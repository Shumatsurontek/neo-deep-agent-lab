"""Modal App and Sandbox lifecycle management."""

from __future__ import annotations

from typing import Optional

import modal

from src.config import settings
from src.constants import MODAL_APP_NAME
from src.sandbox.image import create_pg_image

_sandbox: Optional[modal.Sandbox] = None


def get_or_create_sandbox() -> modal.Sandbox:
    """Get existing sandbox or create a new one.

    Reuses the same sandbox within a session to avoid cold starts.
    PostgreSQL is started and the dump is loaded on first creation.
    """
    global _sandbox

    if _sandbox is not None:
        return _sandbox

    image = create_pg_image(dump_path=settings.DB_DUMP_PATH)
    app = modal.App.lookup(MODAL_APP_NAME, create_if_missing=True)

    _sandbox = modal.Sandbox.create(
        app=app,
        image=image,
        timeout=600,  # 10 minutes max per sandbox session
    )

    # Run the init script that starts PG and loads the dump
    result = _sandbox.exec("bash", "/tmp/init_pg.sh")  # nosec B108
    stdout = result.stdout.read()
    stderr = result.stderr.read()
    result.wait()

    if result.returncode != 0:
        raise RuntimeError(
            f"PostgreSQL init failed:\nstdout: {stdout}\nstderr: {stderr}"
        )

    print(stdout)

    return _sandbox


def exec_in_sandbox(cmd: str) -> tuple[str, str, int]:
    """Execute a command in the sandbox. Returns (stdout, stderr, exit_code)."""
    sandbox = get_or_create_sandbox()
    result = sandbox.exec("bash", "-c", cmd)
    stdout = result.stdout.read()
    stderr = result.stderr.read()
    result.wait()
    return stdout, stderr, result.returncode


def terminate_sandbox() -> None:
    """Terminate the current sandbox if it exists."""
    global _sandbox

    if _sandbox is not None:
        try:
            _sandbox.terminate()
        except Exception:
            pass
        _sandbox = None
