#!/usr/bin/env python
"""Lanceur du serveur ECB Production Manager.

Lancer depuis le dossier serveur/ :
    ..\\.venv\\Scripts\\python.exe launch.py
    ..\\.venv\\Scripts\\python.exe launch.py --reload   (dev)
    ..\\.venv\\Scripts\\python.exe launch.py --host 0.0.0.0 --port 8000
"""

import argparse
import os
import sys
from pathlib import Path

# --- Chemins ---
SERVEUR_DIR = Path(__file__).resolve().parent  # dossier serveur/
ROOT_DIR = SERVEUR_DIR.parent                  # racine projet (pour .venv)

# src/ est dans serveur/ → importable comme package "src"
if str(SERVEUR_DIR) not in sys.path:
    sys.path.insert(0, str(SERVEUR_DIR))

# Changer le CWD vers serveur/ pour que les chemins relatifs (.env, ./database, etc.) fonctionnent
os.chdir(SERVEUR_DIR)

import uvicorn
from src.config import settings


def parse_args() -> argparse.Namespace:
    reload_env = os.getenv("API_RELOAD", "")
    default_reload = reload_env.strip().lower() in {"1", "true", "yes", "on"}

    parser = argparse.ArgumentParser(description="Lance le serveur ECB Production Manager.")
    parser.add_argument("--host", default=settings.api_host, help="Adresse bind (défaut: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=settings.api_port, help="Port API (défaut: 8000)")

    group = parser.add_mutually_exclusive_group()
    group.add_argument("--reload", dest="reload", action="store_true", help="Auto-reload (dev)")
    group.add_argument("--no-reload", dest="reload", action="store_false", help="Pas d'auto-reload")
    parser.set_defaults(reload=default_reload)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("=" * 55)
    print("  ECB Production Manager - Serveur API")
    print("=" * 55)
    print(f"  Dossier  : {SERVEUR_DIR}")
    print(f"  API      : http://{args.host}:{args.port}")
    print(f"  Swagger  : http://localhost:{args.port}/docs")
    print(f"  Mode     : {'dev (reload)' if args.reload else 'production'}")
    print("=" * 55)

    if args.reload:
        uvicorn.run(
            "src.app:app",
            host=args.host,
            port=args.port,
            log_level="info",
            reload=True,
            reload_dirs=[str(SERVEUR_DIR / "src")],
        )
    else:
        from src.app import app
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
