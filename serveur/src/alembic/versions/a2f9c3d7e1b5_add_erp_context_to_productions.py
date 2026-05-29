"""add erp_context to productions

Revision ID: a2f9c3d7e1b5
Revises: e1a3b7c9d4f2
Create Date: 2026-05-16 08:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a2f9c3d7e1b5"
down_revision = "e1a3b7c9d4f2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "PRODUCTIONS",
        sa.Column("erp_context", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("PRODUCTIONS", "erp_context")
