"""add SUPPLIER_OFFERS table (cache prix/dispo fournisseurs)

Revision ID: g1b2c3d4e5f6
Revises: f2a8c1d4e6b0
Create Date: 2026-06-03

See ADR 0004 — Connecteurs API fournisseurs + cache d'offres.
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "g1b2c3d4e5f6"
down_revision: Union[str, None] = "f2a8c1d4e6b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "SUPPLIER_OFFERS",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("component_id", sa.Integer(), nullable=False),
        sa.Column("supplier", sa.String(length=20), nullable=False),
        sa.Column("supplier_part", sa.String(length=120), nullable=True),
        sa.Column("mpn", sa.String(length=200), nullable=True),
        sa.Column("manufacturer", sa.String(length=120), nullable=True),
        sa.Column("product_url", sa.Text(), nullable=True),
        sa.Column("datasheet_url", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=True),
        sa.Column("unit_price", sa.Float(), nullable=True),
        sa.Column("stock_qty", sa.Integer(), nullable=True),
        sa.Column("lead_time_days", sa.Integer(), nullable=True),
        sa.Column("price_breaks", sa.Text(), nullable=True),
        sa.Column("raw_payload", sa.Text(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["component_id"], ["COMPONENTS.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_SUPPLIER_OFFERS_component_id", "SUPPLIER_OFFERS", ["component_id"])
    op.create_index("ix_SUPPLIER_OFFERS_supplier", "SUPPLIER_OFFERS", ["supplier"])
    op.create_index("ix_SUPPLIER_OFFERS_fetched_at", "SUPPLIER_OFFERS", ["fetched_at"])
    op.create_index(
        "ix_SUPPLIER_OFFERS_component_supplier",
        "SUPPLIER_OFFERS",
        ["component_id", "supplier"],
    )


def downgrade() -> None:
    op.drop_index("ix_SUPPLIER_OFFERS_component_supplier", table_name="SUPPLIER_OFFERS")
    op.drop_index("ix_SUPPLIER_OFFERS_fetched_at", table_name="SUPPLIER_OFFERS")
    op.drop_index("ix_SUPPLIER_OFFERS_supplier", table_name="SUPPLIER_OFFERS")
    op.drop_index("ix_SUPPLIER_OFFERS_component_id", table_name="SUPPLIER_OFFERS")
    op.drop_table("SUPPLIER_OFFERS")
