"""Tests du mode CLI ``server_entry.py --check-db`` (ADR 0009).

Le mode ``--check-db`` teste la connexion à la base configurée puis sort 0/1 en
imprimant un JSON ``{ok, engine, detail}``. Il est lancé en **sous-processus** par
Electron (bouton « Tester la connexion » du panneau Paramètres), avec un
``.env`` candidat pointé par ``PCBFLOW_DATA_DIR``.

Ces tests le lancent de la même façon (sous-processus + ``PCBFLOW_DATA_DIR``), ce
qui les rend indépendants du ``conftest`` (qui force SQLite en mémoire pour
l'application, sans effet sur un process séparé).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

SERVEUR_DIR = Path(__file__).resolve().parents[2]  # .../serveur
SERVER_ENTRY = SERVEUR_DIR / "server_entry.py"


def _run_check_db(data_dir: Path) -> tuple[int, dict]:
    """Lance ``server_entry.py --check-db`` avec PCBFLOW_DATA_DIR=data_dir."""
    env = dict(os.environ)
    env["PCBFLOW_DATA_DIR"] = str(data_dir)
    # Ne pas hériter d'une éventuelle DATABASE_URL du shell de test.
    env.pop("DATABASE_URL", None)
    proc = subprocess.run(
        [sys.executable, str(SERVER_ENTRY), "--check-db"],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )
    # Le JSON est la dernière ligne non vide de stdout (le reste = bannières).
    lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
    payload = json.loads(lines[-1]) if lines else {}
    return proc.returncode, payload


def test_check_db_sqlite_ok(tmp_path: Path) -> None:
    """Une cible SQLite valide → exit 0, ok=True, engine=sqlite."""
    (tmp_path / "database").mkdir()
    (tmp_path / ".env").write_text(
        "DATABASE_URL=sqlite:///./database/check.db\n", encoding="utf-8"
    )

    code, payload = _run_check_db(tmp_path)

    assert code == 0
    assert payload["ok"] is True
    assert payload["engine"] == "sqlite"


def test_check_db_unreachable_sql_server(tmp_path: Path) -> None:
    """Une cible SQL Server injoignable → exit 1, ok=False, détail non vide.

    On vise 127.0.0.1:1 (port refusé immédiatement) pour un échec rapide et
    déterministe, que pyodbc soit installé ou non.
    """
    (tmp_path / ".env").write_text(
        "SQL_SERVER_HOST=127.0.0.1\n"
        "SQL_SERVER_PORT=1\n"
        "SQL_SERVER_USER=pcbflow\n"
        "SQL_SERVER_PASSWORD=whatever\n"
        "SQL_SERVER_DATABASE=ECB_Production\n",
        encoding="utf-8",
    )

    code, payload = _run_check_db(tmp_path)

    assert code == 1
    assert payload["ok"] is False
    assert payload["engine"] == "mssql"
    assert payload["detail"]  # message d'erreur présent
