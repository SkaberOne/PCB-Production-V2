"""Persisted supplier API credentials (Mouser, DigiKey).

Stored as a JSON file outside the code tree (``serveur/data/supplier_credentials.json``,
gitignored) so secrets never land in version control. ``build_connectors`` overlays
these values on top of the ``.env`` defaults, so credentials entered from the
Paramètres UI take effect on the next connector build without editing ``.env``.

Shape on disk::

    {
      "mouser":  {"auth_type": "api_key",            "api_key": "..."},
      "digikey": {"auth_type": "client_credentials", "client_id": "...", "client_secret": "..."}
    }

Only ``api_key`` and ``client_secret`` are treated as secrets and are never echoed
back in clear text by :func:`masked_credentials`.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = ("mouser", "digikey")
SECRET_FIELDS = ("api_key", "client_secret")

# serveur/src/services/supplier_credentials.py -> parents[2] == serveur/
_SERVER_ROOT = Path(__file__).resolve().parents[2]
_STORE_PATH = _SERVER_ROOT / "data" / "supplier_credentials.json"


def _store_path() -> Path:
    return _STORE_PATH


def load_credentials() -> Dict[str, Dict[str, Any]]:
    """Return the raw stored credentials (secrets included). ``{}`` when absent."""
    path = _store_path()
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            return {}
        return {provider: dict(values) for provider, values in data.items() if isinstance(values, dict)}
    except (OSError, ValueError) as exc:
        logger.warning("Could not read supplier credentials store: %s", exc)
        return {}


def save_credentials(payload: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Merge ``payload`` into the store and persist it.

    Secret fields left empty/``None`` keep their previously stored value, so the UI
    can save non-secret changes without forcing the user to retype API keys.
    """
    current = load_credentials()
    merged: Dict[str, Dict[str, Any]] = {provider: dict(values) for provider, values in current.items()}

    for provider, values in (payload or {}).items():
        if provider not in SUPPORTED_PROVIDERS or not isinstance(values, dict):
            continue
        entry = dict(merged.get(provider) or {})
        for key, value in values.items():
            if key in SECRET_FIELDS and (value is None or str(value).strip() == ""):
                # Keep the existing secret when the field is left blank.
                continue
            if value is None:
                entry.pop(key, None)
            else:
                entry[key] = str(value).strip()
        merged[provider] = entry

    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".json.tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(merged, handle, ensure_ascii=False, indent=2)
    tmp_path.replace(path)
    return masked_credentials(merged)


def _hint(secret: str) -> str:
    secret = str(secret or "")
    if len(secret) <= 4:
        return "••••" if secret else ""
    return f"••••{secret[-4:]}"


def masked_credentials(data: Dict[str, Dict[str, Any]] | None = None) -> Dict[str, Dict[str, Any]]:
    """Return a UI-safe view: identifiers in clear, secrets reduced to set/hint flags."""
    data = load_credentials() if data is None else data
    result: Dict[str, Dict[str, Any]] = {}
    for provider in SUPPORTED_PROVIDERS:
        values = dict(data.get(provider) or {})
        api_key = values.get("api_key") or ""
        client_secret = values.get("client_secret") or ""
        default_auth = "api_key" if provider == "mouser" else "client_credentials"
        result[provider] = {
            "auth_type": values.get("auth_type") or default_auth,
            "client_id": values.get("client_id") or "",
            "api_key_set": bool(api_key),
            "api_key_hint": _hint(api_key),
            "client_secret_set": bool(client_secret),
            "client_secret_hint": _hint(client_secret),
        }
    return result
