"""
Tests for BOM Import endpoints.
"""
import json
import os
import sys
from io import BytesIO
import tempfile
from openpyxl import Workbook, load_workbook

from sqlalchemy.orm import Session
from tests.conftest import client, TestingSessionLocal

def test_bom_import_missing_file():
    """Test BOM import without file fails"""
    response = client.post("/api/bom/import", params={"reference": "TEST"})
    assert response.status_code in [422, 400]  # Unprocessable or bad request


def test_bom_import_with_valid_file():
    """Test BOM import with a valid BOM file"""
    # Create a test BOM file
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10 0805 10.0 20.0 0 R
R2 4.7k 0805 15.0 25.0 0 R
C1 100nf 0805 20.0 30.0 0 C
C2 10uf 1206 25.0 35.0 90 C
U1 STM32F103 LQFP48 30.0 40.0 0 U
"""
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name
    
    try:
        # Upload file using multipart form data
        with open(temp_path, 'rb') as f:
            files = {'file': ('test_bom.txt', f, 'text/plain')}
            response = client.post(
                "/api/bom/import",
                files=files,
                params={
                    "reference": "AMPLI_GEN6",
                    "revision": "REV_A",
                    "side": "TOP",
                    "description": "Test BOM",
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert data["item_count"] == 5
        assert "bom_reference_id" in data
        assert "bom_revision_id" in data
        assert all("id" in item for item in data["items"])
        assert all("component_library_missing" in item for item in data["items"])

    finally:
        os.unlink(temp_path)


def test_bom_import_applies_existing_footprint_mapping():
    """Test that import reuses stored Eagle -> PnP mappings."""
    client.post(
        "/api/bom/mappings/footprints",
        json={"footprint_eagle": "0805", "footprint_pnp": "PASSIVE_0805"},
    )

    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10 0805 10.0 20.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('mapped_bom.txt', f, 'text/plain')}
            response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "MAPPED_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["items"][0]["footprint_pnp"] == "PASSIVE_0805"
    finally:
        os.unlink(temp_path)


def test_bom_import_uses_component_library_for_footprint_mapping():
    """Test that import can infer Eagle -> PnP footprint mapping from the component library."""
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Component Library"
    worksheet.append(["Value", "MPN", "EagleFootprint", "MachineFootprint", "FeederType"])
    worksheet.append(["10R", "RES-10R", "0805", "PASSIVE_0805", "8mm"])

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    library_response = client.post(
        "/api/bom/components/library/import",
        files={
            "file": (
                "component_library.xlsx",
                buffer.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert library_response.status_code == 200

    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R 0805 10.0 20.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('library_mapped_bom.txt', f, 'text/plain')}
            response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "LIBRARY_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["items"][0]["footprint_pnp"] == "PASSIVE_0805"
        assert data["items"][0]["component_library_missing"] is False
        assert data["items"][0]["component_library_name"] == "RES-10R"
    finally:
        os.unlink(temp_path)


def test_bom_import_prefers_component_library_mapping_over_stale_duplicate_mappings():
    """Import should ignore stale self-mappings when the component library has the correct PnP value."""
    db: Session = TestingSessionLocal()
    try:
        db.add(
            Component(
                reference="LIB-OPA828",
                value="OPA828IDGNT",
                mpn="OPA828IDGNT",
                footprint_eagle="SOP65P490X110-9N",
                footprint_pnp="SOIC-8",
                package="SOIC-8",
            )
        )
        db.add_all(
            [
                FootprintMapping(
                    footprint_eagle="SOP65P490X110-9N",
                    footprint_pnp="SOIC-8",
                ),
                FootprintMapping(
                    footprint_eagle="SOP65P490X110-9N",
                    footprint_pnp="SOP65P490X110-9N",
                ),
                FootprintMapping(
                    footprint_eagle="SOP65P490X110-9N",
                    footprint_pnp="SOP65P490X110-9N",
                ),
            ]
        )
        db.commit()
    finally:
        db.close()

    bom_content = """Reference Value Footprint X Y Rotation Type
IC2 OPA828IDGNT SOP65P490X110-9N 10.0 20.0 0 IC
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('opa828_bom.txt', f, 'text/plain')}
            response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "OPA_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["items"][0]["footprint_pnp"] == "SOIC-8"
        assert data["items"][0]["component_library_missing"] is False
        assert data["items"][0]["component_library_name"] == "OPA828IDGNT"
    finally:
        os.unlink(temp_path)


def test_bom_import_marks_missing_component_library_items():
    """Test that import flags BOM items that do not exist in the component library."""
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 4.7k 0805 10.0 20.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('unknown_component_bom.txt', f, 'text/plain')}
            response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "UNKNOWN_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["items"][0]["component_library_missing"] is True
        assert data["items"][0]["proposed_component_name"] == "4.7K"
    finally:
        os.unlink(temp_path)


def test_resolve_missing_components_registers_component_library_entry():
    """Test registering a missing component from imported BOM items."""
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R 0805 10.0 20.0 0 R
R2 10R 0805 15.0 25.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('register_missing_component.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "REGISTER_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        import_data = import_response.json()
        item_ids = [item["id"] for item in import_data["items"]]

        resolve_response = client.post(
            f"/api/bom/{import_data['bom_reference_id']}/revisions/{import_data['bom_revision_id']}/missing-components/resolve",
            json={
                "action": "register",
                "item_ids": item_ids,
                "component_name": "RES-10R-0805",
            },
        )

        assert resolve_response.status_code == 200
        resolve_data = resolve_response.json()
        assert resolve_data["component"]["value"] == "RES-10R-0805"
        assert resolve_data["component"]["mpn"] is None
        assert resolve_data["component"]["description"] == "10R"
        assert all(item["component_library_missing"] is False for item in resolve_data["items"])
        assert all(item["component_library_name"] == "RES-10R-0805" for item in resolve_data["items"])

        list_response = client.get("/api/bom/components?value=RES-10R-0805")
        assert list_response.status_code == 200
        components = list_response.json()
        assert any(component["value"] == "RES-10R-0805" for component in components)
    finally:
        os.unlink(temp_path)


def test_resolve_missing_components_can_delete_items_from_revision():
    """Test removing unresolved BOM items directly from the current revision."""
    bom_content = """Reference Value Footprint X Y Rotation Type
D1 LED RED_0603 10.0 20.0 0 D
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('delete_missing_component.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "DELETE_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        import_data = import_response.json()
        item_id = import_data["items"][0]["id"]

        delete_response = client.post(
            f"/api/bom/{import_data['bom_reference_id']}/revisions/{import_data['bom_revision_id']}/missing-components/resolve",
            json={
                "action": "delete",
                "item_ids": [item_id],
            },
        )

        assert delete_response.status_code == 200
        delete_data = delete_response.json()
        assert delete_data["item_count"] == 0
        assert delete_data["items"] == []

        items_response = client.get(
            f"/api/bom/{import_data['bom_reference_id']}/revisions/{import_data['bom_revision_id']}/items"
        )
        assert items_response.status_code == 200
        assert items_response.json() == []
    finally:
        os.unlink(temp_path)


def test_resolve_missing_footprints_registers_mapping_and_updates_items():
    """Test saving a missing PnP footprint during the import flow."""
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R resc1608x55n 10.0 20.0 0 R
R2 10R resc1608x55n 15.0 25.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('missing_pnp_bom.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "FOOTPRINT_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        import_data = import_response.json()
        item_ids = [item["id"] for item in import_data["items"]]
        assert all(item["footprint_pnp"] is None for item in import_data["items"])

        resolve_response = client.post(
            f"/api/bom/{import_data['bom_reference_id']}/revisions/{import_data['bom_revision_id']}/missing-footprints/resolve",
            json={
                "item_ids": item_ids,
                "footprint_pnp": "R_0603",
            },
        )

        assert resolve_response.status_code == 200
        resolve_data = resolve_response.json()
        assert all(item["footprint_pnp"] == "R_0603" for item in resolve_data["items"])

        mappings_response = client.get("/api/bom/mappings/footprints?search=resc1608x55n")
        assert mappings_response.status_code == 200
        mappings = mappings_response.json()
        assert len(mappings) == 1
        assert mappings[0]["footprint_pnp"] == "R_0603"
    finally:
        os.unlink(temp_path)


def test_update_bom_item_inline_saves_mapping_and_updates_matching_items():
    """Test inline footprint editing from Import BOM and immediate mapping persistence."""
    client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-R-1",
            "value": "10R",
            "footprint_eagle": "RESC1608X55N",
            "footprint_pnp": None,
        },
    )
    client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-R-2",
            "value": "47R",
            "footprint_eagle": "RESC1608X55N",
            "footprint_pnp": None,
        },
    )

    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R resc1608x55n 10.0 20.0 0 R
R2 10R resc1608x55n 15.0 25.0 0 R
C1 100nF capc1608x90n 20.0 30.0 0 C
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('inline_update_bom.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "INLINE_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        import_data = import_response.json()
        bom_ref_id = import_data["bom_reference_id"]
        bom_rev_id = import_data["bom_revision_id"]
        target_item_id = import_data["items"][0]["id"]

        update_response = client.patch(
            f"/api/bom/{bom_ref_id}/revisions/{bom_rev_id}/items/{target_item_id}",
            json={
                "footprint_pnp": "R_0603",
                "create_mapping": True,
            },
        )

        assert update_response.status_code == 200
        update_data = update_response.json()
        resistor_items = [
            item for item in update_data["items"]
            if str(item["footprint_eagle"] or "").upper() == "RESC1608X55N"
        ]
        assert len(resistor_items) == 2
        assert all(item["footprint_pnp"] == "R_0603" for item in resistor_items)

        mappings_response = client.get("/api/bom/mappings/footprints?search=resc1608x55n")
        assert mappings_response.status_code == 200
        mappings = mappings_response.json()
        assert len(mappings) == 1
        assert mappings[0]["footprint_pnp"] == "R_0603"

        components_response = client.get("/api/bom/components?footprint_eagle=RESC1608X55N")
        assert components_response.status_code == 200
        components = components_response.json()
        assert len(components) == 2
        assert all(component["footprint_pnp"] == "R_0603" for component in components)
        assert all(component["package"] == "R_0603" for component in components)
    finally:
        os.unlink(temp_path)


def test_load_saved_bom_session_reuses_existing_footprint_mapping_for_other_boms():
    """A mapping learned on one BOM should hydrate another already-imported BOM on session reload."""
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R resc1608x55n 10.0 20.0 0 R
R2 10R resc1608x55n 15.0 25.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as file_a:
        file_a.write(bom_content)
        path_a = file_a.name

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as file_b:
        file_b.write(bom_content)
        path_b = file_b.name

    try:
        with open(path_a, 'rb') as file_handle_a:
            import_a = client.post(
                "/api/bom/import",
                files={'file': ('batch_a.txt', file_handle_a, 'text/plain')},
                params={"reference": "BATCH_CARD", "revision": "REV_A", "side": "TOP"},
            )

        with open(path_b, 'rb') as file_handle_b:
            import_b = client.post(
                "/api/bom/import",
                files={'file': ('batch_b.txt', file_handle_b, 'text/plain')},
                params={"reference": "BATCH_CARD", "revision": "REV_A", "side": "BOT"},
            )

        assert import_a.status_code == 200
        assert import_b.status_code == 200

        import_a_data = import_a.json()
        import_b_data = import_b.json()
        assert all(item["footprint_pnp"] is None for item in import_a_data["items"])
        assert all(item["footprint_pnp"] is None for item in import_b_data["items"])

        resolve_response = client.post(
            f"/api/bom/{import_a_data['bom_reference_id']}/revisions/{import_a_data['bom_revision_id']}/missing-footprints/resolve",
            json={
                "item_ids": [item["id"] for item in import_a_data["items"]],
                "footprint_pnp": "R_0603",
            },
        )
        assert resolve_response.status_code == 200

        session_response = client.get(f"/api/bom/files/{import_b_data['bom_revision_id']}/session")
        assert session_response.status_code == 200
        session_data = session_response.json()
        assert all(item["footprint_pnp"] == "R_0603" for item in session_data["items"])

        items_response = client.get(
            f"/api/bom/{import_b_data['bom_reference_id']}/revisions/{import_b_data['bom_revision_id']}/items"
        )
        assert items_response.status_code == 200
        persisted_items = items_response.json()
        assert all(item["footprint_pnp"] == "R_0603" for item in persisted_items)
    finally:
        os.unlink(path_a)
        os.unlink(path_b)


