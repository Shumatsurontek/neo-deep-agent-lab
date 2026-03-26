"""Tests for SSE events and stream encoder."""

from __future__ import annotations

import json

from src.constants import SSEEventType
from src.streaming.events import (
    done_event,
    error_event,
    interrupt_request,
    text_delta,
    tool_call_end,
    tool_call_start,
)
from src.streaming.sse_encoder import _ToolArgsAccumulator


class TestSSEEvents:
    def test_text_delta_to_sse(self):
        event = text_delta("hello")
        sse = event.to_sse()
        assert sse.startswith("data: ")
        assert sse.endswith("\n\n")
        payload = json.loads(sse.removeprefix("data: ").strip())
        assert payload["type"] == "text-delta"
        assert payload["content"] == "hello"

    def test_tool_call_start_to_sse(self):
        event = tool_call_start("execute_sql", {"query": "SELECT 1"})
        payload = json.loads(event.to_sse().removeprefix("data: ").strip())
        assert payload["type"] == "tool-call-start"
        assert payload["tool_name"] == "execute_sql"
        assert payload["tool_input"] == {"query": "SELECT 1"}

    def test_tool_call_end_to_sse(self):
        event = tool_call_end("execute_sql", "result_text")
        payload = json.loads(event.to_sse().removeprefix("data: ").strip())
        assert payload["type"] == "tool-call-end"
        assert payload["tool_name"] == "execute_sql"
        assert payload["tool_output"] == "result_text"

    def test_tool_call_end_with_input(self):
        event = tool_call_end("execute_sql", "result", {"query": "SELECT 1"})
        payload = json.loads(event.to_sse().removeprefix("data: ").strip())
        assert payload["tool_input"] == {"query": "SELECT 1"}

    def test_tool_call_end_without_input(self):
        event = tool_call_end("tool", "output")
        payload = json.loads(event.to_sse().removeprefix("data: ").strip())
        assert "tool_input" not in payload

    def test_error_event(self):
        event = error_event("something broke")
        payload = json.loads(event.to_sse().removeprefix("data: ").strip())
        assert payload["type"] == "error"
        assert payload["message"] == "something broke"

    def test_done_event(self):
        event = done_event()
        payload = json.loads(event.to_sse().removeprefix("data: ").strip())
        assert payload["type"] == "done"

    def test_interrupt_request(self):
        event = interrupt_request(
            [{"tool": "execute_sql"}],
            [{"decision": "approve"}],
        )
        payload = json.loads(event.to_sse().removeprefix("data: ").strip())
        assert payload["type"] == SSEEventType.INTERRUPT_REQUEST.value
        assert payload["action_requests"] == [{"tool": "execute_sql"}]
        assert payload["review_configs"] == [{"decision": "approve"}]


class TestToolArgsAccumulator:
    def test_first_chunk_returns_name(self):
        acc = _ToolArgsAccumulator()
        name = acc.on_chunk({"name": "execute_sql", "index": 0, "args": ""})
        assert name == "execute_sql"

    def test_subsequent_chunks_return_none(self):
        acc = _ToolArgsAccumulator()
        acc.on_chunk({"name": "execute_sql", "index": 0, "args": ""})
        result = acc.on_chunk({"name": None, "index": 0, "args": '{"query":'})
        assert result is None

    def test_accumulates_args(self):
        acc = _ToolArgsAccumulator()
        acc.on_chunk({"name": "execute_sql", "index": 0, "args": ""})
        acc.on_chunk({"name": None, "index": 0, "args": '{"query":'})
        acc.on_chunk({"name": None, "index": 0, "args": '"SELECT 1"}'})
        parsed = acc.pop_args("execute_sql")
        assert parsed == {"query": "SELECT 1"}

    def test_pop_args_clears(self):
        acc = _ToolArgsAccumulator()
        acc.on_chunk({"name": "tool", "index": 0, "args": '{"a": 1}'})
        acc.pop_args("tool")
        assert acc.pop_args("tool") is None

    def test_pop_args_unknown_tool(self):
        acc = _ToolArgsAccumulator()
        assert acc.pop_args("nonexistent") is None

    def test_pop_args_empty_returns_none(self):
        acc = _ToolArgsAccumulator()
        acc.on_chunk({"name": "tool", "index": 0, "args": ""})
        assert acc.pop_args("tool") is None

    def test_pop_args_invalid_json(self):
        acc = _ToolArgsAccumulator()
        acc.on_chunk({"name": "tool", "index": 0, "args": "not json"})
        result = acc.pop_args("tool")
        assert result == {"raw": "not json"}
