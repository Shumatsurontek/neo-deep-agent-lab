"""FastAPI server with SSE streaming endpoint for the SQL agent."""

from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from src.agent.factory import create_sql_agent
from src.config import settings
from src.constants import LLMProvider
from src.context.store import get_store, reset_store
from src.context.thread_var import current_thread_id
from src.sandbox.app import terminate_sandbox
from src.streaming.events import interrupt_request
from src.streaming.sse_encoder import encode_stream_async
from src.tools.export_tool import get_file

logger = logging.getLogger("neo-deep-agent-lab")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(message)s"))
    logger.addHandler(_handler)

STATIC_DIR = Path(__file__).parent / "static"

_agent: Any = None
_thread_id: str = "main"


# ── Request / Response models ────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str


class ProviderRequest(BaseModel):
    provider: str
    model: str


class ContextRequest(BaseModel):
    context: str


class ResumeRequest(BaseModel):
    decisions: list[dict[str, Any]]


class RewardRequest(BaseModel):
    delta: int  # +1 or -1


class HitlToggleRequest(BaseModel):
    enabled: bool


class HealthResponse(BaseModel):
    status: str
    agent_ready: bool


# ── Lifecycle ────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage agent and sandbox lifecycle."""
    global _agent
    logger.info("Starting agent and Modal sandbox...")
    _agent = create_sql_agent()
    logger.info("Agent ready.")
    yield
    logger.info("Shutting down sandbox...")
    terminate_sandbox()
    logger.info("Shutdown complete.")


app = FastAPI(
    title="Neo Deep Agent Lab",
    description="Conversational SQL agent with Modal sandbox",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ── Core endpoints ───────────────────────────────────────────────────


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", agent_ready=_agent is not None)


@app.get("/history")
async def get_history():
    """Return the full conversation history including tool calls."""
    try:
        config = {"configurable": {"thread_id": _thread_id}}
        state = _agent.get_state(config)
        messages: list[dict[str, Any]] = []

        # Build tool_call_id → tool_name map from AI messages
        tool_call_names: dict[str, str] = {}
        for msg in state.values.get("messages", []):
            if hasattr(msg, "tool_calls"):
                for tc in msg.tool_calls:
                    if tc.get("id") and tc.get("name"):
                        tool_call_names[tc["id"]] = tc["name"]

        for msg in state.values.get("messages", []):
            if not hasattr(msg, "type"):
                continue

            if msg.type == "human":
                messages.append({"role": "user", "content": msg.content})

            elif msg.type == "ai":
                # Emit tool calls first (if any)
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    for tc in msg.tool_calls:
                        messages.append(
                            {
                                "role": "tool_call",
                                "tool_name": tc.get("name", "unknown"),
                                "tool_input": tc.get("args", {}),
                                "tool_call_id": tc.get("id"),
                            }
                        )
                # Then emit text content (if any)
                if msg.content:
                    messages.append(
                        {
                            "role": "assistant",
                            "content": msg.content,
                        }
                    )

            elif msg.type == "tool":
                tool_name = getattr(msg, "name", None) or tool_call_names.get(
                    getattr(msg, "tool_call_id", ""), "unknown"
                )
                content = (
                    msg.content if isinstance(msg.content, str) else str(msg.content)
                )
                messages.append(
                    {
                        "role": "tool_result",
                        "tool_name": tool_name,
                        "tool_output": content,
                        "tool_call_id": getattr(msg, "tool_call_id", None),
                    }
                )

        return {"messages": messages}
    except Exception:
        return {"messages": []}


@app.post("/reset")
async def reset_conversation():
    """Reset the conversation by generating a new thread_id."""
    global _thread_id
    old_id = _thread_id
    _thread_id = str(uuid.uuid4())
    reset_store(old_id)
    return {"status": "ok", "thread_id": _thread_id}


# ── Provider endpoints ───────────────────────────────────────────────


async def _fetch_ollama_models() -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            res = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            res.raise_for_status()
            models = res.json().get("models", [])
            return [m["name"] for m in models]
    except Exception:
        return []


@app.get("/providers")
async def list_providers():
    ollama_models = await _fetch_ollama_models()
    return {
        "providers": [
            {
                "id": LLMProvider.OPENAI,
                "name": "OpenAI",
                "models": ["gpt-5-mini-2025-08-07", "gpt-4.1-mini", "gpt-4.1"],
            },
            {
                "id": LLMProvider.ANTHROPIC,
                "name": "Anthropic",
                "models": [
                    "claude-sonnet-4-20250514",
                    "claude-haiku-4-5-20251001",
                ],
            },
            {
                "id": LLMProvider.OLLAMA,
                "name": "Ollama",
                "models": ollama_models,
                "available": len(ollama_models) > 0,
            },
        ],
        "current": {
            "provider": settings.LLM_PROVIDER,
            "model": settings.LLM_MODEL,
        },
    }


@app.post("/provider")
async def switch_provider(request: ProviderRequest):
    global _agent
    valid = {p.value for p in LLMProvider}
    if request.provider not in valid:
        return JSONResponse(
            {"error": f"Unknown provider '{request.provider}'. Valid: {sorted(valid)}"},
            status_code=400,
        )
    logger.info("Switching provider to %s / %s", request.provider, request.model)
    _agent = create_sql_agent(provider=request.provider, model=request.model)
    settings.LLM_PROVIDER = request.provider
    settings.LLM_MODEL = request.model
    logger.info("Agent recreated with %s / %s", request.provider, request.model)
    return {"status": "ok", "provider": request.provider, "model": request.model}


# ── Download endpoint ────────────────────────────────────────────────


@app.get("/download/{file_id}/{filename}")
async def download_file(file_id: str, filename: str):
    entry = get_file(file_id)
    if not entry:
        return JSONResponse({"error": "File not found or expired"}, status_code=404)
    content = entry["content"]
    if isinstance(content, str):
        content = content.encode("utf-8")
    return StreamingResponse(
        content=iter([content]),
        media_type=entry["mime_type"],
        headers={"Content-Disposition": f'attachment; filename="{entry["filename"]}"'},
    )


# ── Context engineering endpoints ────────────────────────────────────


@app.get("/context")
async def get_context():
    """Return the current context store for the active thread."""
    store = get_store(_thread_id)
    return {
        "schema_cached": bool(store.schema_cache),
        "schema_tables": list(store.schema_cache.keys()),
        "user_context": [c.to_dict() for c in store.user_context],
        "scratchpad": [n.to_dict() for n in store.scratchpad],
        "summary": store.summary,
        "reward_summary": store.reward_summary(),
    }


@app.post("/context")
async def add_context(request: ContextRequest):
    """Add a user-provided context hint to the current session."""
    store = get_store(_thread_id)
    store.add_context(request.context, source="user")
    logger.info(
        "User context added: thread=%s, total=%d", _thread_id, len(store.user_context)
    )
    return {"status": "ok", "count": len(store.user_context)}


@app.delete("/context")
async def clear_context():
    """Clear all user-provided context for the current session."""
    store = get_store(_thread_id)
    store.user_context.clear()
    store.scratchpad.clear()
    store.summary = None
    return {"status": "ok"}


@app.delete("/context/{index}")
async def remove_context(index: int):
    """Remove a specific user context entry by index."""
    store = get_store(_thread_id)
    if 0 <= index < len(store.user_context):
        removed = store.user_context.pop(index)
        return {"status": "ok", "removed": removed.text}
    return JSONResponse({"error": "Index out of range"}, status_code=400)


# ── Scratchpad reward endpoints ──────────────────────────────────────


@app.post("/scratchpad/{index}/reward")
async def reward_scratchpad_note(index: int, request: RewardRequest):
    """Apply +1 or -1 reward to a scratchpad note."""
    if request.delta not in (1, -1):
        return JSONResponse({"error": "delta must be +1 or -1"}, status_code=400)
    store = get_store(_thread_id)
    updated = store.reward_note(index, request.delta)
    if updated is None:
        return JSONResponse({"error": "Index out of range"}, status_code=400)
    return {
        "status": "ok",
        "index": index,
        "score": updated.score,
        "reward_summary": store.reward_summary(),
    }


# ── HITL toggle endpoint ────────────────────────────────────────────


@app.get("/hitl")
async def get_hitl_status():
    """Return current HITL status."""
    return {"enabled": settings.HITL_ENABLED}


@app.post("/hitl")
async def toggle_hitl(request: HitlToggleRequest):
    """Toggle HITL on/off and recreate agent."""
    global _agent
    settings.HITL_ENABLED = request.enabled
    _agent = create_sql_agent(provider=settings.LLM_PROVIDER, model=settings.LLM_MODEL)
    logger.info("HITL toggled: enabled=%s, agent recreated", request.enabled)
    return {"status": "ok", "enabled": settings.HITL_ENABLED}


# ── Prompt preview endpoint ─────────────────────────────────────────


@app.get("/prompt-preview")
async def get_prompt_preview():
    """Return the dynamic prompt as it would be built right now.

    This shows exactly what the LLM sees: base prompt + injected context sections.
    """
    from src.agent.prompts import SQL_AGENT_PROMPT

    store = get_store(_thread_id)

    # Build sections the same way inject_context does
    sections: list[dict[str, str]] = []

    sections.append(
        {"id": "base", "label": "System Prompt", "content": SQL_AGENT_PROMPT}
    )

    if store.schema_cache:
        schema_text = "\n\n".join(
            f"-- {key} --\n{value}" for key, value in store.schema_cache.items()
        )
        sections.append(
            {"id": "schema", "label": "Schema Cache", "content": schema_text}
        )

    if store.user_context:
        items = "\n".join(f"- [{c.source}] {c.text}" for c in store.user_context)
        sections.append({"id": "user_ctx", "label": "User Context", "content": items})

    if store.scratchpad:
        ranked = store.ranked_notes()
        notes_lines = []
        for n in ranked:
            score_tag = f" [score:{n.score:+d}]" if n.score != 0 else ""
            notes_lines.append(f"- {n.note}{score_tag}")
        stats = store.reward_summary()
        notes_text = "\n".join(notes_lines)
        notes_text += (
            f"\n\n(Reward stats: {stats['total']} notes, "
            f"{stats['positive']} positives, {stats['negative']} negatives, "
            f"avg={stats['avg_score']:.1f})"
        )
        sections.append(
            {"id": "scratchpad", "label": "Scratchpad", "content": notes_text}
        )

    if store.summary:
        sections.append(
            {"id": "summary", "label": "Conversation Summary", "content": store.summary}
        )

    # Compute total token estimate (rough: 4 chars ≈ 1 token)
    total_chars = sum(len(s["content"]) for s in sections)
    token_estimate = total_chars // 4

    return {
        "sections": sections,
        "total_chars": total_chars,
        "token_estimate": token_estimate,
        "hitl_enabled": settings.HITL_ENABLED,
    }


# ── Chat + HITL endpoints ───────────────────────────────────────────


async def _stream_agent(input_data: dict[str, Any], config: dict[str, Any]):
    """Stream agent response and detect HITL interrupts."""
    stream = _agent.astream(
        input_data,
        stream_mode=["messages"],
        config=config,
        version="v2",
    )
    async for sse_line, _content in encode_stream_async(stream):
        yield sse_line

    # Check for pending HITL interrupt after stream completes
    if settings.HITL_ENABLED:
        state = _agent.get_state(config)
        if state.next:
            # Graph is paused — check for interrupt payloads
            for task in state.tasks:
                if task.interrupts:
                    for intr in task.interrupts:
                        payload = intr.value
                        if isinstance(payload, dict) and "action_requests" in payload:
                            event = interrupt_request(
                                payload["action_requests"],
                                payload.get("review_configs", []),
                            )
                            yield event.to_sse()
                            return


@app.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """Chat endpoint with SSE streaming."""
    if _agent is None:
        return StreamingResponse(
            content=iter(
                ['data: {"type": "error", "message": "Agent not initialized"}\n\n']
            ),
            media_type="text/event-stream",
        )

    logger.info(
        "Chat request: provider=%s, model=%s, thread=%s, msg='%s'",
        settings.LLM_PROVIDER,
        settings.LLM_MODEL,
        _thread_id,
        request.message[:80],
    )
    config = {"configurable": {"thread_id": _thread_id}}
    token = current_thread_id.set(_thread_id)

    try:
        return StreamingResponse(
            content=_stream_agent(
                {"messages": [HumanMessage(content=request.message)]}, config
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    finally:
        current_thread_id.reset(token)


@app.post("/resume")
async def resume(request: ResumeRequest) -> StreamingResponse:
    """Resume agent after human-in-the-loop interrupt."""
    if _agent is None:
        return StreamingResponse(
            content=iter(
                ['data: {"type": "error", "message": "Agent not initialized"}\n\n']
            ),
            media_type="text/event-stream",
        )

    config = {"configurable": {"thread_id": _thread_id}}
    token = current_thread_id.set(_thread_id)

    logger.info(
        "Resuming agent: thread=%s, decisions=%s", _thread_id, request.decisions
    )

    try:
        return StreamingResponse(
            content=_stream_agent(
                Command(resume={"decisions": request.decisions}), config  # type: ignore[arg-type]
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    finally:
        current_thread_id.reset(token)


# ── Entry point ──────────────────────────────────────────────────────


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    uvicorn.run(
        "src.server.app:app",
        host="0.0.0.0",  # nosec B104
        port=settings.SERVER_PORT,
        reload=True,
    )


if __name__ == "__main__":
    main()
