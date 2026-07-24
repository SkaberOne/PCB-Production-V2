"""Réactiver / désarchiver une production (prompt 027).

La transition ARCHIVED → DRAFT doit être autorisée (PATCH statut), sans casser
l'invariant « une seule production ACTIVE » et sans perte de données.
"""

from src.models.production import Production

from .conftest import TestingSessionLocal, client


def _make(db, name, status):
    p = Production(name=name, status=status)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_desarchiver_repasse_en_draft():
    db = TestingSessionLocal()
    pid = _make(db, "ARCH-1", Production.StatusEnum.ARCHIVED).id
    db.close()

    res = client.patch(f"/api/marketplace/productions/{pid}", json={"status": "DRAFT"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "DRAFT"

    # Vérif API : GET renvoie bien DRAFT après désarchivage.
    got = client.get(f"/api/marketplace/productions/{pid}")
    assert got.status_code == 200
    assert got.json()["status"] == "DRAFT"


def test_desarchiver_ne_reactive_pas_directement_en_active():
    """Désarchiver n'active jamais directement : l'ACTIVE existante reste seule."""
    db = TestingSessionLocal()
    active_id = _make(db, "ACT-1", Production.StatusEnum.ACTIVE).id
    arch_id = _make(db, "ARCH-2", Production.StatusEnum.ARCHIVED).id
    db.close()

    res = client.patch(f"/api/marketplace/productions/{arch_id}", json={"status": "DRAFT"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "DRAFT"

    # L'invariant tient : exactement une ACTIVE, et c'est toujours la même.
    db = TestingSessionLocal()
    try:
        actives = db.query(Production).filter(
            Production.status == Production.StatusEnum.ACTIVE
        ).all()
        assert [p.id for p in actives] == [active_id]
        assert db.get(Production, arch_id).status == Production.StatusEnum.DRAFT
    finally:
        db.close()


def test_desarchiver_conserve_les_donnees():
    """Le nom et les métadonnées de la production sont conservés au désarchivage."""
    db = TestingSessionLocal()
    p = _make(db, "ARCH-3", Production.StatusEnum.ARCHIVED)
    p.notes = "note importante"
    p.assembly_mode = "MANUEL"
    db.commit()
    pid = p.id
    db.close()

    res = client.patch(f"/api/marketplace/productions/{pid}", json={"status": "DRAFT"})
    assert res.status_code == 200, res.text

    db = TestingSessionLocal()
    try:
        reloaded = db.get(Production, pid)
        assert reloaded.status == Production.StatusEnum.DRAFT
        assert reloaded.name == "ARCH-3"
        assert reloaded.notes == "note importante"
        assert reloaded.assembly_mode == "MANUEL"
    finally:
        db.close()
