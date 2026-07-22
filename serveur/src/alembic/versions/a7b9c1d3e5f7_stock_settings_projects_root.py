"""ajout STOCK_SETTINGS.projects_root_path (racine projets import catalogue - 011)

Revision ID: a7b9c1d3e5f7
Revises: c5d6e7f8a9b0
Create Date: 2026-07-22

Migration additive (ADR 0008 §3) : ajoute la colonne ``projects_root_path`` à
``STOCK_SETTINGS`` (chemin racine des projets de conception, réglage éditable pour
l'import catalogue — jamais codé en dur). Idempotent (checkfirst via inspect),
pas d'``index=True`` (roundtrip alembic SQLite).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b9c1d3e5f7"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "STOCK_SETTINGS"
COLUMN = "projects_root_path"


def _columns(bind):
    return [c["name"] for c in sa.inspect(bind).get_columns(TABLE)]


def upgrade() -> None:
    bind = op.get_bind()
    if COLUMN not in _columns(bind):
        op.add_column(TABLE, sa.Column(COLUMN, sa.String(length=500), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if COLUMN in _columns(bind):
        op.drop_column(TABLE, COLUMN)
