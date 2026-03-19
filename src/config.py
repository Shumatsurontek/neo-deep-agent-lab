from pydantic_settings import BaseSettings

from src.constants import (
    DEFAULT_MAX_RESULT_ROWS,
    DEFAULT_SERVER_PORT,
    DEFAULT_SQL_TIMEOUT_MS,
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Modal
    MODAL_TOKEN_ID: str = ""
    MODAL_TOKEN_SECRET: str = ""

    # LLM
    TAVILY_API_KEY: str = ""
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-5-mini-2025-08-07"
    LLM_FALLBACK_MODEL: str = (
        "gpt-4.1-mini"  # e.g. "claude-sonnet-4-20250514" or "gpt-4.1-mini"
    )
    LLM_FALLBACK_PROVIDER: str = "openai"  # "anthropic" or "openai"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    # Middleware
    CONTEXT_EDITING_TRIGGER: int = 80_000  # tokens threshold to clear old tool results
    TOOL_CALL_LIMIT_PER_RUN: int = 20  # max tool calls per agent run (safety)

    # SQL
    SQL_TIMEOUT_MS: int = DEFAULT_SQL_TIMEOUT_MS
    MAX_RESULT_ROWS: int = DEFAULT_MAX_RESULT_ROWS

    # Server
    SERVER_PORT: int = DEFAULT_SERVER_PORT

    # Dump
    DB_DUMP_PATH: str = "data/neo_dump.sql"

    # LangSmith (auto-read by LangChain when set)
    LANGCHAIN_TRACING_V2: str = ""
    LANGCHAIN_API_KEY: str = ""
    LANGCHAIN_PROJECT: str = "neo-deep-agent-lab"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
