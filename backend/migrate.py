"""Bring the database schema up to date: ``python -m backend.migrate``.

Waits for the database to accept connections first (up to WAIT_SECONDS), so it can run as
the API container starts, before PostgreSQL is ready.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import NullPool

from .config import DATABASE_URL

ALEMBIC_INI = Path(__file__).resolve().parent / "alembic.ini"
WAIT_SECONDS = 60


def wait_for_database(url: str = DATABASE_URL, timeout: float = WAIT_SECONDS) -> None:
    engine = create_engine(url, poolclass=NullPool)
    deadline = time.monotonic() + timeout
    while True:
        try:
            with engine.connect() as connection:
                _ = connection.execute(text("SELECT 1"))
            return
        except OperationalError:
            if time.monotonic() > deadline:
                raise
            print("Waiting for the database...", file=sys.stderr)
            time.sleep(1)


def alembic_config(url: str = DATABASE_URL) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.attributes["url"] = url
    return config


def upgrade(url: str = DATABASE_URL) -> None:
    command.upgrade(alembic_config(url), "head")


def main() -> int:
    wait_for_database()
    upgrade()
    return 0


if __name__ == "__main__":
    sys.exit(main())
