"""Pydantic schemas for tool inputs.

Strict validation ensures the LLM sends well-formed arguments.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ExecuteSQLInput(BaseModel):
    """Input schema for the execute_sql tool."""

    model_config = {"strict": True}

    query: str = Field(
        description=(
            "A SQL query to execute. "
            "Only read operations (SELECT, WITH/CTEs, EXPLAIN) are permitted. "
            "Use LIMIT to avoid large result sets."
        ),
        min_length=1,
    )


class GetDatabaseSchemaInput(BaseModel):
    """Input schema for the get_database_schema tool."""

    model_config = {"strict": True}

    table_name: str | None = Field(
        default=None,
        description=(
            "Name of the table to describe. If omitted, lists all tables in the database."
        ),
    )


class ExportResultInput(BaseModel):
    """Input schema for the export_csv / export_json tools."""

    model_config = {"strict": True}

    query: str = Field(
        description="The SELECT query whose results should be exported.",
        min_length=1,
    )
    filename: str = Field(
        default="export",
        description=(
            "Base filename (without extension). "
            "Use a short descriptive name like 'users_arthur' or 'inbox_messages'."
        ),
    )


class GenerateChartInput(BaseModel):
    """Input schema for the generate_chart tool."""

    model_config = {"strict": True}

    query: str = Field(
        description=(
            "A SELECT SQL query providing the data for the chart. "
            "Include meaningful column names and LIMIT to avoid huge datasets."
        ),
        min_length=1,
    )
    chart_type: str = Field(
        default="bar",
        description=(
            "Type of chart to generate. "
            "Supported: bar, line, scatter, hist, heatmap, pie, box."
        ),
    )
    title: str = Field(
        default="Chart",
        description="Title displayed on the chart.",
    )


class AnalyzeQueryInput(BaseModel):
    """Input schema for the analyze_query tool."""

    model_config = {"strict": True}

    query: str = Field(
        description="A SELECT SQL query providing the data to analyze.",
        min_length=1,
    )
    analysis: str = Field(
        default="describe",
        description=(
            "Type of analysis to run. "
            "Supported: describe, corr, value_counts, info, nunique."
        ),
    )


class ScratchpadInput(BaseModel):
    """Input schema for the write_scratchpad tool."""

    model_config = {"strict": True}

    note: str = Field(
        description=(
            "A note to save in the session scratchpad. "
            "Use this to record observations, patterns, or information "
            "useful for the rest of the conversation."
        ),
        min_length=1,
    )


class PersistContextInput(BaseModel):
    """Input schema for the persist_context tool."""

    model_config = {"strict": True}

    fact: str = Field(
        description=(
            "A verified fact to persist in the session context. "
            "Must be a confirmed observation — not a hypothesis. "
            "Examples: entity mappings, business rules, schema findings."
        ),
        min_length=1,
    )
