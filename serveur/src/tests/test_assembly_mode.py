"""Mode d'assemblage des productions (PNP | MANUEL | MIXTE)."""

from .conftest import client


def test_create_production_defaults_to_pnp():
    res = client.post(
        "/api/marketplace/productions",
        json={"name": "ASM-defaut"},
    )
    assert res.status_code == 200
    assert res.json()["assembly_mode"] == "PNP"


def test_create_production_manual_mode():
    res = client.post(
        "/api/marketplace/productions",
        json={"name": "ASM-manuel", "assembly_mode": "manuel"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["assembly_mode"] == "MANUEL"  # normalisé en majuscules

    # Exposé aussi dans le résumé dashboard.
    summary = client.get("/api/reports/productions-summary").json()
    entry = next(p for p in summary if p["id"] == body["id"])
    assert entry["assembly_mode"] == "MANUEL"


def test_update_production_assembly_mode():
    created = client.post(
        "/api/marketplace/productions",
        json={"name": "ASM-update"},
    ).json()
    res = client.patch(
        f"/api/marketplace/productions/{created['id']}",
        json={"assembly_mode": "MIXTE"},
    )
    assert res.status_code == 200
    assert res.json()["assembly_mode"] == "MIXTE"


def test_invalid_assembly_mode_rejected():
    res = client.post(
        "/api/marketplace/productions",
        json={"name": "ASM-invalide", "assembly_mode": "ROBOT"},
    )
    assert res.status_code == 400
