"""inventaire physique interne des composants (4e notion de stock)

Revision ID: c3d5f7a9b1e2
Revises: b2c4e6f8a0d1
Create Date: 2026-07-01

Migration additive (ADR 0008 §3 / ADR 0010) : cree les tables de l'inventaire
physique interne des composants sans toucher a l'existant :

  * COMPONENT_STOCK   : solde cache + detail reel/bag/tube + safety_stock + loss_pct
  * STOCK_MOVEMENTS   : journal append-only signe (+ index unique filtre actif)
  * STOCK_SETTINGS    : reglage global (coefficient de perte)

On cree les tables DEPUIS les modeles ORM (source de verite, coherent avec le
bootstrap create_all d'ADR 0008), avec ``checkfirst=True`` pour rester idempotent.
L'index unique FILTRE ``(source_type, source_id) WHERE is_reversed = 0`` est porte
par ``StockMovement.__table_args__`` avec des clauses ``sqlite_where`` / ``mssql_where``
=> genere correctement sur SQLite (dev) ET SQL Server (prod, ODBC 17).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c3d5f7a9b1e2"
down_revision: Union[str, None] = "b2c4e6f8a0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables():
    # Import tardif : garantit que les modeles sont enregistres sur Base.metadata.
    from src.models.stock import ComponentStock, StockMovement, StockSettings

    return ComponentStock.__table__, StockMovement.__table__, StockSettings.__table__


def upgrade() -> None:
    bind = op.get_bind()
    component_stock, stock_movements, stock_settings = _tables()
    # Ordre : STOCK_MOVEMENTS a une self-FK (reverses_id) -> creation simple OK.
    component_stock.create(bind=bind, checkfirst=True)
    stock_movements.create(bind=bind, checkfirst=True)
    stock_settings.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    component_stock, stock_movements, stock_settings = _tables()
    stock_settings.drop(bind=bind, checkfirst=True)
    stock_movements.drop(bind=bind, checkfirst=True)
    component_stock.drop(bind=bind, checkfirst=True)
