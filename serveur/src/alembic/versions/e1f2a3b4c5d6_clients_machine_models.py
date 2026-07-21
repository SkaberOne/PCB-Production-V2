"""clients + modèles de machine + liens sur CLIENT_ORDERS (ADR 0017 suite)

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-20

Additif : crée CLIENTS, MACHINE_MODELS, MACHINE_MODEL_CARDS (checkfirst) et ajoute
``client_id`` / ``machine_model_id`` / ``machine_count`` (nullable) sur CLIENT_ORDERS.
Idempotente — SQLite (dev) et SQL Server (prod).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ORDERS = "CLIENT_ORDERS"


def _new_tables():
    from src.models.board_stock import Client, MachineModel, MachineModelCard

    return [Client.__table__, MachineModel.__table__, MachineModelCard.__table__]


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_ORDERS)}


def upgrade() -> None:
    bind = op.get_bind()
    for table in _new_tables():
        table.create(bind=bind, checkfirst=True)
    cols = _columns(bind)
    if "client_id" not in cols:
        op.add_column(_ORDERS, sa.Column("client_id", sa.Integer(), nullable=True))
    if "machine_model_id" not in cols:
        op.add_column(_ORDERS, sa.Column("machine_model_id", sa.Integer(), nullable=True))
    if "machine_count" not in cols:
        op.add_column(_ORDERS, sa.Column("machine_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    with op.batch_alter_table(_ORDERS) as batch:
        for name in ("machine_count", "machine_model_id", "client_id"):
            if name in cols:
                batch.drop_column(name)
    for table in reversed(_new_tables()):
        table.drop(bind=bind, checkfirst=True)
