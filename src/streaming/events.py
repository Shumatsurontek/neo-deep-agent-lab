"""SSE event dataclasses for streaming agent responses."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from src.constants import SSEEventType


@dataclass
class SSEEvent:
    """Base SSE event sent to the client."""

    type: SSEEventType
    data: dict[str, Any] = field(default_factory=dict)

    def to_sse(self) -> str:
        """Serialize to SSE wire format."""
        payload = {"type": self.type.value, **self.data}
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def text_delta(content: str) -> SSEEvent:
    """Create a text delta event (streaming token)."""
    return SSEEvent(type=SSEEventType.TEXT_DELTA, data={"content": content})


def tool_call_start(tool_name: str, tool_input: dict[str, Any]) -> SSEEvent:
    """Create a tool call start event."""
    return SSEEvent(
        type=SSEEventType.TOOL_CALL_START,
        data={"tool_name": tool_name, "tool_input": tool_input},
    )


def tool_call_end(
    tool_name: str, tool_output: str, tool_input: dict[str, Any] | None = None
) -> SSEEvent:
    """Create a tool call end event."""
    data: dict[str, Any] = {"tool_name": tool_name, "tool_output": tool_output}
    if tool_input:
        data["tool_input"] = tool_input
    return SSEEvent(type=SSEEventType.TOOL_CALL_END, data=data)


def error_event(message: str) -> SSEEvent:
    """Create an error event."""
    return SSEEvent(type=SSEEventType.ERROR, data={"message": message})


def interrupt_request(
    action_requests: list[dict[str, Any]],
    review_configs: list[dict[str, Any]],
) -> SSEEvent:
    """Create an interrupt request event for human-in-the-loop approval."""
    return SSEEvent(
        type=SSEEventType.INTERRUPT_REQUEST,
        data={
            "action_requests": action_requests,
            "review_configs": review_configs,
        },
    )


def done_event() -> SSEEvent:
    """Create a done event marking the end of the stream."""
    return SSEEvent(type=SSEEventType.DONE)
