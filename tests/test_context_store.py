"""Tests for the ContextStore (context/store.py)."""

from __future__ import annotations

import time

from src.context.store import ContextEntry, ContextStore, ScratchpadNote


class TestContextEntry:
    def test_to_dict(self):
        entry = ContextEntry(text="hello", source="user", timestamp=1.0)
        d = entry.to_dict()
        assert d == {"text": "hello", "source": "user", "timestamp": 1.0}

    def test_default_source_is_user(self):
        entry = ContextEntry(text="hello")
        assert entry.source == "user"

    def test_default_timestamp(self):
        before = time.time()
        entry = ContextEntry(text="hello")
        assert entry.timestamp >= before


class TestScratchpadNote:
    def test_to_dict(self):
        note = ScratchpadNote(note="test", score=2, timestamp=1.0)
        d = note.to_dict()
        assert d == {"note": "test", "score": 2, "timestamp": 1.0}

    def test_default_score_is_zero(self):
        note = ScratchpadNote(note="test")
        assert note.score == 0


class TestContextStoreContext:
    def test_add_context_user(self, context_store: ContextStore):
        entry = context_store.add_context("test fact", source="user")
        assert entry.text == "test fact"
        assert entry.source == "user"
        assert len(context_store.user_context) == 1

    def test_add_context_agent(self, context_store: ContextStore):
        entry = context_store.add_context("agent fact", source="agent")
        assert entry.source == "agent"

    def test_add_multiple_context(self, context_store: ContextStore):
        context_store.add_context("a")
        context_store.add_context("b")
        context_store.add_context("c")
        assert len(context_store.user_context) == 3


class TestContextStoreScratchpad:
    def test_add_note(self, context_store: ContextStore):
        note = context_store.add_note("my note")
        assert note.note == "my note"
        assert note.score == 0
        assert len(context_store.scratchpad) == 1

    def test_reward_note_positive(self, context_store: ContextStore):
        context_store.add_note("note")
        updated = context_store.reward_note(0, 1)
        assert updated is not None
        assert updated.score == 1

    def test_reward_note_negative(self, context_store: ContextStore):
        context_store.add_note("note")
        context_store.reward_note(0, 1)
        context_store.reward_note(0, -1)
        assert context_store.scratchpad[0].score == 0

    def test_reward_note_out_of_range(self, context_store: ContextStore):
        result = context_store.reward_note(99, 1)
        assert result is None

    def test_ranked_notes_by_score(self, context_store: ContextStore):
        context_store.add_note("low")
        context_store.add_note("high")
        context_store.reward_note(1, 1)
        ranked = context_store.ranked_notes()
        assert ranked[0].note == "high"
        assert ranked[1].note == "low"

    def test_ranked_notes_tiebreak_by_timestamp(self, context_store: ContextStore):
        n1 = context_store.add_note("first")
        n1.timestamp = 1.0
        n2 = context_store.add_note("second")
        n2.timestamp = 2.0
        ranked = context_store.ranked_notes()
        # Same score (0), most recent first
        assert ranked[0].note == "second"
        assert ranked[1].note == "first"


class TestContextStoreRewardSummary:
    def test_empty_scratchpad(self, context_store: ContextStore):
        stats = context_store.reward_summary()
        assert stats == {"total": 0, "positive": 0, "negative": 0, "avg_score": 0.0}

    def test_mixed_rewards(self, context_store: ContextStore):
        context_store.add_note("a")
        context_store.add_note("b")
        context_store.add_note("c")
        context_store.reward_note(0, 1)
        context_store.reward_note(1, -1)
        stats = context_store.reward_summary()
        assert stats["total"] == 3
        assert stats["positive"] == 1
        assert stats["negative"] == 1
        assert stats["avg_score"] == 0.0


class TestContextStoreSchema:
    def test_schema_cache_empty_by_default(self, context_store: ContextStore):
        assert context_store.schema_cache == {}
        assert context_store.schema_cached_at is None

    def test_schema_cache_direct(self, context_store: ContextStore):
        context_store.schema_cache["users"] = "CREATE TABLE users ..."
        context_store.schema_cached_at = time.time()
        assert "users" in context_store.schema_cache
