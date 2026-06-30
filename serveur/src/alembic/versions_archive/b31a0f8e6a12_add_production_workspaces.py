"""Add production workspace tables.

Revision ID: b31a0f8e6a12
Revises: 4d1f8d5e2c19
Create Date: 2026-03-24 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b31a0f8e6a12"
down_revision = "4d1f8d5e2c19"
branch_labels = None
depends_on = None


def upgrade() -> None:
    status_enum = sa.Enum("DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED", name="production_status_enum")

    op.create_table(
        "PRODUCTIONS",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("status", status_enum, nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_PRODUCTIONS_id"), "PRODUCTIONS", ["id"], unique=False)
    op.create_index(op.f("ix_PRODUCTIONS_name"), "PRODUCTIONS", ["name"], unique=True)

    op.create_table(
        "PRODUCTION_BOM_REVISIONS",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("production_id", sa.Integer(), nullable=False),
        sa.Column("bom_revision_id", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["bom_revision_id"], ["BOM_REVISIONS.id"]),
        sa.ForeignKeyConstraint(["production_id"], ["PRODUCTIONS.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("production_id", "bom_revision_id", name="uq_production_bom_revision"),
    )
    op.create_index(op.f("ix_PRODUCTION_BOM_REVISIONS_id"), "PRODUCTION_BOM_REVISIONS", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_PRODUCTION_BOM_REVISIONS_id"), table_name="PRODUCTION_BOM_REVISIONS")
    op.drop_table("PRODUCTION_BOM_REVISIONS")
    op.drop_index(op.f("ix_PRODUCTIONS_name"), table_name="PRODUCTIONS")
    op.drop_index(op.f("ix_PRODUCTIONS_id"), table_name="PRODUCTIONS")
    op.drop_table("PRODUCTIONS")
