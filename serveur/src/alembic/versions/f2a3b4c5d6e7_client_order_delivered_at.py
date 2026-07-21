"""date de livraison sur les commandes client (CLIENT_ORDERS.delivered_at)

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-20

Additif : ajoute ``delivered_at`` (DateTime nullable) sur CLIENT_ORDERS, renseigné
au passage au statut DELIVERED. Idempotente — SQLite (dev) et SQL Server (prod).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "CLIENT_ORDERS"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if "delivered_at" not in _columns(bind):
        op.add_column(_TABLE, sa.Column("delivered_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if "delivered_at" in _columns(bind):
        with op.batch_alter_table(_TABLE) as batch:
            batch.drop_column("delivered_at")
