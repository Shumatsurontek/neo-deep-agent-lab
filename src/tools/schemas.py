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
