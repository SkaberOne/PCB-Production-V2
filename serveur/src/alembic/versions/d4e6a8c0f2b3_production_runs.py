"""table PRODUCTION_RUNS (cloture de production - Phase 2)

Revision ID: d4e6a8c0f2b3
Revises: c3d5f7a9b1e2
Create Date: 2026-07-02

Migration additive (ADR 0008 §3 / ADR 0011) : cree la table PRODUCTION_RUNS
(lots de production ayant consomme du stock). Aucune FK ajoutee sur la colonne
existante STOCK_MOVEMENTS.production_run_id (lien applicatif, SQLite-friendly).

Table creee depuis le modele ORM (source de verite), idempotent (checkfirst).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d4e6a8c0f2b3"
down_revision: Union[str, None] = "c3d5f7a9b1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table():
    from src.models.production import ProductionRun

    return ProductionRun.__table__


def upgrade() -> None:
    _table().create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    _table().drop(bind=op.get_bind(), checkfirst=True)
