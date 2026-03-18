"""PostgreSQL gateway — executes queries and introspection inside the Modal sandbox.

This is the only module that knows about psql command syntax.
Tools call this gateway; they never build shell commands themselves.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.constants import PG_DATABASE, PG_USER
from src.sandbox.app import exec_in_sandbox

_PSQL_BASE = f"PGPASSWORD=postgres psql -h localhost -U {PG_USER} -d {PG_DATABASE}"


@dataclass(frozen=True)
class QueryResult:
    """Raw result from a psql execution."""

    stdout: str
    stderr: str
    exit_code: int

    @property
    def ok(self) -> bool:
        return self.exit_code == 0

    @property
    def error_message(self) -> str:
        return self.stderr.strip() if self.stderr else "Unknown psql error"


def run_query_csv(query: str, *, timeout_ms: int = 10_000) -> QueryResult:
    """Execute a SQL query and return CSV-formatted output."""
    safe_query = query.replace("'", "'\\''")
    cmd = f"{_PSQL_BASE} -v statement_timeout={timeout_ms} -c '{safe_query}' --csv"
    stdout, stderr, exit_code = exec_in_sandbox(cmd)
    return QueryResult(stdout=stdout, stderr=stderr, exit_code=exit_code)


def run_query_plain(query: str) -> QueryResult:
    """Execute a SQL query and return plain unaligned output (no headers)."""
    cmd = f'{_PSQL_BASE} -t -A -c "{query}"'
    stdout, stderr, exit_code = exec_in_sandbox(cmd)
    return QueryResult(stdout=stdout, stderr=stderr, exit_code=exit_code)


def run_query_delimited(query: str, *, delimiter: str = "|") -> QueryResult:
    """Execute a SQL query and return delimiter-separated output (no headers)."""
    cmd = f"""{_PSQL_BASE} -t -A -F '{delimiter}' -c "{query}" """
    stdout, stderr, exit_code = exec_in_sandbox(cmd)
    return QueryResult(stdout=stdout, stderr=stderr, exit_code=exit_code)
