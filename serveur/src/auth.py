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

import hmac

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

from .config import settings


def _configured_key() -> str:
    """Clé API effective, ou chaîne vide si non configurée (mode ouvert).

    Neutralise une valeur polluée non résolue (gabarit ``${user_config.api_key}``)
    qui, sinon, activerait une auth avec une clé absurde et bloquerait tout.
    """
    key = (settings.api_key or "").strip()
    if "${" in key:  # gabarit non résolu → considéré comme non configuré
        return ""
    return key


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
    configured_key = _configured_key()
    if not configured_key:
        # No key configured — allow all traffic (dev / open mode).
        return

    provided = (x_api_key or "").strip()
    # Comparaison constant-time (hmac.compare_digest) pour éviter les attaques
    # temporelles ; encode en bytes car compare_digest l'exige.
    if not provided or not hmac.compare_digest(provided.encode("utf-8"), configured_key.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
