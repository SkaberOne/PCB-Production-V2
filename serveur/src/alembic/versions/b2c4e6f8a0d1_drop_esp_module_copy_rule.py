"""drop residual ESP-MODULE_COPY component type rule (T-008)

Revision ID: b2c4e6f8a0d1
Revises: baseline00001
Create Date: 2026-06-19

T-008 : nettoie la règle de type résiduelle « ESP-MODULE_COPY », un doublon
accidentel d'« ESP-MODULE » (même type MODULE, même priorité) présent uniquement
dans certaines bases de prod. Migration idempotente : ne fait rien si la règle est
absente. Pas de downgrade (on ne recrée pas un doublon de référentiel).
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "b2c4e6f8a0d1"
down_revision: Union[str, None] = "baseline00001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.get_bind().execute(
        text(
            "DELETE FROM COMPONENT_TYPE_RULES "
            "WHERE reference_prefix = :prefix"
        ),
        {"prefix": "ESP-MODULE_COPY"},
    )


def downgrade() -> None:
    # Pas de rollback : la règle supprimée est un doublon parasite.
    pass
