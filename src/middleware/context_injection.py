"""Context injection middleware — enriches the system prompt before each LLM call.

Strategy: **Select** — pulls cached schema, user context, scratchpad, and
conversation summary into the prompt so the model has the right information
for the next step.

Includes **short memory recall**: semantic search over the PostgresStore to
surface relevant past context before each LLM call.

Scratchpad notes are ranked by reward score (human feedback +1/-1) so the
agent sees the most valuable notes first.
"""

from __future__ import annotations

from langchain.agents.middleware import dynamic_prompt
from langchain.agents.middleware.types import ModelRequest

from src.common import get_logger
from src.config import settings
from src.context.store import ContextStore, RecalledMemory, get_current_store

logger = get_logger("middleware.context_injection")


@dynamic_prompt
async def inject_context(request: ModelRequest) -> str:  # type: ignore[type-arg]
    """Build an enriched system prompt with all available context."""
    store = get_current_store()
    prompt = request.system_prompt or ""

    sections: list[str] = []

    if store.schema_cache:
        schema_text = "\n\n".join(
            f"-- {key} --\n{value}" for key, value in store.schema_cache.items()
        )
        sections.append(f"<schema_cache>\n{schema_text}\n</schema_cache>")

    if store.user_context:
        items = "\n".join(f"- [{c.source}] {c.text}" for c in store.user_context)
        sections.append(f"<user_context>\n{items}\n</user_context>")

    if store.scratchpad:
        # Only inject notes with score >= 0 (negative = rejected by user)
        ranked = [n for n in store.ranked_notes() if n.score >= 0]
        if ranked:
            notes_lines = []
            for n in ranked:
                score_tag = f" [score:{n.score:+d}]" if n.score > 0 else ""
                notes_lines.append(f"- {n.note}{score_tag}")
            notes_text = "\n".join(notes_lines)

            stats = store.reward_summary()
            reward_hint = (
                f"\n(Reward: {stats['total']} notes total, "
                f"{stats['positive']} positives, "
                f"{stats['negative']} rejetees — non injectees. "
                "Evite de reproduire le type de notes rejetees.)"
            )
            sections.append(f"<scratchpad>\n{notes_text}{reward_hint}\n</scratchpad>")

    # Short memory recall — semantic search for relevant past context
    # Cache per user message: skip re-search on subsequent LLM calls within same turn
    if settings.RECALL_ENABLED:
        last_msg = _extract_last_user_message(request.messages)
        if store._last_recall_query == last_msg and store.last_recall:
            logger.debug("[recall] cached — reusing %d results", len(store.last_recall))
        else:
            recalled = await _recall_short_memory(request, store)
            if recalled:
                store.last_recall = recalled
                store._last_recall_query = last_msg

        if store.last_recall:
            recall_lines = [
                f"- [score:{r.score:.2f}] {r.text}" for r in store.last_recall
            ]
            sections.append(
                "<recalled_memory>\n"
                + "\n".join(recall_lines)
                + "\n(Souvenirs rappeles automatiquement par recherche semantique "
                "sur les sessions precedentes.)" + "\n</recalled_memory>"
            )

    # RAG context — search indexed documents for relevant chunks
    if settings.RECALL_ENABLED:
        rag_chunks = await _recall_rag_context(request)
        if rag_chunks:
            rag_lines = [f"- [score:{r.score:.2f}] {r.text}" for r in rag_chunks]
            sections.append(
                "<rag_context>\n"
                + "\n".join(rag_lines)
                + "\n(Extraits de documents indexes via RAG.)"
                + "\n</rag_context>"
            )

    if store.summary:
        sections.append(
            f"<conversation_summary>\n{store.summary}\n</conversation_summary>"
        )

    if sections:
        prompt += "\n\n" + "\n\n".join(sections)

    return prompt


# ── Short memory recall helpers ──────────────────────────────────────


def _extract_last_user_message(messages: list) -> str | None:
    """Walk messages backwards to find the last HumanMessage content."""
    for msg in reversed(messages):
        if getattr(msg, "type", None) == "human":
            content = msg.content
            return content if isinstance(content, str) else str(content)
    return None


def _collect_existing_texts(store: ContextStore) -> set[str]:
    """Collect all text currently in the store for deduplication."""
    texts: set[str] = set()
    for entry in store.user_context:
        texts.add(entry.text)
    for note in store.scratchpad:
        texts.add(note.note)
    for ddl in store.schema_cache.values():
        texts.add(ddl)
    if store.summary:
        texts.add(store.summary)
    return texts


def _extract_text_from_hit(hit: dict) -> str | None:
    """Extract a readable text summary from a search hit value.

    The stored value is a serialized ContextStore dict.  Extract the most
    relevant parts: scratchpad notes and user_context entries.
    """
    value = hit.get("value", {})
    if not isinstance(value, dict):
        return str(value)[:500] if value else None

    parts: list[str] = []
    for note in value.get("scratchpad", []):
        text = note.get("note", "")
        if text:
            parts.append(f"[note] {text}")
    for ctx in value.get("user_context", []):
        text = ctx.get("text", "")
        if text:
            parts.append(f"[ctx] {text}")
    if value.get("summary"):
        parts.append(f"[summary] {value['summary']}")

    return " | ".join(parts) if parts else None


async def _recall_rag_context(
    request: ModelRequest,  # type: ignore[type-arg]
) -> list[RecalledMemory]:
    """Search RAG-indexed documents for chunks relevant to the last user message."""
    from src.persistence.pg import get_pg_store

    last_msg = _extract_last_user_message(request.messages)
    if not last_msg or len(last_msg) < 10:
        return []

    try:
        store = get_pg_store()
        hits = await store.asearch(
            ("rag",),
            query=last_msg,
            limit=settings.RAG_RECALL_LIMIT,
        )
    except Exception as exc:
        logger.warning("RAG recall search failed: %s", exc)
        return []

    recalled: list[RecalledMemory] = []
    for hit in hits:
        score = getattr(hit, "score", 0.0) or 0.0
        if score < settings.RAG_RECALL_MIN_SCORE:
            continue
        text = hit.value.get("text", "")
        if not text:
            continue
        source = hit.value.get("source", "unknown")
        recalled.append(
            RecalledMemory(
                text=f"[{source}] {text}",
                score=score,
                source_thread="rag",
            )
        )

    if recalled:
        logger.info(
            "RAG recall: query='%s' hits=%d injected=%d",
            last_msg[:50],
            len(hits),
            len(recalled),
        )

    return recalled


async def _recall_short_memory(
    request: ModelRequest,  # type: ignore[type-arg]
    store: ContextStore,
) -> list[RecalledMemory]:
    """Search PG store for memories relevant to the last user message."""
    from src.context.thread_var import current_thread_id

    # 1. Extract last user message
    last_msg = _extract_last_user_message(request.messages)
    if not last_msg or len(last_msg) < 10:
        return []

    # 2. Get thread_id from ContextVar (reliable)
    thread_id = current_thread_id.get()

    # 3. Search — hybrid (BM25 + vector) or vector-only
    try:
        if settings.HYBRID_SEARCH_ENABLED:
            from src.context.hybrid_search import hybrid_search

            raw_hits = await hybrid_search(
                query=last_msg,
                limit=settings.RECALL_LIMIT + 2,
            )
        else:
            from src.context.pg_sync import search_context

            raw_hits = await search_context(
                query=last_msg,
                limit=settings.RECALL_LIMIT + 2,
            )
    except Exception as exc:
        logger.warning("Recall search failed: %s", exc)
        return []

    # 4. Filter, deduplicate (O(1) prefix set), budget
    existing_prefixes = {t[:80] for t in _collect_existing_texts(store)}
    recalled: list[RecalledMemory] = []
    total_chars = 0

    for hit in raw_hits:
        score = hit.get("score") or 0.0
        if score < settings.RECALL_MIN_SCORE:
            continue

        namespace = hit.get("namespace", [])
        source_thread = namespace[1] if len(namespace) > 1 else "unknown"
        if source_thread == thread_id:
            continue

        text = _extract_text_from_hit(hit)
        if not text:
            continue

        if text[:80] in existing_prefixes:
            continue

        if total_chars + len(text) > settings.RECALL_MAX_CHARS:
            text = text[: settings.RECALL_MAX_CHARS - total_chars] + "..."

        recalled.append(
            RecalledMemory(
                text=text,
                score=score,
                source_thread=source_thread,
            )
        )
        total_chars += len(text)

        if (
            total_chars >= settings.RECALL_MAX_CHARS
            or len(recalled) >= settings.RECALL_LIMIT
        ):
            break

    # 5. Summary log
    logger.info(
        "Recall: query='%s' thread=%s hits=%d injected=%d scores=%s",
        last_msg[:50],
        thread_id[:8],
        len(raw_hits),
        len(recalled),
        [round(r.score, 4) for r in recalled] if recalled else "[]",
    )

    return recalled
