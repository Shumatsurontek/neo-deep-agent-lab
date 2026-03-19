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
