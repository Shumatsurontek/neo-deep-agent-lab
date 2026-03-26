"""Modal App and Sandbox lifecycle management.

Each session gets its own sandbox (created lazily on first tool call).
The first sandbox performs a full cold start; subsequent ones restore
from a Modal snapshot for faster startup (~2-3s vs ~15-20s).
"""

from __future__ import annotations

import modal

from src.common import get_logger
from src.config import settings
from src.constants import MODAL_APP_NAME
from src.sandbox.image import create_pg_image

logger = get_logger("sandbox")

# Exceptions raised when a sandbox has expired / timed out
_STALE_SANDBOX_ERRORS = (
    modal.exception.NotFoundError,
    modal.exception.ConflictError,
)

# Module-level snapshot image: first sandbox does full cold start + PG init,
# then snapshots the filesystem.  Subsequent sandboxes reuse the snapshot image
# (PG already initialized) for much faster startup.
_snapshot_image: modal.Image | None = None


def _create_sandbox() -> modal.Sandbox:
    """Create a fresh sandbox, using snapshot image if available."""
    global _snapshot_image

    app = modal.App.lookup(MODAL_APP_NAME, create_if_missing=True)

    if _snapshot_image is not None:
        # Fast path: restore from snapshot — PG data is baked into the image.
        # The entrypoint must stay alive (sleep infinity) so the sandbox
        # container doesn't exit after starting PG.
        logger.info("Creating sandbox from snapshot image (fast path).")
        sb = modal.Sandbox.create(
            "bash",
            "-c",
            "pg_ctlcluster $(pg_lsclusters -h | awk '{print $1}') main start && sleep infinity",
            app=app,
            image=_snapshot_image,
            timeout=600,
        )
        # Don't sb.wait() — that blocks until the container exits.
        # Instead, verify PG is ready via a quick exec.
        result = sb.exec("bash", "-c", "pg_isready -U postgres --timeout=10")
        result.wait()
        if result.returncode != 0:
            raise RuntimeError("PG failed to start in snapshot sandbox")
        logger.info("Sandbox restored from snapshot, PG ready.")
        return sb

    # Cold start: create fresh sandbox and init PG from scratch
    image = create_pg_image(dump_path=settings.DB_DUMP_PATH)
    sb = modal.Sandbox.create(
        app=app,
        image=image,
        timeout=600,
    )

    result = sb.exec("bash", "/tmp/init_pg.sh")  # nosec B108
    stdout = result.stdout.read()
    stderr = result.stderr.read()
    result.wait()

    if result.returncode != 0:
        raise RuntimeError(
            f"PostgreSQL init failed:\nstdout: {stdout}\nstderr: {stderr}"
        )

    logger.info("Sandbox created and PG initialized: %s", stdout.strip()[:120])

    # Snapshot the filesystem so future sandboxes skip the init
    try:
        _snapshot_image = sb.snapshot_filesystem()
        logger.info("Sandbox filesystem snapshot saved for future sessions.")
    except Exception as exc:
        logger.warning("Failed to create snapshot (non-fatal): %s", exc)

    return sb


# ── Per-session sandbox management ────────────────────────────────────


def get_or_create_sandbox_for_session(session: object) -> modal.Sandbox:
    """Get existing sandbox for session, or create a new one.

    Args:
        session: A ``Session`` object with a ``sandbox`` attribute.
    """
    if getattr(session, "sandbox", None) is not None:
        return session.sandbox  # type: ignore[return-value]

    sb = _create_sandbox()
    session.sandbox = sb  # type: ignore[attr-defined]
    return sb


def terminate_session_sandbox(session: object) -> None:
    """Terminate the sandbox for a specific session."""
    sb = getattr(session, "sandbox", None)
    if sb is not None:
        try:
            sb.terminate()
        except Exception:
            pass
        session.sandbox = None  # type: ignore[attr-defined]


# ── ContextVar-based sandbox resolution (for tools) ──────────────────


def _resolve_sandbox() -> modal.Sandbox:
    """Resolve the sandbox for the current thread via ContextVar → Session."""
    from src.context.thread_var import current_thread_id
    from src.server.session import get_session_by_thread

    thread_id = current_thread_id.get()
    session = get_session_by_thread(thread_id)
    if session is None:
        raise RuntimeError(f"No session found for thread_id={thread_id}")
    return get_or_create_sandbox_for_session(session)


def exec_in_sandbox(cmd: str) -> tuple[str, str, int]:
    """Execute a command in the current session's sandbox.

    Resolves the sandbox from the current thread's ContextVar.
    If the sandbox has expired, it is transparently recreated and retried once.
    """
    for attempt in range(2):
        sandbox = _resolve_sandbox()
        try:
            result = sandbox.exec("bash", "-c", cmd)
            stdout = result.stdout.read()
            stderr = result.stderr.read()
            result.wait()
            return stdout, stderr, result.returncode
        except _STALE_SANDBOX_ERRORS:
            # Invalidate the session's sandbox so next call recreates
            from src.context.thread_var import current_thread_id
            from src.server.session import get_session_by_thread

            session = get_session_by_thread(current_thread_id.get())
            if session:
                logger.warning(
                    "Sandbox expired for thread=%s — recreating.", session.thread_id[:8]
                )
                session.sandbox = None
            if attempt > 0:
                raise
    raise RuntimeError("Sandbox exec failed after retries")


def terminate_sandbox() -> None:
    """Legacy function — kept for CLI compatibility."""
    pass
