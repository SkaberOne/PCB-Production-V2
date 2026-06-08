"""
ECB Production Manager backend application.
"""

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_api_key
from .config import settings
from .database import ensure_sqlite_schema as ensure_sqlite_dev_schema
from .routes import bom, marketplace, reports


API_TITLE = "ECB Production Manager API"
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: run startup logic, then yield, then teardown."""
    if settings.database_url.startswith("sqlite"):
        ensure_sqlite_dev_schema()
    yield
    # teardown hooks can go here if needed


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    app = FastAPI(
        title=API_TITLE,
        description=API_DESCRIPTION,
        version=API_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
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
