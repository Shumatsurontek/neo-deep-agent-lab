"""Interactive CLI chat with the SQL agent using Rich for display."""

from __future__ import annotations

import logging
import sys
import uuid

from langchain_core.messages import HumanMessage
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel

from src.agent.factory import create_sql_agent
from src.sandbox.app import terminate_sandbox

console = Console()

WELCOME_MESSAGE = """
# Neo Deep Agent Lab - SQL Chat

Pose des questions sur la base de données Neo en langage naturel.
L'agent va générer et exécuter des requêtes SQL pour y répondre.

**Commandes :**
- `quit` ou `exit` : Quitter
- `reset` : Réinitialiser la conversation
- `clear` : Effacer l'écran
"""


def main() -> None:
    """Entry point for the CLI chat."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(message)s",
        handlers=[logging.FileHandler("agent.log")],
    )

    console.print(Markdown(WELCOME_MESSAGE))

    console.print("[dim]Initialisation de l'agent et du sandbox Modal...[/dim]")
    try:
        agent = create_sql_agent()
    except Exception as exc:
        console.print(f"[red]Erreur d'initialisation : {exc}[/red]")
        sys.exit(1)

    console.print("[green]Agent prêt ![/green]\n")

    try:
        _chat_loop(agent)
    except KeyboardInterrupt:
        console.print("\n[dim]Interruption...[/dim]")
    finally:
        console.print("[dim]Arrêt du sandbox...[/dim]")
        terminate_sandbox()
        console.print("[dim]Terminé.[/dim]")


def _chat_loop(agent) -> None:
    """Main chat loop with checkpointer-managed history."""
    thread_id = str(uuid.uuid4())

    while True:
        try:
            user_input = console.input("\n[bold cyan]> [/bold cyan]").strip()
        except EOFError:
            break

        if not user_input:
            continue

        if user_input.lower() in ("quit", "exit"):
            break

        if user_input.lower() == "clear":
            console.clear()
            continue

        if user_input.lower() == "reset":
            thread_id = str(uuid.uuid4())
            console.print("[dim]Conversation réinitialisée.[/dim]")
            continue

        console.print()
        config = {"configurable": {"thread_id": thread_id}}
        _stream_response(agent, user_input, config)


def _stream_response(agent, user_input: str, config: dict) -> None:
    """Stream the agent's response with real-time display."""
    try:
        for chunk in agent.stream(
            {"messages": [HumanMessage(content=user_input)]},
            stream_mode=["messages"],
            config=config,
            version="v2",
        ):
            chunk_type = chunk.get("type", "")
            data = chunk.get("data")

            if chunk_type == "messages":
                token = data[0] if isinstance(data, (list, tuple)) else data
                token_type = getattr(token, "type", "")

                # Tool results — show ONLY as panel, never as text
                if token_type == "tool":
                    tool_name = getattr(token, "name", "unknown")
                    tool_content = str(getattr(token, "content", ""))
                    display_content = tool_content[:500]
                    if len(tool_content) > 500:
                        display_content += "\n..."
                    console.print(
                        Panel(
                            display_content,
                            title=f"Result: {tool_name}",
                            border_style="green",
                        ),
                    )
                else:
                    # Stream text tokens (AI messages only)
                    content = getattr(token, "content", "")
                    if content and isinstance(content, str):
                        console.print(content, end="")

                    # Tool call detection
                    tool_call_chunks = getattr(token, "tool_call_chunks", None)
                    if tool_call_chunks:
                        for tc in tool_call_chunks:
                            if isinstance(tc, dict) and tc.get("name"):
                                console.print(
                                    Panel(
                                        f"[yellow]{tc['name']}[/yellow]({tc.get('args', '')})",
                                        title="Tool Call",
                                        border_style="yellow",
                                    ),
                                )

    except Exception as exc:
        console.print(f"\n[red]Erreur : {exc}[/red]")

    console.print()  # Final newline


if __name__ == "__main__":
    main()
