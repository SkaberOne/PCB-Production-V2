"""cycle de vie : COMPONENTS.lifecycle_status + lifecycle_checked_at

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-07

Migration additive (ADR 0014) : ajoute ``lifecycle_status`` (String, défaut
``UNKNOWN``) et ``lifecycle_checked_at`` (DateTime, nullable) à COMPONENTS pour le
statut de cycle de vie normalisé. Idempotente (inspecteur) — SQLite (dev) et SQL
Server (prod/staging, ODBC 17).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "COMPONENTS"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    if "lifecycle_status" not in cols:
        op.add_column(
            _TABLE,
            sa.Column("lifecycle_status", sa.String(length=16), nullable=False, server_default="UNKNOWN"),
        )
    if "lifecycle_checked_at" not in cols:
        op.add_column(_TABLE, sa.Column("lifecycle_checked_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    with op.batch_alter_table(_TABLE) as batch:
        if "lifecycle_checked_at" in cols:
            batch.drop_column("lifecycle_checked_at")
        if "lifecycle_status" in cols:
            batch.drop_column("lifecycle_status")
