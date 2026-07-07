"""Tests concurrence optimiste sur Production (ADR 0013 extension B).

Opt-in : le PATCH ne vérifie la version que si le client en fournit une.
Couvre : version démarre à 1 et s'incrémente à chaque écriture, un PATCH avec
version périmée renvoie 409 (code version_conflict + données à jour), un PATCH
sans version reste toléré (rétro-compatibilité des appels machine/statut).
"""

from .conftest import client


def _create(name="Prod-VER"):
    res = client.post("/api/marketplace/productions", json={"name": name})
    assert res.status_code == 200, res.text
    return res.json()


def _get(pid):
    return client.get(f"/api/marketplace/productions/{pid}").json()


def test_version_starts_at_one_and_increments():
    prod = _create("Prod-VER-A")
    pid = prod["id"]
    assert _get(pid)["version"] == 1

    res = client.patch(f"/api/marketplace/productions/{pid}", json={"name": "Prod-VER-A2", "version": 1})
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2


def test_stale_version_returns_409():
    prod = _create("Prod-VER-B")
    pid = prod["id"]
    assert _get(pid)["version"] == 1

    # Un premier poste renomme -> version passe à 2.
    first = client.patch(f"/api/marketplace/productions/{pid}", json={"name": "Prod-VER-B-poste1", "version": 1})
    assert first.status_code == 200
    assert first.json()["version"] == 2

    # Un second poste, parti de la version 1, tente d'écrire -> conflit.
    conflict = client.patch(f"/api/marketplace/productions/{pid}", json={"name": "Prod-VER-B-poste2", "version": 1})
    assert conflict.status_code == 409
    detail = conflict.json()["detail"]
    assert detail["code"] == "version_conflict"
    assert detail["current"]["version"] == 2
    # Le nom n'a PAS été écrasé par le poste 2.
    assert _get(pid)["name"] == "Prod-VER-B-poste1"


def test_patch_without_version_is_tolerated():
    prod = _create("Prod-VER-C")
    pid = prod["id"]
    res = client.patch(f"/api/marketplace/productions/{pid}", json={"name": "Prod-VER-C2"})
    assert res.status_code == 200
    # L'écriture incrémente quand même la version côté serveur.
    assert res.json()["version"] == 2
