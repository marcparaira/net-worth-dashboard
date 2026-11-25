"""Alembic environment: migrations run against DATABASE_URL, compared with backend.db_models."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from backend.config import DATABASE_URL
from backend.db_models import Base

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)

# A connection passed in by the caller (tests, backend.migrate) takes precedence over DATABASE_URL.
url = context.config.attributes.get("url") or DATABASE_URL


def run_migrations() -> None:
    engine = create_engine(url, poolclass=NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    raise SystemExit("Offline (SQL script) migrations are not supported; run against a database.")
run_migrations()
