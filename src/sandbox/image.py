"""Modal Image definition with PostgreSQL and Neo dump pre-loaded."""

import modal


def create_pg_image(dump_path: str = "data/neo_dump.sql") -> modal.Image:
    """Build a Modal Image with PostgreSQL, the dump, and init script.

    PostgreSQL is NOT started during build (avoids permission issues).
    The dump and init script are loaded at sandbox runtime by app.py.
    """
    return (
        modal.Image.debian_slim(python_version="3.11")
        .apt_install(
            "postgresql",
            "postgresql-client",
            "sudo",
        )
        .add_local_file(dump_path, "/tmp/neo_dump.sql", copy=True)
        .add_local_file("src/sandbox/init_pg.sh", "/tmp/init_pg.sh", copy=True)
    )
