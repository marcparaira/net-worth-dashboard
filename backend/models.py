"""Typed schema for the dated balance snapshots stored as YAML records."""
from __future__ import annotations

from datetime import date
from typing import ClassVar

from pydantic import BaseModel, ConfigDict


class Mortgage(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra='forbid')
    id: str
    name: str
    value: float = 0


class Holding(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra='forbid')
    id: str
    name: str = 'Unnamed'
    value: float = 0
    category: str = 'Altres'
    mortgage: Mortgage | None = None


class Liability(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra='forbid')
    id: str
    name: str = 'Unnamed liability'
    value: float = 0


class Assets(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra='forbid')
    liquid: list[Holding] = []
    non_liquid: list[Holding] = []


class Liabilities(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra='forbid')
    non_liquid: list[Liability] = []


class Record(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra='forbid')
    date: date
    assets: Assets = Assets()
    liabilities: Liabilities = Liabilities()

    @property
    def holdings(self) -> list[Holding]:
        return [*self.assets.liquid, *self.assets.non_liquid]
