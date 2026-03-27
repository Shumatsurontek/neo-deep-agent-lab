"""FastAPI server with SSE streaming endpoint for the SQL agent."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import Depends, FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from src.agent.factory import create_sql_agent
from src.common import get_logger, setup_logging
from src.config import settings
from src.constants import LLMProvider
from src.context.pg_sync import (
    delete_context,
    load_context,
    save_context,
    search_context,
)
from src.context.thread_var import current_thread_id
from src.persistence.pg import close_persistence, init_persistence
from src.rag.router import router as rag_router
from src.server.log_stream import install_log_handler, log_event_generator
from src.server.session import (
    Session,
    create_session,
    destroy_session,
    get_or_create_session,
)
from src.streaming.events import interrupt_request
from src.streaming.sse_encoder import encode_stream_async
from src.tools.export_tool import get_file

logger = get_logger("server")

STATIC_DIR = Path(__file__).parent / "static"


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


class SearchRequest(BaseModel):
    query: str
    limit: int = 10


class HitlToggleRequest(BaseModel):
    enabled: bool


class HealthResponse(BaseModel):
    status: str
    agent_ready: bool


# ── Auth dependency ───────────────────────────────────────────────────


async def get_current_session(
    authorization: str | None = Header(None),
) -> Session:
    """Extract Bearer token from Authorization header and resolve session."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    session = get_or_create_session(token)
    logger.debug(
        "Session resolved: token_sent=%s, found=%s, thread=%s",
        bool(token),
        token == session.token if token else False,
        session.thread_id[:8],
    )
    return session


# ── Lifecycle ────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage agent and persistence lifecycle."""
    setup_logging(mode=settings.LOG_MODE, level=settings.LOG_LEVEL)
    install_log_handler()
    logger.info("Initializing persistence and agent...")
    store, checkpointer = await init_persistence()
    app.state.agent = create_sql_agent(store=store, checkpointer=checkpointer)
    logger.info("Agent ready.")
    yield
    logger.info("Shutting down...")
    await close_persistence()
    logger.info("Shutdown complete.")


app = FastAPI(
    title="Neo Deep Agent Lab",
    description="Conversational SQL agent with Modal sandbox",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(rag_router)


def _get_agent(request: Request) -> Any:
    """Retrieve the agent from app state."""
    return request.app.state.agent


# ── Core endpoints ───────────────────────────────────────────────────


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/logs/stream")
async def stream_logs():
    """SSE endpoint for live application logs."""
    return StreamingResponse(
        content=log_event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    agent = _get_agent(request)
    return HealthResponse(status="ok", agent_ready=agent is not None)


@app.get("/history")
async def get_history(
    request: Request,
    session: Session = Depends(get_current_session),
):
    """Return the full conversation history including tool calls."""
    agent = _get_agent(request)
    try:
        config = {"configurable": {"thread_id": session.thread_id}}
        state = await agent.aget_state(config)
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


@app.get("/history/threads")
async def list_threads(request: Request):
    """List all conversation threads with their first message."""
    agent = _get_agent(request)
    try:
        # Use the checkpointer to list available threads
        checkpointer = agent.checkpointer
        if not checkpointer:
            return {"threads": []}

        # Query the checkpoint table for distinct thread_ids with metadata
        import psycopg
        import psycopg.rows

        async with await psycopg.AsyncConnection.connect(settings.DATABASE_URL) as conn:
            async with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                await cur.execute(
                    """
                    SELECT DISTINCT ON (thread_id)
                        thread_id,
                        checkpoint_id,
                        created_at
                    FROM checkpoints
                    ORDER BY thread_id, created_at DESC
                    LIMIT 50
                """
                )
                rows = await cur.fetchall()

        threads = []
        for row in rows:
            tid = row["thread_id"]
            # Try to get first user message from the thread
            try:
                config = {"configurable": {"thread_id": tid}}
                state = await agent.aget_state(config)
                msgs = state.values.get("messages", [])
                first_user = next(
                    (m.content for m in msgs if getattr(m, "type", None) == "human"),
                    None,
                )
                msg_count = sum(1 for m in msgs if getattr(m, "type", None) == "human")
                if first_user:
                    threads.append(
                        {
                            "thread_id": tid,
                            "first_message": first_user[:100],
                            "message_count": msg_count,
                            "created_at": (
                                row["created_at"].isoformat()
                                if row.get("created_at")
                                else None
                            ),
                        }
                    )
            except Exception:
                continue

        # Sort by created_at descending
        threads.sort(key=lambda t: t.get("created_at") or "", reverse=True)
        return {"threads": threads}
    except Exception as e:
        logger.warning("Failed to list threads: %s", e)
        return {"threads": []}


# ── Session endpoints ─────────────────────────────────────────────────


@app.post("/session")
async def create_new_session():
    """Create a new session and return its auth token."""
    session = create_session()
    # Try to restore context from PostgresStore (previous session with same thread)
    restored = await load_context(session.thread_id)
    if restored:
        session.context_store = restored
    return {"token": session.token, "thread_id": session.thread_id}


@app.delete("/session")
async def delete_session(session: Session = Depends(get_current_session)):
    """Destroy the current session (sandbox + context)."""
    await delete_context(session.thread_id)
    destroy_session(session.token)
    return {"status": "ok"}


@app.post("/reset")
async def reset_conversation(session: Session = Depends(get_current_session)):
    """Reset: destroy current session and create a new one."""
    await delete_context(session.thread_id)
    destroy_session(session.token)
    new_session = create_session()
    return {
        "status": "ok",
        "token": new_session.token,
        "thread_id": new_session.thread_id,
    }


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


_OPENAI_FALLBACK_MODELS = ["gpt-5-mini-2025-08-07", "gpt-4.1-mini", "gpt-4.1"]


async def _fetch_openai_models() -> list[str]:
    if not settings.OPENAI_API_KEY:
        return _OPENAI_FALLBACK_MODELS
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            )
            res.raise_for_status()
            data = res.json().get("data", [])
            chat_models = sorted(
                [
                    m["id"]
                    for m in data
                    if m.get("id")
                    and any(
                        prefix in m["id"]
                        for prefix in ("gpt-4", "gpt-5", "gpt-3.5", "o1", "o3", "o4")
                    )
                    and "realtime" not in m["id"]
                    and "audio" not in m["id"]
                ],
                reverse=True,
            )
            return chat_models if chat_models else _OPENAI_FALLBACK_MODELS
    except Exception:
        return _OPENAI_FALLBACK_MODELS


_ANTHROPIC_FALLBACK_MODELS = [
    "claude-sonnet-4-20250514",
    "claude-haiku-4-5-20251001",
]


async def _fetch_anthropic_models() -> list[str]:
    if not settings.ANTHROPIC_API_KEY:
        return _ANTHROPIC_FALLBACK_MODELS
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                },
            )
            res.raise_for_status()
            data = res.json().get("data", [])
            models = sorted(
                [
                    m["id"]
                    for m in data
                    if m.get("id")
                    and ("claude" in m["id"])
                    and m.get("type") == "model"
                ],
                reverse=True,
            )
            return models if models else _ANTHROPIC_FALLBACK_MODELS
    except Exception:
        return _ANTHROPIC_FALLBACK_MODELS


@app.get("/providers")
async def list_providers():
    ollama_models, openai_models, anthropic_models = await asyncio.gather(
        _fetch_ollama_models(),
        _fetch_openai_models(),
        _fetch_anthropic_models(),
    )
    return {
        "providers": [
            {
                "id": LLMProvider.OPENAI,
                "name": "OpenAI",
                "models": openai_models,
                "available": bool(settings.OPENAI_API_KEY),
            },
            {
                "id": LLMProvider.ANTHROPIC,
                "name": "Anthropic",
                "models": anthropic_models,
                "available": bool(settings.ANTHROPIC_API_KEY),
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
async def switch_provider(request_body: ProviderRequest, request: Request):
    valid = {p.value for p in LLMProvider}
    if request_body.provider not in valid:
        return JSONResponse(
            {
                "error": f"Unknown provider '{request_body.provider}'. Valid: {sorted(valid)}"
            },
            status_code=400,
        )
    logger.info(
        "Switching provider to %s / %s", request_body.provider, request_body.model
    )
    store, checkpointer = (
        request.app.state.agent.store,
        request.app.state.agent.checkpointer,
    )
    request.app.state.agent = create_sql_agent(
        provider=request_body.provider,
        model=request_body.model,
        store=store,
        checkpointer=checkpointer,
    )
    settings.LLM_PROVIDER = request_body.provider
    settings.LLM_MODEL = request_body.model
    logger.info(
        "Agent recreated with %s / %s", request_body.provider, request_body.model
    )
    return {
        "status": "ok",
        "provider": request_body.provider,
        "model": request_body.model,
    }


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
async def get_context(session: Session = Depends(get_current_session)):
    """Return the current context store for the active session."""
    store = session.context_store
    return {
        "schema_cached": bool(store.schema_cache),
        "schema_tables": list(store.schema_cache.keys()),
        "user_context": [c.to_dict() for c in store.user_context],
        "scratchpad": [n.to_dict() for n in store.scratchpad],
        "summary": store.summary,
        "reward_summary": store.reward_summary(),
        "last_recall": [r.to_dict() for r in store.last_recall],
        "last_rag_chunks": [r.to_dict() for r in store.last_rag_chunks],
    }


@app.post("/context")
async def add_context(
    request: ContextRequest,
    session: Session = Depends(get_current_session),
):
    """Add a user-provided context hint to the current session."""
    store = session.context_store
    store.add_context(request.context, source="user")
    asyncio.create_task(save_context(session.thread_id, store))
    logger.info(
        "User context added: thread=%s, total=%d",
        session.thread_id[:8],
        len(store.user_context),
    )
    return {"status": "ok", "count": len(store.user_context)}


@app.delete("/context")
async def clear_context(session: Session = Depends(get_current_session)):
    """Clear all user-provided context for the current session."""
    store = session.context_store
    store.user_context.clear()
    store.scratchpad.clear()
    store.summary = None
    asyncio.create_task(save_context(session.thread_id, store))
    return {"status": "ok"}


@app.delete("/context/{index}")
async def remove_context(index: int, session: Session = Depends(get_current_session)):
    """Remove a specific user context entry by index."""
    store = session.context_store
    if 0 <= index < len(store.user_context):
        removed = store.user_context.pop(index)
        asyncio.create_task(save_context(session.thread_id, store))
        return {"status": "ok", "removed": removed.text}
    return JSONResponse({"error": "Index out of range"}, status_code=400)


# ── Semantic search endpoint ──────────────────────────────────────────


@app.post("/search")
async def search_store(
    request_body: SearchRequest,
    session: Session = Depends(get_current_session),
):
    """Semantic search across persisted context (current thread or all)."""
    results = await search_context(
        request_body.query,
        thread_id=session.thread_id,
        limit=request_body.limit,
    )
    return {"results": results, "count": len(results)}


@app.post("/search/global")
async def search_store_global(request_body: SearchRequest):
    """Semantic search across ALL threads' persisted context."""
    results = await search_context(
        request_body.query,
        limit=request_body.limit,
    )
    return {"results": results, "count": len(results)}


# ── Scratchpad reward endpoints ──────────────────────────────────────


@app.post("/scratchpad/{index}/reward")
async def reward_scratchpad_note(
    index: int,
    request: RewardRequest,
    session: Session = Depends(get_current_session),
):
    """Apply +1 or -1 reward to a scratchpad note."""
    if request.delta not in (1, -1):
        return JSONResponse({"error": "delta must be +1 or -1"}, status_code=400)
    store = session.context_store
    updated = store.reward_note(index, request.delta)
    if updated is None:
        return JSONResponse({"error": "Index out of range"}, status_code=400)
    asyncio.create_task(save_context(session.thread_id, store))
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
async def toggle_hitl(request_body: HitlToggleRequest, request: Request):
    """Toggle HITL on/off and recreate agent."""
    settings.HITL_ENABLED = request_body.enabled
    store, checkpointer = (
        request.app.state.agent.store,
        request.app.state.agent.checkpointer,
    )
    request.app.state.agent = create_sql_agent(
        provider=settings.LLM_PROVIDER,
        model=settings.LLM_MODEL,
        store=store,
        checkpointer=checkpointer,
    )
    logger.info("HITL toggled: enabled=%s, agent recreated", request_body.enabled)
    return {"status": "ok", "enabled": settings.HITL_ENABLED}


# ── Middleware management endpoints ────────────────────────────────


class MiddlewareToggleRequest(BaseModel):
    name: str
    enabled: bool


@app.get("/middleware")
async def get_middleware():
    """Return all middleware with their enabled/disabled status."""
    from src.agent.factory import MIDDLEWARE_REGISTRY

    return {
        "middleware": [
            {"name": name, "enabled": v["enabled"], "description": v["description"]}
            for name, v in MIDDLEWARE_REGISTRY.items()
        ]
    }


@app.post("/middleware")
async def toggle_middleware(body: MiddlewareToggleRequest, request: Request):
    """Toggle a middleware on/off and recreate the agent."""
    from src.agent.factory import MIDDLEWARE_REGISTRY, get_active_middleware

    if body.name not in MIDDLEWARE_REGISTRY:
        return JSONResponse(
            {"error": f"Unknown middleware: {body.name}"}, status_code=400
        )

    MIDDLEWARE_REGISTRY[body.name]["enabled"] = body.enabled

    # Recreate agent with only active middleware
    store, checkpointer = (
        request.app.state.agent.store,
        request.app.state.agent.checkpointer,
    )
    active = get_active_middleware()

    # Recreate agent with active middleware only
    from src.agent.factory import create_sql_agent_with_middleware

    request.app.state.agent = create_sql_agent_with_middleware(
        middleware=active,
        store=store,
        checkpointer=checkpointer,
    )

    logger.info(
        "Middleware '%s' toggled: enabled=%s, active_count=%d",
        body.name,
        body.enabled,
        len(active),
    )
    return {
        "status": "ok",
        "name": body.name,
        "enabled": body.enabled,
        "active_count": len(active),
    }


# ── Prompt preview endpoint ─────────────────────────────────────────


@app.get("/prompt-preview")
async def get_prompt_preview(session: Session = Depends(get_current_session)):
    """Return the dynamic prompt as it would be built right now."""
    from src.agent.prompts import SQL_AGENT_PROMPT

    store = session.context_store

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

    total_chars = sum(len(s["content"]) for s in sections)
    token_estimate = total_chars // 4

    return {
        "sections": sections,
        "total_chars": total_chars,
        "token_estimate": token_estimate,
        "hitl_enabled": settings.HITL_ENABLED,
    }


# ── Chat + HITL endpoints ───────────────────────────────────────────


async def _stream_agent(
    agent: Any,
    input_data: dict[str, Any] | Command,
    config: dict[str, Any],
    thread_id: str | None = None,
):
    """Stream agent response and detect HITL interrupts."""
    # Set ContextVar here (not in the endpoint) because StreamingResponse
    # consumes this generator *after* the endpoint function has returned.
    cv_token = current_thread_id.set(thread_id) if thread_id else None
    try:
        stream = agent.astream(
            input_data,
            stream_mode=["messages"],
            config=config,
            version="v2",
        )
        async for sse_line, _content in encode_stream_async(
            stream, model=settings.LLM_MODEL
        ):
            yield sse_line

        # Check for pending HITL interrupt after stream completes
        if settings.HITL_ENABLED:
            state = await agent.aget_state(config)
            if state.next:
                for task in state.tasks:
                    if task.interrupts:
                        for intr in task.interrupts:
                            payload = intr.value
                            if (
                                isinstance(payload, dict)
                                and "action_requests" in payload
                            ):
                                event = interrupt_request(
                                    payload["action_requests"],
                                    payload.get("review_configs", []),
                                )
                                yield event.to_sse()
                                return
    finally:
        # Persist context changes made by tools/middleware during the stream
        if thread_id:
            from src.server.session import get_session_by_thread

            session = get_session_by_thread(thread_id)
            if session:
                asyncio.create_task(save_context(thread_id, session.context_store))
        if cv_token is not None:
            current_thread_id.reset(cv_token)


@app.post("/chat")
async def chat(
    request_body: ChatRequest,
    request: Request,
    session: Session = Depends(get_current_session),
) -> StreamingResponse:
    """Chat endpoint with SSE streaming."""
    agent = _get_agent(request)
    if agent is None:
        return StreamingResponse(
            content=iter(
                ['data: {"type": "error", "message": "Agent not initialized"}\n\n']
            ),
            media_type="text/event-stream",
        )

    logger.info(
        "Chat request: thread=%s, msg='%s'",
        session.thread_id[:8],
        request_body.message[:80],
    )
    config = {"configurable": {"thread_id": session.thread_id}}

    return StreamingResponse(
        content=_stream_agent(
            agent,
            {"messages": [HumanMessage(content=request_body.message)]},
            config,
            thread_id=session.thread_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/resume")
async def resume(
    request_body: ResumeRequest,
    request: Request,
    session: Session = Depends(get_current_session),
) -> StreamingResponse:
    """Resume agent after human-in-the-loop interrupt."""
    agent = _get_agent(request)
    if agent is None:
        return StreamingResponse(
            content=iter(
                ['data: {"type": "error", "message": "Agent not initialized"}\n\n']
            ),
            media_type="text/event-stream",
        )

    config = {"configurable": {"thread_id": session.thread_id}}

    logger.info(
        "Resuming agent: thread=%s, decisions=%s",
        session.thread_id[:8],
        request_body.decisions,
    )

    return StreamingResponse(
        content=_stream_agent(
            agent,
            Command(resume={"decisions": request_body.decisions}),  # type: ignore[arg-type]
            config,
            thread_id=session.thread_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Entry point ──────────────────────────────────────────────────────


def main() -> None:
    setup_logging(mode=settings.LOG_MODE, level=settings.LOG_LEVEL)
    uvicorn.run(
        "src.server.app:app",
        host="0.0.0.0",  # nosec B104
        port=settings.SERVER_PORT,
        reload=True,
    )


if __name__ == "__main__":
    main()
