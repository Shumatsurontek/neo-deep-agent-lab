"""Maps LangChain Deep Agent stream events to SSE events.

Uses LangGraph v2 streaming format with stream_mode=["messages"].
Accumulates tool call args across streamed chunks so that tool-call-end
includes the full input (e.g. the SQL query).

Key: only AI message tokens emit text-delta. Tool result messages
(type="tool") are routed exclusively to tool-call-end events.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncGenerator, Generator
from typing import Any

from src.streaming.events import (
    SSEEvent,
    SSEEventType,
    done_event,
    error_event,
    metrics_event,
    text_delta,
    tool_call_end,
    tool_call_start,
)


class _ToolArgsAccumulator:
    """Accumulates streamed tool_call_chunks args by index.

    LangGraph streams tool calls in chunks:
    - First chunk: name='execute_sql', id='call_xxx', index=0, args=''
    - Next chunks: name=None, id=None, index=0, args='{"query":'
    - More chunks: name=None, id=None, index=0, args='"SELECT...'

    We key on index (stable across chunks), not id (None after first).
    """

    def __init__(self) -> None:
        self._args_buffer: dict[int, str] = {}  # index -> raw args string
        self._names: dict[int, str] = {}  # index -> tool name

    def on_chunk(self, tc: dict[str, Any]) -> str | None:
        """Process a tool_call_chunk. Returns tool name if this is the first chunk."""
        idx = tc.get("index", 0)
        name = tc.get("name")
        args = tc.get("args", "")

        if name:
            self._names[idx] = name
            self._args_buffer[idx] = args or ""
            return name

        # Subsequent chunk — append args
        if idx in self._args_buffer and args:
            self._args_buffer[idx] += args
        return None

    def pop_args(self, tool_name: str) -> dict[str, Any] | None:
        """Pop accumulated args for a tool name. Returns parsed dict or None."""
        idx = None
        for i, name in self._names.items():
            if name == tool_name:
                idx = i
                break

        if idx is None:
            return None

        raw = self._args_buffer.pop(idx, "")
        self._names.pop(idx, None)

        if not raw:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return {"raw": raw}


def encode_stream_sync(
    stream: Generator[dict[str, Any], None, None],
) -> Generator[str, None, None]:
    """Convert a synchronous LangGraph v2 stream to SSE strings."""
    acc = _ToolArgsAccumulator()
    try:
        for chunk in stream:
            for event in _map_chunk_to_events(chunk, acc):
                yield event.to_sse()
    except Exception as exc:
        yield error_event(str(exc)).to_sse()
    finally:
        yield done_event().to_sse()


async def encode_stream_async(
    stream: AsyncGenerator[dict[str, Any], None],
    model: str = "",
) -> AsyncGenerator[tuple[str, str], None]:
    """Convert an async LangGraph v2 stream to SSE strings.

    Yields:
        Tuples of (sse_line, text_content). text_content is non-empty only for
        text-delta events, allowing callers to accumulate the full response.

    Emits a ``metrics`` event before ``done`` with TTFT and TPS.
    """
    acc = _ToolArgsAccumulator()
    t_start = time.perf_counter()
    t_first_token: float | None = None
    token_count = 0

    try:
        async for chunk in stream:
            for event in _map_chunk_to_events(chunk, acc):
                is_text = event.type == SSEEventType.TEXT_DELTA
                text_content = event.data.get("content", "") if is_text else ""

                # Track TTFT — first text token
                if is_text and text_content and t_first_token is None:
                    t_first_token = time.perf_counter()

                # Count output tokens (approximate: split by whitespace-ish chunks)
                if is_text and text_content:
                    token_count += 1

                yield event.to_sse(), text_content
    except Exception as exc:
        yield error_event(str(exc)).to_sse(), ""
    finally:
        elapsed = time.perf_counter() - t_start
        elapsed_ms = elapsed * 1000
        ttft_ms = ((t_first_token - t_start) * 1000) if t_first_token else elapsed_ms

        # TPS: tokens per second (text-delta events / streaming duration after first token)
        streaming_duration = (
            (time.perf_counter() - t_first_token) if t_first_token else elapsed
        )
        tps = (token_count / streaming_duration) if streaming_duration > 0 else 0

        from src.streaming.events import estimate_cost

        cost = estimate_cost(model, token_count)
        yield metrics_event(
            ttft_ms, tps, token_count, elapsed_ms, model=model, estimated_cost=cost
        ).to_sse(), ""
        yield done_event().to_sse(), ""


def _map_chunk_to_events(
    chunk: dict[str, Any], acc: _ToolArgsAccumulator
) -> list[SSEEvent]:
    """Map a single LangGraph v2 chunk to SSE events."""
    events: list[SSEEvent] = []
    chunk_type = chunk.get("type", "")
    data = chunk.get("data")

    if chunk_type == "messages":
        token, metadata = (
            data if isinstance(data, (list, tuple)) and len(data) == 2 else (data, {})
        )
        token_type = getattr(token, "type", "")

        # Tool results — routed ONLY to tool-call-end (never text-delta)
        if token_type == "tool":
            tool_name = getattr(token, "name", "unknown")
            tool_content = str(getattr(token, "content", ""))
            tool_input = acc.pop_args(tool_name)
            events.append(
                tool_call_end(
                    tool_name=tool_name,
                    tool_output=tool_content,
                    tool_input=tool_input,
                )
            )
        else:
            # Streaming text content (AI messages only)
            content = getattr(token, "content", "")
            if content and isinstance(content, str):
                events.append(text_delta(content))

            # Tool call chunks (partial streaming) — accumulate args
            tool_call_chunks = getattr(token, "tool_call_chunks", None)
            if tool_call_chunks:
                for tc in tool_call_chunks:
                    if isinstance(tc, dict):
                        name = acc.on_chunk(tc)
                        if name:
                            events.append(
                                tool_call_start(tool_name=name, tool_input={})
                            )

    return events
