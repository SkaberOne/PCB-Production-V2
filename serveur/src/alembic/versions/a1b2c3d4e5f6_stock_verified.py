"""vérification physique du stock (COMPONENT_STOCK.verified_at / verified_qty)

Revision ID: a1b2c3d4e5f6
Revises: f6a8c0e2d4b5
Create Date: 2026-07-07

Migration additive (ADR 0013, phase 1 — version A) : ajoute deux colonnes nullables
à COMPONENT_STOCK pour marquer qu'une quantité stock a été vérifiée physiquement en
Revue BOM, sans toucher au solde. Idempotente (inspecteur) pour rester sûre sur
SQLite (dev) et SQL Server (prod/staging, ODBC 17).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f6a8c0e2d4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "COMPONENT_STOCK"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    existing = _columns(bind)
    if "verified_at" not in existing:
        op.add_column(_TABLE, sa.Column("verified_at", sa.DateTime(), nullable=True))
    if "verified_qty" not in existing:
        op.add_column(_TABLE, sa.Column("verified_qty", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    existing = _columns(bind)
    with op.batch_alter_table(_TABLE) as batch:
        if "verified_qty" in existing:
            batch.drop_column("verified_qty")
        if "verified_at" in existing:
            batch.drop_column("verified_at")
