"""Drop the holdings and liabilities `ref` column: records are identified by their database id.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-25 14:28:07.475859
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("uq_holdings_user_id_ref"), "holdings", type_="unique")
    op.drop_column("holdings", "ref")
    op.drop_constraint(op.f("uq_liabilities_user_id_ref"), "liabilities", type_="unique")
    op.drop_column("liabilities", "ref")


def downgrade() -> None:
    # The original YAML identifiers are gone; each row gets its id, as rows created in the app had.
    for table in ("holdings", "liabilities"):
        op.add_column(table, sa.Column("ref", sa.String(length=100), nullable=True))
        op.execute(f"UPDATE {table} SET ref = id::text")
        op.alter_column(table, "ref", nullable=False)
        op.create_unique_constraint(op.f(f"uq_{table}_user_id_ref"), table, ["user_id", "ref"])
