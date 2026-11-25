"""API routes for data entry: holdings, liabilities, snapshots, and categories."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import JSONResponse

from . import entries
from .deps import SessionDep, UserDep
from .entries import (
    EntryError,
    HoldingIn,
    HoldingOut,
    LiabilityIn,
    LiabilityOut,
    SnapshotDetail,
    SnapshotIn,
    SnapshotSummary,
)

router = APIRouter(prefix="/api")


def entry_error_response(_request: Request, exc: Exception) -> JSONResponse:
    """Business-rule errors carry their own status and a message the UI shows as is."""
    assert isinstance(exc, EntryError)
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


def integrity_error_response(_request: Request, _exc: Exception) -> JSONResponse:
    """A constraint the checks did not catch, usually a concurrent change."""
    return JSONResponse(
        status_code=409, content={"detail": "the change conflicts with existing data; reload and retry"}
    )


@router.get("/categories")
def categories(session: SessionDep, user: UserDep) -> list[str]:
    return entries.list_categories(session, user.id)


@router.get("/holdings")
def holdings(session: SessionDep, user: UserDep) -> list[HoldingOut]:
    return entries.list_holdings(session, user.id)


@router.post("/holdings", status_code=status.HTTP_201_CREATED)
def create_holding(data: HoldingIn, session: SessionDep, user: UserDep) -> HoldingOut:
    result = entries.create_holding(session, user.id, data)
    session.commit()
    return result


@router.put("/holdings/{holding_id}")
def update_holding(holding_id: uuid.UUID, data: HoldingIn, session: SessionDep, user: UserDep) -> HoldingOut:
    result = entries.update_holding(session, user.id, holding_id, data)
    session.commit()
    return result


@router.delete("/holdings/{holding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holding(holding_id: uuid.UUID, session: SessionDep, user: UserDep) -> Response:
    entries.delete_holding(session, user.id, holding_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/liabilities")
def liabilities(session: SessionDep, user: UserDep) -> list[LiabilityOut]:
    return entries.list_liabilities(session, user.id)


@router.post("/liabilities", status_code=status.HTTP_201_CREATED)
def create_liability(data: LiabilityIn, session: SessionDep, user: UserDep) -> LiabilityOut:
    result = entries.create_liability(session, user.id, data)
    session.commit()
    return result


@router.put("/liabilities/{liability_id}")
def update_liability(liability_id: uuid.UUID, data: LiabilityIn, session: SessionDep, user: UserDep) -> LiabilityOut:
    result = entries.update_liability(session, user.id, liability_id, data)
    session.commit()
    return result


@router.delete("/liabilities/{liability_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_liability(liability_id: uuid.UUID, session: SessionDep, user: UserDep) -> Response:
    entries.delete_liability(session, user.id, liability_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/snapshots")
def snapshots(session: SessionDep, user: UserDep) -> list[SnapshotSummary]:
    return entries.list_snapshots(session, user.id)


@router.get("/snapshots/{snapshot_id}")
def snapshot(snapshot_id: uuid.UUID, session: SessionDep, user: UserDep) -> SnapshotDetail:
    return entries.get_snapshot(session, user.id, snapshot_id)


@router.post("/snapshots", status_code=status.HTTP_201_CREATED)
def create_snapshot(data: SnapshotIn, session: SessionDep, user: UserDep) -> SnapshotDetail:
    result = entries.create_snapshot(session, user.id, data)
    session.commit()
    return result


@router.put("/snapshots/{snapshot_id}")
def update_snapshot(snapshot_id: uuid.UUID, data: SnapshotIn, session: SessionDep, user: UserDep) -> SnapshotDetail:
    result = entries.update_snapshot(session, user.id, snapshot_id, data)
    session.commit()
    return result


@router.delete("/snapshots/{snapshot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_snapshot(snapshot_id: uuid.UUID, session: SessionDep, user: UserDep) -> Response:
    entries.delete_snapshot(session, user.id, snapshot_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
