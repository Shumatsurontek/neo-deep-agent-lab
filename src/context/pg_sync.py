"""Sync ContextStore to/from PostgresStore for cross-restart persistence.

Uses a LangGraph store namespace ``("context", <thread_id>)`` with a single
key ``"state"`` holding the serialized ContextStore dict.

Semantic search is available via ``search_context()`` which uses the
PostgresStore vector index (embeddings configured at init time).
"""

from __future__ import annotations

from typing import Any

from src.common import get_logger
from src.context.store import ContextStore

logger = get_logger("context.pg_sync")

_NAMESPACE_PREFIX = "context"
_KEY = "state"


async def save_context(thread_id: str, store: ContextStore) -> None:
    """Persist a ContextStore to PostgresStore."""
    from src.persistence.pg import get_pg_store

    try:
        pg = get_pg_store()
        data = store.to_dict()
        logger.debug(
            "Saving context for thread=%s — schema_keys=%d, user_ctx=%d, notes=%d",
            thread_id[:8],
            len(data.get("schema_cache", {})),
            len(data.get("user_context", [])),
            len(data.get("scratchpad", [])),
        )
        await pg.aput((_NAMESPACE_PREFIX, thread_id), _KEY, data)
        logger.debug("Context saved (embedding will index asynchronously)")
    except Exception as exc:
        logger.warning("Failed to save context for thread=%s: %s", thread_id[:8], exc)


async def load_context(thread_id: str) -> ContextStore | None:
    """Load a ContextStore from PostgresStore. Returns None if not found."""
    from src.persistence.pg import get_pg_store

    try:
        pg = get_pg_store()
        item = await pg.aget((_NAMESPACE_PREFIX, thread_id), _KEY)
        if item and item.value:
            logger.info("Restored context from PG for thread=%s", thread_id[:8])
            return ContextStore.from_dict(item.value)
    except Exception as exc:
        logger.warning("Failed to load context for thread=%s: %s", thread_id[:8], exc)
    return None


async def delete_context(thread_id: str) -> None:
    """Delete persisted context for a thread."""
    from src.persistence.pg import get_pg_store

    try:
        pg = get_pg_store()
        await pg.adelete((_NAMESPACE_PREFIX, thread_id), _KEY)
    except Exception as exc:
        logger.warning("Failed to delete context for thread=%s: %s", thread_id[:8], exc)


async def search_context(
    query: str,
    *,
    thread_id: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Semantic search across all persisted context stores.

    If ``thread_id`` is provided, restricts search to that thread's namespace.
    Otherwise searches across all threads.

    Returns a list of dicts with ``thread_id``, ``score``, and ``value`` keys.
    """
    from src.persistence.pg import get_pg_store

    try:
        pg = get_pg_store()
        namespace: tuple[str, ...] = (_NAMESPACE_PREFIX,)
        if thread_id:
            namespace = (_NAMESPACE_PREFIX, thread_id)
        logger.info(
            "Semantic search: query='%s', namespace=%s, limit=%d",
            query[:80],
            namespace,
            limit,
        )
        results = await pg.asearch(namespace, query=query, limit=limit)
        hits = [
            {
                "namespace": list(item.namespace),
                "key": item.key,
                "score": getattr(item, "score", None),
                "value": item.value,
            }
            for item in results
        ]
        if hits:
            scores = [h["score"] for h in hits if h["score"] is not None]
            logger.info(
                "Search returned %d hit(s) — scores: %s",
                len(hits),
                [round(s, 4) for s in scores] if scores else "n/a",
            )
        else:
            logger.info("Search returned 0 hits for query='%s'", query[:80])
        return hits
    except Exception as exc:
        logger.warning("Search failed for query='%s': %s", query[:50], exc)
        return []
