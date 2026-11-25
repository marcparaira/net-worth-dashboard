"""FastAPI entry point: ``uvicorn backend.app:app``."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import APP_VERSION, CORS_ORIGINS, RateBasis
from .dashboard import calculate_payload
from .rebalancing import calculate_rebalancing
from .schemas import DashboardPayload, Health, RebalancingPayload

app = FastAPI(title="Net Worth Dashboard API", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/dashboard")
def dashboard(rate_basis: RateBasis = "last_year") -> DashboardPayload:
    return calculate_payload(rate_basis=rate_basis)


@app.get("/api/rebalancing")
def rebalancing() -> RebalancingPayload:
    return calculate_rebalancing()


@app.get("/api/health")
def health() -> Health:
    return {"status": "ok", "version": APP_VERSION}
