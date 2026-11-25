"""Database engine and sessions."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import DATABASE_POOL, DATABASE_URL


def make_engine(url: str = DATABASE_URL) -> Engine:
    if DATABASE_POOL == "null":
        return create_engine(url, poolclass=NullPool)
    # pre_ping replaces connections the server closed while idle (for example after Aurora pauses).
    return create_engine(url, pool_size=2, max_overflow=3, pool_pre_ping=True, pool_recycle=300)


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, closed afterwards."""
    with SessionLocal() as session:
        yield session
