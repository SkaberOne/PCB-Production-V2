"""complétion manuelle des lignes de commande (COMMAND_LINE_DETAILS)

Revision ID: f6a8c0e2d4b5
Revises: e5f7b9d1c3a4
Create Date: 2026-07-06

Migration additive (ADR 0008 §3) : crée la table COMMAND_LINE_DETAILS qui porte la
complétion manuelle d'une ligne de commande depuis le popup de la page Commande
(override quantité à commander, note libre, offre fournisseur manuelle, MPN manuel
de repli). Table créée DEPUIS le modèle ORM (source de vérité, cohérent avec le
bootstrap create_all d'ADR 0008), avec ``checkfirst=True`` pour rester idempotent
sur SQLite (dev) et SQL Server (prod, ODBC 17).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "f6a8c0e2d4b5"
down_revision: Union[str, None] = "e5f7b9d1c3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table():
    # Import tardif : garantit que le modèle est enregistré sur Base.metadata.
    from src.models.commands import CommandLineDetail

    return CommandLineDetail.__table__


def upgrade() -> None:
    _table().create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    _table().drop(bind=op.get_bind(), checkfirst=True)
