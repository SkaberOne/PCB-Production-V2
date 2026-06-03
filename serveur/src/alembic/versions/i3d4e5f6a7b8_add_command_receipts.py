"""add COMMAND_RECEIPTS table (qté reçue par ligne de commande)

Revision ID: i3d4e5f6a7b8
Revises: h2c3d4e5f6a7
Create Date: 2026-06-03
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "i3d4e5f6a7b8"
down_revision: Union[str, None] = "h2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "COMMAND_RECEIPTS",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("command_id", sa.Integer(), nullable=False),
        sa.Column("line_key", sa.String(length=300), nullable=False),
        sa.Column("qty_received", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["command_id"], ["COMMANDS.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_COMMAND_RECEIPTS_command_id", "COMMAND_RECEIPTS", ["command_id"])
    op.create_index(
        "ix_COMMAND_RECEIPTS_cmd_line", "COMMAND_RECEIPTS", ["command_id", "line_key"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_COMMAND_RECEIPTS_cmd_line", table_name="COMMAND_RECEIPTS")
    op.drop_index("ix_COMMAND_RECEIPTS_command_id", table_name="COMMAND_RECEIPTS")
    op.drop_table("COMMAND_RECEIPTS")
