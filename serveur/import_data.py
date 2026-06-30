#!/usr/bin/env python
"""Reprise des données — copie une base SQLite source vers la base cible (Phase E).

Usage (depuis serveur/, venv activé), la cible étant celle du .env (SQL Server) :

    ..\\.venv\\Scripts\\python.exe import_data.py CHEMIN\\vers\\ancienne\\dev.db

Contexte : lors de la bascule vers SQL Server central (ADR 0008), le schéma cible
est créé au 1er démarrage du backend (create_all + stamp head). Ce script copie
ENSUITE les données existantes (BOM, composants, machines, productions…) depuis
l'ancienne base SQLite (cf. CHANGELOG 2026-05-29) vers la cible.

Sécurités :
- refuse si la cible est elle-même du SQLite (évite une copie sur soi) ;
- copie table par table dans l'ordre des dépendances (FK-safe) ;
- refuse si une table cible contient déjà des données (sauf --force).
"""

import argparse
import os
import sys
from pathlib import Path

SERVEUR_DIR = Path(__file__).resolve().parent
if str(SERVEUR_DIR) not in sys.path:
    sys.path.insert(0, str(SERVEUR_DIR))
os.chdir(SERVEUR_DIR)

from sqlalchemy import create_engine, insert, inspect, select, text

from src.config import settings
from src.database import Base
from src import models  # noqa: F401  (enregistre toutes les tables sur Base.metadata)


def main() -> None:
    parser = argparse.ArgumentParser(description="Copie les données SQLite → base cible (.env).")
    parser.add_argument("source", help="Chemin de la base SQLite source (ancienne dev.db).")
    parser.add_argument("--force", action="store_true", help="Écrase même si la cible a des données.")
    args = parser.parse_args()

    source_path = Path(args.source).resolve()
    if not source_path.exists():
        sys.exit(f"[ERREUR] Source introuvable : {source_path}")

    target_url = settings.database_url
    if target_url.startswith("sqlite"):
        sys.exit(
            "[ERREUR] La cible (.env) est SQLite. Configurez SQL_SERVER_* / DATABASE_URL "
            "vers SQL Server avant la reprise."
        )

    source_engine = create_engine(f"sqlite:///{source_path.as_posix()}")
    target_engine = create_engine(target_url, pool_pre_ping=True)

    print(f"Source : {source_path}")
    print(f"Cible  : {target_url.split('@')[-1]}")
    print("=" * 60)

    source_tables = set(inspect(source_engine).get_table_names())

    total = 0
    with source_engine.connect() as src, target_engine.begin() as dst:
        # SQL Server applique les FK (contrairement à SQLite source qui peut
        # contenir des orphelins). On désactive les contraintes le temps de la
        # copie, puis on les réactive sans revalider l'existant.
        for table in Base.metadata.sorted_tables:
            dst.execute(text(f"ALTER TABLE [{table.name}] NOCHECK CONSTRAINT ALL"))

        # Sécurité : refuse si la cible a déjà des données, sauf --force qui vide
        # d'abord (rend la reprise ré-exécutable proprement).
        if args.force:
            for table in reversed(Base.metadata.sorted_tables):
                dst.execute(table.delete())
        else:
            for table in Base.metadata.sorted_tables:
                if table.name in source_tables and dst.execute(select(table)).first() is not None:
                    sys.exit(
                        f"[ERREUR] La table cible '{table.name}' contient déjà des données. "
                        "Relancez avec --force pour forcer (vide la cible avant copie)."
                    )

        for table in Base.metadata.sorted_tables:  # ordre FK-safe
            if table.name not in source_tables:
                print(f"  · {table.name}: absente de la source, ignorée")
                continue
            rows = [dict(r._mapping) for r in src.execute(select(table))]
            if rows:
                dst.execute(insert(table), rows)
            print(f"  · {table.name}: {len(rows)} lignes")
            total += len(rows)

        # Réactive les contraintes FK (sans revalider les éventuels orphelins
        # hérités de la source SQLite — l'app reste fonctionnelle).
        for table in Base.metadata.sorted_tables:
            dst.execute(text(f"ALTER TABLE [{table.name}] CHECK CONSTRAINT ALL"))

    print("=" * 60)
    print(f"Reprise terminée : {total} lignes copiées.")
    print("Vérifiez les comptes dans l'application (BOM, composants, machines).")


if __name__ == "__main__":
    main()
