"""Shared fixtures for the neo-deep-agent-lab test suite."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.context.store import ContextStore

# ── Context store fixtures ────────────────────────────────────────────


@pytest.fixture
def context_store():
    """Fresh ContextStore for each test."""
    return ContextStore()


# ── Session fixtures ──────────────────────────────────────────────────


@pytest.fixture
def session():
    """Create a fresh session and clean up after."""
    from src.server.session import create_session, destroy_session

    s = create_session()
    yield s
    destroy_session(s.token)


# ── Mock sandbox ──────────────────────────────────────────────────────


@pytest.fixture
def mock_sandbox(monkeypatch):
    """Patch exec_in_sandbox to avoid Modal calls.

    Returns a dict that tests populate with ``{pattern: (stdout, stderr, code)}``.
    """
    results: dict[str, tuple[str, str, int]] = {}

    def fake_exec(cmd: str) -> tuple[str, str, int]:
        for pattern, result in results.items():
            if pattern in cmd:
                return result
        return ("", "", 0)

    monkeypatch.setattr("src.sandbox.app.exec_in_sandbox", fake_exec)
    monkeypatch.setattr("src.sandbox.pg.exec_in_sandbox", fake_exec)
    return results


# ── Mock PG (higher-level) ────────────────────────────────────────────


@pytest.fixture
def mock_pg(monkeypatch):
    """Patch run_query_csv at the pg module level.

    Returns a dict: ``{pattern: (stdout, stderr, code)}``.
    """
    from src.sandbox.pg import QueryResult

    responses: dict[str, tuple[str, str, int]] = {}

    def fake_csv(query: str, *, timeout_ms: int = 10_000) -> QueryResult:
        for pattern, (stdout, stderr, code) in responses.items():
            if pattern in query:
                return QueryResult(stdout=stdout, stderr=stderr, exit_code=code)
        return QueryResult(stdout="", stderr="no mock match", exit_code=1)

    monkeypatch.setattr("src.sandbox.pg.run_query_csv", fake_csv)
    monkeypatch.setattr("src.tools.sql_tool.run_query_csv", fake_csv)
    monkeypatch.setattr("src.tools.chart_tool.run_query_csv", fake_csv)
    monkeypatch.setattr("src.tools.analysis_tool.run_query_csv", fake_csv)
    return responses


# ── FastAPI TestClient ────────────────────────────────────────────────


@pytest.fixture
def app_client(monkeypatch):
    """TestClient with mocked persistence and sandbox."""
    monkeypatch.setattr(
        "src.persistence.pg.init_persistence",
        AsyncMock(return_value=(MagicMock(), MagicMock())),
    )
    monkeypatch.setattr(
        "src.persistence.pg.close_persistence",
        AsyncMock(),
    )
    # Prevent real sandbox creation
    monkeypatch.setattr(
        "src.sandbox.app._create_sandbox",
        lambda: MagicMock(),
    )
    # Mock agent
    mock_agent = MagicMock()
    monkeypatch.setattr(
        "src.agent.factory.create_sql_agent",
        lambda **kw: mock_agent,
    )

    from fastapi.testclient import TestClient

    from src.server.app import app

    with TestClient(app) as c:
        yield c, mock_agent
