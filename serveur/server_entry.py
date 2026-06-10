#!/usr/bin/env python
"""Point d'entrée du backend ECB Production Manager packagé (PyInstaller).

Ce module est l'entrée gelée en ``ecb-server.exe`` (cf. ADR 0006). Il diffère de
``launch.py`` (entrée dev) sur trois points :

* **Robuste en mode ``frozen``** : résout le dossier de données via
  ``sys.executable`` (pas ``__file__``, qui pointe vers le bundle temporaire).
* **Bind 127.0.0.1 par défaut** : le backend ne sert que le renderer local du
  même poste (jamais exposé au réseau).
* **Port reçu d'Electron** : ``--port`` / ``ECB_SERVER_PORT`` (port libre détecté
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

    * Gelé (PyInstaller) : dossier de l'exécutable, ou ``ECB_DATA_DIR`` si défini
      (utile quand l'exe est installé dans un emplacement non inscriptible type
      Program Files — la config runtime pointe alors vers un dossier inscriptible).
    * Dev : le dossier ``serveur/`` qui contient ce fichier.
    """
    override = os.getenv("ECB_DATA_DIR")
    if override:
        return Path(override).resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backend packagé ECB Production Manager.")
    parser.add_argument(
        "--host",
        default=os.getenv("ECB_SERVER_HOST", "127.0.0.1"),
        help="Adresse de bind (défaut: 127.0.0.1 — local uniquement).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("ECB_SERVER_PORT", "8000")),
        help="Port d'écoute (injecté par Electron).",
    )
    return parser.parse_args()


def main() -> None:
    base = _base_dir()
    # Placer le CWD AVANT d'importer src.config (qui lit .env et crée les dossiers
    # runtime relatifs au CWD au moment de l'import).
    os.chdir(base)
    if str(base) not in sys.path:
        sys.path.insert(0, str(base))

    args = _parse_args()

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
