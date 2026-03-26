"""LangChain text splitters — selects the right splitter by document MIME type."""

from __future__ import annotations

from langchain_core.documents import Document
from langchain_text_splitters import (
    HTMLHeaderTextSplitter,
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
    TextSplitter,
)

from src.common import get_logger
from src.config import settings

logger = get_logger("rag.splitter")

# Markdown header hierarchy for MarkdownHeaderTextSplitter
_MD_HEADERS = [
    ("#", "h1"),
    ("##", "h2"),
    ("###", "h3"),
]

# HTML header hierarchy for HTMLHeaderTextSplitter
_HTML_HEADERS = [
    ("h1", "h1"),
    ("h2", "h2"),
    ("h3", "h3"),
]


def _base_splitter() -> RecursiveCharacterTextSplitter:
    """Default RecursiveCharacterTextSplitter using tiktoken token counting."""
    return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=settings.RAG_CHUNK_MAX_TOKENS,
        chunk_overlap=settings.RAG_CHUNK_OVERLAP,
    )


def get_splitter(mime_type: str) -> TextSplitter:
    """Return the appropriate LangChain splitter for the given MIME type."""
    if mime_type == "text/markdown":
        return MarkdownHeaderTextSplitter(headers_to_split_on=_MD_HEADERS)
    if mime_type == "text/html":
        return HTMLHeaderTextSplitter(headers_to_split_on=_HTML_HEADERS)
    return _base_splitter()


def split_documents(
    docs: list[Document], mime_type: str = "text/plain"
) -> list[Document]:
    """Split documents using the appropriate LangChain splitter.

    For Markdown and HTML, uses header-aware splitters that preserve structure.
    For everything else (PDF, DOCX, TXT, CSV, etc.), uses RecursiveCharacterTextSplitter
    with tiktoken cl100k_base token counting.
    """
    splitter = get_splitter(mime_type)

    # MarkdownHeaderTextSplitter and HTMLHeaderTextSplitter work on text, not Document objects
    if mime_type in ("text/markdown", "text/html"):
        split_docs = []
        for doc in docs:
            chunks = splitter.split_text(doc.page_content)
            # chunks are Document objects with metadata from headers
            if isinstance(chunks, list) and chunks:
                if isinstance(chunks[0], Document):
                    for chunk in chunks:
                        chunk.metadata = {**doc.metadata, **chunk.metadata}
                    split_docs.extend(chunks)
                else:
                    # Fallback: split_text returned strings, wrap them
                    for i, chunk_text in enumerate(chunks):
                        split_docs.append(
                            Document(
                                page_content=chunk_text,
                                metadata={**doc.metadata, "chunk_index": i},
                            )
                        )
        # Re-split by size if individual header sections are too large
        base = _base_splitter()
        final = base.split_documents(split_docs) if split_docs else []
    else:
        final = splitter.split_documents(docs)

    logger.info(
        "Split %d doc(s) → %d chunks (mime=%s, max_tokens=%d, overlap=%d)",
        len(docs),
        len(final),
        mime_type,
        settings.RAG_CHUNK_MAX_TOKENS,
        settings.RAG_CHUNK_OVERLAP,
    )

    return final
