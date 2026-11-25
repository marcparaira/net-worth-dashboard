# Tests read untyped JSON responses throughout.
# pyright: reportAny=false, reportExplicitAny=false
"""Data entry through the API: holdings, liabilities, and snapshots, with their validation."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend import entries, repository

pytestmark = pytest.mark.db

Json = dict[str, Any]


def ok(response: Any, status: int = 200) -> Any:
    assert response.status_code == status, response.text
    return response.json() if status != 204 else None


def holding(client: TestClient, name: str = "Broker", category: str = "Accions", liquidity: str = "liquid") -> Json:
    return cast(
        Json, ok(client.post("/api/holdings", json={"name": name, "category": category, "liquidity": liquidity}), 201)
    )


def detail(response: Any) -> str:
    body = response.json()
    return body["detail"] if isinstance(body["detail"], str) else " ".join(e["msg"] for e in body["detail"])


def test_holdings_can_be_created_renamed_recategorised_and_closed(client: TestClient):
    created = holding(client, " Broker ")
    assert (created["name"], created["category"], created["value_count"]) == ("Broker", "Accions", 0)

    changed = ok(
        client.put(
            f"/api/holdings/{created['id']}",
            json={"name": "Index fund", "category": "Fons", "liquidity": "non_liquid", "closed_on": "2026-01-31"},
        )
    )
    assert (changed["name"], changed["category"], changed["liquidity"], changed["closed_on"]) == (
        "Index fund",
        "Fons",
        "non_liquid",
        "2026-01-31",
    )
    assert [c["name"] for c in ok(client.get("/api/categories"))] == ["Accions", "Fons"]


def test_a_holding_needs_a_name_and_a_valid_liquidity(client: TestClient):
    response = client.post("/api/holdings", json={"name": "  ", "category": "Accions", "liquidity": "liquid"})
    assert response.status_code == 422
    response = client.post("/api/holdings", json={"name": "Broker", "category": "Accions", "liquidity": "sometimes"})
    assert response.status_code == 422


def test_snapshots_are_created_listed_edited_and_deleted(client: TestClient):
    flat = holding(client, "Flat", "Immobles", "non_liquid")
    cash = holding(client, "Bank", "Efectiu i bons CT")
    mortgage = ok(client.post("/api/liabilities", json={"name": "Mortgage", "holding_id": flat["id"]}), 201)
    assert mortgage["holding_id"] == flat["id"]

    first = ok(
        client.post(
            "/api/snapshots",
            json={
                "date": "2026-01-31",
                "values": [
                    {"holding_id": flat["id"], "amount": 200000},
                    {"holding_id": cash["id"], "amount": "1500.50"},
                    {"liability_id": mortgage["id"], "amount": 120000},
                ],
            },
        ),
        201,
    )
    second = ok(
        client.post(
            "/api/snapshots",
            json={"date": "2026-02-28", "values": [{"holding_id": cash["id"], "amount": 2500.5}]},
        ),
        201,
    )
    assert second["previous"]["id"] == first["id"]

    listed = ok(client.get("/api/snapshots"))
    assert [(s["date"], s["net_worth"], s["change"], s["value_count"]) for s in listed] == [
        ("2026-02-28", 2500.5, 2500.5 - 81500.5, 1),
        ("2026-01-31", 81500.5, None, 3),
    ]

    edited = ok(
        client.put(
            f"/api/snapshots/{second['id']}",
            json={"date": "2026-02-27", "values": [{"holding_id": cash["id"], "amount": 3000}]},
        )
    )
    assert (edited["date"], edited["values"][0]["amount"]) == ("2026-02-27", 3000.0)

    # The dashboard is built from the same data.
    dashboard = ok(client.get("/api/dashboard"))
    assert dashboard["meta"]["latest_date"] == "2026-02-27"
    assert dashboard["summary"]["net_worth"] == 3000

    _ = ok(client.delete(f"/api/snapshots/{second['id']}"), 204)
    assert [s["date"] for s in ok(client.get("/api/snapshots"))] == ["2026-01-31"]
    assert ok(client.get("/api/holdings"))[0]["latest_amount"] in (200000, 1500.5)


def test_snapshot_validation(client: TestClient):
    cash = holding(client, "Bank")
    flat = holding(client, "Flat", "Immobles", "non_liquid")
    mortgage = ok(client.post("/api/liabilities", json={"name": "Mortgage", "holding_id": flat["id"]}), 201)

    def post(day: str, values: list[Json]) -> Any:
        return client.post("/api/snapshots", json={"date": day, "values": values})

    _ = ok(post("2026-01-31", [{"holding_id": cash["id"], "amount": 10}]), 201)

    duplicate = post("2026-01-31", [{"holding_id": cash["id"], "amount": 10}])
    assert duplicate.status_code == 409 and "already a snapshot on 2026-01-31" in detail(duplicate)

    future = post((date.today() + timedelta(days=1)).isoformat(), [{"holding_id": cash["id"], "amount": 10}])
    assert future.status_code == 422 and "future" in detail(future)

    assert post("2026-02-28", []).status_code == 422
    assert post("2026-02-28", [{"holding_id": cash["id"], "amount": -1}]).status_code == 422
    assert post("2026-02-28", [{"holding_id": cash["id"], "amount": "10.125"}]).status_code == 422
    assert post("2026-02-28", [{"holding_id": cash["id"], "amount": "ten"}]).status_code == 422

    twice = post("2026-02-28", [{"holding_id": cash["id"], "amount": 1}, {"holding_id": cash["id"], "amount": 2}])
    assert twice.status_code == 422 and "twice" in detail(twice)

    orphan = post("2026-02-28", [{"liability_id": mortgage["id"], "amount": 1000}])
    assert orphan.status_code == 422 and "needs a value for its property" in detail(orphan)

    unknown = post("2026-02-28", [{"holding_id": "00000000-0000-0000-0000-000000000000", "amount": 1}])
    assert unknown.status_code == 422 and "does not exist" in detail(unknown)


def test_deleting_is_only_allowed_without_history(client: TestClient):
    cash = holding(client, "Bank")
    unused = holding(client, "Unused")
    _ = ok(
        client.post("/api/snapshots", json={"date": "2026-01-31", "values": [{"holding_id": cash["id"], "amount": 1}]}),
        201,
    )

    refused = client.delete(f"/api/holdings/{cash['id']}")
    assert refused.status_code == 409 and "close it instead" in detail(refused)
    _ = ok(client.delete(f"/api/holdings/{unused['id']}"), 204)
    assert [h["name"] for h in ok(client.get("/api/holdings"))] == ["Bank"]


def test_a_property_has_at_most_one_mortgage(client: TestClient):
    flat = holding(client, "Flat", "Immobles", "non_liquid")
    _ = ok(client.post("/api/liabilities", json={"name": "Mortgage", "holding_id": flat["id"]}), 201)
    loan = ok(client.post("/api/liabilities", json={"name": "Loan"}), 201)

    second = client.post("/api/liabilities", json={"name": "Second mortgage", "holding_id": flat["id"]})
    assert second.status_code == 409 and "already has a mortgage" in detail(second)
    relink = client.put(f"/api/liabilities/{loan['id']}", json={"name": "Loan", "holding_id": flat["id"]})
    assert relink.status_code == 409

    holdings = ok(client.get("/api/holdings"))
    assert holdings[0]["mortgage_id"] is not None


def test_unknown_ids_are_not_found(client: TestClient):
    missing = "00000000-0000-0000-0000-000000000000"
    assert (
        client.put(f"/api/holdings/{missing}", json={"name": "X", "category": "Y", "liquidity": "liquid"}).status_code
        == 404
    )
    assert client.get(f"/api/snapshots/{missing}").status_code == 404
    assert client.delete(f"/api/liabilities/{missing}").status_code == 404


def test_users_cannot_reach_each_others_rows(db_session: Session):
    alice = repository.get_or_create_user(db_session, "alice").id
    bob = repository.get_or_create_user(db_session, "bob").id
    holding_in = entries.HoldingIn(name="Broker", category="Accions", liquidity="liquid")
    alices = entries.create_holding(db_session, alice, holding_in)
    snapshot_in = entries.SnapshotIn(
        date=date(2026, 1, 31), values=[entries.SnapshotValueIn(holding_id=alices.id, amount=Decimal(10))]
    )
    snapshot = entries.create_snapshot(db_session, alice, snapshot_in)

    with pytest.raises(entries.NotFoundError):
        _ = entries.update_holding(db_session, bob, alices.id, holding_in)
    with pytest.raises(entries.NotFoundError):
        entries.delete_snapshot(db_session, bob, snapshot.id)
    with pytest.raises(entries.EntryError, match="does not exist"):
        _ = entries.create_snapshot(db_session, bob, snapshot_in)  # Bob cannot use Alice's holding
    assert entries.list_holdings(db_session, bob) == []
    assert entries.list_snapshots(db_session, bob) == []
