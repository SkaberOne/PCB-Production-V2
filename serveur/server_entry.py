#!/usr/bin/env python
"""Point d'entrée du backend PCB Flow Production Suite packagé (PyInstaller).

Ce module est l'entrée gelée en ``pcb-flow-server.exe`` (cf. ADR 0006). Il diffère de
``launch.py`` (entrée dev) sur trois points :

* **Robuste en mode ``frozen``** : résout le dossier de données via
  ``sys.executable`` (pas ``__file__``, qui pointe vers le bundle temporaire).
* **Bind 127.0.0.1 par défaut** : le backend ne sert que le renderer local du
  même poste (jamais exposé au réseau).
* **Port reçu d'Electron** : ``--port`` / ``PCBFLOW_SERVER_PORT`` (port libre détecté
  par le process Electron), au lieu d'un 8000 figé.

En dev (non gelé) il reste lançable directement :
    ..\\.venv\\Scripts\\python.exe server_entry.py --port 8000
"""

import argparse
import os
import sys
from pathlib import Path


def _base_dir() -> Path:
    """Dossier de travail (où vivent .env, database/, logs/, uploads/...).

    * Gelé (PyInstaller) : dossier de l'exécutable, ou ``PCBFLOW_DATA_DIR`` si défini
      (utile quand l'exe est installé dans un emplacement non inscriptible type
      Program Files — la config runtime pointe alors vers un dossier inscriptible).
    * Dev : le dossier ``serveur/`` qui contient ce fichier.
    """
    override = os.getenv("PCBFLOW_DATA_DIR")
    if override:
        return Path(override).resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backend packagé PCB Flow Production Suite.")
    parser.add_argument(
        "--host",
        default=os.getenv("PCBFLOW_SERVER_HOST", "127.0.0.1"),
        help="Adresse de bind (défaut: 127.0.0.1 — local uniquement).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("PCBFLOW_SERVER_PORT", "8000")),
        help="Port d'écoute (injecté par Electron).",
    )
    parser.add_argument(
        "--check-db",
        dest="check_db",
        action="store_true",
        help=(
            "Teste la connexion à la base configurée (lit le .env du dossier de "
            "données), imprime un JSON {ok, engine, detail} et sort 0 (succès) ou "
            "1 (échec) SANS démarrer le serveur HTTP. Utilisé par le bouton "
            "« Tester la connexion » du panneau Paramètres (ADR 0009)."
        ),
    )
    return parser.parse_args()


def _run_check_db() -> int:
    """Teste la connexion DB et imprime un JSON sur stdout. Retourne le code de sortie.

    Réutilise ``settings.database_url`` (même construction d'URL, mot de passe
    URL-encodé — cf. config.py). N'importe PAS ``src.app`` : on veut un test léger
    qui n'instancie pas toute l'application. Borne le temps d'attente pour ne pas
    figer l'UI sur un hôte injoignable (le pré-test TCP côté Electron filtre déjà
    le cas « port fermé »).
    """
    import json

    result = {"ok": False, "engine": "unknown", "detail": ""}
    try:
        from sqlalchemy import create_engine, text

        from src.config import settings

        url = settings.database_url
        result["engine"] = "sqlite" if url.startswith("sqlite") else "mssql"

        if url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
        else:
            # pyodbc : borne l'attente. ``timeout`` = délai de requête ; le
            # login timeout ODBC par défaut (~15 s) reste acceptable pour un test.
            connect_args = {"timeout": 5}

        engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        host = engine.url.host or engine.url.database or ""
        engine.dispose()

        result["ok"] = True
        result["detail"] = f"Connexion réussie ({host})" if host else "Connexion réussie"
    except Exception as exc:  # noqa: BLE001 — on veut rapporter toute erreur en JSON
        detail = str(exc).strip().replace("\n", " ")
        result["detail"] = detail[:500]

    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0 if result["ok"] else 1


def main() -> None:
    base = _base_dir()
    # Placer le CWD AVANT d'importer src.config (qui lit .env et crée les dossiers
    # runtime relatifs au CWD au moment de l'import).
    os.chdir(base)
    if str(base) not in sys.path:
        sys.path.insert(0, str(base))

    args = _parse_args()

    # Mode test de connexion (ADR 0009) : ne démarre pas le serveur, sort 0/1.
    if args.check_db:
        sys.exit(_run_check_db())

    import uvicorn

    print("=" * 55, flush=True)
    print("  PCB Flow Production Suite - Backend packagé", flush=True)
    print(f"  Données  : {base}", flush=True)
    print(f"  Écoute   : http://{args.host}:{args.port}", flush=True)
    print(f"  Gelé     : {bool(getattr(sys, 'frozen', False))}", flush=True)
    print("=" * 55, flush=True)

    # Import tardif : après chdir, pour que la config lise le bon .env.
    from src.app import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
