"""concurrence optimiste : PRODUCTIONS.version

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-07

Migration additive (ADR 0013, extension B) : ajoute une colonne ``version``
(entier, défaut 1) à PRODUCTIONS pour la concurrence optimiste opt-in.
``server_default='1'`` remplit les lignes existantes. Idempotente (inspecteur) —
SQLite (dev) et SQL Server (prod/staging, ODBC 17).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "PRODUCTIONS"


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
