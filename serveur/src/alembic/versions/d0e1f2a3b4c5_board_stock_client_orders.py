"""stock de cartes finies + commandes client/machine (ADR 0017)

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-20

Migration additive : crée BOARD_STOCK, CLIENT_ORDERS et CLIENT_ORDER_LINES
DEPUIS les modèles ORM (source de vérité), avec ``checkfirst=True`` pour rester
idempotente sur SQLite (dev) et SQL Server (prod, ODBC 17). Aucune donnée existante
touchée.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables():
    # Import tardif : garantit l'enregistrement des modèles sur Base.metadata.
    from src.models.board_stock import BoardStock, ClientOrder, ClientOrderLine

    # Ordre de création : parents avant enfants (CLIENT_ORDER_LINES -> CLIENT_ORDERS).
    return [BoardStock.__table__, ClientOrder.__table__, ClientOrderLine.__table__]


def upgrade() -> None:
    bind = op.get_bind()
    for table in _tables():
        table.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for table in reversed(_tables()):
        table.drop(bind=bind, checkfirst=True)
