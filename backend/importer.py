"""Import YAML records and rebalancing.json into the database.

    python -m backend.importer [DATA_DIR] [--replace]

DATA_DIR holds ``records/*.yaml`` and, optionally, ``rebalancing.json`` (default:
NET_WORTH_DATA_DIR, or sample-data/). The import runs in one transaction: it loads everything
or nothing. It refuses to import over existing data unless ``--replace`` is given, which first
deletes all of the user's financial data.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import cast

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import DATA_DIR, EXCLUDED_CATEGORY, LOCAL_USER_SUBJECT
from .db import SessionLocal
from .db_models import (
    Category,
    Holding,
    Liability,
    RebalancingBucket,
    RebalancingBucketMember,
    RebalancingReserve,
    RebalancingReserveCategory,
    Snapshot,
    SnapshotValue,
)
from .entries import EntryError
from .ledger import standalone_liabilities
from .migrate import wait_for_database
from .models import Record
from .money import to_cents
from .rebalancing import RebalancingConfig, load_config
from .records import load_records
from .repository import get_or_create_user
from .settings import write_rebalancing


class DataImportError(Exception):
    """The data cannot be imported without losing or changing information."""


@dataclass(frozen=True)
class ImportSummary:
    snapshots: int
    holdings: int
    liabilities: int
    values: int
    rebalancing: bool
    # Each YAML id with the database id of the holding or liability it became.
    ids: dict[str, str]


def exact(value: float, where: str) -> Decimal:
    """The amount as an exact decimal; refuses values that need more than two decimals."""
    try:
        return to_cents(value)
    except ValueError as exc:
        raise DataImportError(f"{where}: {exc}") from exc


def check_consistency(records: list[Record]) -> None:
    """The database stores each holding's name, category, liquidity and mortgage once, and only
    amounts per snapshot, so these must be the same in every record."""
    dates = [r.date for r in records]
    if len(dates) != len(set(dates)):
        raise DataImportError("two records have the same date")

    seen: dict[str, tuple[object, ...]] = {}

    def same(key: str, identity: tuple[object, ...], day: date) -> None:
        previous = seen.setdefault(key, identity)
        if previous != identity:
            raise DataImportError(f"{key} is {previous} until {day}, then {identity}; make the records consistent")

    for record in records:
        for liquidity, items in (("liquid", record.assets.liquid), ("non_liquid", record.assets.non_liquid)):
            for item in items:
                same(f"holding {item.id!r}", (item.name, item.category, liquidity), record.date)
                if item.mortgage:
                    same(f"mortgage {item.mortgage.id!r}", (item.mortgage.name, item.id), record.date)
        for liability in standalone_liabilities(record):
            same(f"liability {liability.id!r}", (liability.name,), record.date)


def delete_user_data(session: Session, user_id: uuid.UUID) -> None:
    """Delete all of a user's financial data, children first."""
    for model in (
        RebalancingBucketMember,
        RebalancingReserveCategory,
        RebalancingBucket,
        RebalancingReserve,
        SnapshotValue,
        Snapshot,
        Liability,
        Holding,
        Category,
    ):
        _ = session.execute(delete(model).where(model.user_id == user_id))


def import_data(
    session: Session,
    records: list[Record],
    config: RebalancingConfig | None,
    *,
    subject: str = LOCAL_USER_SUBJECT,
    replace: bool = False,
) -> ImportSummary:
    """Write records and rebalancing settings for one user. The caller commits or rolls back."""
    check_consistency(records)
    user = get_or_create_user(session, subject)
    existing = session.scalar(select(func.count()).select_from(Snapshot).where(Snapshot.user_id == user.id))
    if existing and not replace:
        raise DataImportError(f"the user already has {existing} snapshots; use --replace to delete and re-import")
    delete_user_data(session, user.id)
    owner = user.id

    categories: dict[str, Category] = {}

    def category(name: str) -> Category:
        if name not in categories:
            categories[name] = Category(user_id=owner, name=name, excluded_from_disposable=name == EXCLUDED_CATEGORY)
            session.add(categories[name])
        return categories[name]

    holdings: dict[str, Holding] = {}
    liabilities: dict[str, Liability] = {}

    def add_value(
        snapshot: Snapshot,
        value: float,
        where: str,
        *,
        holding: Holding | None = None,
        liability: Liability | None = None,
    ) -> None:
        session.add(
            SnapshotValue(
                user_id=owner, snapshot=snapshot, holding=holding, liability=liability, amount=exact(value, where)
            )
        )

    values = 0
    for record in sorted(records, key=lambda r: r.date):
        snapshot = Snapshot(user_id=owner, date=record.date)
        session.add(snapshot)
        for liquidity, items in (("liquid", record.assets.liquid), ("non_liquid", record.assets.non_liquid)):
            for item in items:
                holding = holdings.get(item.id)
                if holding is None:
                    holding = Holding(
                        id=uuid.uuid4(),
                        user_id=owner,
                        name=item.name,
                        category=category(item.category),
                        liquidity=liquidity,
                    )
                    holdings[item.id] = holding
                    session.add(holding)
                add_value(snapshot, item.value, f"{record.date} {item.id}", holding=holding)
                values += 1
                if item.mortgage:
                    mortgage = liabilities.get(item.mortgage.id)
                    if mortgage is None:
                        mortgage = Liability(id=uuid.uuid4(), user_id=owner, name=item.mortgage.name, holding=holding)
                        liabilities[item.mortgage.id] = mortgage
                        session.add(mortgage)
                    add_value(snapshot, item.mortgage.value, f"{record.date} {item.mortgage.id}", liability=mortgage)
                    values += 1
        # A liability listed under its mortgage's name is the same debt: the analytics skip it, and so does this.
        for item in standalone_liabilities(record):
            liability = liabilities.get(item.id)
            if liability is None:
                liability = Liability(id=uuid.uuid4(), user_id=owner, name=item.name)
                liabilities[item.id] = liability
                session.add(liability)
            add_value(snapshot, item.value, f"{record.date} {item.id}", liability=liability)
            values += 1

    if config is not None:
        try:
            write_rebalancing(session, owner, config, category, holdings)
        except EntryError as exc:
            raise DataImportError(exc.message) from exc
    session.flush()
    ids = {key: str(item.id) for key, item in [*holdings.items(), *liabilities.items()]}
    return ImportSummary(len(records), len(holdings), len(liabilities), values, config is not None, ids)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m backend.importer", description="Import YAML records into the database."
    )
    _ = parser.add_argument(
        "data_dir", nargs="?", type=Path, default=DATA_DIR, help="directory with records/ (default: %(default)s)"
    )
    _ = parser.add_argument("--replace", action="store_true", help="delete the user's existing data first")
    args = parser.parse_args(argv)

    data_dir = cast(Path, args.data_dir).expanduser()
    replace = cast(bool, args.replace)
    config_path = data_dir / "rebalancing.json"
    try:
        records = load_records(data_dir / "records")
        config = load_config(config_path) if config_path.exists() else None
        # Rides out a database (or container DNS) that is still starting.
        wait_for_database()
        with SessionLocal.begin() as session:
            summary = import_data(session, records, config, replace=replace)
    except (DataImportError, ValueError, RuntimeError) as exc:
        print(f"Import failed, nothing was written: {exc}", file=sys.stderr)
        return 1
    settings = ", with rebalancing settings" if summary.rebalancing else ""
    counts = f"{summary.snapshots} snapshots, {summary.holdings} holdings, {summary.liabilities} liabilities"
    print(f"Imported {counts} and {summary.values} values{settings}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
