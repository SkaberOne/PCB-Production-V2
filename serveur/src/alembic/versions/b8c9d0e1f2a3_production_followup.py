"""suivi productions terminees : compteurs cartes + note (PRODUCTIONS)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-16

Migration additive : ajoute le suivi manuel des cartes après production sur
``PRODUCTIONS`` — ``cards_tested`` / ``cards_validated`` / ``cards_to_debug``
(Integer, NOT NULL défaut 0) et ``followup_note`` (Text, nullable). Saisi à la
main sur le dashboard. Idempotente — SQLite (dev) et SQL Server.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "PRODUCTIONS"


def _columns(bind) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(_TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    for name in ("cards_tested", "cards_validated", "cards_to_debug"):
        if name not in cols:
            op.add_column(
                _TABLE,
                sa.Column(name, sa.Integer(), nullable=False, server_default="0"),
            )
    if "followup_note" not in cols:
        op.add_column(
            _TABLE,
            sa.Column("followup_note", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    cols = _columns(bind)
    with op.batch_alter_table(_TABLE) as batch:
        for name in ("followup_note", "cards_to_debug", "cards_validated", "cards_tested"):
            if name in cols:
                batch.drop_column(name)
