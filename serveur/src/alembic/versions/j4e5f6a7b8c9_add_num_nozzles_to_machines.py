"""add num_nozzles to PNP_MACHINES (nb de nozzles sur la tête)

Revision ID: j4e5f6a7b8c9
Revises: i3d4e5f6a7b8
Create Date: 2026-06-05
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "j4e5f6a7b8c9"
down_revision: Union[str, None] = "i3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("PNP_MACHINES", sa.Column("num_nozzles", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("PNP_MACHINES", "num_nozzles")
