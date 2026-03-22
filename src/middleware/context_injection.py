"""Context injection middleware — enriches the system prompt before each LLM call.

Strategy: **Select** — pulls cached schema, user context, scratchpad, and
conversation summary into the prompt so the model has the right information
for the next step.

Scratchpad notes are ranked by reward score (human feedback +1/-1) so the
agent sees the most valuable notes first.
"""

from __future__ import annotations

from langchain.agents.middleware import dynamic_prompt
from langchain.agents.middleware.types import ModelRequest

from src.context.store import get_store


@dynamic_prompt
def inject_context(request: ModelRequest) -> str:  # type: ignore[type-arg]
    """Build an enriched system prompt with all available context."""
    try:
        thread_id: str = request.runtime.config["configurable"]["thread_id"]  # type: ignore[union-attr]
    except (AttributeError, KeyError, TypeError):
        thread_id = "main"

    store = get_store(thread_id)
    prompt = request.system_prompt or ""

    sections: list[str] = []

    if store.schema_cache:
        schema_text = "\n\n".join(
            f"-- {key} --\n{value}" for key, value in store.schema_cache.items()
        )
        sections.append(f"<schema_cache>\n{schema_text}\n</schema_cache>")

    if store.user_context:
        items = "\n".join(f"- [{c.source}] {c.text}" for c in store.user_context)
        sections.append(f"<user_context>\n{items}\n</user_context>")

    if store.scratchpad:
        # Only inject notes with score >= 0 (negative = rejected by user)
        ranked = [n for n in store.ranked_notes() if n.score >= 0]
        if ranked:
            notes_lines = []
            for n in ranked:
                score_tag = f" [score:{n.score:+d}]" if n.score > 0 else ""
                notes_lines.append(f"- {n.note}{score_tag}")
            notes_text = "\n".join(notes_lines)

            stats = store.reward_summary()
            reward_hint = (
                f"\n(Reward: {stats['total']} notes total, "
                f"{stats['positive']} positives, "
                f"{stats['negative']} rejetees — non injectees. "
                "Evite de reproduire le type de notes rejetees.)"
            )
            sections.append(f"<scratchpad>\n{notes_text}{reward_hint}\n</scratchpad>")

    if store.summary:
        sections.append(
            f"<conversation_summary>\n{store.summary}\n</conversation_summary>"
        )

    if sections:
        prompt += "\n\n" + "\n\n".join(sections)

    return prompt
