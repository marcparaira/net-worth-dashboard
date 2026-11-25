"""API routes for settings: categories and rebalancing targets."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Response, status

from . import settings
from .deps import SessionDep, UserDep
from .rebalancing import RebalancingConfig
from .schemas import RebalancingPayload
from .settings import CategoryIn, CategoryOut, MergeIn

router = APIRouter(prefix="/api")


@router.get("/categories")
def categories(session: SessionDep, user: UserDep) -> list[CategoryOut]:
    return settings.list_categories(session, user.id)


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryIn, session: SessionDep, user: UserDep) -> CategoryOut:
    result = settings.create_category(session, user.id, data)
    session.commit()
    return result


@router.put("/categories/{category_id}")
def update_category(category_id: uuid.UUID, data: CategoryIn, session: SessionDep, user: UserDep) -> CategoryOut:
    result = settings.update_category(session, user.id, category_id, data)
    session.commit()
    return result


@router.post("/categories/{category_id}/merge")
def merge_category(category_id: uuid.UUID, data: MergeIn, session: SessionDep, user: UserDep) -> CategoryOut:
    result = settings.merge_category(session, user.id, category_id, data)
    session.commit()
    return result


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: uuid.UUID, session: SessionDep, user: UserDep) -> Response:
    settings.delete_category(session, user.id, category_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/rebalancing/settings")
def rebalancing_settings(session: SessionDep, user: UserDep) -> RebalancingConfig:
    """The rebalancing settings; buckets name holdings by their id."""
    config = settings.get_settings(session, user.id)
    if config is None:
        raise HTTPException(status_code=404, detail="No rebalancing settings yet.")
    return config


@router.put("/rebalancing/settings")
def replace_rebalancing_settings(data: RebalancingConfig, session: SessionDep, user: UserDep) -> RebalancingConfig:
    """Replace all rebalancing settings at once; nothing is saved unless all of it is valid."""
    result = settings.replace_settings(session, user.id, data)
    session.commit()
    return result


@router.post("/rebalancing/preview")
def preview_rebalancing(data: RebalancingConfig, session: SessionDep, user: UserDep) -> RebalancingPayload:
    """The rebalancing that these (unsaved) settings would give."""
    return settings.preview(session, user.id, data)
