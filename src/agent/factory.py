"""Agent factory - wires together the Deep Agent with tools, middleware, and sandbox."""

from __future__ import annotations

from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import StoreBackend
from langchain.agents.middleware import (
    ClearToolUsesEdit,
    ContextEditingMiddleware,
    InterruptOnConfig,
    ModelFallbackMiddleware,
    ModelRetryMiddleware,
    ToolCallLimitMiddleware,
    ToolRetryMiddleware,
)
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import ToolCall
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.store.base import BaseStore
from pydantic import SecretStr

from src.agent.prompts import SQL_AGENT_PROMPT
from src.agent.subagents import SUBAGENTS
from src.common import get_logger
from src.config import settings
from src.constants import LLMProvider
from src.middleware.context_injection import inject_context
from src.middleware.schema_cache import schema_cache_middleware
from src.middleware.sql_guard import sql_guard_middleware
from src.tools.analysis_tool import analyze_query
from src.tools.chart_tool import generate_chart
from src.tools.context_tool import persist_context
from src.tools.export_tool import export_csv, export_json
from src.tools.schema_tool import get_database_schema
from src.tools.scratchpad_tool import write_scratchpad
from src.tools.sql_tool import execute_sql

logger = get_logger("agent.factory")


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


# ── Middleware registry for dynamic toggle ───────────────────────────

MIDDLEWARE_REGISTRY: dict[str, dict] = {}
"""Maps middleware name → {instance, enabled, description}. Populated at build time."""


def _build_middleware() -> list:
    """Assemble the middleware stack (7 layers).

    Order matters — middleware executes top-to-bottom:
    1. SQL guard         — block destructive queries before anything else
    2. Tool retry        — retry transient sandbox failures (timeouts, network)
    3. Tool call limit   — prevent infinite tool-call loops (safety)
    4. Schema cache      — cache get_database_schema results (Write)
    5. Context injection — enrich system prompt with cached context (Select)
    6. Context editing   — clear old tool results when context grows large
    7. Model retry       — retry transient LLM API errors with backoff
    8. Model fallback    — (optional) fall back to a secondary model
    """
    entries = [
        (
            "sql_guard",
            sql_guard_middleware,
            "Block destructive SQL (DROP, DELETE, etc.)",
        ),
        (
            "tool_retry",
            ToolRetryMiddleware(
                max_retries=2,
                backoff_factor=2.0,
                initial_delay=1.0,
                on_failure="continue",
            ),
            "Retry transient tool failures",
        ),
        (
            "tool_call_limit",
            ToolCallLimitMiddleware(
                run_limit=settings.TOOL_CALL_LIMIT_PER_RUN,
                exit_behavior="continue",
            ),
            "Limit tool calls per run",
        ),
        ("schema_cache", schema_cache_middleware, "Cache DB schema (Write strategy)"),
        (
            "context_injection",
            inject_context,
            "Inject context into system prompt (Select strategy)",
        ),
        (
            "context_editing",
            ContextEditingMiddleware(
                edits=[
                    ClearToolUsesEdit(
                        trigger=settings.CONTEXT_EDITING_TRIGGER,
                        keep=3,
                        clear_tool_inputs=False,
                        placeholder="[cleared — re-run tool if needed]",
                    )
                ],
            ),
            "Clear old tool results when context grows",
        ),
        (
            "model_retry",
            ModelRetryMiddleware(
                max_retries=3,
                backoff_factor=2.0,
                initial_delay=1.0,
                on_failure="continue",
            ),
            "Retry transient LLM API errors",
        ),
    ]

    # Optional model fallback
    if settings.LLM_FALLBACK_MODEL and settings.LLM_FALLBACK_PROVIDER:
        fallback = _build_model(
            settings.LLM_FALLBACK_PROVIDER, settings.LLM_FALLBACK_MODEL
        )
        entries.append(
            (
                "model_fallback",
                ModelFallbackMiddleware(fallback),
                "Fallback to secondary model",
            )
        )
        logger.info(
            "Model fallback enabled: %s:%s",
            settings.LLM_FALLBACK_PROVIDER,
            settings.LLM_FALLBACK_MODEL,
        )

    # Populate registry
    MIDDLEWARE_REGISTRY.clear()
    for name, instance, desc in entries:
        MIDDLEWARE_REGISTRY[name] = {
            "instance": instance,
            "enabled": True,
            "description": desc,
        }

    return [e[1] for e in entries]


def get_active_middleware() -> list:
    """Return only the currently enabled middleware instances (in order)."""
    return [v["instance"] for v in MIDDLEWARE_REGISTRY.values() if v["enabled"]]


def create_sql_agent_with_middleware(
    middleware: list,
    store: BaseStore | None = None,
    checkpointer: BaseCheckpointSaver | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> CompiledStateGraph:
    """Create agent with an explicit middleware list (for dynamic toggling)."""
    return create_deep_agent(
        model=_build_model(provider, model),
        tools=[
            execute_sql,
            get_database_schema,
            export_csv,
            export_json,
            generate_chart,
            analyze_query,
            write_scratchpad,
            persist_context,
        ],
        system_prompt=SQL_AGENT_PROMPT,
        middleware=middleware,
        backend=lambda rt: StoreBackend(rt),
        store=store,
        checkpointer=checkpointer,
        interrupt_on=_build_interrupt_on(),
        subagents=SUBAGENTS,
    )


# ── Human-in-the-Loop ────────────────────────────────────────────────


def _format_sql_approval(tool_call: ToolCall, state: Any, runtime: Any) -> str:
    """Generate a French description for SQL approval requests."""
    query = tool_call["args"].get("query", "")
    return (
        f"Approbation requise pour l'execution SQL\n\nRequete :\n```sql\n{query}\n```"
    )


def _build_interrupt_on() -> dict[str, bool | InterruptOnConfig] | None:
    """Build interrupt_on config if HITL is enabled."""
    if not settings.HITL_ENABLED:
        return None
    return {
        "execute_sql": InterruptOnConfig(
            allowed_decisions=["approve", "edit", "reject"],
            description=_format_sql_approval,
        ),
    }


# ── Agent Factory ────────────────────────────────────────────────────


def create_sql_agent(
    provider: str | None = None,
    model: str | None = None,
    store: BaseStore | None = None,
    checkpointer: BaseCheckpointSaver | None = None,
) -> CompiledStateGraph:
    """Create and return a fully configured Deep Agent for SQL analysis.

    Args:
        provider: LLM provider override (defaults to settings).
        model: LLM model override (defaults to settings).
        store: Persistent store for long-term memory (e.g. PostgresStore).
        checkpointer: Checkpoint saver for conversation history (e.g. PostgresSaver).
    """
    return create_deep_agent(
        model=_build_model(provider, model),
        tools=[
            execute_sql,
            get_database_schema,
            export_csv,
            export_json,
            generate_chart,
            analyze_query,
            write_scratchpad,
            persist_context,
        ],
        system_prompt=SQL_AGENT_PROMPT,
        middleware=_build_middleware(),
        backend=lambda rt: StoreBackend(rt),
        store=store,
        checkpointer=checkpointer,
        interrupt_on=_build_interrupt_on(),
        subagents=SUBAGENTS,
    )
