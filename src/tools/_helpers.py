"""Shared helpers for sandbox-based tools (chart, analysis)."""

from __future__ import annotations

import uuid

from src.common import get_logger
from src.config import settings
from src.sandbox.app import exec_in_sandbox
from src.sandbox.pg import run_query_csv
from src.tools.export_tool import _file_store

logger = get_logger("tools.helpers")

# Path where sandbox scripts are mounted inside the Modal image.
SANDBOX_SCRIPTS_DIR = "/opt/scripts"


def shell_quote(s: str) -> str:
    """Shell-quote a string for bash -c."""
    return "'" + s.replace("'", "'\\''") + "'"


def sanitize_input(value: str, *, allow_underscore: bool = False) -> str:
    """Keep only alphanumeric characters (and optionally underscore)."""
    allowed = str.isalnum
    if allow_underscore:
        return "".join(c for c in value if c.isalnum() or c == "_")
    return "".join(c for c in value if allowed(c))


def fetch_csv(query: str) -> str | None:
    """Run a SQL query via psql and return CSV string, or None on error/empty."""
    result = run_query_csv(query, timeout_ms=settings.SQL_TIMEOUT_MS)
    if not result.ok or not result.stdout.strip():
        return None
    return result.stdout.strip()


def run_sandbox_script(
    script_name: str,
    csv_data: str,
    args: list[str],
) -> tuple[str, str, int]:
    """Pipe CSV data into a sandbox Python script.

    Args:
        script_name: Script filename (e.g. "chart.py").
        csv_data: CSV string to pipe via stdin.
        args: Positional arguments passed to the script.

    Returns:
        (stdout, stderr, exit_code)
    """
    quoted_args = " ".join(shell_quote(a) for a in args)
    cmd = f"echo {shell_quote(csv_data)} | python3 {SANDBOX_SCRIPTS_DIR}/{script_name} {quoted_args}"
    return exec_in_sandbox(cmd)


def store_file(
    content: bytes | str,
    filename: str,
    mime_type: str,
) -> tuple[str, str]:
    """Store content in the in-memory file store.

    Returns:
        (file_id, full_filename)
    """
    file_id = str(uuid.uuid4())[:8]
    _file_store[file_id] = {
        "filename": filename,
        "content": content,
        "mime_type": mime_type,
    }
    return file_id, filename
