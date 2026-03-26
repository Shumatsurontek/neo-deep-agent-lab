"""Tests for the common logging module."""

from __future__ import annotations

import json
import logging

from src.common.logging import (
    ROOT_LOGGER_NAME,
    JsonFormatter,
    MetricsLogger,
    get_logger,
    setup_logging,
)


class TestSetupLogging:
    def test_dev_mode(self):
        setup_logging(mode="dev", level="DEBUG")
        root = logging.getLogger(ROOT_LOGGER_NAME)
        assert root.level == logging.DEBUG
        assert len(root.handlers) == 1
        assert not isinstance(root.handlers[0].formatter, JsonFormatter)

    def test_json_mode(self):
        setup_logging(mode="json", level="INFO")
        root = logging.getLogger(ROOT_LOGGER_NAME)
        assert isinstance(root.handlers[0].formatter, JsonFormatter)

    def test_clears_existing_handlers(self):
        setup_logging(mode="dev")
        setup_logging(mode="dev")
        root = logging.getLogger(ROOT_LOGGER_NAME)
        assert len(root.handlers) == 1

    def test_no_propagate(self):
        setup_logging(mode="dev")
        root = logging.getLogger(ROOT_LOGGER_NAME)
        assert root.propagate is False


class TestGetLogger:
    def test_child_logger_name(self):
        logger = get_logger("test.module")
        assert logger.name == f"{ROOT_LOGGER_NAME}.test.module"

    def test_child_inherits_parent(self):
        setup_logging(mode="dev", level="WARNING")
        logger = get_logger("child")
        assert logger.getEffectiveLevel() == logging.WARNING


class TestJsonFormatter:
    def test_output_is_valid_json(self):
        fmt = JsonFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="hello %s",
            args=("world",),
            exc_info=None,
        )
        output = fmt.format(record)
        data = json.loads(output)
        assert data["message"] == "hello world"
        assert data["level"] == "INFO"
        assert data["logger"] == "test"

    def test_extra_fields_included(self):
        fmt = JsonFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="metric",
            args=(),
            exc_info=None,
        )
        record.latency_ms = 42.5  # type: ignore[attr-defined]
        record.tool_name = "execute_sql"  # type: ignore[attr-defined]
        output = fmt.format(record)
        data = json.loads(output)
        assert data["latency_ms"] == 42.5
        assert data["tool_name"] == "execute_sql"

    def test_missing_extra_fields_excluded(self):
        fmt = JsonFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="clean",
            args=(),
            exc_info=None,
        )
        output = fmt.format(record)
        data = json.loads(output)
        assert "latency_ms" not in data


class TestMetricsLogger:
    def test_tool_latency(self, capsys):
        setup_logging(mode="dev", level="DEBUG")
        ml = MetricsLogger(get_logger("test.metrics"))
        ml.tool_latency("execute_sql", 123.4)
        captured = capsys.readouterr().out
        assert "execute_sql" in captured
        assert "123.4" in captured

    def test_token_usage(self, capsys):
        setup_logging(mode="dev", level="DEBUG")
        ml = MetricsLogger(get_logger("test.metrics2"))
        ml.token_usage("gpt-4", 100, 50)
        captured = capsys.readouterr().out
        assert "gpt-4" in captured
        assert "150" in captured

    def test_cache_event(self, capsys):
        setup_logging(mode="dev", level="DEBUG")
        ml = MetricsLogger(get_logger("test.metrics3"))
        ml.cache_event("schema", "users", hit=True)
        captured = capsys.readouterr().out
        assert "cache_hit" in captured
