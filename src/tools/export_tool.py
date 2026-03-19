"""Export tools — generate downloadable CSV/JSON files from SQL queries.

Files are stored in an in-memory store and served via /download/<file_id>.
"""

from __future__ import annotations

import csv
import io
import json
import uuid

from langchain_core.tools import tool

from src.config import settings
from src.sandbox.pg import run_query_csv
from src.tools.schemas import ExportResultInput

# In-memory file store: file_id → {filename, content, mime_type}
_file_store: dict[str, dict] = {}


def get_file(file_id: str) -> dict | None:
    """Retrieve a stored file by id. Used by the download endpoint."""
    return _file_store.get(file_id)


def _run_export_query(query: str) -> tuple[list[str], list[list[str]]] | str:
    """Run query and return (headers, rows) or an error string."""
    result = run_query_csv(query, timeout_ms=settings.SQL_TIMEOUT_MS)
    if not result.ok:
        return f"SQL Error: {result.error_message}"
    if not result.stdout.strip():
        return "Query returned no results."

    reader = csv.reader(io.StringIO(result.stdout.strip()))
    rows = list(reader)
    if len(rows) < 2:
        return "Query returned no data rows."

    return rows[0], rows[1:]


@tool(args_schema=ExportResultInput)
def export_csv(query: str, filename: str = "export") -> str:
    """Export SQL query results as a downloadable CSV file.

    Use this tool when the user asks to export, download, or save query results
    as CSV. The tool executes the query and returns a download link.

    Args:
        query: A SELECT SQL query to export.
        filename: Descriptive base filename (e.g. 'users_arthur').

    Returns:
        A message with the download link and row count.
    """
    data = _run_export_query(query)
    if isinstance(data, str):
        return data

    headers, rows = data

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)

    file_id = str(uuid.uuid4())[:8]
    safe_name = "".join(c for c in filename if c.isalnum() or c in "_-")
    full_name = f"{safe_name}.csv"

    _file_store[file_id] = {
        "filename": full_name,
        "content": buf.getvalue(),
        "mime_type": "text/csv",
    }

    return (
        f"Fichier CSV pret : {len(rows)} lignes exportees.\n"
        f"Telecharger : /download/{file_id}/{full_name}"
    )


@tool(args_schema=ExportResultInput)
def export_json(query: str, filename: str = "export") -> str:
    """Export SQL query results as a downloadable JSON file.

    Use this tool when the user asks to export, download, or save query results
    as JSON. The tool executes the query and returns a download link.

    Args:
        query: A SELECT SQL query to export.
        filename: Descriptive base filename (e.g. 'users_arthur').

    Returns:
        A message with the download link and row count.
    """
    data = _run_export_query(query)
    if isinstance(data, str):
        return data

    headers, rows = data

    objects = []
    for row in rows:
        obj = {}
        for i, h in enumerate(headers):
            obj[h] = row[i] if i < len(row) else None
        objects.append(obj)

    content = json.dumps(objects, ensure_ascii=False, indent=2)

    file_id = str(uuid.uuid4())[:8]
    safe_name = "".join(c for c in filename if c.isalnum() or c in "_-")
    full_name = f"{safe_name}.json"

    _file_store[file_id] = {
        "filename": full_name,
        "content": content,
        "mime_type": "application/json",
    }

    return (
        f"Fichier JSON pret : {len(rows)} lignes exportees.\n"
        f"Telecharger : /download/{file_id}/{full_name}"
    )
