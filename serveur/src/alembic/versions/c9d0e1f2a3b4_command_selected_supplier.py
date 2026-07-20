"""fournisseur retenu par ligne de commande (COMMAND_LINE_DETAILS.selected_supplier)

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-20

Migration additive : ajoute ``selected_supplier`` (String(20), nullable) sur
``COMMAND_LINE_DETAILS``. Stocke le CODE fournisseur choisi par composant sur la
page Commande (prix recalculé « live » depuis SUPPLIER_OFFERS, contrairement à
l'offre manuelle figée). Idempotente — SQLite (dev) et SQL Server (prod).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "COMMAND_LINE_DETAILS"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if "selected_supplier" not in _columns(bind):
        op.add_column(
            _TABLE,
            sa.Column("selected_supplier", sa.String(length=20), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "selected_supplier" in _columns(bind):
        with op.batch_alter_table(_TABLE) as batch:
            batch.drop_column("selected_supplier")
