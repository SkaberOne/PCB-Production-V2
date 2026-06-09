"""Supplier API connectors (Mouser, DigiKey, ...).

Common interface in ``base.py`` (SupplierConnector + OfferDTO). Each supplier is
an adapter returning normalized ``OfferDTO`` objects. See ADR 0004.
"""

from .base import OfferDTO, SupplierConnector, price_at_quantity
from .mouser import MouserConnector
from .digikey import DigiKeyConnector
from .farnell import FarnellConnector

__all__ = [
    "OfferDTO",
    "SupplierConnector",
    "price_at_quantity",
    "MouserConnector",
    "DigiKeyConnector",
    "FarnellConnector",
    "build_connectors",
]


def build_connectors():
    """Return the list of configured connectors (skips those without credentials).

    Credentials saved from the Paramètres UI (``supplier_credentials`` store) are
    overlaid on top of the ``.env`` defaults; a missing/empty stored value falls back
    to the environment configuration.
    """
    from ..supplier_credentials import load_credentials

    stored = load_credentials()
    mouser_creds = stored.get("mouser") or {}
    digikey_creds = stored.get("digikey") or {}
    farnell_creds = stored.get("farnell") or {}

    mouser = MouserConnector(api_key=(mouser_creds.get("api_key") or None))
    digikey = DigiKeyConnector(
        client_id=(digikey_creds.get("client_id") or None),
        client_secret=(digikey_creds.get("client_secret") or None),
    )
    farnell = FarnellConnector(api_key=(farnell_creds.get("api_key") or None))

    return [connector for connector in (mouser, digikey, farnell) if connector.is_configured]
