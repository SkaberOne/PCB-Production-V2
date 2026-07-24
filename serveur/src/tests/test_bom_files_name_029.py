"""Prompt 029 — le listing « BOM enregistrées » (GET /api/bom/files) expose le
nom lisible de la carte (BomReference.name) pour l'affichage « réf — nom », et
la recherche filtre aussi par nom."""

import os
import tempfile

from src.models.bom import BomReference
from src.tests.conftest import client, TestingSessionLocal


def _import_bom(reference):
    bom_content = "Reference Value Footprint X Y Rotation Type\nR1 10R 0805 10.0 20.0 0 R\n"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(bom_content)
        temp_path = f.name
    try:
        with open(temp_path, "rb") as source:
            resp = client.post(
                "/api/bom/import",
                files={"file": (f"{reference}.txt", source, "text/plain")},
                params={"reference": reference, "revision": "REV_A", "side": "TOP"},
            )
        assert resp.status_code == 200, resp.text
        return resp.json()["bom_reference_id"], resp.json()["bom_revision_id"]
    finally:
        os.unlink(temp_path)


def _set_name(bom_reference_id, name):
    with TestingSessionLocal() as db:
        ref = db.get(BomReference, bom_reference_id)
        ref.name = name
        db.commit()


def test_bom_files_expose_le_nom_de_la_carte():
    ref_id, rev_id = _import_bom("AMPLI_NOM_029")
    _set_name(ref_id, "Ampli Nommée")

    files = client.get("/api/bom/files")
    assert files.status_code == 200
    entry = next(i for i in files.json()["items"] if i["bom_revision_id"] == rev_id)
    assert entry["name"] == "Ampli Nommée"
    assert entry["reference"] == "AMPLI_NOM_029"


def test_bom_files_name_absent_reste_vide():
    _, rev_id = _import_bom("LEGACY_SANS_NOM_029")  # jamais de name posé
    files = client.get("/api/bom/files")
    entry = next(i for i in files.json()["items"] if i["bom_revision_id"] == rev_id)
    assert not entry["name"]  # None ou "" — pas de nom → référence seule côté UI


def test_bom_files_recherche_par_nom():
    ref_id, rev_id = _import_bom("REFOBSCURE_029")
    _set_name(ref_id, "Carte Bien Nommee")

    # Recherche par un fragment du NOM (pas de la référence).
    resp = client.get("/api/bom/files", params={"search": "bien nommee"})
    assert resp.status_code == 200
    ids = [i["bom_revision_id"] for i in resp.json()["items"]]
    assert rev_id in ids
