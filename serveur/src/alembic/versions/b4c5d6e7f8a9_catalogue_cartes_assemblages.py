"""catalogue Cartes : name/part_number/card_type sur BOM_REFERENCES + ASSEMBLY_ITEMS (ADR 0018)

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-07-21

Additif : enrichit BOM_REFERENCES (name, part_number, card_type) et crée la table
ASSEMBLY_ITEMS (enfants d'un assemblage : sous-carte OU composant vrac).
Idempotente — SQLite (dev/tests) et SQL Server (prod).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    existing = _cols(bind, "BOM_REFERENCES")
    if "name" not in existing:
        op.add_column("BOM_REFERENCES", sa.Column("name", sa.String(length=200), nullable=True))
    if "part_number" not in existing:
        op.add_column("BOM_REFERENCES", sa.Column("part_number", sa.String(length=100), nullable=True))
    if "card_type" not in existing:
        op.add_column(
            "BOM_REFERENCES",
            sa.Column("card_type", sa.String(length=20), nullable=False, server_default="SIMPLE"),
        )

    from src.models.bom import AssemblyItem
    AssemblyItem.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    if "ASSEMBLY_ITEMS" in sa.inspect(bind).get_table_names():
        op.drop_table("ASSEMBLY_ITEMS")
    existing = _cols(bind, "BOM_REFERENCES")
    for col in ("card_type", "part_number", "name"):
        if col in existing:
            with op.batch_alter_table("BOM_REFERENCES") as batch:
                batch.drop_column(col)
