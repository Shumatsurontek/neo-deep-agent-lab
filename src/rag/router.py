"""FastAPI router for RAG document management endpoints."""

from __future__ import annotations

import asyncio
import json
import mimetypes
import tempfile
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from src.common import get_logger
from src.rag.parser import parse_document, parse_text
from src.rag.splitter import split_documents
from src.rag.store import delete_document, get_chunks, list_documents, store_chunks

logger = get_logger("rag.router")

router = APIRouter(prefix="/documents", tags=["rag"])


class TextIndexRequest(BaseModel):
    text: str
    name: str = "inline-document"


class DocumentResponse(BaseModel):
    id: str
    name: str
    chunk_count: int
    token_count: int
    created_at: str
    mime_type: str


class DeleteResponse(BaseModel):
    deleted_chunks: int


def _guess_mime(filename: str) -> str:
    """Guess MIME type from filename extension."""
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload a file, parse it, chunk it, and store embeddings in pgvector."""
    mime_type = _guess_mime(file.filename or "file.txt")

    # Save to temp file for unstructured to process
    suffix = Path(file.filename or "file.txt").suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        docs = parse_document(tmp_path)
        chunks = split_documents(docs, mime_type=mime_type)
        result = await store_chunks(
            chunks,
            source_name=file.filename or "uploaded-file",
            mime_type=mime_type,
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return DocumentResponse(
        id=result.id,
        name=result.name,
        chunk_count=result.chunk_count,
        token_count=result.token_count,
        created_at=result.created_at,
        mime_type=result.mime_type,
    )


@router.post("/text", response_model=DocumentResponse)
async def index_text(req: TextIndexRequest):
    """Index raw text (e.g. from Yoopta editor) into the RAG store."""
    docs = parse_text(req.text, source=req.name)
    chunks = split_documents(docs, mime_type="text/plain")
    result = await store_chunks(chunks, source_name=req.name)

    return DocumentResponse(
        id=result.id,
        name=result.name,
        chunk_count=result.chunk_count,
        token_count=result.token_count,
        created_at=result.created_at,
        mime_type=result.mime_type,
    )


@router.get("", response_model=list[DocumentResponse])
async def get_documents():
    """List all indexed RAG documents."""
    docs = await list_documents()
    return [
        DocumentResponse(
            id=d.id,
            name=d.name,
            chunk_count=d.chunk_count,
            token_count=d.token_count,
            created_at=d.created_at,
            mime_type=d.mime_type,
        )
        for d in docs
    ]


@router.get("/{document_id}/chunks")
async def get_document_chunks(document_id: str):
    """Return all chunks for a given document."""
    chunks = await get_chunks(document_id)
    return {
        "document_id": document_id,
        "chunks": [
            {
                "index": c.index,
                "text": c.text,
                "source": c.source,
                "token_estimate": c.token_estimate,
            }
            for c in chunks
        ],
        "total": len(chunks),
    }


@router.delete("/{document_id}", response_model=DeleteResponse)
async def remove_document(document_id: str):
    """Delete a document and all its chunks."""
    count = await delete_document(document_id)
    return DeleteResponse(deleted_chunks=count)


def _sse(event_type: str, data: dict) -> str:
    """Format an SSE line."""
    return f"data: {json.dumps({'type': event_type, **data})}\n\n"


def _progress_phase(msg: str) -> str:
    """Determine SSE phase from progress message."""
    low = msg.lower()
    if "embedding" in low or "storing" in low:
        return "embedding"
    return "preparing"


def _result_to_dict(result) -> dict:  # type: ignore[no-untyped-def]
    """Convert RagDocument to serializable dict."""
    return {
        "id": result.id,
        "name": result.name,
        "chunk_count": result.chunk_count,
        "token_count": result.token_count,
        "created_at": result.created_at,
        "mime_type": result.mime_type,
    }


async def _stream_store(
    chunks,  # type: ignore[no-untyped-def]
    *,
    source_name: str,
    mime_type: str = "text/plain",
) -> AsyncGenerator[str, None]:
    """Shared helper: store chunks with SSE progress events."""
    queue: asyncio.Queue[tuple[int, int, str]] = asyncio.Queue()

    def on_progress(cur: int, tot: int, msg: str) -> None:
        queue.put_nowait((cur, tot, msg))

    task = asyncio.create_task(
        store_chunks(
            chunks,
            source_name=source_name,
            mime_type=mime_type,
            on_progress=on_progress,
        )
    )

    while not task.done():
        try:
            cur, tot, msg = await asyncio.wait_for(
                queue.get(),
                timeout=0.1,
            )
            yield _sse(
                _progress_phase(msg),
                {
                    "current": cur,
                    "total": tot,
                    "message": msg,
                },
            )
        except asyncio.TimeoutError:
            continue

    # Drain remaining
    while not queue.empty():
        cur, tot, msg = queue.get_nowait()
        yield _sse(
            _progress_phase(msg),
            {
                "current": cur,
                "total": tot,
                "message": msg,
            },
        )

    result = await task
    cc = result.chunk_count
    tc = result.token_count
    yield _sse(
        "done",
        {
            "message": f"Indexed {cc} chunks (~{tc} tokens)",
            "document": _result_to_dict(result),
        },
    )


@router.post("/upload-stream")
async def upload_document_stream(file: UploadFile = File(...)):
    """Upload a file with real-time SSE progress events.

    Events emitted:
      - parsing: file is being parsed
      - splitting: chunks are being created
      - preparing: chunk N/total prepared
      - embedding: batch embedding + storing in pgvector
      - done: final result with document metadata
      - error: if something went wrong
    """
    mime_type = _guess_mime(file.filename or "file.txt")
    suffix = Path(file.filename or "file.txt").suffix

    async def generate() -> AsyncGenerator[str, None]:
        fname = file.filename or "file.txt"
        tmp_path: str | None = None
        yield _sse(
            "parsing",
            {
                "message": f"Parsing {fname}...",
                "filename": fname,
            },
        )

        try:
            with tempfile.NamedTemporaryFile(
                suffix=suffix,
                delete=False,
            ) as tmp:
                content = await file.read()
                tmp.write(content)
                tmp_path = tmp.name

            docs = parse_document(tmp_path)
            n = len(docs)
            yield _sse(
                "parsing",
                {
                    "message": f"Parsed {n} section(s)",
                    "sections": n,
                },
            )

            yield _sse(
                "splitting",
                {
                    "message": "Splitting into chunks...",
                },
            )
            chunks = split_documents(docs, mime_type=mime_type)
            nc = len(chunks)
            yield _sse(
                "splitting",
                {
                    "message": f"Created {nc} chunks",
                    "chunk_count": nc,
                },
            )

            async for evt in _stream_store(
                chunks,
                source_name=fname.replace(".txt", "") or "uploaded-file",
                mime_type=mime_type,
            ):
                yield evt

        except Exception as exc:
            logger.exception("Streaming upload failed")
            yield _sse("error", {"message": str(exc)})
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    return StreamingResponse(
        content=generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/text-stream")
async def index_text_stream(req: TextIndexRequest):
    """Index raw text with real-time SSE progress events."""

    async def generate() -> AsyncGenerator[str, None]:
        yield _sse(
            "parsing",
            {
                "message": f"Parsing text '{req.name}'...",
            },
        )

        try:
            docs = parse_text(req.text, source=req.name)
            n = len(docs)
            yield _sse(
                "parsing",
                {
                    "message": f"Parsed {n} section(s)",
                    "sections": n,
                },
            )

            yield _sse(
                "splitting",
                {
                    "message": "Splitting into chunks...",
                },
            )
            chunks = split_documents(docs, mime_type="text/plain")
            nc = len(chunks)
            yield _sse(
                "splitting",
                {
                    "message": f"Created {nc} chunks",
                    "chunk_count": nc,
                },
            )

            async for evt in _stream_store(
                chunks,
                source_name=req.name,
            ):
                yield evt

        except Exception as exc:
            logger.exception("Streaming text index failed")
            yield _sse("error", {"message": str(exc)})

    return StreamingResponse(
        content=generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
