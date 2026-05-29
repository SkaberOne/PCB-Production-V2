"""add quantity to production bom revisions

Revision ID: e1a3b7c9d4f2
Revises: c4f7d9e21a8b
Create Date: 2026-03-26 04:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e1a3b7c9d4f2"
down_revision = "c4f7d9e21a8b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "PRODUCTION_BOM_REVISIONS",
        sa.Column("quantity_to_produce", sa.Integer(), nullable=True),
    )
    op.execute("UPDATE PRODUCTION_BOM_REVISIONS SET quantity_to_produce = 1 WHERE quantity_to_produce IS NULL")


def downgrade():
    op.drop_column("PRODUCTION_BOM_REVISIONS", "quantity_to_produce")
