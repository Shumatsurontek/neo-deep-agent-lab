"""Chart generation tool — runs Seaborn inside the Modal sandbox.

Delegates rendering to /opt/scripts/chart.py (baked into the Modal image).
The resulting PNG is stored in-memory and served via /download/<file_id>.
"""

from __future__ import annotations

import base64
import logging

from langchain_core.tools import tool

from src.config import settings
from src.sandbox.pg import run_query_csv
from src.tools._helpers import run_sandbox_script, sanitize_input, store_file
from src.tools.schemas import GenerateChartInput

logger = logging.getLogger("neo-deep-agent-lab")


@tool(args_schema=GenerateChartInput)
def generate_chart(
    query: str,
    chart_type: str = "bar",
    title: str = "Chart",
) -> str:
    """Generate a Seaborn chart from SQL query results.

    Executes the query, creates a chart in the sandbox, and returns a
    download link for the PNG image. Use this when the user asks for
    a visualization, graph, plot, or chart.

    Supported chart types: bar, line, scatter, hist, heatmap, pie, box.

    Args:
        query: A SELECT SQL query that provides the data for the chart.
        chart_type: Type of chart (bar, line, scatter, hist, heatmap, pie, box).
        title: Title displayed on the chart.

    Returns:
        A message with the chart image download link.
    """
    logger.info("generate_chart: type=%s, query=%s", chart_type, query[:80])

    result = run_query_csv(query, timeout_ms=settings.SQL_TIMEOUT_MS)
    if not result.ok:
        return f"Erreur SQL : {result.error_message}"
    if not result.stdout.strip():
        return "La requete ne retourne aucun resultat."

    csv_data = result.stdout.strip()
    safe_type = sanitize_input(chart_type)
    safe_title = title.replace("'", "")

    stdout, stderr, exit_code = run_sandbox_script(
        "chart.py", csv_data, [safe_type, safe_title]
    )

    logger.info(
        "generate_chart render: exit=%d, stdout=%d bytes, stderr=%s",
        exit_code,
        len(stdout),
        stderr[:200] if stderr else "(empty)",
    )

    if exit_code != 0:
        return _handle_chart_error(stderr)

    png_b64 = stdout.strip()
    if not png_b64:
        return f"Erreur : aucune image generee. stderr={stderr[:300]}"

    png_bytes = base64.b64decode(png_b64)
    filename = _build_filename(title)
    file_id, full_name = store_file(png_bytes, filename, "image/png")

    return (
        f"Chart genere : **{title}** ({chart_type})\n"
        f"Telecharger : /download/{file_id}/{full_name}"
    )


def _handle_chart_error(stderr: str) -> str:
    """Map sandbox stderr to user-facing error messages."""
    if "EMPTY" in stderr:
        return "La requete ne retourne aucun resultat."
    if "NEED_NUMERIC" in stderr:
        return "Ce type de chart necessite au moins 2 colonnes numeriques."
    return f"Erreur generation chart :\n```\n{stderr[:500]}\n```"


def _build_filename(title: str) -> str:
    """Derive a safe PNG filename from the chart title."""
    safe = "".join(c for c in title if c.isalnum() or c in "_- ")[:40]
    name = safe.replace(" ", "_").lower() or "chart"
    return f"{name}.png"
