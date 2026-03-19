"""Database schema introspection tool for the Deep Agent.

Allows the agent to discover tables and columns before writing queries.
"""

from __future__ import annotations

from langchain_core.tools import tool

from src.sandbox.pg import run_query_delimited, run_query_plain
from src.tools.schemas import GetDatabaseSchemaInput


@tool(args_schema=GetDatabaseSchemaInput)
def get_database_schema(table_name: str | None = None) -> str:
    """List all tables in the database, or show columns for a specific table.

    Use this tool to discover the database structure BEFORE writing SQL queries.

    Args:
        table_name: If provided, show columns and types for this specific table.
                   If None, list all user tables in the database.

    Returns:
        Table listing or column details formatted as text.
    """
    if table_name:
        return _describe_table(table_name)
    return _list_tables()


def _list_tables() -> str:
    """List all user tables in the public schema."""
    query = (
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' "
        "AND table_type = 'BASE TABLE' "
        "ORDER BY table_name;"
    )
    result = run_query_plain(query)

    if not result.ok:
        return f"Error listing tables: {result.error_message}"

    tables = [t.strip() for t in result.stdout.strip().split("\n") if t.strip()]

    if not tables:
        return "No user tables found in the database."

    header = f"Database tables ({len(tables)} total):\n"
    table_list = "\n".join(f"  - {t}" for t in tables)
    return header + table_list


def _describe_table(table_name: str) -> str:
    """Show columns, types, and constraints for a specific table."""
    safe_name = "".join(c for c in table_name if c.isalnum() or c == "_")

    query = (
        f"SELECT column_name, data_type, is_nullable, column_default "
        f"FROM information_schema.columns "
        f"WHERE table_schema = 'public' AND table_name = '{safe_name}' "  # nosec B608
        f"ORDER BY ordinal_position;"
    )
    result = run_query_delimited(query)

    if not result.ok:
        return f"Error describing table '{safe_name}': {result.error_message}"

    lines = [line.strip() for line in result.stdout.strip().split("\n") if line.strip()]

    if not lines:
        return f"Table '{safe_name}' not found or has no columns."

    header = f"Table: {safe_name}\n\n"
    header += "| Column | Type | Nullable | Default |\n"
    header += "| --- | --- | --- | --- |\n"

    for line in lines:
        parts = line.split("|")
        if len(parts) >= 4:
            col_name, data_type, nullable, default = (
                parts[0],
                parts[1],
                parts[2],
                parts[3],
            )
            header += f"| {col_name} | {data_type} | {nullable} | {default or '-'} |\n"

    return header
