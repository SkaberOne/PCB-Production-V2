"""Tests parsing du cycle de vie par adaptateur fournisseur (ADR 0014, phase A2).

Chaque adaptateur doit remonter le libellé brut de cycle de vie dans
``OfferDTO.lifecycle_status``, et la normalisation doit le classer correctement.
"""

from src.services import lifecycle
from src.services.suppliers.mouser import MouserConnector
from src.services.suppliers.digikey import DigiKeyConnector
from src.services.suppliers.farnell import FarnellConnector
from src.services.suppliers.rs import RsConnector


def test_mouser_parses_lifecycle_status():
    data = {"SearchResults": {"Parts": [
        {"ManufacturerPartNumber": "X", "LifecycleStatus": "Obsolete"},
    ]}}
    offers = MouserConnector(api_key="")._parse_parts(data)
    assert offers and offers[0].lifecycle_status == "Obsolete"
    assert lifecycle.normalize_lifecycle(offers[0].lifecycle_status) == lifecycle.EOL


def test_digikey_parses_product_status_object():
    data = {"Products": [
        {"ManufacturerProductNumber": "X", "ProductStatus": {"Id": 0, "Status": "Active"}},
    ]}
    offers = DigiKeyConnector(client_id="", client_secret="")._parse_products(data)
    assert offers and offers[0].lifecycle_status == "Active"
    assert lifecycle.normalize_lifecycle(offers[0].lifecycle_status) == lifecycle.ACTIVE


def test_farnell_parses_product_status():
    data = {"products": [
        {"translatedManufacturerPartNumber": "X", "productStatus": "NOT_RECOMMENDED_FOR_NEW_DESIGN"},
    ]}
    offers = FarnellConnector(api_key="")._parse_products(data)
    assert offers and offers[0].lifecycle_status == "NOT_RECOMMENDED_FOR_NEW_DESIGN"
    assert lifecycle.normalize_lifecycle(offers[0].lifecycle_status) == lifecycle.NRND


def test_rs_parses_lifecycle_status():
    offer = RsConnector(client_id="", client_secret="")._parse_one(
        {"ManufacturerPartNumber": "X", "LifecycleStatus": "Last Time Buy"}
    )
    assert offer.lifecycle_status == "Last Time Buy"
    assert lifecycle.normalize_lifecycle(offer.lifecycle_status) == lifecycle.NRND
