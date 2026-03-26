"""PostgreSQL persistence for LangGraph store and checkpointer.

Uses ``AsyncPostgresStore`` for long-term memory (cross-session) and
``AsyncPostgresSaver`` for conversation checkpointing (per-thread).

Both share the same ``DATABASE_URL`` connection string but create
separate tables via their respective ``setup()`` calls.
"""

from __future__ import annotations

from typing import Any

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore
from langgraph.store.postgres.base import PostgresIndexConfig

from src.common import get_logger
from src.config import settings

logger = get_logger("persistence")

_pg_store: AsyncPostgresStore | None = None
_pg_saver: AsyncPostgresSaver | None = None
# Keep references to the async context managers so we can __aexit__ on shutdown.
_store_cm: Any = None
_saver_cm: Any = None
# Shared connection pool for BM25 queries (avoids per-query TCP handshakes).
_bm25_pool: Any = None


async def init_persistence() -> tuple[AsyncPostgresStore, AsyncPostgresSaver]:
    """Initialize AsyncPostgresStore and AsyncPostgresSaver.  Call once at startup.

    ``from_conn_string`` returns an async context-manager that owns the
    connection pool.  We enter it here and exit it in ``close_persistence()``.
    """
    global _pg_store, _pg_saver, _store_cm, _saver_cm, _bm25_pool

    logger.info("Initializing PostgreSQL persistence: %s", settings.DATABASE_URL)

    index_config: PostgresIndexConfig = {
        "dims": settings.EMBEDDING_DIMS,
        "embed": settings.EMBEDDING_MODEL,
        "fields": ["$"],
    }
    _store_cm = AsyncPostgresStore.from_conn_string(
        settings.DATABASE_URL,
        index=index_config,
    )
    _pg_store = await _store_cm.__aenter__()
    await _pg_store.setup()

    _saver_cm = AsyncPostgresSaver.from_conn_string(settings.DATABASE_URL)
    _pg_saver = await _saver_cm.__aenter__()
    await _pg_saver.setup()

    logger.info(
        "AsyncPostgresStore ready — embedding index: model=%s, dims=%d, fields=%s",
        settings.EMBEDDING_MODEL,
        settings.EMBEDDING_DIMS,
        index_config["fields"],
    )
    logger.info("AsyncPostgresSaver ready.")

    # BM25 index for hybrid search (requires ParadeDB pg_search extension)
    await _ensure_bm25_index()

    # Shared connection pool for BM25 queries
    try:
        from psycopg_pool import AsyncConnectionPool

        _bm25_pool = AsyncConnectionPool(settings.DATABASE_URL, min_size=2, max_size=5)
        await _bm25_pool.open()
        logger.info("BM25 connection pool ready (min=2, max=5).")
    except Exception as exc:
        logger.warning("BM25 connection pool setup skipped: %s", exc)

    return _pg_store, _pg_saver


def get_pg_store() -> AsyncPostgresStore:
    """Return the initialized AsyncPostgresStore.  Raises if not initialized."""
    if _pg_store is None:
        raise RuntimeError(
            "PostgresStore not initialized — call init_persistence() first."
        )
    return _pg_store


def get_pg_saver() -> AsyncPostgresSaver:
    """Return the initialized AsyncPostgresSaver.  Raises if not initialized."""
    if _pg_saver is None:
        raise RuntimeError(
            "PostgresSaver not initialized — call init_persistence() first."
        )
    return _pg_saver


def get_bm25_pool():
    """Return the shared BM25 connection pool, or None if unavailable."""
    return _bm25_pool


async def _ensure_bm25_index() -> None:
    """Create pg_search BM25 index on the store table if not already present.

    Requires the ParadeDB image (paradedb/paradedb) with pg_search extension.
    Gracefully skips if pg_search is not available (e.g. during tests).

    Uses a plain TEXT column + trigger (PG forbids subqueries in generated columns).
    """
    import psycopg

    try:
        async with await psycopg.AsyncConnection.connect(
            settings.DATABASE_URL,
            autocommit=True,
        ) as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS pg_search;")

            # 1. Plain TEXT column for searchable text + auto-increment id for BM25 key
            await conn.execute(
                "ALTER TABLE store ADD COLUMN IF NOT EXISTS searchable_text TEXT DEFAULT '';"
            )
            await conn.execute("ALTER TABLE store ADD COLUMN IF NOT EXISTS id SERIAL;")
            # Unique index on id required by ParadeDB BM25 key_field
            await conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS store_id_uniq ON store (id);"
            )

            # 2. PL/pgSQL function to extract text from JSONB value
            #    Handles BOTH context store items (summary/scratchpad/user_context)
            #    AND RAG chunks (text field)
            await conn.execute(
                """
                CREATE OR REPLACE FUNCTION store_searchable_text_fn()
                RETURNS trigger AS $$
                DECLARE
                    _chunk   TEXT;
                    _summary TEXT;
                    _notes   TEXT;
                    _ctx     TEXT;
                BEGIN
                    -- RAG chunk text (from /documents/text indexing)
                    _chunk := coalesce(NEW.value->>'text', '');

                    -- Context store fields
                    _summary := coalesce(NEW.value->>'summary', '');

                    SELECT coalesce(string_agg(n->>'note', ' '), '')
                      INTO _notes
                      FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(NEW.value->'scratchpad') = 'array'
                               THEN NEW.value->'scratchpad' ELSE '[]'::jsonb END
                      ) AS n;

                    SELECT coalesce(string_agg(c->>'text', ' '), '')
                      INTO _ctx
                      FROM jsonb_array_elements(
                          CASE WHEN jsonb_typeof(NEW.value->'user_context') = 'array'
                               THEN NEW.value->'user_context' ELSE '[]'::jsonb END
                      ) AS c;

                    NEW.searchable_text := _chunk || ' ' || _summary || ' ' || _notes || ' ' || _ctx;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                """
            )

            # 3. Trigger on INSERT/UPDATE
            await conn.execute(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_trigger
                        WHERE tgname = 'trg_store_searchable_text'
                    ) THEN
                        CREATE TRIGGER trg_store_searchable_text
                        BEFORE INSERT OR UPDATE ON store
                        FOR EACH ROW EXECUTE FUNCTION store_searchable_text_fn();
                    END IF;
                END $$;
                """
            )

            # 4. Backfill existing rows (includes RAG chunk text + context fields)
            await conn.execute(
                """
                UPDATE store SET searchable_text = (
                    coalesce(value->>'text', '') || ' ' ||
                    coalesce(value->>'summary', '') || ' ' ||
                    coalesce(
                        (SELECT string_agg(n->>'note', ' ')
                         FROM jsonb_array_elements(
                             CASE WHEN jsonb_typeof(value->'scratchpad') = 'array'
                                  THEN value->'scratchpad' ELSE '[]'::jsonb END
                         ) AS n), ''
                    ) || ' ' ||
                    coalesce(
                        (SELECT string_agg(c->>'text', ' ')
                         FROM jsonb_array_elements(
                             CASE WHEN jsonb_typeof(value->'user_context') = 'array'
                                  THEN value->'user_context' ELSE '[]'::jsonb END
                         ) AS c), ''
                    )
                ) WHERE searchable_text IS NULL OR searchable_text = '';
                """
            )

            # 5. BM25 index via ParadeDB pg_search
            #    key_field must be a unique column — id (SERIAL) is included in index cols
            await conn.execute(
                """
                CREATE INDEX IF NOT EXISTS store_bm25_idx
                ON store USING bm25 (id, searchable_text)
                WITH (key_field = 'id');
                """
            )
            logger.info("BM25 index ready (pg_search).")
    except Exception as exc:
        logger.warning("BM25 index setup skipped: %s", exc)


async def close_persistence() -> None:
    """Clean shutdown — exit the async context managers to release connection pools."""
    global _pg_store, _pg_saver, _store_cm, _saver_cm, _bm25_pool
    logger.info("Closing PostgreSQL persistence connections.")
    if _bm25_pool is not None:
        await _bm25_pool.close()
        _bm25_pool = None
    if _saver_cm is not None:
        await _saver_cm.__aexit__(None, None, None)
        _saver_cm = None
    if _store_cm is not None:
        await _store_cm.__aexit__(None, None, None)
        _store_cm = None
    _pg_store = None
    _pg_saver = None
