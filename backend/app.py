"""FastAPI entry point: ``uvicorn backend.app:app``."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError

from . import repository
from .config import APP_VERSION, CORS_ORIGINS, RateBasis
from .dashboard import build_dashboard
from .deps import SessionDep, UserDep
from .entries import EntryError
from .entry_routes import entry_error_response, integrity_error_response, router
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
app.include_router(router)
app.add_exception_handler(EntryError, entry_error_response)
app.add_exception_handler(IntegrityError, integrity_error_response)

NO_DATA = "No snapshots yet. Add one from the Snapshots page, or import records with: python -m backend.importer"


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
