"""SQL analysis tool — advanced statistics computed inside the Modal sandbox.

Delegates computation to /opt/scripts/analysis.py (baked into the Modal image).
"""

from __future__ import annotations

from langchain_core.tools import tool

from src.common import get_logger
from src.config import settings
from src.sandbox.pg import run_query_csv
from src.tools._helpers import run_sandbox_script, sanitize_input
from src.tools.schemas import AnalyzeQueryInput

logger = get_logger("tools.analysis")


@tool(args_schema=AnalyzeQueryInput)
def analyze_query(query: str, analysis: str = "describe") -> str:
    """Analyze SQL query results with pandas statistics.

    Runs the query and computes advanced statistics inside the sandbox.
    Use this when the user asks for stats, distributions, correlations,
    or data profiling.

    Supported analysis types:
    - describe: Descriptive statistics (count, mean, std, min, max, quartiles)
    - corr: Correlation matrix between numeric columns
    - value_counts: Top 20 value frequencies for each categorical column
    - info: Column types, null counts, memory usage
    - nunique: Number of unique values per column

    Args:
        query: A SELECT SQL query providing the data to analyze.
        analysis: Analysis type (describe, corr, value_counts, info, nunique).

    Returns:
        Formatted analysis results as text.
    """
    logger.info("analyze_query: analysis=%s, query=%s", analysis, query[:80])

    result = run_query_csv(query, timeout_ms=settings.SQL_TIMEOUT_MS)
    if not result.ok:
        return f"Erreur SQL : {result.error_message}"
    if not result.stdout.strip():
        return "La requete ne retourne aucun resultat."

    csv_data = result.stdout.strip()
    safe_analysis = sanitize_input(analysis, allow_underscore=True)

    stdout, stderr, exit_code = run_sandbox_script(
        "analysis.py", csv_data, [safe_analysis]
    )

    logger.info(
        "analyze_query result: exit=%d, stdout=%d bytes",
        exit_code,
        len(stdout),
    )

    if exit_code != 0:
        return f"Erreur analyse :\n```\n{stderr[:500]}\n```"

    return stdout.strip()
