"""add production order fields

Revision ID: c4f7d9e21a8b
Revises: 7b4a1c2e9f10
Create Date: 2026-03-26 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c4f7d9e21a8b"
down_revision = "7b4a1c2e9f10"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("PRODUCTIONS", sa.Column("manufacturing_order_validated_at", sa.DateTime(), nullable=True))
    op.add_column("PRODUCTION_BOM_REVISIONS", sa.Column("sequence_order", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("PRODUCTION_BOM_REVISIONS", "sequence_order")
    op.drop_column("PRODUCTIONS", "manufacturing_order_validated_at")
