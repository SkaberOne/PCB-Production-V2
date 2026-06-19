"""Régression : un mot de passe DB contenant des caractères spéciaux ne doit
plus faire planter le boot du backend.

Bug (2026-06-18) : ``config.py`` URL-encode le mot de passe (quote_plus → %XX),
puis ``database._alembic_config`` passait l'URL telle quelle à
``alembic.config.set_main_option``. configparser interprète « % » comme syntaxe
d'interpolation → ``ValueError: invalid interpolation syntax`` et le backend
refusait de démarrer (« Backend indisponible »). Correctif : échapper « % » en
« %% » avant ``set_main_option`` (round-trip restitué par ``get_main_option``).
"""
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src import database


# URL telle que produite par config.database_url quand le mot de passe contient
# des caractères spéciaux (ici « !Ab%cd+ » → quote_plus → %21Ab%25cd%2B).
URL_WITH_PERCENT = (
    "mssql+pyodbc://pcbflow:%21Ab%25cd%2B@localhost:1433/ECB_Production"
    "?driver=ODBC+Driver+17+for+SQL+Server&Encrypt=no&TrustServerCertificate=yes"
)


class _StubSettings:
    """Minimal stand-in exposant uniquement database_url (lu par _alembic_config)."""

    database_url = URL_WITH_PERCENT


def test_alembic_config_handles_percent_in_password(monkeypatch):
    """_alembic_config ne lève pas et l'URL fait l'aller-retour intact."""
    monkeypatch.setattr(database, "settings", _StubSettings())

    cfg = database._alembic_config()  # ne doit pas lever ValueError

    # get_main_option ré-interprète %% → % : on récupère l'URL d'origine.
    assert cfg.get_main_option("sqlalchemy.url") == URL_WITH_PERCENT


def test_alembic_config_unchanged_for_plain_password(monkeypatch):
    """Sans « % », l'URL est inchangée (pas de régression sur le cas nominal)."""
    plain = (
        "mssql+pyodbc://pcbflow:Kelenn@localhost:1433/ECB_Production"
        "?driver=ODBC+Driver+17+for+SQL+Server"
    )

    class _S:
        database_url = plain

    monkeypatch.setattr(database, "settings", _S())
    cfg = database._alembic_config()
    assert cfg.get_main_option("sqlalchemy.url") == plain
