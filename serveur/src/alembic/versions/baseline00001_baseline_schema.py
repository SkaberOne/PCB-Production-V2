"""Baseline schema (collapse de la chaine historique)

Revision ID: baseline00001
Revises:
Create Date: 2026-06-15

Remplace la chaine historique (archivee dans ../versions_archive/) qui etait
desynchronisee des modeles ORM : la table PNP_MACHINES n'y etait jamais creee,
donc `alembic upgrade head` echouait (ALTER TABLE PNP_MACHINES ... -> no such table).

Cette baseline construit le schema courant COMPLET depuis les modeles ORM
(coherent avec le bootstrap create_all d'ADR 0008). Les evolutions futures se font
par des migrations additives normales branchees sur cette revision.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "baseline00001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schema complet depuis les modeles (source de verite). Les modeles sont
    # deja importes par env.py (bom, machines, commands) -> Base.metadata complet.
    from src.database import Base
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    from src.database import Base
    Base.metadata.drop_all(bind=op.get_bind())
