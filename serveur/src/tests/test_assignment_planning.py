"""
Unit/integration tests for AssignmentPlanningMixin service methods.

Uses the shared SQLite engine from conftest.py.
"""
import pytest
from sqlalchemy.orm import Session

from tests.conftest import TestingSessionLocal, engine
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
            reference_designator="R1",
            quantity=2,
            footprint_pnp=component.footprint_pnp,
            value=component.value,
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
            reference_designator="R1",
            quantity=1,
            footprint_pnp=component.footprint_pnp,
            value=component.value,
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
