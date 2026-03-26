"""Document parsing via unstructured — supports PDF, DOCX, PPTX, XLSX, HTML, CSV, TXT, MD."""

from __future__ import annotations

from pathlib import Path

from langchain_community.document_loaders import UnstructuredFileLoader
from langchain_core.documents import Document

from src.common import get_logger

logger = get_logger("rag.parser")


def parse_document(file_path: str | Path) -> list[Document]:
    """Parse a document file into LangChain Document objects.

    Uses ``unstructured`` under the hood for format-agnostic parsing.
    Supported: .pdf, .docx, .pptx, .xlsx, .html, .csv, .txt, .md, .eml, .msg, .xml
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Document not found: {path}")

    loader = UnstructuredFileLoader(str(path))
    docs = loader.load()

    logger.info("Parsed '%s': %d document(s)", path.name, len(docs))
    return docs


def parse_text(text: str, source: str = "inline") -> list[Document]:
    """Wrap raw text into a LangChain Document (e.g. from Yoopta editor)."""
    return [Document(page_content=text, metadata={"source": source})]
