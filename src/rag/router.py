"""FastAPI router for RAG document management endpoints."""

from __future__ import annotations

import mimetypes
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from src.common import get_logger
from src.rag.parser import parse_document, parse_text
from src.rag.splitter import split_documents
from src.rag.store import RagDocument, delete_document, list_documents, store_chunks

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


@router.delete("/{document_id}", response_model=DeleteResponse)
async def remove_document(document_id: str):
    """Delete a document and all its chunks."""
    count = await delete_document(document_id)
    return DeleteResponse(deleted_chunks=count)
