"""Schema cache middleware — intercepts get_database_schema results and caches them.

Strategy: **Write** — saves schema outside the context window for later injection.
"""

from __future__ import annotations

from langchain.agents.middleware import wrap_tool_call
from langchain_core.messages import ToolMessage

from src.common import MetricsLogger, get_logger
from src.context.store import cache_schema

logger = get_logger("middleware.schema_cache")
_metrics = MetricsLogger(logger)

_TARGET_TOOL = "get_database_schema"


def _extract_thread_id(request: object) -> str:
    """Extract thread_id from a ToolCallRequest's runtime config."""
    try:
        return request.runtime.config["configurable"]["thread_id"]  # type: ignore[union-attr]
    except (AttributeError, KeyError, TypeError):
        return "main"


@wrap_tool_call  # type: ignore[call-overload, arg-type]
async def schema_cache_middleware(request, handler):  # type: ignore[no-untyped-def]
    """Cache results of get_database_schema calls."""
    result = await handler(request)

    if request.tool_call["name"] == _TARGET_TOOL and isinstance(result, ToolMessage):
        thread_id = _extract_thread_id(request)
        table = request.tool_call["args"].get("table_name") or "__all__"
        cache_schema(thread_id, table, str(result.content))
        _metrics.cache_event("schema", table, hit=False)

    return result
