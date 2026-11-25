"""Database fixtures. Tests marked ``db`` run against TEST_DATABASE_URL, a real PostgreSQL.

The database is recreated from the migrations once per test run, and each test runs inside a
transaction that is rolled back. Locally the tests are skipped when TEST_DATABASE_URL is unset;
in CI they are required.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, create_engine, make_url, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from backend import migrate

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    del config  # required by the hook signature
    if TEST_DATABASE_URL:
        return
    if os.environ.get("CI"):
        raise pytest.UsageError("TEST_DATABASE_URL must be set in CI, so the database tests run.")
    skip = pytest.mark.skip(reason="set TEST_DATABASE_URL to run the database tests")
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


def recreate_database(url: str) -> None:
    """Create the test database if missing, and empty it. Refuses names not ending in ``_test``."""
    parsed = make_url(url)
    name = parsed.database or ""
    if not name.endswith("_test"):
        raise pytest.UsageError(f"TEST_DATABASE_URL must point at a database named *_test, not {name!r}")
    server = create_engine(parsed.set(database="postgres"), poolclass=NullPool, isolation_level="AUTOCOMMIT")
    with server.connect() as connection:
        exists = connection.execute(text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": name}).first()
        if exists is None:
            _ = connection.execute(text(f'CREATE DATABASE "{name}"'))
    server.dispose()
    engine = create_engine(url, poolclass=NullPool)
    with engine.begin() as connection:
        _ = connection.execute(text("DROP SCHEMA public CASCADE"))
        _ = connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    assert TEST_DATABASE_URL is not None
    recreate_database(TEST_DATABASE_URL)
    migrate.upgrade(TEST_DATABASE_URL)
    engine = create_engine(TEST_DATABASE_URL, poolclass=NullPool)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Iterator[Session]:
    """A session whose changes, including commits, are rolled back after the test."""
    with db_engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
        try:
            yield session
        finally:
            session.close()
            transaction.rollback()
