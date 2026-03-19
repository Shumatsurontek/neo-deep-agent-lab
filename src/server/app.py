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
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from src.agent.factory import create_sql_agent
from src.config import settings
from src.constants import LLMProvider
from src.sandbox.app import terminate_sandbox
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


class ChatRequest(BaseModel):
    """Request body for the chat endpoint."""

    message: str


class ProviderRequest(BaseModel):
    """Request body for switching the LLM provider."""

    provider: str
    model: str


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    agent_ready: bool


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


@app.get("/")
async def index():
    """Serve the frontend."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="ok", agent_ready=_agent is not None)


@app.get("/history")
async def get_history():
    """Return the current conversation history from the checkpointer."""
    try:
        config = {"configurable": {"thread_id": _thread_id}}
        state = _agent.get_state(config)
        messages = []
        for msg in state.values.get("messages", []):
            if hasattr(msg, "type"):
                if msg.type == "human":
                    messages.append({"role": "user", "content": msg.content})
                elif msg.type == "ai" and msg.content:
                    messages.append({"role": "assistant", "content": msg.content})
        return {"messages": messages}
    except Exception:
        return {"messages": []}


@app.post("/reset")
async def reset_conversation():
    """Reset the conversation by generating a new thread_id."""
    global _thread_id
    _thread_id = str(uuid.uuid4())
    return {"status": "ok", "thread_id": _thread_id}


async def _fetch_ollama_models() -> list[str]:
    """Fetch locally available Ollama models via the Ollama API."""
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
    """List available LLM providers and models (Ollama models fetched dynamically)."""
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
    """Switch the LLM provider and model at runtime (recreates the agent)."""
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

    return {
        "status": "ok",
        "provider": request.provider,
        "model": request.model,
    }


@app.get("/download/{file_id}/{filename}")
async def download_file(file_id: str, filename: str):
    """Serve an exported file (CSV/JSON/PNG) generated by the agent."""
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


@app.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """Chat endpoint with SSE streaming.

    Send a message and receive streaming SSE events with the agent's response,
    including text tokens and tool call events.
    """
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

    async def event_generator():
        stream = _agent.astream(
            {"messages": [HumanMessage(content=request.message)]},
            stream_mode=["messages"],
            config=config,
            version="v2",
        )
        async for sse_line, _content in encode_stream_async(stream):
            yield sse_line

    return StreamingResponse(
        content=event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def main() -> None:
    """Entry point for the server."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    uvicorn.run(
        "src.server.app:app",
        host="0.0.0.0",  # nosec B104
        port=settings.SERVER_PORT,
        reload=True,
    )


if __name__ == "__main__":
    main()
