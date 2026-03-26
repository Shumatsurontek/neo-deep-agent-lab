"""SSE log streaming — broadcasts application logs to connected frontend clients."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime
from typing import AsyncGenerator

from src.common import get_logger

logger = get_logger("server.log_stream")

# Ring buffer of recent logs + broadcast queue
_log_buffer: deque[dict] = deque(maxlen=200)
_subscribers: list[asyncio.Queue] = []


class SSELogHandler(logging.Handler):
    """Logging handler that pushes records to SSE subscribers."""

    def emit(self, record: logging.LogRecord) -> None:
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": self.format(record),
        }
        _log_buffer.append(entry)
        for q in _subscribers:
            try:
                q.put_nowait(entry)
            except asyncio.QueueFull:
                pass  # drop if subscriber is slow


def install_log_handler() -> None:
    """Install the SSE handler on the root logger."""
    handler = SSELogHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logging.getLogger().addHandler(handler)
    logger.info("SSE log handler installed")


async def log_event_generator() -> AsyncGenerator[str, None]:
    """Yield SSE events for log entries. Sends recent buffer first, then live."""
    import json

    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    _subscribers.append(queue)

    try:
        # Send connection event so frontend knows we're live
        yield f"data: {json.dumps({'timestamp': '', 'level': 'INFO', 'logger': 'log_stream', 'message': 'Log stream connected'})}\n\n"

        # Send recent buffer
        for entry in _log_buffer:
            yield f"data: {json.dumps(entry)}\n\n"

        # Stream live
        while True:
            entry = await queue.get()
            yield f"data: {json.dumps(entry)}\n\n"
    finally:
        _subscribers.remove(queue)
