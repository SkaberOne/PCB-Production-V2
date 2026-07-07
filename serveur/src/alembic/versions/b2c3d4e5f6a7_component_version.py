"""concurrence optimiste : COMPONENTS.version

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-07

Migration additive (ADR 0013, phase 2) : ajoute une colonne ``version`` (entier,
défaut 1) à COMPONENTS pour la concurrence optimiste. ``server_default='1'``
remplit les lignes existantes. Idempotente (inspecteur) — SQLite (dev) et SQL
Server (prod/staging, ODBC 17).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "COMPONENTS"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if "version" not in _columns(bind):
        op.add_column(
            _TABLE,
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "version" in _columns(bind):
        with op.batch_alter_table(_TABLE) as batch:
            batch.drop_column("version")
