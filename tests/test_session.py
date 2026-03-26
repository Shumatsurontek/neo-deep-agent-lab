"""Tests for session management (server/session.py)."""

from __future__ import annotations

from src.server.session import (
    create_session,
    destroy_session,
    get_or_create_session,
    get_session,
    get_session_by_thread,
)


class TestCreateSession:
    def test_creates_unique_tokens(self):
        s1 = create_session()
        s2 = create_session()
        assert s1.token != s2.token
        assert s1.thread_id != s2.thread_id
        destroy_session(s1.token)
        destroy_session(s2.token)

    def test_session_has_context_store(self):
        s = create_session()
        assert s.context_store is not None
        assert s.context_store.scratchpad == []
        destroy_session(s.token)

    def test_session_sandbox_is_none(self):
        s = create_session()
        assert s.sandbox is None
        destroy_session(s.token)


class TestGetSession:
    def test_get_existing(self):
        s = create_session()
        found = get_session(s.token)
        assert found is not None
        assert found.token == s.token
        destroy_session(s.token)

    def test_get_nonexistent(self):
        assert get_session("nonexistent-token") is None


class TestGetSessionByThread:
    def test_reverse_lookup(self):
        s = create_session()
        found = get_session_by_thread(s.thread_id)
        assert found is not None
        assert found.token == s.token
        destroy_session(s.token)

    def test_nonexistent_thread(self):
        assert get_session_by_thread("nonexistent-thread") is None


class TestGetOrCreateSession:
    def test_returns_existing(self):
        s = create_session()
        same = get_or_create_session(s.token)
        assert same.token == s.token
        destroy_session(s.token)

    def test_creates_when_none(self):
        s = get_or_create_session(None)
        assert s.token is not None
        destroy_session(s.token)

    def test_creates_when_unknown_token(self):
        s = get_or_create_session("unknown")
        assert s.token != "unknown"
        destroy_session(s.token)


class TestDestroySession:
    def test_removes_from_registry(self):
        s = create_session()
        destroy_session(s.token)
        assert get_session(s.token) is None

    def test_removes_thread_index(self):
        s = create_session()
        thread_id = s.thread_id
        destroy_session(s.token)
        assert get_session_by_thread(thread_id) is None

    def test_destroy_nonexistent_is_noop(self):
        destroy_session("nonexistent-token")  # should not raise
