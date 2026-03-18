"""Logging middleware - logs all tool calls with timing.

Supports both sync (CLI) and async (server) invocation.
"""

from __future__ import annotations

import logging
import time

from langchain.agents.middleware.types import AgentMiddleware

logger = logging.getLogger("neo-deep-agent-lab")


class LogToolCallsMiddleware(AgentMiddleware):
    """Cross-cutting logging middleware for all tool calls."""

    def wrap_tool_call(self, request, handler):
        tc = request.tool_call
        start = time.perf_counter()
        logger.info("[tool:start] %s | input=%s", tc["name"], str(tc["args"])[:200])
        result = handler(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "[tool:end] %s | duration=%dms | output_size=%d",
            tc["name"],
            int(duration_ms),
            len(str(result)),
        )
        return result

    async def awrap_tool_call(self, request, handler):
        tc = request.tool_call
        start = time.perf_counter()
        logger.info("[tool:start] %s | input=%s", tc["name"], str(tc["args"])[:200])
        result = await handler(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "[tool:end] %s | duration=%dms | output_size=%d",
            tc["name"],
            int(duration_ms),
            len(str(result)),
        )
        return result


log_tool_calls = LogToolCallsMiddleware()
