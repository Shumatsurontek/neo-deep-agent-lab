"""Persist context tool — lets the agent write durable context entries.

Unlike scratchpad notes (temporary working memory), persisted context
entries are treated as established facts: business rules, entity mappings,
and verified relationships that should inform all future agent decisions.
"""

from __future__ import annotations

from langchain_core.tools import tool

from src.context.store import get_store
from src.context.thread_var import current_thread_id
from src.tools.schemas import PersistContextInput


@tool(args_schema=PersistContextInput)
def persist_context(fact: str) -> str:
    """Persiste un fait verifie dans le contexte de session.

    Utilise cet outil pour sauvegarder des faits importants et verifies
    qui doivent influencer toutes les futures decisions de la conversation.
    Ces entrees sont visibles par l'utilisateur et persistent jusqu'a
    suppression manuelle.

    Exemples de bons faits a persister :
    - "external_id 443196 = company 'arthur edmond' (AUTHORIZED)"
    - "Arthur Edmond user_id = 96a2284d, roles = [ADMIN]"
    - "Pas de role AML explicite dans le schema"

    NE PAS persister :
    - Des hypotheses non verifiees
    - Des resultats de requetes bruts
    - Des informations deja dans le schema cache

    Args:
        fact: Le fait verifie a persister.

    Returns:
        Confirmation avec le nombre total d'entrees contexte.
    """
    thread_id = current_thread_id.get()
    store = get_store(thread_id)
    store.add_context(fact, source="agent")
    total = len(store.user_context)
    agent_count = sum(1 for c in store.user_context if c.source == "agent")
    return (
        f"Fait persiste dans le contexte ({total} entrees, "
        f"dont {agent_count} par l'agent)."
    )
