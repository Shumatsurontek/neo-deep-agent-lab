"""Subagent definitions for delegation from the main SQL agent."""

from __future__ import annotations

from deepagents import CompiledSubAgent, SubAgent

from src.tools.analysis_tool import analyze_query
from src.tools.chart_tool import generate_chart
from src.tools.schema_tool import get_database_schema
from src.tools.scratchpad_tool import write_scratchpad
from src.tools.sql_tool import execute_sql

DATA_ANALYST_PROMPT = """\
Tu es un sous-agent spécialisé en analyse de données.

Ton rôle : exécuter des analyses statistiques (distributions, corrélations, agrégations) \
sur les résultats de requêtes SQL et retourner un résumé structuré.

Règles :
- Retourne uniquement un résumé en langage naturel (max 500 mots), pas les données brutes.
- Utilise analyze_query pour les statistiques descriptives et generate_chart pour les visualisations.
- Commence par get_database_schema si tu ne connais pas la structure des tables concernées.
"""

SCHEMA_EXPLORER_PROMPT = """\
Tu es un sous-agent spécialisé en exploration de schéma de base de données.

Ton rôle : découvrir les tables, colonnes, types, relations (FK, index) et documenter \
tes trouvailles de manière structurée.

Règles :
- Utilise get_database_schema puis des requêtes SQL ciblées (information_schema, pg_catalog).
- Retourne un résumé structuré : tables trouvées, colonnes clés, relations entre tables.
- Note les découvertes importantes via write_scratchpad pour enrichir le contexte.
"""

SUBAGENTS: list[SubAgent | CompiledSubAgent] = [
    SubAgent(
        {
            "name": "data-analyst",
            "description": (
                "Delegate data analysis tasks — statistical analysis, "
                "correlations, distributions, profiling on query results"
            ),
            "system_prompt": DATA_ANALYST_PROMPT,
            "tools": [execute_sql, get_database_schema, analyze_query, generate_chart],
        }
    ),
    SubAgent(
        {
            "name": "schema-explorer",
            "description": (
                "Delegate schema exploration — discover tables, columns, "
                "relationships, and document findings"
            ),
            "system_prompt": SCHEMA_EXPLORER_PROMPT,
            "tools": [execute_sql, get_database_schema, write_scratchpad],
        }
    ),
]
