"""identite de poste : PRODUCTION_RUNS.created_by (ADR 0015)

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-15

Migration additive : ajoute ``created_by`` (String(60), nullable) aux lots de
production (``PRODUCTION_RUNS``) — poste/opérateur qui a déclaré le lot (header
``X-Workstation``). Pas de backfill. Idempotente — SQLite (dev) et SQL Server.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "PRODUCTION_RUNS"


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
