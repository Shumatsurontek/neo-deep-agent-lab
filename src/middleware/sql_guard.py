"""SQL guard middleware - blocks destructive SQL statements.

Defense in depth: the PostgreSQL user is also set to read-only,
but this middleware catches bad queries before they reach the sandbox.

Supports both sync (CLI) and async (server) invocation.
"""

from langchain.agents.middleware.types import AgentMiddleware

from src.constants import ALLOWED_SQL_KEYWORDS, FORBIDDEN_SQL_KEYWORDS


class SQLGuardMiddleware(AgentMiddleware):
    """Intercept execute_sql calls and block destructive queries."""

    def _check(self, request):
        """Validate the query if this is an execute_sql call. Returns blocked msg or None."""
        tc = request.tool_call
        if tc["name"] == "execute_sql":
            query = tc["args"].get("query", "")
            return validate_sql_query(query)
        return None

    def wrap_tool_call(self, request, handler):
        error = self._check(request)
        if error is not None:
            return f"Blocked: {error}"
        return handler(request)

    async def awrap_tool_call(self, request, handler):
        error = self._check(request)
        if error is not None:
            return f"Blocked: {error}"
        return await handler(request)


sql_guard_middleware = SQLGuardMiddleware()


class SQLGuardError(Exception):
    """Raised when a destructive SQL statement is detected."""


def validate_sql_query(query: str) -> str | None:
    """Validate that a SQL query is read-only.

    Args:
        query: The SQL query to validate.

    Returns:
        None if valid, or an error message string if blocked.
    """
    stripped = query.strip()

    if not stripped:
        return "Empty query is not allowed."

    # Extract first keyword
    first_keyword = stripped.split()[0].upper().rstrip(";")

    if first_keyword in FORBIDDEN_SQL_KEYWORDS:
        return (
            f"Blocked: {first_keyword} statements are not allowed. "
            f"Only read operations ({', '.join(sorted(ALLOWED_SQL_KEYWORDS))}) are permitted."
        )

    if first_keyword not in ALLOWED_SQL_KEYWORDS:
        return (
            f"Unknown SQL operation: {first_keyword}. "
            f"Only {', '.join(sorted(ALLOWED_SQL_KEYWORDS))} are permitted."
        )

    return None
