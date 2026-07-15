"""identite de poste : STOCK_MOVEMENTS.created_by (ADR 0015)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-15

Migration additive (ADR 0015) : ajoute ``created_by`` (String(60), nullable) au
journal ``STOCK_MOVEMENTS`` — nom du poste/opérateur transmis par le header
``X-Workstation``. Pas de backfill (l'historique reste ``NULL``). Idempotente
(inspecteur) — SQLite (dev) et SQL Server (prod/staging, ODBC 17).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "STOCK_MOVEMENTS"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    if "created_by" not in cols:
        op.add_column(
            _TABLE,
            sa.Column("created_by", sa.String(length=60), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    with op.batch_alter_table(_TABLE) as batch:
        if "created_by" in cols:
            batch.drop_column("created_by")
