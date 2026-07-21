"""révisions de carte dans stock cartes + commandes + modèles machine (ADR 0017)

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-07-20

Additif : ajoute ``revision`` à BOARD_STOCK (clé unique (bom_reference_id, revision)),
CLIENT_ORDER_LINES et MACHINE_MODEL_CARDS.

BOARD_STOCK : sur un schéma pré-révision (staging), l'ancienne unicité était sur
``bom_reference_id`` seul ; on recrée la table depuis le modèle (données de stock
cartes jetables, feature non encore en prod). Sur une base fraîche (prod), la table
est déjà créée AVEC ``revision`` par la migration d0e1f2a3b4c5 (modèle source de
vérité) ⇒ on ne touche à rien. Idempotente — SQLite (dev) et SQL Server (prod).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def _add_revision(bind, table) -> None:
    if "revision" not in _cols(bind, table):
        op.add_column(table, sa.Column("revision", sa.String(length=20), nullable=True))


def upgrade() -> None:
    bind = op.get_bind()
    from src.models.board_stock import BoardStock

    # BOARD_STOCK : recréer si l'ancien schéma (sans 'revision') est en place.
    if "revision" not in _cols(bind, "BOARD_STOCK"):
        BoardStock.__table__.drop(bind=bind, checkfirst=True)
        BoardStock.__table__.create(bind=bind, checkfirst=True)

    _add_revision(bind, "CLIENT_ORDER_LINES")
    _add_revision(bind, "MACHINE_MODEL_CARDS")


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("CLIENT_ORDER_LINES", "MACHINE_MODEL_CARDS"):
        if "revision" in _cols(bind, table):
            with op.batch_alter_table(table) as batch:
                batch.drop_column("revision")
    # BOARD_STOCK : on laisse la colonne revision (recréation non réversible sans perte).
