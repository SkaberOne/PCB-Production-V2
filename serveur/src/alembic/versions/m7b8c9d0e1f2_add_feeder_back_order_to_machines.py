"""add feeder_back_order to PNP_MACHINES (numérotation rail arrière export)

Revision ID: m7b8c9d0e1f2
Revises: l6a7b8c9d0e1
Create Date: 2026-06-08
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "m7b8c9d0e1f2"
down_revision: Union[str, None] = "l6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "PNP_MACHINES",
        sa.Column("feeder_back_order", sa.String(length=4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("PNP_MACHINES", "feeder_back_order")
