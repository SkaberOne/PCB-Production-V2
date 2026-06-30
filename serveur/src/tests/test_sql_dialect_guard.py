"""
Garde-fou anti-régression de dialecte SQL (T-001 / T-002).

Contexte
────────
SQL Server (T-SQL) n'accepte `IS [NOT]` qu'avec `NULL`. Or SQLAlchemy rend
`Column.isnot(True)` / `Column.is_(False)` en `col IS NOT 1` / `col IS 0`,
syntaxe **valide en SQLite mais invalide en SQL Server**. Le bug est donc
totalement invisible avec la base de dev (SQLite) et n'explose qu'en prod
(SQL Server) — exactement ce qui a bloqué les modules Commande et Prix carte
lors du test terrain du 2026-06-18 (audit release v1.0.6).

Ce test scanne le code source du backend et échoue si le motif fautif
réapparaît. Forme correcte à utiliser à la place :

    from sqlalchemy import or_
    or_(Model.flag == False, Model.flag.is_(None))   # noqa: E712   (NULL-safe)
    # ou, si la colonne est strictement NOT NULL :
    Model.flag == False                              # noqa: E712

Voir docs/audits/Audit_2026-06-18_test_terrain_release_v1.0.6.md (T-001/T-002).
"""
import re
from pathlib import Path

# Racine du package backend : .../serveur/src
SRC_ROOT = Path(__file__).resolve().parent.parent

# `.isnot(True)`, `.isnot(False)`, `.is_(True)`, `.is_(False)` avec espaces tolérés.
FORBIDDEN = re.compile(r"\.(?:isnot|is_)\(\s*(?:True|False)\s*\)")


def test_no_is_boolean_on_columns():
    """Aucun .isnot(<bool>) / .is_(<bool>) ne doit subsister (invalide en T-SQL)."""
    offenders = []
    for path in SRC_ROOT.rglob("*.py"):
        # Ne pas s'auto-incriminer : ce fichier contient le motif dans des chaînes.
        if path.name == "test_sql_dialect_guard.py":
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if FORBIDDEN.search(line):
                rel = path.relative_to(SRC_ROOT)
                offenders.append(f"{rel}:{lineno}: {line.strip()}")

    assert not offenders, (
        "Motif SQL invalide en SQL Server (`IS [NOT] <bool>`) détecté.\n"
        "Remplacer par `== True/False  # noqa: E712` ou la forme NULL-safe "
        "`or_(col == False, col.is_(None))`.\n" + "\n".join(offenders)
    )
