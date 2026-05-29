"""
Tests for Health endpoint and Component Database endpoints.
"""
import json
import os
import sys
from io import BytesIO
import tempfile
from openpyxl import Workbook, load_workbook

from sqlalchemy.orm import Session
from tests.conftest import client, TestingSessionLocal

def test_health_check():
    """Test health check endpoint"""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_root_endpoint():
    """Test root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    assert "ECB Production Manager API" in response.json()["message"]


# ============================================================================
# Test Component Database Endpoints
# ============================================================================

def test_create_component():
    """Test creating a new component"""
    component_data = {
        "reference": "RESC0805",
        "value": "10K",
        "package": "0805",
        "supplier_code": "RC0603JR-0710KL",
        "pitch_mm": 0.8,
        "description": "10k Ohm resistor",
        "notes": "Common resistor value",
    }
    
    response = client.post("/api/bom/components", json=component_data)
    assert response.status_code == 200
    data = response.json()
    assert data["reference"] == "RESC0805"
    assert data["value"] == "10K"
    assert data["package"] == "0805"
    assert data["footprint_pnp"] == "0805"
    assert data["pitch_mm"] == 0.8
    assert "id" in data


def test_create_duplicate_component_fails():
    """Test that creating duplicate component fails"""
    component_data = {
        "reference": "RESC0805",
        "value": "10K",
        "package": "0805",
    }
    
    # Create first component
    response1 = client.post("/api/bom/components", json=component_data)
    assert response1.status_code == 200
    
    # Try to create duplicate
    response2 = client.post("/api/bom/components", json=component_data)
    assert response2.status_code == 409  # Conflict


def test_list_components():
    """Test listing components"""
    # Create a component first
    component_data = {"reference": "CAPC0805", "value": "100nF", "package": "0805"}
    client.post("/api/bom/components", json=component_data)
    
    # List all components
    response = client.get("/api/bom/components")
    assert response.status_code == 200
    components = response.json()
    assert len(components) > 0


def test_list_components_with_filter():
    """Test listing components with filter"""
    # Create components
    client.post("/api/bom/components", json={"reference": "RESC0805", "value": "10K"})
    client.post("/api/bom/components", json={"reference": "CAPC0805", "value": "100nF"})
    
    # Filter by reference
    response = client.get("/api/bom/components?reference=RES")
    assert response.status_code == 200
    components = response.json()
    assert all("RES" in c["reference"] for c in components)


def test_list_components_supports_search_pagination_and_total_header():
    """List endpoint should expose a stable total count for paginated UIs."""
    client.post("/api/bom/components", json={"reference": "LIB-OPA828", "value": "OPA828IDGNT", "mpn": "OPA828IDGNT"})
    client.post("/api/bom/components", json={"reference": "LIB-OPA827", "value": "OPA827IDGNT", "mpn": "OPA827IDGNT"})
    client.post("/api/bom/components", json={"reference": "LIB-NE5532", "value": "NE5532", "mpn": "NE5532DR"})

    response = client.get("/api/bom/components?search=OPA&limit=1")
    assert response.status_code == 200
    assert response.headers["x-total-count"] == "2"
    components = response.json()
    assert len(components) == 1
    assert "OPA" in components[0]["reference"]


def test_list_components_accepts_large_limit_for_full_settings_view():
    """Settings page can request a single page containing the whole component library."""
    client.post("/api/bom/components", json={"reference": "LIB-A", "value": "ALPHA"})
    client.post("/api/bom/components", json={"reference": "LIB-B", "value": "BETA"})
    client.post("/api/bom/components", json={"reference": "LIB-C", "value": "GAMMA"})

    response = client.get("/api/bom/components?limit=10000&sort_by=id&sort_dir=asc")
    assert response.status_code == 200
    assert response.headers["x-total-count"] == "3"
    assert len(response.json()) == 3


def test_list_component_type_rules_seeds_defaults():
    """The settings page should be able to load the editable type-rule catalog."""
    response = client.get("/api/bom/component-type-rules")
    assert response.status_code == 200
    rules = response.json()
    assert len(rules) > 5
    prefixes = {rule["reference_prefix"] for rule in rules}
    assert {"R", "C", "LED", "U$"}.issubset(prefixes)


def test_create_and_update_component_type_rule():
    """Users should be able to add or adjust inference rules from the settings page."""
    create_response = client.post(
        "/api/bom/component-type-rules",
        json={
            "reference_prefix": "ANT",
            "mapped_type": "MODULE",
            "requires_confirmation": True,
            "priority": 35,
            "enabled": True,
            "description": "Antenna references are reviewed as modules",
        },
    )
    assert create_response.status_code == 200
    created_rule = create_response.json()
    assert created_rule["reference_prefix"] == "ANT"
    assert created_rule["mapped_type"] == "MODULE"
    assert created_rule["requires_confirmation"] is True

    update_response = client.put(
        f"/api/bom/component-type-rules/{created_rule['id']}",
        json={
            "reference_prefix": "ANT",
            "mapped_type": "CONNECTOR",
            "requires_confirmation": False,
            "priority": 25,
            "enabled": False,
            "description": "Handled manually as connector-like hardware",
        },
    )
    assert update_response.status_code == 200
    updated_rule = update_response.json()
    assert updated_rule["mapped_type"] == "CONNECTOR"
    assert updated_rule["requires_confirmation"] is False
    assert updated_rule["priority"] == 25
    assert updated_rule["enabled"] is False

    db = TestingSessionLocal()
    try:
        stored_rule = db.query(ComponentTypeRule).filter(ComponentTypeRule.id == created_rule["id"]).first()
        assert stored_rule is not None
        assert stored_rule.mapped_type == "CONNECTOR"
    finally:
        db.close()


def test_delete_component_type_rule_and_reset_defaults():
    """Users should be able to delete custom/default rules and restore the default catalog."""
    initial_response = client.get("/api/bom/component-type-rules")
    assert initial_response.status_code == 200
    initial_rules = initial_response.json()
    initial_count = len(initial_rules)
    assert any(rule["reference_prefix"] == "Z" for rule in initial_rules)

    create_response = client.post(
        "/api/bom/component-type-rules",
        json={
            "reference_prefix": "ANT",
            "mapped_type": "MODULE",
            "requires_confirmation": False,
            "priority": 35,
            "enabled": True,
            "description": "Antenna references are reviewed as modules",
        },
    )
    assert create_response.status_code == 200
    created_rule = create_response.json()

    delete_custom_response = client.delete(f"/api/bom/component-type-rules/{created_rule['id']}")
    assert delete_custom_response.status_code == 200
    assert delete_custom_response.json()["success"] is True

    delete_default_rule = next(rule for rule in initial_rules if rule["reference_prefix"] == "Z")
    delete_default_response = client.delete(f"/api/bom/component-type-rules/{delete_default_rule['id']}")
    assert delete_default_response.status_code == 200

    after_delete_response = client.get("/api/bom/component-type-rules")
    assert after_delete_response.status_code == 200
    after_delete_rules = after_delete_response.json()
    after_delete_prefixes = {rule["reference_prefix"] for rule in after_delete_rules}
    assert "ANT" not in after_delete_prefixes
    assert "Z" not in after_delete_prefixes

    reset_response = client.post("/api/bom/component-type-rules/reset")
    assert reset_response.status_code == 200
    assert reset_response.json()["success"] is True
    assert reset_response.json()["rule_count"] == initial_count

    after_reset_response = client.get("/api/bom/component-type-rules")
    assert after_reset_response.status_code == 200
    after_reset_rules = after_reset_response.json()
    after_reset_prefixes = {rule["reference_prefix"] for rule in after_reset_rules}
    assert "ANT" not in after_reset_prefixes
    assert "Z" in after_reset_prefixes


def test_duplicate_and_export_component_type_rule_catalog():
    """Users should be able to duplicate a rule and export the current catalog."""
    list_response = client.get("/api/bom/component-type-rules")
    assert list_response.status_code == 200
    source_rule = next(rule for rule in list_response.json() if rule["reference_prefix"] == "LED")

    duplicate_response = client.post(f"/api/bom/component-type-rules/{source_rule['id']}/duplicate")
    assert duplicate_response.status_code == 200
    duplicated_rule = duplicate_response.json()
    assert duplicated_rule["reference_prefix"].startswith("LED_COPY")
    assert duplicated_rule["mapped_type"] == source_rule["mapped_type"]
    assert duplicated_rule["requires_confirmation"] == source_rule["requires_confirmation"]

    export_response = client.get("/api/bom/component-type-rules/export")
    assert export_response.status_code == 200
    assert export_response.headers["content-type"].startswith("application/json")
    payload = json.loads(export_response.content.decode("utf-8"))
    assert payload["version"] == 1
    exported_prefixes = {rule["reference_prefix"] for rule in payload["rules"]}
    assert "LED" in exported_prefixes
    assert duplicated_rule["reference_prefix"] in exported_prefixes


def test_import_component_type_rules_upserts_json_payload():
    """Rule imports should create or update entries from JSON payloads."""
    import_payload = {
        "version": 1,
        "rules": [
            {
                "reference_prefix": "ANT",
                "mapped_type": "MODULE",
                "requires_confirmation": True,
                "priority": 35,
                "enabled": True,
                "description": "Imported antenna rule",
            },
            {
                "reference_prefix": "R",
                "mapped_type": "RESISTOR",
                "requires_confirmation": False,
                "priority": 80,
                "enabled": True,
                "description": "Imported resistor override",
            },
        ],
    }

    import_response = client.post(
        "/api/bom/component-type-rules/import",
        files={"file": ("component_type_rules.json", json.dumps(import_payload).encode("utf-8"), "application/json")},
    )
    assert import_response.status_code == 200
    response_payload = import_response.json()
    assert response_payload["created_count"] == 1
    assert response_payload["updated_count"] == 1
    assert response_payload["skipped_count"] == 0

    rules_response = client.get("/api/bom/component-type-rules")
    assert rules_response.status_code == 200
    rules_by_prefix = {rule["reference_prefix"]: rule for rule in rules_response.json()}
    assert rules_by_prefix["ANT"]["mapped_type"] == "MODULE"
    assert rules_by_prefix["ANT"]["requires_confirmation"] is True
    assert rules_by_prefix["R"]["priority"] == 80
    assert rules_by_prefix["R"]["description"] == "Imported resistor override"


def test_reorder_component_type_rules_updates_listing_order():
    """Manual rule ordering should be persisted through the reorder endpoint."""
    initial_response = client.get("/api/bom/component-type-rules")
    assert initial_response.status_code == 200
    initial_rules = initial_response.json()
    assert len(initial_rules) > 3

    initial_ids = [rule["id"] for rule in initial_rules]
    reordered_ids = [initial_ids[1], initial_ids[0], *initial_ids[2:]]

    reorder_response = client.post(
        "/api/bom/component-type-rules/reorder",
        json={"ordered_rule_ids": reordered_ids},
    )
    assert reorder_response.status_code == 200
    assert reorder_response.json()["success"] is True
    assert reorder_response.json()["rule_count"] == len(initial_ids)

    after_response = client.get("/api/bom/component-type-rules")
    assert after_response.status_code == 200
    after_rules = after_response.json()
    after_ids = [rule["id"] for rule in after_rules]
    assert after_ids[:2] == reordered_ids[:2]
    assert after_rules[0]["priority"] < after_rules[1]["priority"]


def test_replace_component_type_rules_restores_catalog_snapshot():
    """Undo flows should be able to restore a full rule snapshot."""
    initial_response = client.get("/api/bom/component-type-rules")
    assert initial_response.status_code == 200
    initial_rules = initial_response.json()
    assert len(initial_rules) > 5

    edited_rules = []
    for rule in initial_rules[:3]:
        edited_rules.append({
            "reference_prefix": rule["reference_prefix"],
            "mapped_type": rule["mapped_type"],
            "requires_confirmation": rule["requires_confirmation"],
            "priority": rule["priority"],
            "enabled": rule["enabled"],
            "description": rule["description"],
        })
    edited_rules[0]["priority"] = 5
    edited_rules[1]["mapped_type"] = "MODULE"

    replace_response = client.post(
        "/api/bom/component-type-rules/replace",
        json={"rules": edited_rules},
    )
    assert replace_response.status_code == 200
    assert replace_response.json()["success"] is True
    assert replace_response.json()["rule_count"] == len(edited_rules)

    after_response = client.get("/api/bom/component-type-rules")
    assert after_response.status_code == 200
    after_rules = after_response.json()
    assert len(after_rules) == len(edited_rules)
    assert after_rules[0]["priority"] == 5
    assert any(rule["mapped_type"] == "MODULE" for rule in after_rules)


def test_list_components_supports_sorting():
    """Component list should support stable column sorting for the settings table."""
    client.post("/api/bom/components", json={"reference": "LIB-A", "value": "ALPHA", "mpn": "AAA"})
    client.post("/api/bom/components", json={"reference": "LIB-B", "value": "GAMMA", "mpn": "CCC"})
    client.post("/api/bom/components", json={"reference": "LIB-C", "value": "BETA", "mpn": "BBB"})

    value_response = client.get("/api/bom/components?sort_by=value&sort_dir=asc")
    assert value_response.status_code == 200
    value_references = [component["reference"] for component in value_response.json()]
    assert value_references[:3] == ["LIB-A", "LIB-C", "LIB-B"]

    mpn_response = client.get("/api/bom/components?sort_by=mpn&sort_dir=desc")
    assert mpn_response.status_code == 200
    mpn_references = [component["reference"] for component in mpn_response.json()]
    assert mpn_references[:3] == ["LIB-B", "LIB-C", "LIB-A"]


def test_list_components_supports_component_database_filters():
    """Settings page filters should map to explicit backend query params."""
    cart_response = client.post(
        "/api/marketplace/carts",
        json={
            "name": "FILTRE_FIXE",
            "kind": "COMMON",
            "capacity_positions": 60,
        },
    )
    assert cart_response.status_code == 200
    cart_id = cart_response.json()["cart_id"]

    fixed_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-FIX-10K",
            "value": "10K",
            "package": "R_0603",
            "mpn": "RC0603FR-0710KL",
            "supplier_code": "FARNELL-123",
            "footprint_pnp": "R_0603",
            "feeder_type": "8mm",
            "is_fixed_feeder": True,
            "fixed_cart_id": cart_id,
        },
    )
    assert fixed_response.status_code == 200

    loose_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-LOOSE-100N",
            "value": "100nF",
            "package": "C_0603",
            "mpn": "CL10B104KB8NNNC",
            "supplier_code": "MOUSER-456",
            "footprint_pnp": "C_0603",
            "feeder_type": "12mm",
            "is_fixed_feeder": False,
        },
    )
    assert loose_response.status_code == 200

    response = client.get(
        "/api/bom/components?package=R_0603&feeder_type=8mm&supplier_code=FARNELL&footprint_pnp=R_0603&is_fixed_feeder=true"
    )
    assert response.status_code == 200
    assert response.headers["x-total-count"] == "1"
    components = response.json()
    assert len(components) == 1
    assert components[0]["reference"] == "LIB-FIX-10K"

    non_fixed_response = client.get("/api/bom/components?is_fixed_feeder=false")
    assert non_fixed_response.status_code == 200
    non_fixed_components = non_fixed_response.json()
    assert any(component["reference"] == "LIB-LOOSE-100N" for component in non_fixed_components)
    assert all(component["reference"] != "LIB-FIX-10K" for component in non_fixed_components)


def test_list_components_can_focus_recent_bom_registrations():
    """Settings page should be able to isolate components auto-created from BOM review/import."""
    from_bom_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-FROM-BOM",
            "value": "OPA828",
            "footprint_pnp": "SOIC-8",
            "notes": "Created from BOM Control board REV_H item U15",
        },
    )
    assert from_bom_response.status_code == 200

    manual_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-MANUAL",
            "value": "100nF",
            "footprint_pnp": "0603",
            "notes": "Created manually from Settings",
        },
    )
    assert manual_response.status_code == 200

    filtered_response = client.get("/api/bom/components?created_from_bom=true&sort_by=id&sort_dir=desc")
    assert filtered_response.status_code == 200
    filtered_components = filtered_response.json()
    assert [component["reference"] for component in filtered_components][:1] == ["LIB-FROM-BOM"]
    assert all(
        str(component.get("notes") or "").startswith("Created from BOM")
        for component in filtered_components
    )

    manual_only_response = client.get("/api/bom/components?created_from_bom=false")
    assert manual_only_response.status_code == 200
    manual_only_components = manual_only_response.json()
    assert any(component["reference"] == "LIB-MANUAL" for component in manual_only_components)
    assert all(component["reference"] != "LIB-FROM-BOM" for component in manual_only_components)


def test_get_component():
    """Test getting a specific component"""
    # Create a component
    create_response = client.post(
        "/api/bom/components",
        json={"reference": "RESC0805", "value": "10K"}
    )
    component_id = create_response.json()["id"]
    
    # Get the component
    response = client.get(f"/api/bom/components/{component_id}")
    assert response.status_code == 200
    assert response.json()["reference"] == "RESC0805"


def test_update_component():
    """Test editing an existing component from the settings page."""
    create_response = client.post(
        "/api/bom/components",
        json={
            "reference": "RESC0805",
            "value": "10K",
            "package": "0805",
            "footprint_eagle": "RESC1608X55N",
            "footprint_pnp": "R_0603",
            "pitch_mm": 0.85,
        },
    )
    component_id = create_response.json()["id"]

    update_response = client.put(
        f"/api/bom/components/{component_id}",
        json={
            "id": component_id,
            "reference": "RESC0805",
            "value": "10K 0.1%",
            "mpn": "ERJ-6ENF1002V",
            "package": "",
            "supplier_code": "PAN-10K-0603",
            "footprint_eagle": "RESC1608X55N",
            "footprint_pnp": "R_0603",
            "pitch_mm": 0.75,
            "feeder_type": "8mm",
            "description": "Resistance de precision",
            "notes": "Mis a jour manuellement",
        },
    )

    assert update_response.status_code == 200
    data = update_response.json()
    assert data["value"] == "10K 0.1%"
    assert data["mpn"] == "ERJ-6ENF1002V"
    assert data["package"] == "R_0603"
    assert data["footprint_pnp"] == "R_0603"
    assert data["pitch_mm"] == 0.75
    assert data["notes"] == "Mis a jour manuellement"


def test_import_machine_footprint_catalog_and_autofill_component_fields():
    """Machine-footprint catalog rows should be importable and reusable by component forms."""
    catalog_payload = "\n".join([
        "Type;MachineFootprint;Tape_width_mm;Pitch_mm;Feeder",
        "IC;QFN32_5X5;12;4;12mm",
        "RESISTOR;R_0603;8;4;8mm",
    ]).encode("utf-8")

    import_response = client.post(
        "/api/bom/machine-footprints/import",
        files={
            "file": (
                "machine_footprints.txt",
                BytesIO(catalog_payload),
                "text/plain",
            ),
        },
    )
    assert import_response.status_code == 200
    payload = import_response.json()
    assert payload["created_count"] == 2
    assert payload["updated_count"] == 0
    assert payload["errors"] == []

    list_response = client.get("/api/bom/machine-footprints?search=QFN32")
    assert list_response.status_code == 200
    assert list_response.json() == [
        {
            "id": 1,
            "component_type": "IC",
            "machine_footprint": "QFN32_5X5",
            "tape_width_mm": 12.0,
            "pitch_mm": 4.0,
            "feeder_type": "CL12",
        }
    ]

    create_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-QFN32-AUTO",
            "value": "MCU-QFN32",
            "footprint_pnp": "QFN32_5X5",
        },
    )
    assert create_response.status_code == 200
    component = create_response.json()
    assert component["package"] == "QFN32_5X5"
    assert component["footprint_pnp"] == "QFN32_5X5"
    assert component["component_type"] == "IC"
    assert component["tape_width_mm"] == 12.0
    assert component["pitch_mm"] == 4.0
    assert component["feeder_type"] == "CL12"


def test_import_machine_footprint_catalog_synchronizes_existing_components():
    """Importing the catalog after components exist should enrich missing data in place."""
    create_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-R0603-AUTO",
            "value": "10K",
            "footprint_pnp": "R_0603",
        },
    )
    assert create_response.status_code == 200
    component_id = create_response.json()["id"]

    catalog_payload = "\n".join([
        "Type;MachineFootprint;Tape_width_mm;Pitch_mm;Feeder",
        "RESISTOR;R_0603;8;4;8mm",
    ]).encode("utf-8")

    import_response = client.post(
        "/api/bom/machine-footprints/import",
        files={
            "file": (
                "machine_footprints.txt",
                BytesIO(catalog_payload),
                "text/plain",
            ),
        },
    )
    assert import_response.status_code == 200
    payload = import_response.json()
    assert payload["created_count"] == 1
    assert payload["synchronized_component_count"] == 1

    detail_response = client.get(f"/api/bom/components/{component_id}")
    assert detail_response.status_code == 200
    component = detail_response.json()
    assert component["component_type"] == "RESISTOR"
    assert component["tape_width_mm"] == 8.0
    assert component["pitch_mm"] == 4.0
    assert component["feeder_type"] == "CL8-4"

    db = TestingSessionLocal()
    try:
        assert db.query(MachineFootprintRule).count() == 1
    finally:
        db.close()


def test_import_machine_footprint_catalog_accepts_footprint_alias_and_preserves_variants():
    """The real catalog format can reuse the same footprint with several valid variants."""
    catalog_payload = "\n".join([
        "Type;Footprint;Tape_width_mm;Pitch_mm;Feeder",
        "PASSIF;1206;8;4;CL8-4",
        "PASSIF;1206;8;8;CL8-4",
        "LED;1206;8;4;CL8-4",
    ]).encode("utf-8")

    import_response = client.post(
        "/api/bom/machine-footprints/import",
        files={
            "file": (
                "machine_footprints.txt",
                BytesIO(catalog_payload),
                "text/plain",
            ),
        },
    )
    assert import_response.status_code == 200
    payload = import_response.json()
    assert payload["created_count"] == 7
    assert payload["updated_count"] == 0
    assert payload["errors"] == []

    list_response = client.get("/api/bom/machine-footprints?search=1206")
    assert list_response.status_code == 200
    rows = list_response.json()
    assert len(rows) == 7
    assert {row["component_type"] for row in rows} == {"RESISTOR", "CAPACITOR", "INDUCTOR", "LED"}
    assert {row["pitch_mm"] for row in rows} == {4.0, 8.0}


def test_machine_footprint_defaults_only_apply_unambiguous_fields():
    """Only fields that stay consistent for a footprint should auto-fill without extra context."""
    catalog_payload = "\n".join([
        "Type;Footprint;Tape_width_mm;Pitch_mm;Feeder",
        "PASSIF;1206;8;4;CL8-4",
        "PASSIF;1206;8;8;CL8-4",
        "LED;1206;8;4;CL8-4",
    ]).encode("utf-8")

    import_response = client.post(
        "/api/bom/machine-footprints/import",
        files={
            "file": (
                "machine_footprints.txt",
                BytesIO(catalog_payload),
                "text/plain",
            ),
        },
    )
    assert import_response.status_code == 200

    passive_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-1206-RESISTOR",
            "value": "10uF",
            "component_type": "RESISTOR",
            "footprint_pnp": "1206",
        },
    )
    assert passive_response.status_code == 200
    passive_component = passive_response.json()
    assert passive_component["component_type"] == "RESISTOR"
    assert passive_component["tape_width_mm"] == 8.0
    assert passive_component["feeder_type"] == "CL8-4"
    assert passive_component["pitch_mm"] is None

    generic_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-1206-GENERIC",
            "value": "1206 generic",
            "footprint_pnp": "1206",
        },
    )
    assert generic_response.status_code == 200
    generic_component = generic_response.json()
    assert generic_component["component_type"] is None
    assert generic_component["tape_width_mm"] == 8.0
    assert generic_component["feeder_type"] == "CL8-4"
    assert generic_component["pitch_mm"] is None

    led_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-1206-LED",
            "value": "LED green",
            "component_type": "LED",
            "footprint_pnp": "1206",
        },
    )
    assert led_response.status_code == 200
    led_component = led_response.json()
    assert led_component["component_type"] == "LED"
    assert led_component["tape_width_mm"] == 8.0
    assert led_component["feeder_type"] == "CL8-4"
    assert led_component["pitch_mm"] == 4.0


def test_component_can_be_marked_as_fixed_feeder_with_cart():
    """The component library should expose fixed-feeder metadata and linked cart name."""
    cart_response = client.post(
        "/api/marketplace/carts",
        json={
            "name": "COMPOSANT_RECURRENT",
            "kind": "COMMON",
            "capacity_positions": 80,
        },
    )
    assert cart_response.status_code == 200
    cart_id = cart_response.json()["cart_id"]

    create_response = client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-10K-0603",
            "value": "10K",
            "footprint_eagle": "RESC1608X55N",
            "footprint_pnp": "R_0603",
            "is_fixed_feeder": True,
            "fixed_cart_id": cart_id,
        },
    )

    assert create_response.status_code == 200
    data = create_response.json()
    assert data["is_fixed_feeder"] is True
    assert data["fixed_cart_id"] == cart_id
    assert data["fixed_cart_name"] == "COMPOSANT_RECURRENT"

    list_response = client.get("/api/bom/components")
    assert list_response.status_code == 200
    listed = next(component for component in list_response.json() if component["reference"] == "LIB-10K-0603")
    assert listed["fixed_cart_name"] == "COMPOSANT_RECURRENT"


