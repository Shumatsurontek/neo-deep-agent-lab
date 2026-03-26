"""Per-thread context store for the Context Engineering layer.

Each conversation thread gets its own isolated store containing:
- schema_cache: cached DB schema (Write strategy)
- user_context: human + agent injected context with source tracking (Select strategy)
- scratchpad: agent-written session notes with reward scoring (Write strategy)
- summary: compressed conversation summary (Compress strategy)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ScratchpadNote:
    """A single scratchpad note with reward scoring."""

    note: str
    score: int = 0
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {"note": self.note, "score": self.score, "timestamp": self.timestamp}


@dataclass
class ContextEntry:
    """A context entry with source tracking."""

    text: str
    source: Literal["user", "agent"] = "user"
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {"text": self.text, "source": self.source, "timestamp": self.timestamp}


@dataclass
class RecalledMemory:
    """A memory item retrieved via semantic search (short memory recall)."""

    text: str
    score: float
    source_thread: str
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "score": self.score,
            "source_thread": self.source_thread,
            "timestamp": self.timestamp,
        }


@dataclass
class ContextStore:
    """Holds all context for a single conversation thread."""

    schema_cache: dict[str, str] = field(default_factory=dict)
    schema_cached_at: float | None = None
    user_context: list[ContextEntry] = field(default_factory=list)
    scratchpad: list[ScratchpadNote] = field(default_factory=list)
    summary: str | None = None
    # Ephemeral — regenerated each turn by recall middleware, NOT persisted.
    last_recall: list[RecalledMemory] = field(default_factory=list)
    last_rag_chunks: list[RecalledMemory] = field(default_factory=list)
    _last_recall_query: str | None = field(default=None, repr=False)
    _last_rag_query: str | None = field(default=None, repr=False)

    def add_context(
        self, text: str, source: Literal["user", "agent"] = "user"
    ) -> ContextEntry:
        """Add a context entry with source tracking."""
        entry = ContextEntry(text=text, source=source)
        self.user_context.append(entry)
        return entry

    def add_note(self, note: str) -> ScratchpadNote:
        """Add a scratchpad note and return it."""
        entry = ScratchpadNote(note=note)
        self.scratchpad.append(entry)
        return entry

    def reward_note(self, index: int, delta: int) -> ScratchpadNote | None:
        """Apply +1 or -1 reward to a note. Returns updated note or None."""
        if 0 <= index < len(self.scratchpad):
            self.scratchpad[index].score += delta
            return self.scratchpad[index]
        return None

    def ranked_notes(self) -> list[ScratchpadNote]:
        """Return notes sorted by score (highest first), then recency."""
        return sorted(
            self.scratchpad,
            key=lambda n: (n.score, n.timestamp),
            reverse=True,
        )

    def reward_summary(self) -> dict[str, Any]:
        """Return stats about note rewards for prompt injection."""
        if not self.scratchpad:
            return {"total": 0, "positive": 0, "negative": 0, "avg_score": 0.0}
        scores = [n.score for n in self.scratchpad]
        return {
            "total": len(scores),
            "positive": sum(1 for s in scores if s > 0),
            "negative": sum(1 for s in scores if s < 0),
            "avg_score": sum(scores) / len(scores),
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize the entire store to a JSON-safe dict."""
        return {
            "schema_cache": self.schema_cache,
            "schema_cached_at": self.schema_cached_at,
            "user_context": [c.to_dict() for c in self.user_context],
            "scratchpad": [n.to_dict() for n in self.scratchpad],
            "summary": self.summary,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ContextStore:
        """Reconstruct a ContextStore from a serialized dict."""
        store = cls()
        store.schema_cache = data.get("schema_cache", {})
        store.schema_cached_at = data.get("schema_cached_at")
        store.user_context = [
            ContextEntry(
                text=c["text"],
                source=c.get("source", "user"),
                timestamp=c.get("timestamp", 0),
            )
            for c in data.get("user_context", [])
        ]
        store.scratchpad = [
            ScratchpadNote(
                note=n["note"],
                score=n.get("score", 0),
                timestamp=n.get("timestamp", 0),
            )
            for n in data.get("scratchpad", [])
        ]
        store.summary = data.get("summary")
        return store


def get_current_store() -> ContextStore:
    """Return the ContextStore for the current thread (via session lookup).

    Used by tools and middleware that don't have direct access to the session
    object but can read the current thread_id from the ContextVar.
    Falls back to a throwaway ContextStore if no session is found (e.g. in tests).
    """
    from src.context.thread_var import current_thread_id
    from src.server.session import get_session_by_thread

    thread_id = current_thread_id.get()
    session = get_session_by_thread(thread_id)
    if session is not None:
        return session.context_store
    return ContextStore()


def cache_schema(_thread_id: str, key: str, value: str) -> None:
    """Cache a schema result for the current thread's store.

    The ``_thread_id`` parameter is kept for call-site compatibility but
    ignored — the store is resolved from the current ContextVar session.
    """
    store = get_current_store()
    store.schema_cache[key] = value
    store.schema_cached_at = time.time()
