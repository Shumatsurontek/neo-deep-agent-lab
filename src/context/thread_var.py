"""ContextVar for passing the current thread_id to tools.

Set in the server before each agent invocation so that tools
(like write_scratchpad) can access the thread without LangGraph plumbing.
"""

from contextvars import ContextVar

current_thread_id: ContextVar[str] = ContextVar("current_thread_id", default="main")
