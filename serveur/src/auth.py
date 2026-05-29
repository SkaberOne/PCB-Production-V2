"""Optional X-API-Key authentication dependency for FastAPI routes.

Usage
-----
If ``API_KEY`` is set in the environment (or .env file), every request to a
protected route must include a matching ``X-API-Key`` header.  When the
setting is absent or empty the application runs open, which is the expected
behaviour in local development.

Wire it up per-router::

    app.include_router(router, prefix="/api", dependencies=[Depends(require_api_key)])

Or globally on the FastAPI app::

    app = FastAPI(dependencies=[Depends(require_api_key)])
"""

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

from .config import settings


_api_key_header = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,  # We handle the error ourselves to keep the message consistent.
    description="Optional API key. Required when the server is configured with API_KEY.",
)


def require_api_key(x_api_key: str = Security(_api_key_header)) -> None:
    """FastAPI dependency that enforces X-API-Key authentication.

    * If ``settings.api_key`` is ``None`` or empty the check is skipped
      (open / dev mode).
    * If configured, the incoming ``X-API-Key`` header must be an exact
      case-sensitive match.  A missing or wrong key raises HTTP 401.
    """
    configured_key: str = (settings.api_key or "").strip()
    if not configured_key:
        # No key configured — allow all traffic.
        return

    if not x_api_key or x_api_key.strip() != configured_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
