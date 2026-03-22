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
class ContextStore:
    """Holds all context for a single conversation thread."""

    schema_cache: dict[str, str] = field(default_factory=dict)
    schema_cached_at: float | None = None
    user_context: list[ContextEntry] = field(default_factory=list)
    scratchpad: list[ScratchpadNote] = field(default_factory=list)
    summary: str | None = None

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


_stores: dict[str, ContextStore] = {}


def get_store(thread_id: str) -> ContextStore:
    """Get or create the context store for a thread."""
    if thread_id not in _stores:
        _stores[thread_id] = ContextStore()
    return _stores[thread_id]


def reset_store(thread_id: str) -> None:
    """Clear the context store for a thread."""
    _stores.pop(thread_id, None)


def cache_schema(thread_id: str, key: str, value: str) -> None:
    """Cache a schema result for a thread."""
    store = get_store(thread_id)
    store.schema_cache[key] = value
    store.schema_cached_at = time.time()
