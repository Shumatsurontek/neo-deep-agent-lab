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

    # Persistence (local PG for store + checkpointer — separate from Modal sandbox PG)
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:17/neo_agent"

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_MODE: str = "dev"  # "dev" for human-readable, "json" for structured JSON

    # Embeddings (for PostgresStore semantic search)
    EMBEDDING_MODEL: str = "openai:text-embedding-3-small"
    EMBEDDING_DIMS: int = 1536

    # Session
    SESSION_TTL_SECONDS: int = 3600  # 1h

    # Middleware
    CONTEXT_EDITING_TRIGGER: int = 80_000  # tokens threshold to clear old tool results
    TOOL_CALL_LIMIT_PER_RUN: int = 20  # max tool calls per agent run (safety)
    HITL_ENABLED: bool = (
        True  # human-in-the-loop approval for SQL execution (toggle via /hitl)
    )

    # Short memory recall (semantic search injected before each LLM call)
    RECALL_ENABLED: bool = True
    RECALL_LIMIT: int = 3  # max results from semantic search
    RECALL_MIN_SCORE: float = 0.1  # minimum similarity score to include
    RECALL_MAX_CHARS: int = 2000  # total character budget for recalled memories

    # Hybrid search (BM25 + vector via ParadeDB pg_search)
    HYBRID_SEARCH_ENABLED: bool = True
    HYBRID_VECTOR_WEIGHT: float = 0.6
    HYBRID_BM25_WEIGHT: float = 0.4
    HYBRID_RRF_K: int = 60  # Reciprocal Rank Fusion constant

    # RAG
    RAG_CHUNK_MAX_TOKENS: int = 400
    RAG_CHUNK_OVERLAP: int = 50
    RAG_RECALL_LIMIT: int = 3
    RAG_RECALL_MIN_SCORE: float = 0.2

    # Clerk
    CLERK_DOMAIN: str = ""  # e.g. "your-app.clerk.accounts.dev"
    CLERK_ENABLED: bool = False

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
