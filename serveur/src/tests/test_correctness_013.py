"""Non-regression tests for prompt 013 — correctness backend.

Couvre les 4 correctifs :
  1+2. ``AssignmentPlanningMixin.check_machine_capacity`` renvoie des valeurs
       cohérentes (PnpMachine + comptage des PlanAssignment du plan), sans
       division par zéro quand la machine n'a pas de positions.
  3.   ``ProductionService.auto_assign_components`` lève ``ValueError`` quand la
       capacité machine est insuffisante, au lieu de tronquer silencieusement.
  4.   ``ProductionWorkspaceService.delete_production`` purge ProductionRun +
       ProductionComponentProgress avant le delete → suppression sans FK error
       (test avec ``PRAGMA foreign_keys=ON`` pour reproduire le comportement prod
       SQL Server, SQLite n'appliquant pas les FK par défaut).
"""
import pytest
from sqlalchemy import text

from src.tests.conftest import TestingSessionLocal, engine
from src.database import Base
from src.models.bom import BomReference, BomRevision, BomItem, Component
from src.models.commands import Command, CommandItem, ProductionPlan, PlanAssignment
from src.models.machines import PnpMachine
from src.models.production import (
    Production,
    ProductionRun,
    ProductionComponentProgress,
)
from src.services.assignment_planning import AssignmentPlanningMixin
from src.services.production_service import ProductionService
from src.services.production_workspace_service import ProductionWorkspaceService


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


@pytest.fixture
def db_fk():
    """Session avec ``PRAGMA foreign_keys=ON`` (reproduit l'enforcement FK prod)."""
    session = TestingSessionLocal()
    session.execute(text("PRAGMA foreign_keys = ON"))
    try:
        yield session
    finally:
        session.close()


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_machine(db, name="M1", positions=4):
    machine = PnpMachine(name=name, num_positions=positions)
    db.add(machine)
    db.flush()
    return machine


def make_plan(db, machine):
    command = Command(name="CMD-013")
    db.add(command)
    db.flush()
    plan = ProductionPlan(command_id=command.id, machine_id=machine.id)
    db.add(plan)
    db.flush()
    return command, plan


def make_component(db, reference, value, footprint):
    component = Component(
        reference=reference,
        value=value,
        package=footprint,
        footprint_pnp=footprint,
        feeder_type="CL8-4",
        is_fixed_feeder=False,
    )
    db.add(component)
    db.flush()
    return component


# ── Fix 1+2 : check_machine_capacity ──────────────────────────────────────────

def test_check_machine_capacity_counts_plan_assignments(db):
    machine = make_machine(db, positions=4)
    command, plan = make_plan(db, machine)
    c1 = make_component(db, "R1", "10K", "R0805")
    c2 = make_component(db, "C1", "100N", "C0805")
    db.add(PlanAssignment(production_plan_id=plan.id, feeder_position=1,
                          component_id=c1.id, quantity=5))
    db.add(PlanAssignment(production_plan_id=plan.id, feeder_position=2,
                          component_id=c2.id, quantity=3))
    db.commit()

    result = AssignmentPlanningMixin.check_machine_capacity(db, machine.id, plan.id)

    assert result["machine_positions"] == 4
    assert result["assigned_positions"] == 2
    assert result["available_positions"] == 2
    assert result["has_capacity"] is True
    assert result["capacity_utilization"] == 50.0


def test_check_machine_capacity_over_capacity_flagged(db):
    machine = make_machine(db, positions=1)
    command, plan = make_plan(db, machine)
    c1 = make_component(db, "R1", "10K", "R0805")
    c2 = make_component(db, "C1", "100N", "C0805")
    db.add(PlanAssignment(production_plan_id=plan.id, feeder_position=1,
                          component_id=c1.id, quantity=1))
    db.add(PlanAssignment(production_plan_id=plan.id, feeder_position=2,
                          component_id=c2.id, quantity=1))
    db.commit()

    result = AssignmentPlanningMixin.check_machine_capacity(db, machine.id, plan.id)

    assert result["assigned_positions"] == 2
    assert result["available_positions"] == -1
    assert result["has_capacity"] is False


def test_check_machine_capacity_zero_positions_no_zero_division(db):
    machine = make_machine(db, positions=0)
    command, plan = make_plan(db, machine)
    db.commit()

    result = AssignmentPlanningMixin.check_machine_capacity(db, machine.id, plan.id)

    assert result["machine_positions"] == 0
    assert result["assigned_positions"] == 0
    assert result["capacity_utilization"] == 0.0


# ── Fix 3 : auto_assign_components lève au lieu de tronquer ─────────────────────

def test_auto_assign_raises_on_insufficient_capacity(db):
    machine = make_machine(db, positions=1)  # 1 seule position libre
    command = Command(name="CMD-AUTO")
    db.add(command)
    db.flush()

    ref = BomReference(reference="PROJ-013", category="Mixte")
    db.add(ref)
    db.flush()
    rev = BomRevision(
        bom_ref_id=ref.id,
        revision="A",
        type=BomRevision.TypeEnum.TOP,
        status=BomRevision.StatusEnum.ACTIVE,
    )
    db.add(rev)
    db.flush()

    # 2 composants distincts + 2 lignes BOM qui les résolvent → 2 composants à
    # placer pour 1 seule position.
    c1 = make_component(db, "R1", "10K", "R0805")
    c2 = make_component(db, "C1", "100N", "C0805")
    db.add(BomItem(bom_revision_id=rev.id, reference_item="R1", quantity=1,
                   footprint_pnp="R0805", value_harmonized="10K", dnp=False))
    db.add(BomItem(bom_revision_id=rev.id, reference_item="C1", quantity=1,
                   footprint_pnp="C0805", value_harmonized="100N", dnp=False))

    plan = ProductionPlan(command_id=command.id, machine_id=machine.id)
    db.add(plan)
    db.flush()
    db.add(CommandItem(command_id=command.id, bom_revision_id=rev.id,
                       quantity_to_produce=1))
    db.commit()

    with pytest.raises(ValueError, match="Capacite machine insuffisante"):
        ProductionService.auto_assign_components(db, plan.id)


# ── Fix 4 : delete_production purge les enfants (FK ON) ─────────────────────────

def test_delete_production_with_run_and_progress(db_fk):
    db = db_fk
    machine = make_machine(db, positions=4)
    component = make_component(db, "R1", "10K", "R0805")

    production = Production(name="PROD-013", machine_id=machine.id)
    db.add(production)
    db.flush()

    db.add(ProductionRun(production_id=production.id, machine_id=machine.id,
                         boards_produced=10))
    db.add(ProductionComponentProgress(production_id=production.id,
                                       component_id=component.id,
                                       is_prepared=True))
    db.commit()

    pid = production.id
    ProductionWorkspaceService.delete_production(db, pid)

    assert db.query(Production).filter(Production.id == pid).first() is None
    assert db.query(ProductionRun).filter(
        ProductionRun.production_id == pid).count() == 0
    assert db.query(ProductionComponentProgress).filter(
        ProductionComponentProgress.production_id == pid).count() == 0
