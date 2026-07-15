"""mode d'assemblage : PRODUCTIONS.assembly_mode (PNP | MANUEL | MIXTE)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-15

Migration additive : ajoute ``assembly_mode`` (String(10), NOT NULL, défaut ``PNP``)
à PRODUCTIONS — les cartes peuvent être assemblées à la main, pas seulement par la
machine PnP. Idempotente (inspecteur) — SQLite (dev) et SQL Server (prod/staging).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "PRODUCTIONS"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    if "assembly_mode" not in cols:
        op.add_column(
            _TABLE,
            sa.Column(
                "assembly_mode",
                sa.String(length=10),
                nullable=False,
                server_default="PNP",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    with op.batch_alter_table(_TABLE) as batch:
        if "assembly_mode" in cols:
            batch.drop_column("assembly_mode")
