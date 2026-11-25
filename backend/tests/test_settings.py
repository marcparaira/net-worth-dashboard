# Tests read untyped JSON responses throughout.
# pyright: reportAny=false, reportExplicitAny=false
"""Settings through the API: rebalancing targets and categories."""

from __future__ import annotations

import copy
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.config import SAMPLE_DATA_DIR
from backend.importer import import_data
from backend.rebalancing import load_config
from backend.records import load_records

pytestmark = pytest.mark.db


@pytest.fixture
def sample(db_session: Session) -> None:
    _ = import_data(
        db_session, load_records(SAMPLE_DATA_DIR / "records"), load_config(SAMPLE_DATA_DIR / "rebalancing.json")
    )


def ok(response: Any, status: int = 200) -> Any:
    assert response.status_code == status, response.text
    return response.json() if status != 204 else None


def categories(client: TestClient) -> dict[str, Any]:
    return {c["name"]: c for c in ok(client.get("/api/categories"))}


@pytest.mark.usefixtures("sample")
def test_settings_name_holdings_by_id_and_round_trip(client: TestClient):
    settings = ok(client.get("/api/rebalancing/settings"))
    holding_ids = {h["id"]: h["name"] for h in ok(client.get("/api/holdings"))}
    real_estate = next(b for b in settings["buckets"] if b["name"] == "Real estate")
    assert [holding_ids[h] for h in real_estate["holding_ids"]] == ["Flat (sample)"]

    before = ok(client.get("/api/rebalancing"))
    assert ok(client.put("/api/rebalancing/settings", json=settings)) == settings
    assert ok(client.get("/api/rebalancing")) == before


@pytest.mark.usefixtures("sample")
def test_saving_replaces_everything_at_once(client: TestClient):
    settings = ok(client.get("/api/rebalancing/settings"))
    changed = copy.deepcopy(settings)
    changed["reserves"] = [{"name": "Emergency fund", "amount": 9000, "categories": ["Efectiu i bons CT"]}]
    changed["fill_order"] = ["Emergency fund"]
    changed["excluded_categories"] = ["Vehicles"]
    changed["buckets"][0]["weight"] = 25

    saved = ok(client.put("/api/rebalancing/settings", json=changed))
    assert [r["name"] for r in saved["reserves"]] == ["Emergency fund"]
    assert saved["excluded_categories"] == ["Vehicles"]
    assert categories(client)["Pensions"]["excluded_from_rebalancing"] is False
    assert ok(client.get("/api/rebalancing"))["reserves"][0]["target"] == 9000


@pytest.mark.usefixtures("sample")
def test_invalid_settings_change_nothing(client: TestClient):
    settings = ok(client.get("/api/rebalancing/settings"))

    unknown_step = {**settings, "fill_order": ["No such bucket"]}
    response = client.put("/api/rebalancing/settings", json=unknown_step)
    assert response.status_code == 422 and "fill_order" in response.text

    unknown_holding = copy.deepcopy(settings)
    unknown_holding["buckets"][0]["holding_ids"] = ["00000000-0000-0000-0000-000000000000"]
    response = client.put("/api/rebalancing/settings", json=unknown_holding)
    assert response.status_code == 422 and "does not exist" in response.text

    too_precise = copy.deepcopy(settings)
    too_precise["reserves"][0]["amount"] = 10.125
    assert client.put("/api/rebalancing/settings", json=too_precise).status_code == 422

    assert ok(client.get("/api/rebalancing/settings")) == settings


@pytest.mark.usefixtures("sample")
def test_preview_shows_the_effect_without_saving(client: TestClient):
    settings = ok(client.get("/api/rebalancing/settings"))
    saved = ok(client.get("/api/rebalancing"))
    changed = copy.deepcopy(settings)
    for bucket in changed["buckets"]:
        bucket["weight"] = 50

    preview = ok(client.post("/api/rebalancing/preview", json=changed))
    assert [b["share"] for b in preview["buckets"]] == [50, 50]
    assert preview != saved
    assert ok(client.get("/api/rebalancing")) == saved


def test_preview_needs_snapshots(client: TestClient):
    settings = {"buckets": [{"name": "All", "weight": 1, "categories": ["Accions"]}]}
    assert client.post("/api/rebalancing/preview", json=settings).status_code == 404
    assert client.get("/api/rebalancing/settings").status_code == 404


@pytest.mark.usefixtures("sample")
def test_categories_list_usage_and_flags(client: TestClient):
    listed = categories(client)
    assert listed["Efectiu i bons CT"]["holding_count"] == 2
    assert listed["Efectiu i bons CT"]["in_rebalancing"] is True
    assert (listed["Immobles"]["excluded_from_disposable"], listed["Pensions"]["excluded_from_rebalancing"]) == (
        True,
        True,
    )


@pytest.mark.usefixtures("sample")
def test_disposable_exclusion_drives_the_dashboard(client: TestClient):
    summary = ok(client.get("/api/dashboard"))["summary"]
    assert summary["disposable_net_value"] < summary["net_worth"]

    real_estate = categories(client)["Immobles"]
    _ = ok(
        client.put(
            f"/api/categories/{real_estate['id']}",
            json={"name": "Immobles", "excluded_from_disposable": False, "excluded_from_rebalancing": False},
        )
    )
    dashboard = ok(client.get("/api/dashboard"))
    assert dashboard["summary"]["disposable_net_value"] == dashboard["summary"]["net_worth"]
    assert dashboard["meta"]["excluded_categories"] == []


@pytest.mark.usefixtures("sample")
def test_renaming_merging_and_deleting_categories(client: TestClient):
    listed = categories(client)
    stocks = listed["Accions"]

    renamed = ok(client.put(f"/api/categories/{stocks['id']}", json={"name": "Shares"}))
    assert renamed["name"] == "Shares"
    assert ok(client.get("/api/rebalancing/settings"))["buckets"][1]["children"][0]["categories"] == ["Shares"]

    clash = client.put(f"/api/categories/{stocks['id']}", json={"name": "Pensions"})
    assert clash.status_code == 409 and "merge" in clash.text
    assert client.post("/api/categories", json={"name": "Pensions"}).status_code == 409

    in_use = client.delete(f"/api/categories/{stocks['id']}")
    assert in_use.status_code == 409

    funds = ok(client.post("/api/categories", json={"name": "Funds"}), 201)
    merged = ok(client.post(f"/api/categories/{stocks['id']}/merge", json={"into": funds["id"]}))
    assert merged["holding_count"] == 2 and merged["in_rebalancing"] is True
    assert "Shares" not in categories(client)
    assert {h["category"] for h in ok(client.get("/api/holdings")) if "Broker" in h["name"]} == {"Funds"}

    unused = ok(client.post("/api/categories", json={"name": "Unused"}), 201)
    _ = ok(client.delete(f"/api/categories/{unused['id']}"), 204)
