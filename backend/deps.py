"""Request dependencies shared by the API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from . import repository
from .db import get_session
from .db_models import User

SessionDep = Annotated[Session, Depends(get_session)]


def current_user(session: SessionDep) -> User:
    """The signed-in user; until accounts exist (Phase 8), the single local user, created on first use."""
    user = repository.find_user(session)
    if user is None:
        user = repository.get_or_create_user(session)
        session.commit()
    return user


UserDep = Annotated[User, Depends(current_user)]
