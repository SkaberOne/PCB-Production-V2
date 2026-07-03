"""table COMPONENT_MACHINE_LOADS (stock engage sur feeders - Phase 3)

Revision ID: e5f7b9d1c3a4
Revises: d4e6a8c0f2b3
Create Date: 2026-07-02

Migration additive (ADR 0008 §3 / ADR 0012) : cree la table COMPONENT_MACHINE_LOADS
(quantite d'un composant physiquement chargee sur une machine — annotation libre/engage).
Table creee depuis le modele ORM (source de verite), idempotent (checkfirst).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "e5f7b9d1c3a4"
down_revision: Union[str, None] = "d4e6a8c0f2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table():
    from src.models.stock import ComponentMachineLoad

    return ComponentMachineLoad.__table__


def upgrade() -> None:
    _table().create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    _table().drop(bind=op.get_bind(), checkfirst=True)
