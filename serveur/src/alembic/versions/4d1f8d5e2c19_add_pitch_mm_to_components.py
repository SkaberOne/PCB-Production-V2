"""Add pitch_mm to component library.

Revision ID: 4d1f8d5e2c19
Revises: 9c1f4a0c8f2b
Create Date: 2026-03-22 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4d1f8d5e2c19"
down_revision = "9c1f4a0c8f2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("COMPONENTS", sa.Column("pitch_mm", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("COMPONENTS", "pitch_mm")
