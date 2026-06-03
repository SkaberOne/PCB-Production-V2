"""Supplier API connectors (Mouser, DigiKey, ...).

Common interface in ``base.py`` (SupplierConnector + OfferDTO). Each supplier is
an adapter returning normalized ``OfferDTO`` objects. See ADR 0004.
"""

from .base import OfferDTO, SupplierConnector, price_at_quantity
from .mouser import MouserConnector
from .digikey import DigiKeyConnector

__all__ = [
    "OfferDTO",
    "SupplierConnector",
    "price_at_quantity",
    "MouserConnector",
    "DigiKeyConnector",
    "build_connectors",
]


def build_connectors():
    """Return the list of configured connectors (skips those without credentials)."""
    connectors = []
    for connector_cls in (MouserConnector, DigiKeyConnector):
        connector = connector_cls()
        if connector.is_configured:
            connectors.append(connector)
    return connectors
