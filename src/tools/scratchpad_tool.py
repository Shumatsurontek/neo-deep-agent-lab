"""Scratchpad tool — lets the agent write session notes to itself.

Strategy: **Write** — persists information outside the context window
so it survives context trimming and can be re-injected by the
context injection middleware.

Notes are scored by human feedback (+1/-1) so the agent learns
which observations are valuable to record.
"""

from __future__ import annotations

from langchain_core.tools import tool

from src.context.store import get_store
from src.context.thread_var import current_thread_id
from src.tools.schemas import ScratchpadInput


@tool(args_schema=ScratchpadInput)
def write_scratchpad(note: str) -> str:
    """Ecrit une note dans le bloc-notes de session pour reference future.

    Utilise cet outil pour sauvegarder des observations, des patterns,
    ou des informations utiles pour la suite de la conversation.
    Les notes sont injectees automatiquement dans ton contexte,
    classees par score de pertinence (feedback humain +1/-1).

    Privilegie les notes factuelles et verifiees. Evite de noter
    des hypotheses non confirmees ou des informations deja visibles
    dans le schema.

    Args:
        note: La note a enregistrer.

    Returns:
        Confirmation avec le nombre total de notes et stats reward.
    """
    thread_id = current_thread_id.get()
    store = get_store(thread_id)
    store.add_note(note)
    stats = store.reward_summary()
    return (
        f"Note enregistree ({stats['total']} notes, "
        f"{stats['positive']} positives, {stats['negative']} negatives)."
    )
