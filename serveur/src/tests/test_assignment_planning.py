"""
Unit/integration tests for AssignmentPlanningMixin service methods.

Uses the shared SQLite engine from conftest.py.
"""
import json

import pytest
from sqlalchemy.orm import Session

from src.tests.conftest import TestingSessionLocal, engine
from src.database import Base
from src.models.bom import BomReference, BomRevision, BomItem, Component
from src.models.machines import PnpMachine, PnpFeeder
from src.models.production import Production, ProductionBomRevision
from src.services.assignment_planning import AssignmentPlanningMixin


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function", autouse=True)
def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_machine(db, name="MACHINE-01", positions=40):
    machine = PnpMachine(name=name, num_positions=positions)
    db.add(machine)
    db.flush()
    return machine


def make_production(db, machine, name="PROD-01"):
    production = Production(name=name, machine_id=machine.id)
    db.add(production)
    db.flush()
    return production


def make_bom_revision(db, reference="REF-01", revision="A"):
    ref = BomReference(reference=reference, category="Resistor")
    db.add(ref)
    db.flush()
    rev = BomRevision(
        bom_ref_id=ref.id,
        revision=revision,
        type=BomRevision.TypeEnum.TOP,
        status=BomRevision.StatusEnum.ACTIVE,
    )
    db.add(rev)
    db.flush()
    return rev


def make_component(db, reference="R0805", value="10K", footprint="R0805"):
    component = Component(
        reference=reference,
        value=value,
        package="0805",
        footprint_pnp=footprint,
        feeder_type="CL8-4",
        is_fixed_feeder=False,
    )
    db.add(component)
    db.flush()
    return component


def link_revision(db, production, revision, order=1, quantity=1):
    link = ProductionBomRevision(
        production_id=production.id,
        bom_revision_id=revision.id,
        sequence_order=order,
        quantity_to_produce=quantity,
    )
    db.add(link)
    db.flush()
    return link


# ── Tests: get_machine_summary ─────────────────────────────────────────────

class TestGetMachineSummary:
    def test_returns_basic_machine_fields(self, db):
        machine = make_machine(db, name="ALPHA", positions=80)
        db.commit()

        summary = AssignmentPlanningMixin.get_machine_summary(db=db, machine_id=machine.id)

        assert summary["id"] == machine.id
        assert summary["name"] == "ALPHA"
        assert summary["num_positions"] == 80

    def test_raises_on_missing_machine(self, db):
        with pytest.raises(ValueError, match="not found"):
            AssignmentPlanningMixin.get_machine_summary(db=db, machine_id=99999)

    def test_includes_linked_productions(self, db):
        machine = make_machine(db)
        make_production(db, machine, name="PROD-LINKED")
        db.commit()

        summary = AssignmentPlanningMixin.get_machine_summary(db=db, machine_id=machine.id)

        assert isinstance(summary["productions"], list)
        assert any(p["name"] == "PROD-LINKED" for p in summary["productions"])

    def test_includes_feeders(self, db):
        machine = make_machine(db)
        feeder = PnpFeeder(size_mm=8, capacity=100)
        db.add(feeder)
        db.flush()
        machine.feeders.append(feeder)
        db.commit()

        summary = AssignmentPlanningMixin.get_machine_summary(db=db, machine_id=machine.id)

        assert len(summary["feeders"]) == 1
        assert summary["feeders"][0]["size_mm"] == 8

    def test_empty_machine_has_empty_lists(self, db):
        machine = make_machine(db)
        db.commit()

        summary = AssignmentPlanningMixin.get_machine_summary(db=db, machine_id=machine.id)

        assert summary["productions"] == []
        assert summary["feeders"] == []


# ── Tests: validate_machine_production_order ────────────────────────────────

class TestValidateMachineProductionOrder:
    def test_validate_sets_manufacturing_validated_at(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        link_revision(db, production, revision)
        db.commit()

        result = AssignmentPlanningMixin.validate_machine_production_order(
            db=db, machine_id=machine.id, production_id=production.id
        )

        assert result["production"]["manufacturing_order_validated_at"] is not None

    def test_validate_returns_plan(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        link_revision(db, production, revision)
        db.commit()

        result = AssignmentPlanningMixin.validate_machine_production_order(
            db=db, machine_id=machine.id, production_id=production.id
        )

        assert "plan" in result
        assert "production" in result

    def test_validate_raises_when_no_bom_linked(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        db.commit()

        with pytest.raises(ValueError, match="Aucune BOM"):
            AssignmentPlanningMixin.validate_machine_production_order(
                db=db, machine_id=machine.id, production_id=production.id
            )

    def test_validate_raises_when_machine_not_found(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        db.commit()

        with pytest.raises(ValueError, match="not found"):
            AssignmentPlanningMixin.validate_machine_production_order(
                db=db, machine_id=99999, production_id=production.id
            )

    def test_validate_raises_when_production_not_linked_to_machine(self, db):
        machine_a = make_machine(db, name="MACHINE-A")
        machine_b = make_machine(db, name="MACHINE-B")
        production = make_production(db, machine_b)
        revision = make_bom_revision(db)
        link_revision(db, production, revision)
        db.commit()

        with pytest.raises(ValueError, match="not assigned to machine"):
            AssignmentPlanningMixin.validate_machine_production_order(
                db=db, machine_id=machine_a.id, production_id=production.id
            )


# ── Tests: update_machine_production_bom_order ──────────────────────────────

class TestUpdateMachineProductionBomOrder:
    def test_reorder_succeeds_with_all_revisions(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        rev_a = make_bom_revision(db, reference="REF-A", revision="A")
        rev_b = make_bom_revision(db, reference="REF-B", revision="B")
        link_revision(db, production, rev_a, order=1)
        link_revision(db, production, rev_b, order=2)
        db.commit()

        result = AssignmentPlanningMixin.update_machine_production_bom_order(
            db=db,
            machine_id=machine.id,
            production_id=production.id,
            bom_revision_ids=[rev_b.id, rev_a.id],
        )

        assert isinstance(result, dict)
        # Validate reorder persisted
        db.expire_all()
        links = {
            link.bom_revision_id: link.sequence_order
            for link in production.bom_links
        }
        assert links[rev_b.id] == 1
        assert links[rev_a.id] == 2

    def test_reorder_raises_on_missing_revision(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        rev_a = make_bom_revision(db, reference="REF-A", revision="A")
        rev_b = make_bom_revision(db, reference="REF-B", revision="B")
        link_revision(db, production, rev_a, order=1)
        link_revision(db, production, rev_b, order=2)
        db.commit()

        with pytest.raises(ValueError, match="missing"):
            AssignmentPlanningMixin.update_machine_production_bom_order(
                db=db,
                machine_id=machine.id,
                production_id=production.id,
                bom_revision_ids=[rev_a.id],  # rev_b missing
            )

    def test_reorder_raises_on_extra_revision(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        rev_a = make_bom_revision(db, reference="REF-A", revision="A")
        link_revision(db, production, rev_a, order=1)
        extra = make_bom_revision(db, reference="EXTRA", revision="X")
        db.commit()

        with pytest.raises(ValueError, match="unknown"):
            AssignmentPlanningMixin.update_machine_production_bom_order(
                db=db,
                machine_id=machine.id,
                production_id=production.id,
                bom_revision_ids=[rev_a.id, extra.id],
            )

    def test_reorder_raises_on_empty_list(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        rev_a = make_bom_revision(db)
        link_revision(db, production, rev_a)
        db.commit()

        with pytest.raises(ValueError, match="At least one"):
            AssignmentPlanningMixin.update_machine_production_bom_order(
                db=db,
                machine_id=machine.id,
                production_id=production.id,
                bom_revision_ids=[],
            )

    def test_reorder_clears_manufacturing_validated_at(self, db):
        from datetime import datetime
        machine = make_machine(db)
        production = make_production(db, machine)
        production.manufacturing_order_validated_at = datetime.utcnow()
        rev_a = make_bom_revision(db)
        link_revision(db, production, rev_a)
        db.commit()

        AssignmentPlanningMixin.update_machine_production_bom_order(
            db=db,
            machine_id=machine.id,
            production_id=production.id,
            bom_revision_ids=[rev_a.id],
        )

        db.expire_all()
        db.refresh(production)
        assert production.manufacturing_order_validated_at is None


# ── Tests: get_machine_production_feeder_plan ────────────────────────────────

class TestGetMachineProductionFeederPlan:
    def test_returns_plan_structure(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        component = make_component(db)
        db.add(BomItem(
            bom_revision_id=revision.id,
            reference_item="R1",
            quantity=2,
            footprint_pnp=component.footprint_pnp,
            value_harmonized=component.value,
            dnp=False,
        ))
        link_revision(db, production, revision, order=1, quantity=5)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db,
            machine_id=machine.id,
            production_id=production.id,
        )

        assert isinstance(plan, dict)
        assert "ordered_boms" in plan

    def test_dnp_items_excluded_from_plan(self, db):
        machine = make_machine(db)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        component = make_component(db)
        db.add(BomItem(
            bom_revision_id=revision.id,
            reference_item="R1",
            quantity=1,
            footprint_pnp=component.footprint_pnp,
            value_harmonized=component.value,
            dnp=True,  # DNP → should not appear in plan assignments
        ))
        link_revision(db, production, revision)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db,
            machine_id=machine.id,
            production_id=production.id,
        )

        # unmatched_bom_items includes dnp as skipped, fixed/dynamic assignments should be empty
        fixed = plan.get("fixed_assignments", [])
        dynamic = plan.get("dynamic_assignments", [])
        unassigned = plan.get("unassigned", [])
        assert len(fixed) == 0
        assert len(dynamic) == 0

    def test_raises_on_missing_production(self, db):
        machine = make_machine(db)
        db.commit()

        with pytest.raises(ValueError, match="not found"):
            AssignmentPlanningMixin.get_machine_production_feeder_plan(
                db=db,
                machine_id=machine.id,
                production_id=99999,
            )


# ── Tests: sélection « à placer à la main » au débordement ───────────────────

class TestManualPlacementOnOverflow:
    def test_overflow_prefers_big_low_pose_components(self, db):
        # Machine 4 positions ; demande = 6 slots (1 gros 2-slots + 4 petits) → déborde de 2.
        machine = make_machine(db, positions=4)
        production = make_production(db, machine)
        revision = make_bom_revision(db)

        big = Component(
            reference="J1", value="USB-C", package="USB",
            footprint_pnp="USB", feeder_type="CL12", is_fixed_feeder=False,
        )
        db.add(big)
        db.flush()
        smalls = []
        for index in range(4):
            small = Component(
                reference=f"R{index}", value=f"V{index}", package="0402",
                footprint_pnp=f"R0402_{index}", feeder_type="CL8-4", is_fixed_feeder=False,
            )
            db.add(small)
            db.flush()
            smalls.append(small)

        # Le gros feeder n'a qu'1 pose (score 2/1=2.0) ; les petits en ont 10 (score 1/10=0.1)
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="J1", quantity=1,
            footprint_pnp=big.footprint_pnp, value_harmonized=big.value, dnp=False,
        ))
        for index, small in enumerate(smalls):
            db.add(BomItem(
                bom_revision_id=revision.id, reference_item=f"R{index}", quantity=10,
                footprint_pnp=small.footprint_pnp, value_harmonized=small.value, dnp=False,
            ))
        link_revision(db, production, revision, order=1, quantity=1)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
        )

        # Le gros feeder (2 slots, peu posé) est choisi pour la pose à la main.
        assert plan["manual_placement_count"] == 1
        assert plan["manual_placement_slot_savings"] == 2
        manual = plan["manual_placement_components"][0]
        assert manual["component_id"] == big.id
        assert manual["slot_usage"] == 2
        assert manual["manual_placement"] is True
        # Les 4 petits feeders tiennent alors sur la machine, sans débordement capacitaire.
        assert plan["assigned_component_count"] == 4
        assert plan["occupied_slot_count"] == 4
        capacity_unassigned = [
            item for item in plan["unassigned_components"]
            if "apacit" in str(item.get("reason", ""))
        ]
        assert capacity_unassigned == []

    def test_no_manual_placement_when_everything_fits(self, db):
        machine = make_machine(db, positions=40)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        component = make_component(db)
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="R1", quantity=2,
            footprint_pnp=component.footprint_pnp, value_harmonized=component.value, dnp=False,
        ))
        link_revision(db, production, revision, order=1, quantity=1)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
        )

        assert plan["manual_placement_count"] == 0
        assert plan["manual_placement_slot_savings"] == 0
        assert plan["manual_placement_components"] == []


# ── Tests: plan recalculé par face (bom_revision_id) ─────────────────────────

class TestPerFaceFeederPlan:
    def _setup_two_faces(self, db):
        machine = make_machine(db, positions=40)
        production = make_production(db, machine)
        rev_a = make_bom_revision(db, reference="BOARD-A", revision="A")
        rev_b = make_bom_revision(db, reference="BOARD-B", revision="B")
        comp_a = make_component(db, reference="RA", value="VAL-A", footprint="R0805_A")
        comp_b = make_component(db, reference="RB", value="VAL-B", footprint="R0805_B")
        db.add(BomItem(
            bom_revision_id=rev_a.id, reference_item="R1", quantity=1,
            footprint_pnp=comp_a.footprint_pnp, value_harmonized=comp_a.value, dnp=False,
        ))
        db.add(BomItem(
            bom_revision_id=rev_b.id, reference_item="R2", quantity=1,
            footprint_pnp=comp_b.footprint_pnp, value_harmonized=comp_b.value, dnp=False,
        ))
        link_revision(db, production, rev_a, order=1, quantity=1)
        link_revision(db, production, rev_b, order=2, quantity=1)
        db.commit()
        return machine, production, rev_a, rev_b, comp_a, comp_b

    def test_global_plan_includes_both_faces(self, db):
        machine, production, rev_a, rev_b, comp_a, comp_b = self._setup_two_faces(db)
        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
        )
        ids = {a["component_id"] for a in plan["slot_assignments"]}
        assert ids == {comp_a.id, comp_b.id}
        assert len(plan["ordered_boms"]) == 2

    def test_per_face_plan_scopes_to_selected_face(self, db):
        machine, production, rev_a, rev_b, comp_a, comp_b = self._setup_two_faces(db)
        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
            bom_revision_id=rev_a.id,
        )
        ids = {a["component_id"] for a in plan["slot_assignments"]}
        assert ids == {comp_a.id}
        # ordered_boms garde TOUTES les faces (sélecteur UI), seules les
        # affectations sont scopées à la face choisie.
        assert len(plan["ordered_boms"]) == 2
        assert comp_b.id not in ids


# ── Tests: rétention par réutilisation inter-productions ─────────────────────

class TestQueueReuseRetention:
    def test_low_reuse_component_handplaced_first(self, db):
        # Capacité 1 ; face A demande 2 composants (1 partagé A+B, 1 propre à A) →
        # déborde de 1. Le partagé (réutilisé sur 2 faces) doit rester monté ; le
        # composant propre à la face A part à la main.
        machine = make_machine(db, positions=1)
        production = make_production(db, machine)
        rev_a = make_bom_revision(db, reference="BOARD-A", revision="A")
        rev_b = make_bom_revision(db, reference="BOARD-B", revision="B")
        shared = make_component(db, reference="SH", value="SHARED", footprint="R_SH")
        specific = make_component(db, reference="SP", value="SPEC", footprint="R_SP")
        db.add(BomItem(
            bom_revision_id=rev_a.id, reference_item="R1", quantity=1,
            footprint_pnp=shared.footprint_pnp, value_harmonized=shared.value, dnp=False,
        ))
        db.add(BomItem(
            bom_revision_id=rev_b.id, reference_item="R2", quantity=1,
            footprint_pnp=shared.footprint_pnp, value_harmonized=shared.value, dnp=False,
        ))
        db.add(BomItem(
            bom_revision_id=rev_a.id, reference_item="R3", quantity=1,
            footprint_pnp=specific.footprint_pnp, value_harmonized=specific.value, dnp=False,
        ))
        link_revision(db, production, rev_a, order=1, quantity=1)
        link_revision(db, production, rev_b, order=2, quantity=1)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
            bom_revision_id=rev_a.id,
        )
        manual_ids = {m["component_id"] for m in plan["manual_placement_components"]}
        assigned_ids = {a["component_id"] for a in plan["slot_assignments"]}
        assert specific.id in manual_ids
        assert shared.id in assigned_ids


# ── Tests: composant sans taille de feeder → pose manuelle auto ───────────────

class TestMissingFeederSizeManual:
    def test_component_without_feeder_size_is_routed_to_manual(self, db):
        # Capacité large : rien ne déborde. Un composant sans taille de feeder ne
        # doit PAS être installé sur la PnP, mais basculé en pose manuelle avec le
        # drapeau needs_feeder_size (à compléter), tandis qu'un composant dimensionné
        # est placé normalement.
        machine = make_machine(db, positions=40)
        production = make_production(db, machine)
        revision = make_bom_revision(db)

        sized = make_component(db, reference="R1", value="10K", footprint="R0805")  # CL8-4
        no_size = Component(
            reference="U1", value="DRV-XYZ", package="QFN",
            footprint_pnp="QFN", feeder_type=None, is_fixed_feeder=False,
        )
        db.add(no_size)
        db.flush()

        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="R1", quantity=1,
            footprint_pnp=sized.footprint_pnp, value_harmonized=sized.value, dnp=False,
        ))
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="U1", quantity=1,
            footprint_pnp=no_size.footprint_pnp, value_harmonized=no_size.value, dnp=False,
        ))
        link_revision(db, production, revision, order=1, quantity=1)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
        )

        assigned_ids = {a["component_id"] for a in plan["slot_assignments"]}
        manual = {m["component_id"]: m for m in plan["manual_placement_components"]}

        # Le composant sans taille n'est pas installé sur la PnP.
        assert no_size.id not in assigned_ids
        # Il est en pose manuelle, signalé à compléter.
        assert no_size.id in manual
        assert manual[no_size.id]["needs_feeder_size"] is True
        assert manual[no_size.id]["manual_placement"] is True
        # Le composant dimensionné est placé normalement.
        assert sized.id in assigned_ids
        # Compteur dédié + il ne consomme aucun slot ni "slot savings" capacitaire.
        assert plan["missing_feeder_size_count"] == 1
        assert plan["manual_placement_slot_savings"] == 0


# ── Tests: épinglage manuel de slot ──────────────────────────────────────────

class TestSlotPins:
    def _setup(self, db, components):
        machine = make_machine(db, positions=40)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        for index, comp in enumerate(components, start=1):
            db.add(BomItem(
                bom_revision_id=revision.id, reference_item=f"R{index}", quantity=1,
                footprint_pnp=comp.footprint_pnp, value_harmonized=comp.value, dnp=False,
            ))
        link_revision(db, production, revision, order=1, quantity=1)
        db.commit()
        return machine, production

    def test_pin_places_component_at_slot(self, db):
        comp = make_component(db, reference="RP", value="VP", footprint="R0805")
        machine, production = self._setup(db, [comp])
        plan = AssignmentPlanningMixin.set_slot_pin(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=comp.id, slot_position=5,
        )
        assignment = next(a for a in plan["slot_assignments"] if a["component_id"] == comp.id)
        assert assignment["slot_start"] == 5
        assert assignment.get("is_pinned") is True

    def test_pin_conflict_rejected(self, db):
        c1 = make_component(db, reference="C1", value="V1", footprint="R0805")
        c2 = make_component(db, reference="C2", value="V2", footprint="R0603")
        machine, production = self._setup(db, [c1, c2])
        AssignmentPlanningMixin.set_slot_pin(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=c1.id, slot_position=5,
        )
        with pytest.raises(ValueError):
            AssignmentPlanningMixin.set_slot_pin(
                db=db, machine_id=machine.id, production_id=production.id,
                component_id=c2.id, slot_position=5,
            )

    def test_pin_out_of_range_rejected(self, db):
        comp = make_component(db, reference="RP2", value="VP2", footprint="R0805")
        machine, production = self._setup(db, [comp])
        with pytest.raises(ValueError):
            AssignmentPlanningMixin.set_slot_pin(
                db=db, machine_id=machine.id, production_id=production.id,
                component_id=comp.id, slot_position=999,
            )

    def test_clear_pin(self, db):
        comp = make_component(db, reference="RP3", value="VP3", footprint="R0805")
        machine, production = self._setup(db, [comp])
        AssignmentPlanningMixin.set_slot_pin(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=comp.id, slot_position=7,
        )
        plan = AssignmentPlanningMixin.clear_slot_pin(
            db=db, machine_id=machine.id, production_id=production.id, component_id=comp.id,
        )
        assignment = next(a for a in plan["slot_assignments"] if a["component_id"] == comp.id)
        assert not assignment.get("is_pinned")


# ── Tests: pose à la main forcée ─────────────────────────────────────────────

class TestForcedManualPlacement:
    def _setup(self, db, comp):
        machine = make_machine(db, positions=40)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="R1", quantity=1,
            footprint_pnp=comp.footprint_pnp, value_harmonized=comp.value, dnp=False,
        ))
        link_revision(db, production, revision, order=1, quantity=1)
        db.commit()
        return machine, production

    def test_force_manual_excludes_from_pnp(self, db):
        comp = make_component(db, reference="FM", value="VFM", footprint="R0805")
        machine, production = self._setup(db, comp)
        plan = AssignmentPlanningMixin.set_manual_placement(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=comp.id, manual=True,
        )
        assigned = {a["component_id"] for a in plan["slot_assignments"]}
        manual = {m["component_id"]: m for m in plan["manual_placement_components"]}
        assert comp.id not in assigned
        assert comp.id in manual
        assert manual[comp.id]["forced_manual"] is True
        assert plan["forced_manual_count"] == 1

    def test_unset_manual_returns_to_pnp(self, db):
        comp = make_component(db, reference="FM2", value="VFM2", footprint="R0805")
        machine, production = self._setup(db, comp)
        AssignmentPlanningMixin.set_manual_placement(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=comp.id, manual=True,
        )
        plan = AssignmentPlanningMixin.set_manual_placement(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=comp.id, manual=False,
        )
        assigned = {a["component_id"] for a in plan["slot_assignments"]}
        assert comp.id in assigned
        assert plan["forced_manual_count"] == 0

    def test_force_manual_clears_pin(self, db):
        comp = make_component(db, reference="FM3", value="VFM3", footprint="R0805")
        machine, production = self._setup(db, comp)
        AssignmentPlanningMixin.set_slot_pin(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=comp.id, slot_position=9,
        )
        plan = AssignmentPlanningMixin.set_manual_placement(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=comp.id, manual=True,
        )
        # Le composant est en manuel, et n'apparaît plus comme épinglé/assigné.
        assigned = {a["component_id"] for a in plan["slot_assignments"]}
        assert comp.id not in assigned
        assert plan["forced_manual_count"] == 1

    def test_force_manual_on_component_without_feeder_size(self, db):
        # Connecteur/bouton SANS taille de feeder : par défaut dans « à compléter ».
        comp = Component(
            reference="CONN1", value="VCONN", package="CONNECTEUR",
            footprint_pnp="CONNECTEUR", feeder_type=None, is_fixed_feeder=False,
        )
        db.add(comp)
        db.flush()
        machine, production = self._setup(db, comp)

        plan0 = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
        )
        before = {m["component_id"]: m for m in plan0["manual_placement_components"]}
        assert before[comp.id].get("needs_feeder_size") is True

        # Forcer en pose à la main → passe en « à placer à la main » (forcé), plus
        # en « à compléter », même sans taille de feeder.
        plan = AssignmentPlanningMixin.set_manual_placement(
            db=db, machine_id=machine.id, production_id=production.id,
            component_id=comp.id, manual=True,
        )
        after = {m["component_id"]: m for m in plan["manual_placement_components"]}
        assert after[comp.id].get("forced_manual") is True
        assert not after[comp.id].get("needs_feeder_size")
        assert plan["forced_manual_count"] == 1
        assert plan["missing_feeder_size_count"] == 0


# ── Tests: placement auto dynamiques→avant / fixés→arrière ───────────────────

class TestRampSegregation:
    def test_dynamic_goes_front_fixed_goes_back(self, db):
        # 8 positions : rampe AVANT = positions 1..4, rampe ARRIÈRE = 5..8.
        machine = make_machine(db, positions=8)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        dyn = Component(
            reference="RD", value="VD", package="0805",
            footprint_pnp="R0805_D", feeder_type="CL8-4", is_fixed_feeder=False,
        )
        fix = Component(
            reference="RF", value="VF", package="0805",
            footprint_pnp="R0805_F", feeder_type="CL8-4", is_fixed_feeder=True,
        )
        db.add_all([dyn, fix])
        db.flush()
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="R1", quantity=1,
            footprint_pnp=dyn.footprint_pnp, value_harmonized=dyn.value, dnp=False,
        ))
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="R2", quantity=1,
            footprint_pnp=fix.footprint_pnp, value_harmonized=fix.value, dnp=False,
        ))
        link_revision(db, production, revision, order=1, quantity=1)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
        )
        by_group = {a["placement_group"]: a for a in plan["slot_assignments"]}
        assert by_group["DYNAMIC"]["slot_positions"][0] <= 4   # rampe avant
        assert by_group["FIXED"]["slot_positions"][0] >= 5     # rampe arrière

    def test_bilateral_fill_small_left_big_flush_right(self, db):
        # 12 positions → rampe avant = positions 1..6. Petit feeder (8 mm) collé
        # au bord GAUCHE (pos 1) ; gros feeder (12 mm, 2 pos) collé au bord DROIT
        # (pos 5-6) ; creux au milieu (pos 2,3,4 libres).
        machine = make_machine(db, positions=12)
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        small = Component(
            reference="RS", value="SMALL", package="0805",
            footprint_pnp="0805", feeder_type="CL8-4", is_fixed_feeder=False,
        )
        big = Component(
            reference="RB", value="BIG", package="0805",
            footprint_pnp="0805", feeder_type="CL12", is_fixed_feeder=False,
        )
        db.add_all([small, big])
        db.flush()
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="R1", quantity=1,
            footprint_pnp="0805", value_harmonized="SMALL", dnp=False,
        ))
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="R2", quantity=1,
            footprint_pnp="0805", value_harmonized="BIG", dnp=False,
        ))
        link_revision(db, production, revision, order=1, quantity=1)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
        )
        positions_by_id = {a["component_id"]: a["slot_positions"] for a in plan["slot_assignments"]}
        assert positions_by_id[small.id] == [1]          # bord gauche
        assert positions_by_id[big.id] == [5, 6]         # collé au bord droit (front_cols=6)
        occupied = {p for plist in positions_by_id.values() for p in plist}
        assert occupied.isdisjoint({2, 3, 4})            # creux au milieu


class TestNozzleClamping:
    def test_0603_uses_smallest_available_nozzle(self, db):
        # La machine n'a que des nozzles 503/504/505. Un 0603 (déduit 502) doit
        # être ramené à 503 dans l'implantation (et donc à l'export).
        machine = make_machine(db, positions=40)
        machine.num_nozzles = 8
        machine.nozzle_layout = json.dumps([503, 503, 504, 504, 504, 505, 505, 505])
        db.flush()
        production = make_production(db, machine)
        revision = make_bom_revision(db)
        comp = Component(
            reference="R0603", value="10K0603", package="0603",
            footprint_pnp="0603", feeder_type="CL8-4", is_fixed_feeder=False,
        )
        db.add(comp)
        db.flush()
        db.add(BomItem(
            bom_revision_id=revision.id, reference_item="R1", quantity=1,
            footprint_pnp="0603", value_harmonized="10K0603", dnp=False,
        ))
        link_revision(db, production, revision, order=1, quantity=1)
        db.commit()

        plan = AssignmentPlanningMixin.get_machine_production_feeder_plan(
            db=db, machine_id=machine.id, production_id=production.id,
        )
        nozzles = {a["component_id"]: a["nozzle_type"] for a in plan["slot_assignments"]}
        assert nozzles[comp.id] == 503
