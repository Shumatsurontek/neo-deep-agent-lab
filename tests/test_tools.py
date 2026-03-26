"""Tests for tool schemas and tool functions."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.tools.schemas import (
    AnalyzeQueryInput,
    ExecuteSQLInput,
    ExportResultInput,
    GenerateChartInput,
    GetDatabaseSchemaInput,
    PersistContextInput,
    ScratchpadInput,
)


class TestExecuteSQLInput:
    def test_valid_query(self):
        inp = ExecuteSQLInput(query="SELECT 1")
        assert inp.query == "SELECT 1"

    def test_empty_query_rejected(self):
        with pytest.raises(ValidationError):
            ExecuteSQLInput(query="")


class TestGetDatabaseSchemaInput:
    def test_none_table_is_valid(self):
        inp = GetDatabaseSchemaInput()
        assert inp.table_name is None

    def test_table_name_provided(self):
        inp = GetDatabaseSchemaInput(table_name="users")
        assert inp.table_name == "users"


class TestExportResultInput:
    def test_defaults(self):
        inp = ExportResultInput(query="SELECT 1")
        assert inp.filename == "export"

    def test_custom_filename(self):
        inp = ExportResultInput(query="SELECT 1", filename="my_export")
        assert inp.filename == "my_export"

    def test_empty_query_rejected(self):
        with pytest.raises(ValidationError):
            ExportResultInput(query="")


class TestGenerateChartInput:
    def test_defaults(self):
        inp = GenerateChartInput(query="SELECT 1")
        assert inp.chart_type == "bar"
        assert inp.title == "Chart"

    def test_custom_values(self):
        inp = GenerateChartInput(query="SELECT 1", chart_type="pie", title="Revenue")
        assert inp.chart_type == "pie"
        assert inp.title == "Revenue"


class TestAnalyzeQueryInput:
    def test_defaults(self):
        inp = AnalyzeQueryInput(query="SELECT 1")
        assert inp.analysis == "describe"

    def test_empty_query_rejected(self):
        with pytest.raises(ValidationError):
            AnalyzeQueryInput(query="")


class TestScratchpadInput:
    def test_valid_note(self):
        inp = ScratchpadInput(note="a note")
        assert inp.note == "a note"

    def test_empty_note_rejected(self):
        with pytest.raises(ValidationError):
            ScratchpadInput(note="")


class TestPersistContextInput:
    def test_valid_fact(self):
        inp = PersistContextInput(fact="a fact")
        assert inp.fact == "a fact"

    def test_empty_fact_rejected(self):
        with pytest.raises(ValidationError):
            PersistContextInput(fact="")


class TestFormatCsvAsMarkdown:
    """Test the markdown table formatter in sql_tool."""

    def test_formats_csv(self):
        from src.tools.sql_tool import _format_csv_as_markdown

        csv = "id,name\n1,alice\n2,bob"
        md = _format_csv_as_markdown(csv, max_rows=50)
        assert "id" in md
        assert "alice" in md
        assert "|" in md

    def test_empty_csv(self):
        from src.tools.sql_tool import _format_csv_as_markdown

        result = _format_csv_as_markdown("", max_rows=50)
        assert "aucun" in result.lower() or "no" in result.lower() or result == ""
