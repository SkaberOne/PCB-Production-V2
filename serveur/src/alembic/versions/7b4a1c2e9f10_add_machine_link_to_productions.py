"""add machine link to productions

Revision ID: 7b4a1c2e9f10
Revises: f6c3b12a9d44
Create Date: 2026-03-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "7b4a1c2e9f10"
down_revision = "f6c3b12a9d44"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("PRODUCTIONS", sa.Column("machine_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_PRODUCTIONS_machine_id"), "PRODUCTIONS", ["machine_id"], unique=False)
    op.create_foreign_key(
        "fk_PRODUCTIONS_machine_id_PNP_MACHINES",
        "PRODUCTIONS",
        "PNP_MACHINES",
        ["machine_id"],
        ["id"],
    )


def downgrade():
    op.drop_constraint("fk_PRODUCTIONS_machine_id_PNP_MACHINES", "PRODUCTIONS", type_="foreignkey")
    op.drop_index(op.f("ix_PRODUCTIONS_machine_id"), table_name="PRODUCTIONS")
    op.drop_column("PRODUCTIONS", "machine_id")
