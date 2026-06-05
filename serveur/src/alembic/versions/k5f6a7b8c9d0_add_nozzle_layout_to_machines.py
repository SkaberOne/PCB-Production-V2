"""add nozzle_layout to PNP_MACHINES (type de nozzle par position, JSON)

Revision ID: k5f6a7b8c9d0
Revises: j4e5f6a7b8c9
Create Date: 2026-06-05
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "k5f6a7b8c9d0"
down_revision: Union[str, None] = "j4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("PNP_MACHINES", sa.Column("nozzle_layout", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("PNP_MACHINES", "nozzle_layout")
