"""table PRODUCTION_COMPONENT_PROGRESS (suivi préparé/installé par composant - 007)

Revision ID: b8d0f2a4c6e8
Revises: c5d6e7f8a9b0
Create Date: 2026-07-22

Migration additive (ADR 0008 §3) : crée la table PRODUCTION_COMPONENT_PROGRESS
(avancement de préparation physique d'un composant pour une production —
annotation d'état, sans impact sur le solde de stock). Table créée depuis le
modèle ORM (source de vérité), idempotent (checkfirst).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "b8d0f2a4c6e8"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table():
    from src.models.production import ProductionComponentProgress

    return ProductionComponentProgress.__table__


def upgrade() -> None:
    _table().create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    _table().drop(bind=op.get_bind(), checkfirst=True)
