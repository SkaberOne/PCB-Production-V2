"""Extend component library fields for Excel round-trip support.

Revision ID: 9c1f4a0c8f2b
Revises: 7a6f2c0f1e90
Create Date: 2026-03-18 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9c1f4a0c8f2b"
down_revision = "7a6f2c0f1e90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("COMPONENTS", sa.Column("mpn", sa.String(length=200), nullable=True))
    op.add_column("COMPONENTS", sa.Column("footprint_eagle", sa.String(length=100), nullable=True))
    op.add_column("COMPONENTS", sa.Column("footprint_pnp", sa.String(length=100), nullable=True))
    op.add_column("COMPONENTS", sa.Column("feeder_type", sa.String(length=50), nullable=True))
    op.create_index(op.f("ix_COMPONENTS_mpn"), "COMPONENTS", ["mpn"], unique=False)
    op.create_index(op.f("ix_COMPONENTS_footprint_eagle"), "COMPONENTS", ["footprint_eagle"], unique=False)
    op.create_index(op.f("ix_COMPONENTS_footprint_pnp"), "COMPONENTS", ["footprint_pnp"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_COMPONENTS_footprint_pnp"), table_name="COMPONENTS")
    op.drop_index(op.f("ix_COMPONENTS_footprint_eagle"), table_name="COMPONENTS")
    op.drop_index(op.f("ix_COMPONENTS_mpn"), table_name="COMPONENTS")
    op.drop_column("COMPONENTS", "feeder_type")
    op.drop_column("COMPONENTS", "footprint_pnp")
    op.drop_column("COMPONENTS", "footprint_eagle")
    op.drop_column("COMPONENTS", "mpn")
