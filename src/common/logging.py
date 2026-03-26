"""Centralized logging configuration for neo-deep-agent-lab.

Call ``setup_logging()`` **once** at application startup (server or CLI).
All other modules obtain a child logger via ``get_logger(name)``.
"""

from __future__ import annotations

import json
import logging
import os
import sys

ROOT_LOGGER_NAME = "neo-deep-agent-lab"

_DEV_FORMAT = "%(asctime)s [%(name)s] %(levelname)s %(message)s"

# Extra keys that MetricsLogger attaches to log records.
_METRIC_KEYS = (
    "token_usage",
    "latency_ms",
    "cache_hit",
    "tool_name",
    "success",
    "model",
)


# ── Formatters ────────────────────────────────────────────────────────


class JsonFormatter(logging.Formatter):
    """Structured JSON formatter for ELK / Datadog ingestion."""

    def format(self, record: logging.LogRecord) -> str:
        log_dict: dict = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        for key in _METRIC_KEYS:
            value = getattr(record, key, None)
            if value is not None:
                log_dict[key] = value
        if record.exc_info and record.exc_info[1]:
            log_dict["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_dict, default=str)


# ── Core API ──────────────────────────────────────────────────────────


def setup_logging(mode: str = "dev", level: str = "INFO") -> None:
    """Configure the root application logger.  Call once at startup.

    Args:
        mode: ``"dev"`` for human-readable output, ``"json"`` for structured JSON.
        level: Standard Python log level name (``"DEBUG"``, ``"INFO"``, …).
    """
    root = logging.getLogger(ROOT_LOGGER_NAME)
    root.handlers.clear()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.propagate = False

    handler = logging.StreamHandler(sys.stdout)
    if mode == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(_DEV_FORMAT))
    root.addHandler(handler)

    _setup_langsmith()


def get_logger(name: str) -> logging.Logger:
    """Return a child logger under the application root.

    Usage::

        from src.common.logging import get_logger
        logger = get_logger("server")  # → neo-deep-agent-lab.server
    """
    return logging.getLogger(f"{ROOT_LOGGER_NAME}.{name}")


# ── Metrics helper ────────────────────────────────────────────────────


class MetricsLogger:
    """Emit structured metric events via standard logging.

    In JSON mode the extra fields become top-level keys, making them
    easy to index in ELK / Datadog.  In dev mode they appear inline.
    """

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger or get_logger("metrics")

    def tool_latency(
        self, tool_name: str, duration_ms: float, *, success: bool = True
    ) -> None:
        self._logger.info(
            "tool_latency tool=%s duration_ms=%.1f success=%s",
            tool_name,
            duration_ms,
            success,
            extra={
                "tool_name": tool_name,
                "latency_ms": duration_ms,
                "success": success,
            },
        )

    def token_usage(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> None:
        total = prompt_tokens + completion_tokens
        self._logger.info(
            "token_usage model=%s prompt=%d completion=%d total=%d",
            model,
            prompt_tokens,
            completion_tokens,
            total,
            extra={
                "model": model,
                "token_usage": {
                    "prompt": prompt_tokens,
                    "completion": completion_tokens,
                    "total": total,
                },
            },
        )

    def cache_event(self, cache_type: str, key: str, *, hit: bool) -> None:
        self._logger.info(
            "cache_%s type=%s key=%s",
            "hit" if hit else "miss",
            cache_type,
            key,
            extra={"cache_hit": hit, "tool_name": cache_type},
        )


# ── LangSmith wiring ─────────────────────────────────────────────────


def _setup_langsmith() -> None:
    """Propagate LangSmith settings to env vars for LangChain auto-detection."""
    try:
        from src.config import settings
    except Exception:
        return

    if settings.LANGCHAIN_TRACING_V2.lower() == "true":
        os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
        os.environ.setdefault("LANGCHAIN_API_KEY", settings.LANGCHAIN_API_KEY)
        os.environ.setdefault("LANGCHAIN_PROJECT", settings.LANGCHAIN_PROJECT)
        get_logger("langsmith").info(
            "LangSmith tracing enabled: project=%s", settings.LANGCHAIN_PROJECT
        )
