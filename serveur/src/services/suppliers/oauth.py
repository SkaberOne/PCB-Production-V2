"""OAuth2 client-credentials (2-legged) token manager for DigiKey.

Caches the access token in memory and refreshes it shortly before expiry.
Docs: https://developer.digikey.com/tutorials-and-resources/oauth-20-2-legged-flow
"""

from __future__ import annotations

import logging
import time
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# Refresh this many seconds before the token actually expires.
_EXPIRY_SKEW_SECONDS = 60


class OAuth2ClientCredentials:
    """Fetch and cache a bearer token via the client-credentials grant."""

    def __init__(
        self,
        token_url: str,
        client_id: str,
        client_secret: str,
        http_post: Optional[Callable[[str, dict], dict]] = None,
        clock: Callable[[], float] = time.time,
    ):
        self.token_url = token_url
        self.client_id = client_id
        self.client_secret = client_secret
        self._http_post = http_post  # injectable for tests
        self._clock = clock
        self._token: Optional[str] = None
        self._expires_at: float = 0.0

    def get_token(self) -> Optional[str]:
        """Return a valid access token, fetching a new one if needed."""
        if self._token and self._clock() < self._expires_at:
            return self._token
        return self._refresh()

    def invalidate(self) -> None:
        self._token = None
        self._expires_at = 0.0

    def _refresh(self) -> Optional[str]:
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials",
        }
        data = self._do_post(self.token_url, payload)
        token = data.get("access_token")
        if not token:
            logger.warning("DigiKey OAuth: no access_token in response")
            return None
        expires_in = data.get("expires_in", 600)
        try:
            expires_in = float(expires_in)
        except (TypeError, ValueError):
            expires_in = 600.0
        self._token = token
        self._expires_at = self._clock() + max(expires_in - _EXPIRY_SKEW_SECONDS, 0)
        return token

    def _do_post(self, url: str, form: dict) -> dict:
        if self._http_post is not None:
            return self._http_post(url, form)
        import httpx

        try:
            response = httpx.post(
                url,
                data=form,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15.0,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            logger.warning("DigiKey OAuth request failed: %s", exc)
            return {}
