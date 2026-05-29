"""add BOM categories catalog

Revision ID: f6c3b12a9d44
Revises: d8f2b91d3c4e
Create Date: 2026-03-25 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f6c3b12a9d44"
down_revision = "d8f2b91d3c4e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "BOM_CATEGORIES",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_BOM_CATEGORIES_id"), "BOM_CATEGORIES", ["id"], unique=False)
    op.create_index(op.f("ix_BOM_CATEGORIES_name"), "BOM_CATEGORIES", ["name"], unique=True)


def downgrade():
    op.drop_index(op.f("ix_BOM_CATEGORIES_name"), table_name="BOM_CATEGORIES")
    op.drop_index(op.f("ix_BOM_CATEGORIES_id"), table_name="BOM_CATEGORIES")
    op.drop_table("BOM_CATEGORIES")
