"""
Tests for BOM Retrieval and Workflow endpoints, including productions.
"""
import json
import os
import sys
from io import BytesIO
import tempfile
from openpyxl import Workbook, load_workbook

from sqlalchemy.orm import Session
from tests.conftest import client, TestingSessionLocal, bom_file_service

def test_get_bom_not_found():
    """Test getting a BOM that doesn't exist"""
    response = client.get("/api/bom/99999")
    assert response.status_code == 404


def test_list_bom_revisions_not_found():
    """Test listing revisions for non-existent BOM"""
    response = client.get("/api/bom/99999/revisions")
    assert response.status_code == 404


def test_bom_workflow_complete():
    """Test a complete BOM import and retrieval workflow"""
    # Create test BOM content
    bom_content = """Reference Value Footprint X Y Rotation Type
R10 1.5K 0805 10.0 20.0 0 R
C10 22nf 0805 15.0 25.0 0 C
"""
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name
    
    try:
        # Import BOM
        with open(temp_path, 'rb') as f:
            files = {'file': ('amplifier.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={
                    "reference": "AMPLI_GEN6",
                    "revision": "REV_A",
                    "side": "TOP",
                }
            )
        
        assert import_response.status_code == 200
        import_data = import_response.json()
        bom_ref_id = import_data["bom_reference_id"]
        bom_rev_id = import_data["bom_revision_id"]
        
        # Get BOM details
        detail_response = client.get(f"/api/bom/{bom_ref_id}")
        assert detail_response.status_code == 200
        detail_data = detail_response.json()
        assert detail_data["reference"]["reference"] == "AMPLI_GEN6"
        assert len(detail_data["revisions"]) >= 1
        
        # List revisions
        revisions_response = client.get(f"/api/bom/{bom_ref_id}/revisions")
        assert revisions_response.status_code == 200
        revisions_data = revisions_response.json()
        assert len(revisions_data["revisions"]) >= 1
        
        # List items in revision
        items_response = client.get(
            f"/api/bom/{bom_ref_id}/revisions/{bom_rev_id}/items"
        )
        assert items_response.status_code == 200
        items = items_response.json()
        assert len(items) == 2  # 2 components in test file

        revision_response = client.get(f"/api/bom/{bom_ref_id}/revisions/{bom_rev_id}")
        assert revision_response.status_code == 200
        revision_data = revision_response.json()
        assert revision_data["revision"]["id"] == bom_rev_id
        assert len(revision_data["items"]) == 2
        
        # Check harmonization worked
        # R10 should become "1.5K" (uppercase K)
        # C10 should become "22nF" (uppercase F)
        r_item = next((i for i in items if "R10" in i["reference_item"]), None)
        c_item = next((i for i in items if "C10" in i["reference_item"]), None)
        
        if r_item:
            assert r_item["value_harmonized"] == "1.5K"
        if c_item:
            assert c_item["value_harmonized"] == "22nF"
    
    finally:
        os.unlink(temp_path)


def test_save_bom_review_updates_items_and_creates_mapping():
    """Test saving review edits and persisting a new footprint mapping."""
    client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-REVIEW-1",
            "value": "10R",
            "footprint_eagle": "RESC1608X55N",
            "footprint_pnp": None,
        },
    )
    client.post(
        "/api/bom/components",
        json={
            "reference": "LIB-REVIEW-2",
            "value": "22R",
            "footprint_eagle": "RESC1608X55N",
            "footprint_pnp": None,
        },
    )

    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10 resc1608x55n 10.0 20.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('review_bom.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "REVIEW_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        import_data = import_response.json()
        bom_ref_id = import_data["bom_reference_id"]
        bom_rev_id = import_data["bom_revision_id"]
        bom_item_id = import_data["items"][0]["id"]

        review_response = client.put(
            f"/api/bom/{bom_ref_id}/revisions/{bom_rev_id}/review",
            json={
                "items": [
                    {
                        "id": bom_item_id,
                        "value_harmonized": "10R",
                        "footprint_pnp": "R_0603",
                        "notes": "validated by test",
                        "dnp": False,
                    }
                ],
                "create_mappings": True,
                "mark_as_active": True,
            },
        )

        assert review_response.status_code == 200
        review_data = review_response.json()
        assert review_data["revision_status"] == "ACTIVE"
        assert review_data["saved_mapping_count"] == 1
        assert review_data["items"][0]["footprint_pnp"] == "R_0603"
        assert review_data["items"][0]["value_harmonized"] == "10R"

        mappings_response = client.get("/api/bom/mappings/footprints?search=resc1608x55n")
        assert mappings_response.status_code == 200
        mappings = mappings_response.json()
        assert len(mappings) == 1
        assert mappings[0]["footprint_eagle"] == "RESC1608X55N"
        assert mappings[0]["footprint_pnp"] == "R_0603"

        components_response = client.get("/api/bom/components?footprint_eagle=RESC1608X55N")
        assert components_response.status_code == 200
        components = components_response.json()
        assert len(components) == 2
        assert all(component["footprint_pnp"] == "R_0603" for component in components)
        assert all(component["package"] == "R_0603" for component in components)
    finally:
        os.unlink(temp_path)


def test_save_bom_review_persists_dnp_marker_in_snapshot():
    """Reviewed BOM snapshots should preserve the optional DNP marker in text exports."""
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R 0805 10.0 20.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('review_dnp_bom.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "REVIEW_DNP_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        import_data = import_response.json()
        bom_ref_id = import_data["bom_reference_id"]
        bom_rev_id = import_data["bom_revision_id"]
        bom_item_id = import_data["items"][0]["id"]

        review_response = client.put(
            f"/api/bom/{bom_ref_id}/revisions/{bom_rev_id}/review",
            json={
                "items": [
                    {
                        "id": bom_item_id,
                        "value_harmonized": "10R",
                        "footprint_pnp": "0805",
                        "dnp": True,
                    }
                ],
                "create_mappings": False,
                "mark_as_active": True,
            },
        )

        assert review_response.status_code == 200
        snapshot_path = bom_file_service.get_file_path("REVIEW_DNP_CARD", "REV_A", "TOP")
        assert snapshot_path.exists()
        snapshot_content = snapshot_path.read_text(encoding="utf-8")
        assert "Reference Value Footprint X Y Rotation Side DNP" not in snapshot_content
        assert "R1 10R 0805 10 20 0 TOP DNP" in snapshot_content
    finally:
        os.unlink(temp_path)


def test_save_bom_review_rejects_conflicting_footprint_mapping_updates():
    """A single review payload should not silently save two different PnP mappings for the same Eagle footprint."""
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R RESC1608X55N 10.0 20.0 0 R
R2 22R RESC1608X55N 11.0 21.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('review_conflict_bom.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "REVIEW_CONFLICT_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        import_data = import_response.json()
        bom_ref_id = import_data["bom_reference_id"]
        bom_rev_id = import_data["bom_revision_id"]
        [first_item, second_item] = import_data["items"]

        review_response = client.put(
            f"/api/bom/{bom_ref_id}/revisions/{bom_rev_id}/review",
            json={
                "items": [
                    {
                        "id": first_item["id"],
                        "value_harmonized": "10R",
                        "footprint_pnp": "R_0603",
                    },
                    {
                        "id": second_item["id"],
                        "value_harmonized": "22R",
                        "footprint_pnp": "RES_0603_ALT",
                    },
                ],
                "create_mappings": True,
                "mark_as_active": True,
            },
        )

        assert review_response.status_code == 422
        assert "Conflicting PnP footprints" in review_response.json()["detail"]
    finally:
        os.unlink(temp_path)


def test_save_bom_review_requires_confirmation_for_ambiguous_types_only_on_validate():
    """Ambiguous inferred types such as LED should block final validation until confirmed."""
    bom_content = """Reference Value Footprint X Y Rotation Type
LED1 GREEN PLCC-2 10.0 20.0 0 TOP
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as f:
            files = {'file': ('review_led_bom.txt', f, 'text/plain')}
            import_response = client.post(
                "/api/bom/import",
                files=files,
                params={"reference": "REVIEW_LED_CARD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        import_data = import_response.json()
        bom_ref_id = import_data["bom_reference_id"]
        bom_rev_id = import_data["bom_revision_id"]
        bom_item_id = import_data["items"][0]["id"]

        validate_response = client.put(
            f"/api/bom/{bom_ref_id}/revisions/{bom_rev_id}/review",
            json={
                "items": [
                    {
                        "id": bom_item_id,
                        "component_type": "LED",
                        "component_type_confirmed": False,
                    }
                ],
                "create_mappings": False,
                "mark_as_active": True,
            },
        )
        assert validate_response.status_code == 422
        assert "manual type confirmation" in validate_response.json()["detail"]

        draft_response = client.put(
            f"/api/bom/{bom_ref_id}/revisions/{bom_rev_id}/review",
            json={
                "items": [
                    {
                        "id": bom_item_id,
                        "component_type": "LED",
                        "component_type_confirmed": False,
                    }
                ],
                "create_mappings": False,
                "mark_as_active": False,
            },
        )
        assert draft_response.status_code == 200
        assert draft_response.json()["revision_status"] == "DRAFT"
        assert draft_response.json()["items"][0]["component_type"] == "LED"
    finally:
        os.unlink(temp_path)


def test_refresh_component_types_reconciles_bom_items_and_created_components():
    """The refresh endpoint should backfill business families from BOM references."""
    db = TestingSessionLocal()
    try:
        bom_ref = BomReference(reference="TYPE_REFRESH_CARD")
        db.add(bom_ref)
        db.commit()
        db.refresh(bom_ref)

        revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.TOP,
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add(revision)
        db.commit()
        db.refresh(revision)

        resistor_item = BomItem(
            bom_revision_id=revision.id,
            reference_item="R1",
            value_raw="10K",
            value_harmonized="10K",
            footprint_eagle="RES_0603",
            footprint_pnp="0603",
            component_type="R",
        )
        led_item = BomItem(
            bom_revision_id=revision.id,
            reference_item="LED1",
            value_raw="GREEN",
            value_harmonized="GREEN",
            footprint_eagle="LED_0603",
            footprint_pnp="0603",
            component_type=None,
        )
        db.add_all([resistor_item, led_item])
        db.commit()
        db.refresh(resistor_item)
        db.refresh(led_item)

        resistor_component = Component(
            reference="LIB-TYPE-RES",
            value="10K",
            component_type="R",
            footprint_pnp="0603",
            package="0603",
            notes="Created from BOM TYPE_REFRESH_CARD REV_A item R1",
        )
        led_component = Component(
            reference="LIB-TYPE-LED",
            value="GREEN",
            component_type=None,
            footprint_pnp="0603",
            package="0603",
            notes="Created from BOM TYPE_REFRESH_CARD REV_A item LED1",
        )
        preserved_component = Component(
            reference="LIB-TYPE-POWER",
            value="REG",
            component_type="POWER",
            footprint_pnp="SOT223",
            package="SOT223",
            notes="Created from BOM TYPE_REFRESH_CARD REV_A item VR1",
        )
        db.add_all([resistor_component, led_component, preserved_component])
        db.commit()
        db.refresh(resistor_component)
        db.refresh(led_component)
        resistor_item_id = resistor_item.id
        led_item_id = led_item.id
        resistor_component_id = resistor_component.id
        led_component_id = led_component.id
    finally:
        db.close()

    refresh_response = client.post("/api/bom/components/types/refresh")
    assert refresh_response.status_code == 200
    payload = refresh_response.json()
    assert payload["updated_component_count"] == 2
    assert payload["updated_bom_item_count"] == 2
    assert payload["inferred_type_count"] == 2
    assert payload["ambiguous_component_count"] == 1
    assert payload["manual_preserved_count"] == 1
    assert led_component_id in payload["ambiguous_component_ids"]

    db = TestingSessionLocal()
    try:
        refreshed_resistor_item = db.query(BomItem).filter(BomItem.id == resistor_item_id).first()
        refreshed_led_item = db.query(BomItem).filter(BomItem.id == led_item_id).first()
        refreshed_resistor_component = db.query(Component).filter(Component.id == resistor_component_id).first()
        refreshed_led_component = db.query(Component).filter(Component.id == led_component_id).first()
        refreshed_preserved_component = db.query(Component).filter(Component.reference == "LIB-TYPE-POWER").first()

        assert refreshed_resistor_item.component_type == "RESISTOR"
        assert refreshed_led_item.component_type == "LED"
        assert refreshed_resistor_component.component_type == "RESISTOR"
        assert refreshed_led_component.component_type == "LED"
        assert refreshed_preserved_component.component_type == "POWER"
    finally:
        db.close()


def test_rename_saved_bom_file_only_updates_selected_side():
    """Test renaming a stored BOM entry without moving the paired side automatically."""
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R 0805 10.0 20.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, 'rb') as source:
            top_import = client.post(
                "/api/bom/import",
                files={'file': ('triamp_top.txt', source, 'text/plain')},
                params={"reference": "TRIAMP", "revision": "REV_A", "side": "TOP"},
            )
        assert top_import.status_code == 200
        top_revision_id = top_import.json()["bom_revision_id"]

        with open(temp_path, 'rb') as source:
            bot_import = client.post(
                "/api/bom/import",
                files={'file': ('triamp_bot.txt', source, 'text/plain')},
                params={"reference": "TRIAMP", "revision": "REV_A", "side": "BOT"},
            )
        assert bot_import.status_code == 200
        bot_revision_id = bot_import.json()["bom_revision_id"]

        rename_response = client.patch(
            f"/api/bom/files/{top_revision_id}",
            json={"reference": "TRIAMP_FIXED", "revision": "REV_B"},
        )
        assert rename_response.status_code == 200

        files_response = client.get("/api/bom/files")
        assert files_response.status_code == 200
        files = files_response.json()["items"]

        renamed_top = next(item for item in files if item["bom_revision_id"] == top_revision_id)
        untouched_bot = next(item for item in files if item["bom_revision_id"] == bot_revision_id)

        assert renamed_top["reference"] == "TRIAMP_FIXED"
        assert renamed_top["revision"] == "REV_B"
        assert renamed_top["side"] == "TOP"
        assert untouched_bot["reference"] == "TRIAMP"
        assert untouched_bot["revision"] == "REV_A"
        assert untouched_bot["side"] == "BOT"
    finally:
        os.unlink(temp_path)


def test_import_same_logical_bom_reuses_existing_revision():
    """Importing the same reference/revision/side should update the existing logical BOM in place."""
    first_bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R 0805 10.0 20.0 0 R
"""
    second_bom_content = """Reference Value Footprint X Y Rotation Type
C1 100N 0603 11.0 21.0 90 C
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as first_file:
        first_file.write(first_bom_content)
        first_path = first_file.name

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as second_file:
        second_file.write(second_bom_content)
        second_path = second_file.name

    try:
        with open(first_path, "rb") as source:
            first_import = client.post(
                "/api/bom/import",
                files={"file": ("dup_a.txt", source, "text/plain")},
                params={"reference": "TRIAMP_DUP", "revision": "REV_A", "side": "TOP"},
            )
        assert first_import.status_code == 200
        first_revision_id = first_import.json()["bom_revision_id"]

        with open(second_path, "rb") as source:
            second_import = client.post(
                "/api/bom/import",
                files={"file": ("dup_b.txt", source, "text/plain")},
                params={"reference": "TRIAMP_DUP", "revision": "REV_A", "side": "TOP"},
            )
        assert second_import.status_code == 200
        assert second_import.json()["bom_revision_id"] == first_revision_id

        files_response = client.get("/api/bom/files")
        assert files_response.status_code == 200
        files = files_response.json()["items"]
        assert len(files) == 1
        assert files[0]["bom_revision_id"] == first_revision_id

        session_response = client.get(f"/api/bom/files/{first_revision_id}/session")
        assert session_response.status_code == 200
        session_items = session_response.json()["items"]
        assert len(session_items) == 1
        assert session_items[0]["reference_item"] == "C1"
        assert session_items[0]["value_raw"] == "100N"

        db = TestingSessionLocal()
        try:
            assert db.query(BomRevision).count() == 1
        finally:
            db.close()
    finally:
        os.unlink(first_path)
        os.unlink(second_path)


def test_rename_saved_bom_file_collapses_historical_duplicates_and_relinks_dependencies():
    """Renaming the visible logical BOM should absorb hidden duplicates and move dependent links."""
    db = TestingSessionLocal()
    older_revision_id = None
    newer_revision_id = None
    try:
        bom_ref = BomReference(reference="TRIAMP_DUP_RENAME")
        db.add(bom_ref)
        db.commit()
        db.refresh(bom_ref)

        older_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.TOP,
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add(older_revision)
        db.commit()
        db.refresh(older_revision)

        newer_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.TOP,
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add(newer_revision)
        db.commit()
        db.refresh(newer_revision)

        db.add(BomItem(
            bom_revision_id=older_revision.id,
            reference_item="R1",
            value_raw="10R",
            value_harmonized="10R",
            footprint_eagle="RESC1608X55N",
            footprint_pnp="R_0603",
            x=10,
            y=20,
            rotation=0,
            placement_side="TOP",
            component_type="R",
        ))
        db.add(BomItem(
            bom_revision_id=newer_revision.id,
            reference_item="R2",
            value_raw="22R",
            value_harmonized="22R",
            footprint_eagle="RESC1608X55N",
            footprint_pnp="R_0603",
            x=11,
            y=21,
            rotation=90,
            placement_side="TOP",
            component_type="R",
        ))

        production = Production(name="prod-rename-dup")
        db.add(production)
        db.flush()

        db.add(ProductionBomRevision(
            production_id=production.id,
            bom_revision_id=older_revision.id,
        ))

        command = Command(name="cmd-rename-dup", production_id=production.id)
        db.add(command)
        db.flush()

        db.add(CommandItem(
            command_id=command.id,
            bom_revision_id=older_revision.id,
            quantity_to_produce=4,
        ))
        db.commit()

        newer_items = db.query(BomItem).filter(BomItem.bom_revision_id == newer_revision.id).all()
        bom_file_service.save_revision_snapshot(
            "TRIAMP_DUP_RENAME",
            "REV_A",
            "TOP",
            newer_items,
        )

        older_revision_id = older_revision.id
        newer_revision_id = newer_revision.id
    finally:
        db.close()

    rename_response = client.patch(
        f"/api/bom/files/{newer_revision_id}",
        json={"reference": "TRIAMP_FIXED", "revision": "REV_B"},
    )
    assert rename_response.status_code == 200

    old_session_response = client.get(f"/api/bom/files/{older_revision_id}/session")
    assert old_session_response.status_code == 404

    files_response = client.get("/api/bom/files")
    assert files_response.status_code == 200
    files = files_response.json()["items"]
    assert len(files) == 1
    assert files[0]["bom_revision_id"] == newer_revision_id
    assert files[0]["reference"] == "TRIAMP_FIXED"
    assert files[0]["revision"] == "REV_B"

    db = TestingSessionLocal()
    try:
        remaining_revisions = db.query(BomRevision).all()
        assert len(remaining_revisions) == 1
        assert remaining_revisions[0].id == newer_revision_id
        assert remaining_revisions[0].reference.reference == "TRIAMP_FIXED"

        production_links = db.query(ProductionBomRevision).all()
        assert len(production_links) == 1
        assert production_links[0].bom_revision_id == newer_revision_id

        command_items = db.query(CommandItem).all()
        assert len(command_items) == 1
        assert command_items[0].bom_revision_id == newer_revision_id
        assert command_items[0].quantity_to_produce == 4
    finally:
        db.close()


def test_import_and_update_bom_reference_category():
    """A manual category should live on the BOM reference and appear in stored-file listings."""
    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R 0805 10.0 20.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(bom_content)
        temp_path = f.name

    try:
        with open(temp_path, "rb") as source:
            import_response = client.post(
                "/api/bom/import",
                files={"file": ("carrier_top.txt", source, "text/plain")},
                params={
                    "reference": "CARRIER_GEN6",
                    "revision": "REV_A",
                    "side": "TOP",
                    "category": "CARRIER_BOARD",
                },
            )
        assert import_response.status_code == 200
        bom_reference_id = import_response.json()["bom_reference_id"]
        bom_revision_id = import_response.json()["bom_revision_id"]

        detail_response = client.get(f"/api/bom/{bom_reference_id}")
        assert detail_response.status_code == 200
        assert detail_response.json()["reference"]["category"] == "CARRIER_BOARD"

        update_response = client.patch(
            f"/api/bom/references/{bom_reference_id}/category",
            json={"category": "AMPLI"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["category"] == "AMPLI"

        files_response = client.get("/api/bom/files")
        assert files_response.status_code == 200
        entry = next(item for item in files_response.json()["items"] if item["bom_revision_id"] == bom_revision_id)
        assert entry["category"] == "AMPLI"

        search_response = client.get("/api/bom/files", params={"search": "AMPLI"})
        assert search_response.status_code == 200
        searched_entries = search_response.json()["items"]
        assert len(searched_entries) == 1
        assert searched_entries[0]["bom_revision_id"] == bom_revision_id
    finally:
        os.unlink(temp_path)


def test_create_and_list_bom_categories():
    """Manual BOM categories should be creatable and visible even before any BOM is linked."""
    category_name = "CARRIER_BOARD_UI"
    create_response = client.post(
        "/api/bom/categories",
        json={
            "name": category_name,
            "description": "Cartes porteuses",
        },
    )
    assert create_response.status_code == 200
    created_category = create_response.json()
    assert created_category["name"] == category_name
    assert created_category["reference_count"] == 0

    list_response = client.get("/api/bom/categories")
    assert list_response.status_code == 200
    listed_names = [item["name"] for item in list_response.json()["items"]]
    assert category_name in listed_names


def test_create_production_and_attach_bom_revisions():
    """A production workspace can be created and linked to several BOM revisions."""
    db = TestingSessionLocal()
    try:
        bom_ref = BomReference(reference="TRIAMP")
        db.add(bom_ref)
        db.commit()
        db.refresh(bom_ref)

        top_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.TOP,
            status=BomRevision.StatusEnum.DRAFT,
        )
        bot_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.BOT,
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add_all([top_revision, bot_revision])
        db.commit()
        db.refresh(top_revision)
        db.refresh(bot_revision)
    finally:
        db.close()

    create_response = client.post(
        "/api/marketplace/productions",
        json={"name": "prod01 DATE:03/2026"},
    )
    assert create_response.status_code == 200
    production_id = create_response.json()["id"]
    assert create_response.json()["bom_count"] == 0

    attach_response = client.post(
        f"/api/marketplace/productions/{production_id}/bom-revisions",
        json={"bom_revision_ids": [top_revision.id, bot_revision.id]},
    )
    assert attach_response.status_code == 200
    attached_payload = attach_response.json()
    assert attached_payload["bom_count"] == 2
    assert {item["side"] for item in attached_payload["bom_revisions"]} == {"TOP", "BOT"}
    assert {item["quantity_to_produce"] for item in attached_payload["bom_revisions"]} == {1}

    list_response = client.get("/api/marketplace/productions")
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["bom_count"] == 2
    assert list_response.json()["items"][0]["total_boards_to_produce"] == 1


def test_update_production_bom_quantities():
    """Production BOM quantities can be persisted directly from the BOM workspace."""
    db = TestingSessionLocal()
    try:
        bom_ref = BomReference(reference="QTY_SYNC")
        db.add(bom_ref)
        db.commit()
        db.refresh(bom_ref)

        top_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.TOP,
            status=BomRevision.StatusEnum.DRAFT,
        )
        bot_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.BOT,
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add_all([top_revision, bot_revision])
        db.commit()
        db.refresh(top_revision)
        db.refresh(bot_revision)
    finally:
        db.close()

    production_response = client.post(
        "/api/marketplace/productions",
        json={"name": "prod-qty-sync DATE:03/2026"},
    )
    assert production_response.status_code == 200
    production_id = production_response.json()["id"]

    attach_response = client.post(
        f"/api/marketplace/productions/{production_id}/bom-revisions",
        json={"bom_revision_ids": [top_revision.id, bot_revision.id]},
    )
    assert attach_response.status_code == 200

    update_response = client.patch(
        f"/api/marketplace/productions/{production_id}/bom-quantities",
        json={
            "items": [
                {"bom_revision_id": top_revision.id, "quantity_to_produce": 12},
                {"bom_revision_id": bot_revision.id, "quantity_to_produce": 12},
            ],
        },
    )
    assert update_response.status_code == 200
    payload = update_response.json()
    assert payload["total_boards_to_produce"] == 12
    assert {item["quantity_to_produce"] for item in payload["bom_revisions"]} == {12}


def test_detach_bom_revision_updates_production_count():
    """Detaching a BOM revision should update the production summary immediately."""
    db = TestingSessionLocal()
    try:
        bom_ref = BomReference(reference="DETACH_TEST")
        db.add(bom_ref)
        db.commit()
        db.refresh(bom_ref)

        top_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.TOP,
            status=BomRevision.StatusEnum.DRAFT,
        )
        bot_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.BOT,
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add_all([top_revision, bot_revision])
        db.commit()
        db.refresh(top_revision)
        db.refresh(bot_revision)
    finally:
        db.close()

    create_response = client.post(
        "/api/marketplace/productions",
        json={"name": "prod-detach DATE:03/2026"},
    )
    assert create_response.status_code == 200
    production_id = create_response.json()["id"]

    attach_response = client.post(
        f"/api/marketplace/productions/{production_id}/bom-revisions",
        json={"bom_revision_ids": [top_revision.id, bot_revision.id]},
    )
    assert attach_response.status_code == 200
    assert attach_response.json()["bom_count"] == 2

    detach_response = client.post(
        f"/api/marketplace/productions/{production_id}/bom-revisions/detach",
        json={"bom_revision_ids": [top_revision.id]},
    )
    assert detach_response.status_code == 200
    detached_payload = detach_response.json()
    assert detached_payload["bom_count"] == 1
    assert [entry["bom_revision_id"] for entry in detached_payload["bom_revisions"]] == [bot_revision.id]

    list_response = client.get("/api/marketplace/productions")
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["bom_count"] == 1


def test_only_one_production_stays_active():
    """Creating or activating a production should keep a single ACTIVE status in the dashboard listing."""
    first_create = client.post(
        "/api/marketplace/productions",
        json={"name": "prod-alpha DATE:03/2026"},
    )
    assert first_create.status_code == 200
    first_id = first_create.json()["id"]
    assert first_create.json()["status"] == "ACTIVE"

    second_create = client.post(
        "/api/marketplace/productions",
        json={"name": "prod-beta DATE:03/2026"},
    )
    assert second_create.status_code == 200
    second_id = second_create.json()["id"]
    assert second_create.json()["status"] == "ACTIVE"

    list_response = client.get("/api/marketplace/productions")
    assert list_response.status_code == 200
    items = {item["id"]: item for item in list_response.json()["items"]}
    assert items[first_id]["status"] == "DRAFT"
    assert items[second_id]["status"] == "ACTIVE"

    activate_first = client.patch(
        f"/api/marketplace/productions/{first_id}",
        json={"status": "ACTIVE"},
    )
    assert activate_first.status_code == 200

    refresh_response = client.get("/api/marketplace/productions")
    assert refresh_response.status_code == 200
    refreshed_items = {item["id"]: item for item in refresh_response.json()["items"]}
    assert refreshed_items[first_id]["status"] == "ACTIVE"
    assert refreshed_items[second_id]["status"] == "DRAFT"


def test_generate_command_can_be_linked_to_production():
    """Generated commands should stay linked to the active production workspace."""
    create_production_response = client.post(
        "/api/marketplace/productions",
        json={"name": "prod-cmd DATE:03/2026"},
    )
    assert create_production_response.status_code == 200
    production_id = create_production_response.json()["id"]

    bom_content = """Reference Value Footprint X Y Rotation Type
R1 10R 0805 10.0 20.0 0 R
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as source_file:
        source_file.write(bom_content)
        temp_path = source_file.name

    try:
        with open(temp_path, 'rb') as source:
            import_response = client.post(
                "/api/bom/import",
                files={'file': ('prod_cmd.txt', source, 'text/plain')},
                params={"reference": "PROD_CMD", "revision": "REV_A", "side": "TOP"},
            )

        assert import_response.status_code == 200
        bom_revision_id = import_response.json()["bom_revision_id"]

        attach_response = client.post(
            f"/api/marketplace/productions/{production_id}/bom-revisions",
            json={"bom_revision_ids": [bom_revision_id]},
        )
        assert attach_response.status_code == 200

        command_response = client.post(
            "/api/marketplace/commands/generate",
            json={
                "name": "CMD-PROD-001",
                "production_id": production_id,
                "items": [
                    {
                        "bom_revision_id": bom_revision_id,
                        "quantity": 5,
                    }
                ],
            },
        )
        assert command_response.status_code == 200
        command_summary = command_response.json()
        assert command_summary["production_id"] == production_id

        list_commands_response = client.get(f"/api/marketplace/commands?production_id={production_id}")
        assert list_commands_response.status_code == 200
        assert list_commands_response.json()["total"] == 1
        assert list_commands_response.json()["data"][0]["production_id"] == production_id

        production_detail_response = client.get(f"/api/marketplace/productions/{production_id}")
        assert production_detail_response.status_code == 200
        production_detail = production_detail_response.json()
        assert production_detail["command_count"] == 1
        assert production_detail["latest_command_name"] == "CMD-PROD-001"
    finally:
        os.unlink(temp_path)


def test_productions_keep_isolated_bom_links_and_commands():
    """Two productions should keep independent BOM links and command history."""
    create_prod_a = client.post(
        "/api/marketplace/productions",
        json={"name": "prod-A DATE:03/2026"},
    )
    assert create_prod_a.status_code == 200
    production_a_id = create_prod_a.json()["id"]

    create_prod_b = client.post(
        "/api/marketplace/productions",
        json={"name": "prod-B DATE:03/2026"},
    )
    assert create_prod_b.status_code == 200
    production_b_id = create_prod_b.json()["id"]

    bom_a_content = """Reference Value Footprint X Y Rotation Type
R1 10R 0805 10.0 20.0 0 R
"""
    bom_b_content = """Reference Value Footprint X Y Rotation Type
C1 100n 0603 12.0 24.0 90 C
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as source_a, tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as source_b:
        source_a.write(bom_a_content)
        source_b.write(bom_b_content)
        temp_path_a = source_a.name
        temp_path_b = source_b.name

    try:
        with open(temp_path_a, 'rb') as source:
            import_a_response = client.post(
                "/api/bom/import",
                files={'file': ('prod_a_top.txt', source, 'text/plain')},
                params={"reference": "PROD_A", "revision": "REV_A", "side": "TOP"},
            )
        assert import_a_response.status_code == 200
        bom_a_revision_id = import_a_response.json()["bom_revision_id"]

        with open(temp_path_b, 'rb') as source:
            import_b_response = client.post(
                "/api/bom/import",
                files={'file': ('prod_b_top.txt', source, 'text/plain')},
                params={"reference": "PROD_B", "revision": "REV_B", "side": "TOP"},
            )
        assert import_b_response.status_code == 200
        bom_b_revision_id = import_b_response.json()["bom_revision_id"]

        attach_a_response = client.post(
            f"/api/marketplace/productions/{production_a_id}/bom-revisions",
            json={"bom_revision_ids": [bom_a_revision_id]},
        )
        assert attach_a_response.status_code == 200

        attach_b_response = client.post(
            f"/api/marketplace/productions/{production_b_id}/bom-revisions",
            json={"bom_revision_ids": [bom_b_revision_id]},
        )
        assert attach_b_response.status_code == 200

        command_a_response = client.post(
            "/api/marketplace/commands/generate",
            json={
                "name": "CMD-PROD-A",
                "production_id": production_a_id,
                "items": [
                    {
                        "bom_revision_id": bom_a_revision_id,
                        "quantity": 5,
                    }
                ],
            },
        )
        assert command_a_response.status_code == 200
        assert command_a_response.json()["production_id"] == production_a_id

        command_b_response = client.post(
            "/api/marketplace/commands/generate",
            json={
                "name": "CMD-PROD-B",
                "production_id": production_b_id,
                "items": [
                    {
                        "bom_revision_id": bom_b_revision_id,
                        "quantity": 3,
                    }
                ],
            },
        )
        assert command_b_response.status_code == 200
        assert command_b_response.json()["production_id"] == production_b_id

        detail_a_response = client.get(f"/api/marketplace/productions/{production_a_id}")
        assert detail_a_response.status_code == 200
        detail_a = detail_a_response.json()
        assert detail_a["bom_count"] == 1
        assert detail_a["command_count"] == 1
        assert detail_a["latest_command_name"] == "CMD-PROD-A"
        assert [entry["bom_revision_id"] for entry in detail_a["bom_revisions"]] == [bom_a_revision_id]

        detail_b_response = client.get(f"/api/marketplace/productions/{production_b_id}")
        assert detail_b_response.status_code == 200
        detail_b = detail_b_response.json()
        assert detail_b["bom_count"] == 1
        assert detail_b["command_count"] == 1
        assert detail_b["latest_command_name"] == "CMD-PROD-B"
        assert [entry["bom_revision_id"] for entry in detail_b["bom_revisions"]] == [bom_b_revision_id]

        list_a_response = client.get(f"/api/marketplace/commands?production_id={production_a_id}")
        assert list_a_response.status_code == 200
        assert list_a_response.json()["total"] == 1
        assert list_a_response.json()["data"][0]["name"] == "CMD-PROD-A"

        list_b_response = client.get(f"/api/marketplace/commands?production_id={production_b_id}")
        assert list_b_response.status_code == 200
        assert list_b_response.json()["total"] == 1
        assert list_b_response.json()["data"][0]["name"] == "CMD-PROD-B"
    finally:
        os.unlink(temp_path_a)
        os.unlink(temp_path_b)


def test_delete_production_workspace():
    """Deleting a production workspace removes it from the marketplace listing."""
    create_response = client.post(
        "/api/marketplace/productions",
        json={"name": "prod02 DATE:03/2026"},
    )
    assert create_response.status_code == 200
    production_id = create_response.json()["id"]

    delete_response = client.delete(f"/api/marketplace/productions/{production_id}")
    assert delete_response.status_code == 200

    detail_response = client.get(f"/api/marketplace/productions/{production_id}")
    assert detail_response.status_code == 404


def test_delete_saved_bom_file_removes_production_links():
    """Deleting a stored BOM should also remove production and command links."""
    db = TestingSessionLocal()
    revision_id = None
    try:
        bom_ref = BomReference(reference="CARD_DELETE")
        db.add(bom_ref)
        db.commit()
        db.refresh(bom_ref)

        revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.TOP,
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add(revision)
        db.commit()
        db.refresh(revision)

        production = Production(name="prod-delete-test")
        db.add(production)
        db.commit()
        db.refresh(production)

        production_link = ProductionBomRevision(
            production_id=production.id,
            bom_revision_id=revision.id,
        )
        db.add(production_link)

        command = Command(name="cmd-delete-test", production_id=production.id)
        db.add(command)
        db.flush()

        db.add(CommandItem(
            command_id=command.id,
            bom_revision_id=revision.id,
            quantity_to_produce=2,
        ))
        db.commit()
        revision_id = revision.id
    finally:
        db.close()

    delete_response = client.delete(f"/api/bom/files/{revision_id}")
    assert delete_response.status_code == 200

    db = TestingSessionLocal()
    try:
        remaining_links = db.query(ProductionBomRevision).count()
        remaining_command_items = db.query(CommandItem).count()
        remaining_revisions = db.query(BomRevision).count()
        assert remaining_links == 0
        assert remaining_command_items == 0
        assert remaining_revisions == 0
    finally:
        db.close()


def test_delete_saved_bom_file_keeps_database_cleanup_when_snapshot_delete_fails(monkeypatch):
    """A snapshot cleanup failure should not roll back the database deletion."""
    db = TestingSessionLocal()
    revision_id = None
    try:
        bom_ref = BomReference(reference="CARD_DELETE_LOCKED")
        db.add(bom_ref)
        db.commit()
        db.refresh(bom_ref)

        revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision="REV_A",
            type=BomRevision.TypeEnum.TOP,
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add(revision)
        db.commit()
        db.refresh(revision)
        revision_id = revision.id
    finally:
        db.close()

    def fail_delete(*args, **kwargs):
        raise PermissionError("file is locked")

    monkeypatch.setattr(bom_file_service, "delete_revision_snapshot", fail_delete)

    delete_response = client.delete(f"/api/bom/files/{revision_id}")
    assert delete_response.status_code == 200

    db = TestingSessionLocal()
    try:
        assert db.query(BomRevision).count() == 0
        assert db.query(BomReference).count() == 0
    finally:
        db.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
