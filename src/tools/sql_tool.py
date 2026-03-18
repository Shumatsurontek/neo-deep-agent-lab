"""SQL execution tool for the Deep Agent.

Executes read-only SQL queries inside the Modal sandbox via the pg gateway.
"""

from __future__ import annotations

import csv
import io

from langchain_core.tools import tool

from src.config import settings
from src.sandbox.pg import run_query_csv
from src.tools.schemas import ExecuteSQLInput


@tool(args_schema=ExecuteSQLInput)
def execute_sql(query: str) -> str:
    """Execute a read-only SQL query against the Neo PostgreSQL database.

    Use this tool to run SELECT queries and analyze data. The database contains
    Neo's operational data: threads, messages, users, companies, agents,
    knowledge bases, document chunks, skills, and more.

    Only SELECT, WITH (CTEs), and EXPLAIN queries are allowed.
    Results are limited to the first rows for readability.

    Args:
        query: A SQL query. Only read operations (SELECT/WITH/EXPLAIN) are permitted.

    Returns:
        Query results formatted as a markdown table, or an error message.
    """
    result = run_query_csv(query, timeout_ms=settings.SQL_TIMEOUT_MS)

    if not result.ok:
        return f"SQL Error:\n```\n{result.error_message}\n```"

    if not result.stdout.strip():
        return "Query returned no results."

    return _format_csv_as_markdown(result.stdout, settings.MAX_RESULT_ROWS)


def _format_csv_as_markdown(csv_output: str, max_rows: int) -> str:
    """Convert psql CSV output to a markdown table."""
    reader = csv.reader(io.StringIO(csv_output.strip()))
    rows = list(reader)

    if not rows:
        return "Query returned no results."

    headers = rows[0]
    data_rows = rows[1:]
    truncated = len(data_rows) > max_rows
    data_rows = data_rows[:max_rows]

    col_widths = [len(h) for h in headers]
    for row in data_rows:
        for i, cell in enumerate(row):
            if i < len(col_widths):
                col_widths[i] = max(col_widths[i], len(cell))

    header_line = "| " + " | ".join(h.ljust(w) for h, w in zip(headers, col_widths)) + " |"
    sep_line = "| " + " | ".join("-" * w for w in col_widths) + " |"

    lines = [header_line, sep_line]
    for row in data_rows:
        padded = []
        for i, w in enumerate(col_widths):
            cell = row[i] if i < len(row) else ""
            padded.append(cell.ljust(w))
        lines.append("| " + " | ".join(padded) + " |")

    table = "\n".join(lines)

    if truncated:
        table += f"\n\n*({len(rows) - 1} total rows, showing first {max_rows})*"

    return table
