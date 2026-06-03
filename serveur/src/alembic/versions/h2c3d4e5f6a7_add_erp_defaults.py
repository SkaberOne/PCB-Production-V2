"""add ERP_DEFAULTS table (valeurs par défaut export ERP, éditables)

Revision ID: h2c3d4e5f6a7
Revises: g1b2c3d4e5f6
Create Date: 2026-06-03

See ADR 0004 / audit 2026-06-03 §6.2.
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "h2c3d4e5f6a7"
down_revision: Union[str, None] = "g1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ERP_DEFAULTS",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project", sa.String(length=250), nullable=True),
        sa.Column("unit", sa.String(length=50), nullable=True),
        sa.Column("requester", sa.String(length=150), nullable=True),
        sa.Column("validator", sa.String(length=150), nullable=True),
        sa.Column("delay", sa.String(length=100), nullable=True),
        sa.Column("remark", sa.String(length=500), nullable=True),
        sa.Column("default_supplier", sa.String(length=50), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ERP_DEFAULTS")
