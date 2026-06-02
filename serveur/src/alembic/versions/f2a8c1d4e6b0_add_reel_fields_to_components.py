"""Add reel fields (qty/diameters) to component library.

Revision ID: f2a8c1d4e6b0
Revises: a2f9c3d7e1b5
Create Date: 2026-06-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f2a8c1d4e6b0"
down_revision = "a2f9c3d7e1b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("COMPONENTS", sa.Column("qty_per_reel", sa.Integer(), nullable=True))
    op.add_column("COMPONENTS", sa.Column("reel_outer_diameter_mm", sa.Float(), nullable=True))
    op.add_column("COMPONENTS", sa.Column("reel_hub_diameter_mm", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("COMPONENTS", "reel_hub_diameter_mm")
    op.drop_column("COMPONENTS", "reel_outer_diameter_mm")
    op.drop_column("COMPONENTS", "qty_per_reel")
