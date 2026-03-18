"""Agent factory - wires together the Deep Agent with tools, middleware, and sandbox."""

from __future__ import annotations

from deepagents import create_deep_agent
from deepagents.backends import StoreBackend
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.store.memory import InMemoryStore

from src.agent.prompts import SQL_AGENT_PROMPT
from src.config import settings
from src.constants import LLMProvider
from src.middleware.logging_mw import log_tool_calls
from src.middleware.sql_guard import sql_guard_middleware
from src.sandbox.app import get_or_create_sandbox
from src.tools.schema_tool import get_database_schema
from src.tools.sql_tool import execute_sql

# Persistent store and checkpointer (survive across requests, not across restarts)
store = InMemoryStore()
checkpointer = MemorySaver()


def _build_model() -> BaseChatModel:
    """Build the LLM model based on settings."""
    provider = settings.LLM_PROVIDER.lower()

    if provider == LLMProvider.OPENAI:
        return ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.OPENAI_API_KEY,
        )

    return ChatAnthropic(
        model=settings.LLM_MODEL,
        api_key=settings.ANTHROPIC_API_KEY,
        max_retries=6,
    )


def create_sql_agent() -> CompiledStateGraph:
    """Create and return a fully configured Deep Agent for SQL analysis."""
    get_or_create_sandbox()

    return create_deep_agent(
        model=_build_model(),
        tools=[execute_sql, get_database_schema],
        system_prompt=SQL_AGENT_PROMPT,
        middleware=[
            sql_guard_middleware,
            log_tool_calls,
        ],
        backend=lambda rt: StoreBackend(rt),
        store=store,
        checkpointer=checkpointer,
    )
