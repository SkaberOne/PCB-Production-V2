"""Add BOM item review fields and footprint mapping index

Revision ID: 7a6f2c0f1e90
Revises: 2e81347cc7b0
Create Date: 2026-03-18 13:20:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a6f2c0f1e90"
down_revision: Union[str, None] = "2e81347cc7b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("BOM_ITEMS", sa.Column("x", sa.Float(), nullable=True))
    op.add_column("BOM_ITEMS", sa.Column("y", sa.Float(), nullable=True))
    op.add_column("BOM_ITEMS", sa.Column("rotation", sa.Integer(), nullable=True))
    op.add_column("BOM_ITEMS", sa.Column("placement_side", sa.String(length=10), nullable=True))
    op.add_column("BOM_ITEMS", sa.Column("component_type", sa.String(length=20), nullable=True))
    op.create_index(
        "ix_FOOTPRINT_MAPPING_footprint_eagle",
        "FOOTPRINT_MAPPING",
        ["footprint_eagle"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_FOOTPRINT_MAPPING_footprint_eagle", table_name="FOOTPRINT_MAPPING")
    op.drop_column("BOM_ITEMS", "component_type")
    op.drop_column("BOM_ITEMS", "placement_side")
    op.drop_column("BOM_ITEMS", "rotation")
    op.drop_column("BOM_ITEMS", "y")
    op.drop_column("BOM_ITEMS", "x")
