"""RAG chunk storage in AsyncPostgresStore (pgvector).

Chunks are stored under namespace ("rag", document_id) with keys "chunk_0", "chunk_1", etc.
Embeddings are computed automatically by the store's index configuration.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from langchain_core.documents import Document

from src.common import get_logger
from src.persistence.pg import get_pg_store

logger = get_logger("rag.store")


@dataclass
class RagDocument:
    """Metadata for an indexed document."""

    id: str
    name: str
    chunk_count: int
    token_count: int
    created_at: str
    mime_type: str = "text/plain"


async def store_chunks(
    chunks: list[Document],
    *,
    source_name: str,
    mime_type: str = "text/plain",
    document_id: str | None = None,
) -> RagDocument:
    """Store document chunks in the PostgresStore with automatic embedding.

    Returns metadata about the stored document.
    """
    store = get_pg_store()
    doc_id = document_id or str(uuid.uuid4())

    # Store each chunk
    items = []
    total_tokens = 0
    for i, chunk in enumerate(chunks):
        value: dict[str, Any] = {
            "text": chunk.page_content,
            "source": source_name,
            "chunk_index": i,
            "mime_type": mime_type,
            **{k: v for k, v in chunk.metadata.items() if k not in ("source",)},
        }
        items.append((("rag", doc_id), f"chunk_{i}", value))
        # Rough token estimate: 1 token ≈ 4 chars
        total_tokens += len(chunk.page_content) // 4

    # Batch put
    await store.abatch([store.aput(ns, key, val) for ns, key, val in items])

    # Store document metadata
    meta_value = {
        "name": source_name,
        "chunk_count": len(chunks),
        "token_count": total_tokens,
        "mime_type": mime_type,
        "created_at": datetime.utcnow().isoformat(),
    }
    await store.aput(("rag_meta",), doc_id, meta_value)

    logger.info(
        "Stored %d chunks for '%s' (doc_id=%s, ~%d tokens)",
        len(chunks),
        source_name,
        doc_id[:8],
        total_tokens,
    )

    return RagDocument(
        id=doc_id,
        name=source_name,
        chunk_count=len(chunks),
        token_count=total_tokens,
        created_at=meta_value["created_at"],
        mime_type=mime_type,
    )


async def list_documents() -> list[RagDocument]:
    """List all indexed RAG documents."""
    store = get_pg_store()
    items = await store.asearch(("rag_meta",), query="", limit=100)

    docs = []
    for item in items:
        val = item.value
        docs.append(
            RagDocument(
                id=item.key,
                name=val.get("name", "unknown"),
                chunk_count=val.get("chunk_count", 0),
                token_count=val.get("token_count", 0),
                created_at=val.get("created_at", ""),
                mime_type=val.get("mime_type", "text/plain"),
            )
        )

    return docs


async def delete_document(document_id: str) -> int:
    """Delete a document and all its chunks from the store.

    Returns the number of chunks deleted.
    """
    store = get_pg_store()

    # List chunks for this document
    items = await store.asearch(("rag", document_id), query="", limit=1000)
    count = len(items)

    # Delete chunks
    for item in items:
        await store.adelete(("rag", document_id), item.key)

    # Delete metadata
    await store.adelete(("rag_meta",), document_id)

    logger.info("Deleted document %s (%d chunks)", document_id[:8], count)
    return count
