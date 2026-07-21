"""référence du bon de commande source sur CLIENT_ORDERS (import PDF, ADR 0018)

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-07-21

Additif : ajoute ``external_reference`` (réf. du bon PDF, ex. « CO2601-10180 »)
à CLIENT_ORDERS. Idempotente — SQLite (dev/tests) et SQL Server (prod).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if "external_reference" not in _cols(bind, "CLIENT_ORDERS"):
        op.add_column("CLIENT_ORDERS", sa.Column("external_reference", sa.String(length=60), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if "external_reference" in _cols(bind, "CLIENT_ORDERS"):
        with op.batch_alter_table("CLIENT_ORDERS") as batch:
            batch.drop_column("external_reference")
