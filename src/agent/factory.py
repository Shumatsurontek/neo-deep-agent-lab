"""Agent factory - wires together the Deep Agent with tools, middleware, and sandbox."""

from __future__ import annotations

import logging

from deepagents import create_deep_agent
from deepagents.backends import StoreBackend
from langchain.agents.middleware import (
    ClearToolUsesEdit,
    ContextEditingMiddleware,
    ModelFallbackMiddleware,
    ModelRetryMiddleware,
    ToolCallLimitMiddleware,
    ToolRetryMiddleware,
)
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.store.memory import InMemoryStore
from pydantic import SecretStr

from src.agent.prompts import SQL_AGENT_PROMPT
from src.config import settings
from src.constants import LLMProvider
from src.middleware.logging_mw import log_tool_calls
from src.middleware.sql_guard import sql_guard_middleware
from src.sandbox.app import get_or_create_sandbox
from src.tools.analysis_tool import analyze_query
from src.tools.chart_tool import generate_chart
from src.tools.export_tool import export_csv, export_json
from src.tools.schema_tool import get_database_schema
from src.tools.sql_tool import execute_sql

logger = logging.getLogger("neo-deep-agent-lab")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(message)s"))
    logger.addHandler(_handler)

# Persistent store and checkpointer (survive across requests, not across restarts)
store = InMemoryStore()
checkpointer = MemorySaver()


def _build_model(
    provider: str | None = None, model: str | None = None
) -> BaseChatModel:
    """Build an LLM from provider/model strings (defaults to settings)."""
    p = (provider or settings.LLM_PROVIDER).lower()
    m = model or settings.LLM_MODEL
    logger.info("Building model: provider=%s, model=%s", p, m)

    if p == LLMProvider.OPENAI:
        llm = ChatOpenAI(model=m, api_key=SecretStr(settings.OPENAI_API_KEY))
    elif p == LLMProvider.OLLAMA:
        llm = ChatOllama(model=m, base_url=settings.OLLAMA_BASE_URL)
    else:
        llm = ChatAnthropic(
            model_name=m,
            api_key=SecretStr(settings.ANTHROPIC_API_KEY),
            max_retries=6,
            timeout=None,
            stop=None,
        )

    logger.info("Model ready: %s (%s)", type(llm).__name__, m)
    return llm


def _build_middleware() -> list:
    """Assemble the middleware stack.

    Order matters — middleware executes top-to-bottom:
    1. SQL guard         — block destructive queries before anything else
    2. Tool retry        — retry transient sandbox failures (timeouts, network)
    3. Tool call limit   — prevent infinite tool-call loops (safety)
    4. Logging           — log every tool call with timing
    5. Context editing   — clear old tool results when context grows large
    6. Model retry       — retry transient LLM API errors with backoff
    7. Model fallback    — fall back to a secondary model if primary fails
    """
    stack = [
        # ── Tool-level middleware ──
        sql_guard_middleware,
        ToolRetryMiddleware(
            max_retries=2,
            backoff_factor=2.0,
            initial_delay=1.0,
            on_failure="continue",
        ),
        ToolCallLimitMiddleware(
            run_limit=settings.TOOL_CALL_LIMIT_PER_RUN,
            exit_behavior="continue",
        ),
        log_tool_calls,
        # ── Context-level middleware ──
        ContextEditingMiddleware(
            edits=[
                ClearToolUsesEdit(
                    trigger=settings.CONTEXT_EDITING_TRIGGER,
                    keep=3,
                    clear_tool_inputs=False,
                    placeholder="[cleared — re-run tool if needed]",
                ),
            ],
        ),
        # ── Model-level middleware ──
        ModelRetryMiddleware(
            max_retries=3,
            backoff_factor=2.0,
            initial_delay=1.0,
            on_failure="continue",
        ),
    ]

    # Optional model fallback (if configured)
    if settings.LLM_FALLBACK_MODEL and settings.LLM_FALLBACK_PROVIDER:
        fallback = _build_model(
            settings.LLM_FALLBACK_PROVIDER, settings.LLM_FALLBACK_MODEL
        )
        stack.append(ModelFallbackMiddleware(fallback))
        logger.info(
            "Model fallback enabled: %s:%s",
            settings.LLM_FALLBACK_PROVIDER,
            settings.LLM_FALLBACK_MODEL,
        )

    return stack


def create_sql_agent(
    provider: str | None = None, model: str | None = None
) -> CompiledStateGraph:
    """Create and return a fully configured Deep Agent for SQL analysis."""
    get_or_create_sandbox()

    return create_deep_agent(
        model=_build_model(provider, model),
        tools=[
            execute_sql,
            get_database_schema,
            export_csv,
            export_json,
            generate_chart,
            analyze_query,
        ],
        system_prompt=SQL_AGENT_PROMPT,
        middleware=_build_middleware(),
        backend=lambda rt: StoreBackend(rt),
        store=store,
        checkpointer=checkpointer,
    )
