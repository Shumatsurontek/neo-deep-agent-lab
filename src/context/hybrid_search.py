"""Hybrid BM25 + vector search using ParadeDB pg_search and pgvector.

Combines lexical (BM25) and semantic (embedding) search results via
Reciprocal Rank Fusion (RRF) for better recall than either alone.

Falls back to vector-only search if pg_search is not available.
"""

from __future__ import annotations

import asyncio
from typing import Any

from src.common import get_logger
from src.config import settings
from src.context.pg_sync import search_context

logger = get_logger("context.hybrid_search")


async def hybrid_search(
    query: str,
    *,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Hybrid BM25 + vector search with Reciprocal Rank Fusion.

    Args:
        query: Natural language search query.
        limit: Maximum number of results to return.

    Returns:
        List of dicts with namespace, key, score, value keys — same format
        as ``search_context`` for drop-in compatibility.
    """
    vector_weight = settings.HYBRID_VECTOR_WEIGHT
    bm25_weight = settings.HYBRID_BM25_WEIGHT
    k = settings.HYBRID_RRF_K

    # 1. Parallel vector + BM25 search (both are async coroutines)
    vector_result, bm25_result = await asyncio.gather(
        search_context(query, limit=limit * 2),
        _bm25_search(query, limit=limit * 2),
        return_exceptions=True,
    )

    # Handle exceptions gracefully
    vector_hits: list[dict[str, Any]] = (
        vector_result if isinstance(vector_result, list) else []
    )
    bm25_hits: list[dict[str, Any]] = (
        bm25_result if isinstance(bm25_result, list) else []
    )

    if isinstance(vector_result, Exception):
        logger.warning("Vector search failed: %s", vector_result)
    if isinstance(bm25_result, Exception):
        logger.warning("BM25 search failed in gather: %s", bm25_result)

    if not bm25_hits:
        # pg_search not available or no BM25 results — fall back to vector only
        logger.info("No BM25 hits — returning vector-only results")
        return vector_hits[:limit]

    # 3. Reciprocal Rank Fusion
    scores: dict[tuple, float] = {}
    metadata: dict[tuple, dict] = {}

    for rank, hit in enumerate(vector_hits):
        hit_key = _make_key(hit)
        scores[hit_key] = scores.get(hit_key, 0) + vector_weight / (k + rank + 1)
        metadata[hit_key] = hit

    for rank, hit in enumerate(bm25_hits):
        hit_key = _make_key(hit)
        scores[hit_key] = scores.get(hit_key, 0) + bm25_weight / (k + rank + 1)
        if hit_key not in metadata:
            metadata[hit_key] = hit

    # Sort by RRF score descending, normalize to [0, 1]
    max_rrf = (vector_weight + bm25_weight) / (k + 1)  # theoretical max
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]

    results = [
        {**metadata[hit_key], "score": rrf_score / max_rrf if max_rrf > 0 else 0}
        for hit_key, rrf_score in ranked
    ]

    logger.info(
        "Hybrid search: query='%s' vector=%d bm25=%d fused=%d",
        query[:50],
        len(vector_hits),
        len(bm25_hits),
        len(results),
    )

    return results


def _make_key(hit: dict) -> tuple:
    """Create a hashable key from a hit for deduplication."""
    ns = hit.get("namespace", [])
    return (tuple(ns) if isinstance(ns, list) else ns, hit.get("key", ""))


def _sanitize_bm25_query(raw: str) -> str:
    """Sanitize a natural-language query for ParadeDB BM25 search.

    ParadeDB expects `column:term` pairs. Special characters like apostrophes,
    parentheses, colons, and question marks break the parser. We strip them,
    split into words, and join with OR.
    """
    import re

    # Remove characters that break ParadeDB query parser
    cleaned = re.sub(r"['\"\(\)\?\!\:\;\,\.\[\]\{\}\+\-\&\|\~\^\*\\\/]", " ", raw)
    terms = [t for t in cleaned.split() if len(t) >= 2]
    if not terms:
        return ""
    # Build ParadeDB query: searchable_text:term1 OR searchable_text:term2 ...
    return " OR ".join(f"searchable_text:{t}" for t in terms)


async def _bm25_search(query: str, *, limit: int = 10) -> list[dict[str, Any]]:
    """Execute BM25 full-text search via ParadeDB pg_search extension.

    Returns results in the same format as ``search_context`` for easy merging.
    Uses the shared connection pool when available (avoids per-query TCP handshakes).
    """
    import psycopg
    import psycopg.rows

    from src.persistence.pg import get_bm25_pool

    sanitized = _sanitize_bm25_query(query)
    if not sanitized:
        logger.debug("BM25 search skipped: query empty after sanitization")
        return []

    async def _run_query(cur) -> list[dict[str, Any]]:
        await cur.execute(
            """
            SELECT prefix, key, value,
                   paradedb.score(id) AS bm25_score
            FROM store
            WHERE searchable_text @@@ %(query)s
            ORDER BY bm25_score DESC
            LIMIT %(limit)s;
            """,
            {"query": sanitized, "limit": limit},
        )
        rows = await cur.fetchall()
        results = []
        for row in rows:
            prefix = row["prefix"]
            namespace = prefix.split(".") if prefix else []
            results.append(
                {
                    "namespace": namespace,
                    "key": row["key"],
                    "score": row.get("bm25_score"),
                    "value": row["value"],
                }
            )
        if results:
            logger.info(
                "BM25 search: query='%s' hits=%d top_score=%.4f",
                query[:50],
                len(results),
                results[0]["score"],
            )
        return results

    try:
        pool = get_bm25_pool()
        if pool is not None:
            async with pool.connection() as conn:
                async with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                    return await _run_query(cur)

        # Fallback: no pool available, open a one-off connection
        async with await psycopg.AsyncConnection.connect(settings.DATABASE_URL) as conn:
            async with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                return await _run_query(cur)

    except Exception as exc:
        logger.warning("BM25 search failed: %s", exc)
        return []
