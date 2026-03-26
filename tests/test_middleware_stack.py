"""Tests for the middleware stack composition in factory.py."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from langchain.agents.middleware import (
    ContextEditingMiddleware,
    ModelFallbackMiddleware,
    ModelRetryMiddleware,
    ToolCallLimitMiddleware,
    ToolRetryMiddleware,
)

from src.middleware.logging_mw import LogToolCallsMiddleware
from src.middleware.sql_guard import SQLGuardMiddleware


class TestMiddlewareStack:
    """Test the middleware stack built by _build_middleware()."""

    @patch("src.agent.factory._build_model", return_value=MagicMock())
    def test_middleware_count_without_fallback(self, _mock_model, monkeypatch):
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_MODEL", "")
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_PROVIDER", "")
        from src.agent.factory import _build_middleware

        stack = _build_middleware()
        assert len(stack) == 8  # no fallback

    @patch("src.agent.factory._build_model", return_value=MagicMock())
    def test_middleware_count_with_fallback(self, _mock_model, monkeypatch):
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_MODEL", "gpt-4.1-mini")
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_PROVIDER", "openai")
        from src.agent.factory import _build_middleware

        stack = _build_middleware()
        assert len(stack) == 9

    @patch("src.agent.factory._build_model", return_value=MagicMock())
    def test_sql_guard_is_first(self, _mock_model, monkeypatch):
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_MODEL", "")
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_PROVIDER", "")
        from src.agent.factory import _build_middleware

        stack = _build_middleware()
        assert isinstance(stack[0], SQLGuardMiddleware)

    @patch("src.agent.factory._build_model", return_value=MagicMock())
    def test_middleware_order(self, _mock_model, monkeypatch):
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_MODEL", "")
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_PROVIDER", "")
        from src.agent.factory import _build_middleware

        stack = _build_middleware()
        types = [type(m) for m in stack]
        assert types[0] is SQLGuardMiddleware
        assert types[1] is ToolRetryMiddleware
        assert types[2] is ToolCallLimitMiddleware
        assert types[3] is LogToolCallsMiddleware
        # stack[4] is schema_cache_middleware (a function, not a class)
        # stack[5] is inject_context (a function, not a class)
        assert types[6] is ContextEditingMiddleware
        assert types[7] is ModelRetryMiddleware

    @patch("src.agent.factory._build_model", return_value=MagicMock())
    def test_fallback_is_last(self, _mock_model, monkeypatch):
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_MODEL", "gpt-4.1-mini")
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_PROVIDER", "openai")
        from src.agent.factory import _build_middleware

        stack = _build_middleware()
        assert isinstance(stack[-1], ModelFallbackMiddleware)

    @patch("src.agent.factory._build_model", return_value=MagicMock())
    def test_tool_call_limit_uses_setting(self, _mock_model, monkeypatch):
        monkeypatch.setattr("src.config.settings.TOOL_CALL_LIMIT_PER_RUN", 42)
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_MODEL", "")
        monkeypatch.setattr("src.config.settings.LLM_FALLBACK_PROVIDER", "")
        from src.agent.factory import _build_middleware

        stack = _build_middleware()
        limit_mw = [m for m in stack if isinstance(m, ToolCallLimitMiddleware)]
        assert len(limit_mw) == 1
        assert limit_mw[0].run_limit == 42
