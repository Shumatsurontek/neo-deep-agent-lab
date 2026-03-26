"""Logging middleware - logs all tool calls with timing.

NOTE: Currently NOT wired into the middleware stack in factory.py.
Kept for future use — can be added to the stack when needed for debugging.

Supports both sync (CLI) and async (server) invocation.
"""

# from __future__ import annotations
#
# import time
#
# from langchain.agents.middleware.types import AgentMiddleware
#
# from src.common import MetricsLogger, get_logger
#
# logger = get_logger("middleware.logging")
# _metrics = MetricsLogger(logger)
#
#
# class LogToolCallsMiddleware(AgentMiddleware):
#     """Cross-cutting logging middleware for all tool calls."""
#
#     def wrap_tool_call(self, request, handler):
#         tc = request.tool_call
#         start = time.perf_counter()
#         logger.info("[tool:start] %s | input=%s", tc["name"], str(tc["args"])[:200])
#         result = handler(request)
#         duration_ms = (time.perf_counter() - start) * 1000
#         _metrics.tool_latency(tc["name"], duration_ms)
#         return result
#
#     async def awrap_tool_call(self, request, handler):
#         tc = request.tool_call
#         start = time.perf_counter()
#         logger.info("[tool:start] %s | input=%s", tc["name"], str(tc["args"])[:200])
#         result = await handler(request)
#         duration_ms = (time.perf_counter() - start) * 1000
#         _metrics.tool_latency(tc["name"], duration_ms)
#         return result
#
#
# log_tool_calls = LogToolCallsMiddleware()
