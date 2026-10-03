"""Typed schema for the dated balance snapshots stored as YAML records."""
from __future__ import annotations

from datetime import date
from typing import ClassVar

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    """Base model that rejects unknown fields, so typos in YAML records fail loudly."""

    model_config: ClassVar[ConfigDict] = ConfigDict(extra='forbid')


class Mortgage(StrictModel):
    id: str
    name: str
    value: float = 0


class Holding(StrictModel):
    id: str
    name: str = 'Unnamed'
    value: float = 0
    category: str = 'Altres'
    mortgage: Mortgage | None = None


class Liability(StrictModel):
    id: str
    name: str = 'Unnamed liability'
    value: float = 0


class Assets(StrictModel):
    liquid: list[Holding] = []
    non_liquid: list[Holding] = []


class Liabilities(StrictModel):
    non_liquid: list[Liability] = []


class Record(StrictModel):
    date: date
    assets: Assets = Assets()
    liabilities: Liabilities = Liabilities()

    @property
    def holdings(self) -> list[Holding]:
        return [*self.assets.liquid, *self.assets.non_liquid]
