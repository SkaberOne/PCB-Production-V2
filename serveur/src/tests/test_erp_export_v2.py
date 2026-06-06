"""Tests for the 12-column ERP export mapping and ERP defaults endpoints."""

from tests.conftest import client

from src.services.command_service import CommandService


DEFAULTS = {
    "project": "PJ2601-00241 - Achat projet client 2026",
    "unit": "pièce",
    "requester": "Eric Bouquet",
    "validator": "Kevin Surrier",
    "delay": "URGENT",
    "remark": "mise en bobine",
    "default_supplier": None,
}


def test_erp_headers_are_the_twelve_form_fields():
    assert CommandService.ERP_HEADERS == [
        "Référence fournisseur",
        "Fournisseur",
        "Description",
        "Lien web",
        "Référence KT",
        "Quantité",
        "Unité",
        "Projet",
        "Demandeur",
        "Validateur",
        "Délai",
        "Remarques",
    ]


def test_build_rows_maps_offer_and_defaults():
    summary = {
        "aggregated_components": [
            {
                "key": "k1",
                "component_library_id": 7,
                "value": "100nF",
                "footprint": "C0402",
                "component_mpn": None,
                "component_reference": "C0402_100NF",
                "supplier_code": None,
                "supplier_link": None,
                "quantity": 250,
            }
        ]
    }
    offers_by_component = {
        7: {
            "supplier": "MOUSER",
            "supplier_part": "81-GRM188",
            "mpn": "GRM188R71H104KA93D",
            "manufacturer": "Murata",
            "product_url": "https://mouser.com/p/1",
        }
    }
    rows = CommandService._build_erp_export_rows(summary, DEFAULTS, offers_by_component)
    assert len(rows) == 1
    row = rows[0]
    assert row["Référence fournisseur"] == "81-GRM188"
    assert row["Fournisseur"] == "Mouser"  # MOUSER -> label
    assert "Murata" in row["Description"] and "GRM188R71H104KA93D" in row["Description"]
    assert row["Lien web"] == "https://mouser.com/p/1"
    assert row["Référence KT"] == ""  # champ société, jamais pré-rempli
    assert row["Quantité"] == 250
    assert row["Unité"] == "pièce"
    assert row["Projet"] == "PJ2601-00241 - Achat projet client 2026"
    assert row["Demandeur"] == "Eric Bouquet"
    assert row["Validateur"] == "Kevin Surrier"
    assert row["Délai"] == "URGENT"
    assert row["Remarques"] == "mise en bobine"


def test_build_rows_without_offer_uses_default_supplier():
    summary = {"aggregated_components": [{"key": "k", "component_library_id": 1, "value": "10k",
                                          "footprint": "R0402", "component_reference": "R0402_10K",
                                          "quantity": 5}]}
    defaults = dict(DEFAULTS, default_supplier="Mouser")
    rows = CommandService._build_erp_export_rows(summary, defaults, {})
    assert rows[0]["Fournisseur"] == "Mouser"
    assert rows[0]["Référence KT"] == ""  # champ société, jamais pré-rempli


def test_erp_defaults_get_seeds_then_put_updates():
    resp = client.get("/api/marketplace/erp-defaults")
    assert resp.status_code == 200
    data = resp.json()
    assert data["requester"] == "Eric Bouquet"
    assert data["validator"] == "Kevin Surrier"
    assert data["delay"] == "URGENT"

    resp = client.put("/api/marketplace/erp-defaults", json={"validator": "Autre Valideur"})
    assert resp.status_code == 200
    assert resp.json()["validator"] == "Autre Valideur"
    # Unchanged fields preserved.
    assert resp.json()["requester"] == "Eric Bouquet"
