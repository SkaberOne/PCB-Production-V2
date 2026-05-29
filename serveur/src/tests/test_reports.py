"""
Tests for /api/reports/* endpoints.

Covers:
- GET /reports/overview
- GET /reports/bom-stats  (with and without production_id)
- GET /reports/bom-stats  with dnp=NULL rows (regression: was under-counted)
- GET /reports/machines
- GET /reports/components/top
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tests.conftest import client, TestingSessionLocal
from src.models.bom import BomItem, BomReference, BomRevision
from src.models.commands import Command, CommandItem
from src.models.machines import PnpMachine
from src.models.production import Production, ProductionBomRevision


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _create_bom_revision(db, reference="TEST_REF", revision="REV_A", side="TOP"):
    ref = BomReference(reference=reference)
    db.add(ref)
    db.flush()
    rev = BomRevision(bom_ref_id=ref.id, revision=revision, type=side)
    db.add(rev)
    db.flush()
    return ref, rev


def _add_item(db, revision_id, ref="R1", footprint_pnp=None, component_type="RESISTOR", dnp=False):
    item = BomItem(
        bom_revision_id=revision_id,
        reference_item=ref,
        value_raw="10k",
        value_harmonized="10k",
        footprint_eagle="R0402",
        footprint_pnp=footprint_pnp,
        component_type=component_type,
        quantity=1,
        dnp=dnp,
    )
    db.add(item)
    db.flush()
    return item


def _add_item_null_dnp(db, revision_id, ref="R_NULL"):
    """Insert a BOM item with dnp=NULL to reproduce the legacy-data scenario."""
    item = BomItem(
        bom_revision_id=revision_id,
        reference_item=ref,
        value_raw="1k",
        footprint_eagle="R0402",
        footprint_pnp=None,   # no PnP footprint → should appear in items_to_verify
        component_type=None,
        quantity=1,
    )
    # Bypass Python default to force NULL in the column
    db.add(item)
    db.flush()
    db.execute(
        f"UPDATE BOM_ITEMS SET dnp = NULL WHERE id = {item.id}"
    )
    db.flush()
    return item


# ---------------------------------------------------------------------------
# GET /reports/overview
# ---------------------------------------------------------------------------

def test_overview_empty_db():
    """Overview returns zero counts on empty DB."""
    response = client.get("/api/reports/overview")
    assert response.status_code == 200
    data = response.json()
    assert "totals" in data
    assert data["totals"]["bom_references"] == 0
    assert data["totals"]["components"] == 0
    assert "commands_by_status" in data


def test_overview_counts_correctly():
    """Overview reflects objects actually inserted."""
    with TestingSessionLocal() as db:
        ref = BomReference(reference="OVW_REF")
        db.add(ref)
        db.flush()
        rev = BomRevision(bom_ref_id=ref.id, revision="REV_A", type="TOP")
        db.add(rev)
        db.commit()

    response = client.get("/api/reports/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["totals"]["bom_references"] == 1
    assert data["totals"]["bom_revisions"] == 1


# ---------------------------------------------------------------------------
# GET /reports/bom-stats
# ---------------------------------------------------------------------------

def test_bom_stats_empty_db():
    """bom-stats returns zeros when DB is empty."""
    response = client.get("/api/reports/bom-stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_items"] == 0
    assert data["items_with_footprint_pnp"] == 0
    assert data["items_to_verify"] == 0


def test_bom_stats_counts_correctly():
    """items_to_verify counts non-DNP items missing footprint or type."""
    with TestingSessionLocal() as db:
        _, rev = _create_bom_revision(db)
        # OK item: has footprint_pnp and component_type
        _add_item(db, rev.id, ref="R1", footprint_pnp="R0402", component_type="RESISTOR", dnp=False)
        # Missing footprint_pnp → to verify
        _add_item(db, rev.id, ref="R2", footprint_pnp=None, component_type="RESISTOR", dnp=False)
        # Missing component_type → to verify
        _add_item(db, rev.id, ref="C1", footprint_pnp="C0402", component_type=None, dnp=False)
        # DNP → should NOT count in items_to_verify
        _add_item(db, rev.id, ref="R3", footprint_pnp=None, component_type=None, dnp=True)
        db.commit()

    response = client.get("/api/reports/bom-stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_items"] == 4
    assert data["items_with_footprint_pnp"] == 2   # R1 + C1
    assert data["items_to_verify"] == 2             # R2 + C1


def test_bom_stats_dnp_null_not_excluded():
    """Regression: dnp=NULL rows must appear in items_to_verify (not silently excluded)."""
    with TestingSessionLocal() as db:
        _, rev = _create_bom_revision(db, reference="DNP_NULL_TEST")
        # One normal OK item
        _add_item(db, rev.id, ref="R1", footprint_pnp="R0402", component_type="RESISTOR", dnp=False)
        # One item with dnp=NULL and missing footprint → must count in items_to_verify
        _add_item_null_dnp(db, rev.id, ref="R_NULL")
        db.commit()

    response = client.get("/api/reports/bom-stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_items"] == 2
    # R_NULL has no footprint_pnp → must appear in items_to_verify
    assert data["items_to_verify"] == 1


def test_bom_stats_scoped_to_production():
    """bom-stats with production_id only counts BOM items linked to that production."""
    with TestingSessionLocal() as db:
        _, rev_a = _create_bom_revision(db, reference="PROD_A")
        _, rev_b = _create_bom_revision(db, reference="PROD_B")
        # rev_a: 3 items, 1 to_verify
        _add_item(db, rev_a.id, ref="R1", footprint_pnp="R0402", component_type="RESISTOR")
        _add_item(db, rev_a.id, ref="R2", footprint_pnp=None, component_type="RESISTOR")
        _add_item(db, rev_a.id, ref="R3", footprint_pnp="R0402", component_type="RESISTOR")
        # rev_b: 2 items (should not appear in scoped query)
        _add_item(db, rev_b.id, ref="C1", footprint_pnp=None, component_type=None)
        _add_item(db, rev_b.id, ref="C2", footprint_pnp="C0402", component_type="CAPACITOR")

        prod = Production(name="PROD_SCOPE_TEST")
        db.add(prod)
        db.flush()
        db.add(ProductionBomRevision(production_id=prod.id, bom_revision_id=rev_a.id))
        db.commit()
        prod_id = prod.id

    response = client.get(f"/api/reports/bom-stats?production_id={prod_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["production_id"] == prod_id
    assert data["total_items"] == 3        # only rev_a
    assert data["items_to_verify"] == 1    # only R2


def test_bom_stats_invalid_production_id():
    """bom-stats with non-existent production_id returns zeros (no 404)."""
    response = client.get("/api/reports/bom-stats?production_id=99999")
    assert response.status_code == 200
    data = response.json()
    assert data["total_items"] == 0


# ---------------------------------------------------------------------------
# GET /reports/machines
# ---------------------------------------------------------------------------

def test_machines_empty():
    """Machine utilization returns empty list when no machines exist."""
    response = client.get("/api/reports/machines")
    assert response.status_code == 200
    assert response.json() == []


def test_machines_utilization():
    """Machine utilization reflects plan and assignment counts."""
    # Create machine via API
    resp = client.post(
        "/api/marketplace/machines",
        json={"name": "UTIL_MACHINE", "num_positions": 40},
    )
    assert resp.status_code == 200
    machine_id = resp.json()["machine_id"]

    response = client.get("/api/reports/machines")
    assert response.status_code == 200
    machines = response.json()
    machine = next(m for m in machines if m["machine_id"] == machine_id)
    assert machine["machine_name"] == "UTIL_MACHINE"
    assert machine["plans"] == 0
    assert machine["assignments"] == 0


def test_machines_utilization_no_n_plus_1():
    """Inserting multiple machines should still use a fixed number of DB queries.

    This is a smoke-test: if N+1 were present, this would be slow (or we'd
    count queries with a SQLAlchemy event listener). Here we just assert the
    endpoint returns correct data for all machines in one call.
    """
    for i in range(5):
        client.post(
            "/api/marketplace/machines",
            json={"name": f"BATCH_MACHINE_{i}", "num_positions": 20},
        )

    response = client.get("/api/reports/machines")
    assert response.status_code == 200
    names = {m["machine_name"] for m in response.json()}
    for i in range(5):
        assert f"BATCH_MACHINE_{i}" in names


# ---------------------------------------------------------------------------
# GET /reports/components/top
# ---------------------------------------------------------------------------

def test_top_components_empty():
    """Top components returns empty list on empty DB."""
    response = client.get("/api/reports/components/top")
    assert response.status_code == 200
    assert response.json() == []


def test_top_components_limit_param():
    """limit query param is validated (ge=1, le=50)."""
    assert client.get("/api/reports/components/top?limit=0").status_code == 422
    assert client.get("/api/reports/components/top?limit=51").status_code == 422
    assert client.get("/api/reports/components/top?limit=5").status_code == 200
