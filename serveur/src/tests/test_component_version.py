"""Tests concurrence optimiste sur Component (ADR 0013 phase 2).

Couvre : la version démarre à 1, un PUT avec la bonne version passe et incrémente,
un PUT avec une version périmée renvoie 409 (code version_conflict + données à jour),
un PUT sans version reste toléré (rétro-compatibilité).
"""

from .conftest import client


def _create(reference="LIB-VER", value="10K"):
    res = client.post("/api/bom/components", json={"reference": reference, "value": value})
    assert res.status_code == 200, res.text
    return res.json()


def _get(cid):
    return client.get(f"/api/bom/components/{cid}").json()


def test_version_starts_at_one_and_increments():
    comp = _create("LIB-VER-A")
    cid = comp["id"]
    assert _get(cid)["version"] == 1

    payload = {**_get(cid), "value": "10K-maj", "version": 1}
    res = client.put(f"/api/bom/components/{cid}", json=payload)
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2


def test_stale_version_returns_409():
    comp = _create("LIB-VER-B")
    cid = comp["id"]
    base = _get(cid)  # version 1

    # Un premier poste enregistre -> version passe à 2.
    first = client.put(f"/api/bom/components/{cid}", json={**base, "value": "poste1", "version": 1})
    assert first.status_code == 200
    assert first.json()["version"] == 2

    # Un second poste, parti de la version 1, tente d'écrire -> conflit.
    conflict = client.put(f"/api/bom/components/{cid}", json={**base, "value": "poste2", "version": 1})
    assert conflict.status_code == 409
    detail = conflict.json()["detail"]
    assert detail["code"] == "version_conflict"
    assert detail["current"]["version"] == 2
    # La valeur n'a PAS été écrasée par le poste 2.
    assert _get(cid)["value"] == "poste1"


def test_put_without_version_is_tolerated():
    comp = _create("LIB-VER-C")
    cid = comp["id"]
    base = _get(cid)
    base.pop("version", None)
    res = client.put(f"/api/bom/components/{cid}", json=base)
    assert res.status_code == 200
    assert res.json()["version"] == 2
