"""FastAPI entry point: ``uvicorn backend.app:app``."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import repository
from .config import APP_VERSION, CORS_ORIGINS, RateBasis
from .dashboard import build_dashboard
from .db import get_session
from .db_models import User
from .rebalancing import build_rebalancing
from .schemas import DashboardPayload, Health, RebalancingPayload

app = FastAPI(title="Net Worth Dashboard API", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SessionDep = Annotated[Session, Depends(get_session)]
NO_DATA = "No snapshots yet. Import your records with: python -m backend.importer <data directory>"


def current_user(session: SessionDep) -> User:
    """The signed-in user; until accounts exist (Phase 8), the single local user."""
    user = repository.find_user(session)
    if user is None:
        raise HTTPException(status_code=404, detail=NO_DATA)
    return user


UserDep = Annotated[User, Depends(current_user)]


@app.get("/api/dashboard")
def dashboard(session: SessionDep, user: UserDep, rate_basis: RateBasis = "last_year") -> DashboardPayload:
    records = repository.load_records(session, user.id)
    if not records:
        raise HTTPException(status_code=404, detail=NO_DATA)
    return build_dashboard(records, rate_basis)


@app.get("/api/rebalancing")
def rebalancing(session: SessionDep, user: UserDep) -> RebalancingPayload:
    records = repository.load_records(session, user.id)
    if not records:
        raise HTTPException(status_code=404, detail=NO_DATA)
    config = repository.load_rebalancing_config(session, user.id)
    if config is None:
        raise HTTPException(
            status_code=404, detail="No rebalancing settings yet. Include rebalancing.json in the import."
        )
    return build_rebalancing(records, config)


@app.get("/api/health")
def health() -> Health:
    return {"status": "ok", "version": APP_VERSION}
