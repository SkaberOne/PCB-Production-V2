"""
PCB Flow Production Suite backend application.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import require_api_key
from .config import settings
from .database import ensure_sqlite_schema as ensure_sqlite_dev_schema
from .database import init_or_upgrade_schema, verify_connection_or_raise
from .routes import bom, costing, marketplace, reports


logger = logging.getLogger(__name__)

API_TITLE = "PCB Flow Production Suite API"
API_DESCRIPTION = "API for PCB production management (BOM, Marketplace, PnP, Database)"
API_VERSION = "1.0.0"


def build_allowed_origins():
    """Return deduplicated CORS origins for local development and config overrides."""
    defaults = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:7071",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:7071",
        # Renderer Electron packagé : chargé en file:// → le navigateur envoie
        # Origin "null". Backend lié à 127.0.0.1 (local), donc accepter cette
        # origine permet à l'app packagée d'appeler son propre backend (écart D6).
        "null",
    ]
    configured = list(getattr(settings, "cors_origins", []))
    return sorted({*defaults, *configured})


def register_routes(app: FastAPI) -> None:
    """Register all API routers on the FastAPI application.

    All /api/* routes share the ``require_api_key`` dependency.  When
    ``settings.api_key`` is not set (default) the dependency is a no-op,
    keeping local development open.  Set ``API_KEY=<secret>`` in .env to
    require the ``X-API-Key`` header on every API call.
    """
    auth = [Depends(require_api_key)]
    app.include_router(bom.router, prefix="/api", tags=["BOM"], dependencies=auth)
    app.include_router(marketplace.router, prefix="/api", tags=["Marketplace"], dependencies=auth)
    app.include_router(reports.router, prefix="/api", tags=["Reports"], dependencies=auth)
    app.include_router(costing.router, prefix="/api", tags=["Costing"], dependencies=auth)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: run startup logic, then yield, then teardown."""
    if settings.database_url.startswith("sqlite"):
        ensure_sqlite_dev_schema()
    else:
        # Base partagée SQL Server : fail-fast si injoignable (écart D7) plutôt
        # qu'une bascule SQLite silencieuse. Stoppe le boot avec un message clair.
        verify_connection_or_raise()
        # Met le schéma à niveau au démarrage (écart D14) : create_all + stamp
        # sur base neuve, upgrade head sur base existante.
        init_or_upgrade_schema()
    yield
    # teardown hooks can go here if needed


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    # En production (api_env=production, posé par Electron pour le backend
    # packagé), on n'expose pas /docs ni /redoc (cartographie API — écart D10).
    docs_enabled = settings.api_env.lower() != "production"
    app = FastAPI(
        title=API_TITLE,
        description=API_DESCRIPTION,
        version=API_VERSION,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        lifespan=lifespan,
    )

    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception):
        """Renvoie un message générique au client et logge le détail côté serveur.

        Évite de fuiter ``str(exc)`` (stack/SQL/chemins) dans les réponses 500
        (écart D8). Les HTTPException et erreurs de validation gardent leur
        comportement détaillé (gérés en amont par FastAPI).
        """
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Erreur interne du serveur."},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=build_allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    @app.get("/api/health")
    async def health_check():
        return {
            "status": "ok",
            "version": API_VERSION,
            "service": API_TITLE,
        }

    @app.get("/")
    async def root():
        return {
            "message": API_TITLE,
            "docs_url": "/docs",
            "redoc_url": "/redoc",
            "health_check": "/api/health",
        }

    register_routes(app)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_env == "development",
    )
# reload trigger 2026-06-03T18:12:26.5746720+02:00
