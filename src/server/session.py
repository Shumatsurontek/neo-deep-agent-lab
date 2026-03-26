"""Session management — maps auth tokens to per-user state.

Each session owns:
- A unique ``thread_id`` used by LangGraph for conversation history.
- An ephemeral ``ContextStore`` for schema cache, scratchpad, and user context.
- An optional Modal sandbox reference (created lazily on first tool call).

Sessions are stored in-memory (ephemeral runtime state).
Durable state (checkpoints, memories) lives in PostgreSQL.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

import modal

from src.common import get_logger
from src.context.store import ContextStore

logger = get_logger("server.session")

# ── Session dataclass ─────────────────────────────────────────────────


@dataclass
class Session:
    """Per-user session holding thread context and sandbox reference."""

    token: str
    thread_id: str
    created_at: float = field(default_factory=time.time)
    context_store: ContextStore = field(default_factory=ContextStore)
    sandbox: modal.Sandbox | None = None


# ── In-memory registries ──────────────────────────────────────────────

_sessions: dict[str, Session] = {}  # token → Session
_thread_index: dict[str, str] = {}  # thread_id → token (reverse lookup)


# ── Public API ────────────────────────────────────────────────────────


def create_session() -> Session:
    """Create a new session with fresh token and thread_id."""
    token = str(uuid.uuid4())
    thread_id = str(uuid.uuid4())
    session = Session(token=token, thread_id=thread_id)
    _sessions[token] = session
    _thread_index[thread_id] = token
    logger.info("Session created: token=%s, thread=%s", token[:8], thread_id[:8])
    return session


def get_session(token: str) -> Session | None:
    """Look up a session by its auth token."""
    return _sessions.get(token)


def get_session_by_thread(thread_id: str) -> Session | None:
    """Reverse-lookup: find the session that owns a given thread_id."""
    token = _thread_index.get(thread_id)
    if token is None:
        return None
    return _sessions.get(token)


def get_or_create_session(token: str | None) -> Session:
    """Return existing session for token, or create a new one."""
    if token:
        session = get_session(token)
        if session is not None:
            return session
    return create_session()


def destroy_session(token: str) -> None:
    """Terminate sandbox and remove session from registries."""
    session = _sessions.pop(token, None)
    if session is None:
        return

    _thread_index.pop(session.thread_id, None)

    if session.sandbox is not None:
        try:
            session.sandbox.terminate()
        except Exception:
            pass
        session.sandbox = None

    logger.info(
        "Session destroyed: token=%s, thread=%s", token[:8], session.thread_id[:8]
    )


def list_sessions() -> list[Session]:
    """Return all active sessions (for admin / debugging)."""
    return list(_sessions.values())
