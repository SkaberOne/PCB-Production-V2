"""add export config to PNP_MACHINES (format/colonnes/séparateur export PnP)

Revision ID: l6a7b8c9d0e1
Revises: k5f6a7b8c9d0
Create Date: 2026-06-08
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "l6a7b8c9d0e1"
down_revision: Union[str, None] = "k5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("PNP_MACHINES", sa.Column("export_format", sa.String(length=10), nullable=True))
    op.add_column("PNP_MACHINES", sa.Column("export_columns", sa.Text(), nullable=True))
    op.add_column("PNP_MACHINES", sa.Column("export_separator", sa.String(length=4), nullable=True))


def downgrade() -> None:
    op.drop_column("PNP_MACHINES", "export_separator")
    op.drop_column("PNP_MACHINES", "export_columns")
    op.drop_column("PNP_MACHINES", "export_format")
