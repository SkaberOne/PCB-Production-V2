"""
Unit/integration tests for AssignmentFixedFeederMixin service methods.

Uses the shared SQLite engine from conftest.py.
"""
import pytest
from sqlalchemy.orm import Session

from tests.conftest import TestingSessionLocal, engine
from src.database import Base
from src.models.bom import BomReference, BomRevision, BomItem, Component
from src.models.machines import PnpCart, PnpFeeder
from src.services.assignment_fixed_feeders import AssignmentFixedFeederMixin


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

def make_cart(db, name="CART-COMMON", kind=PnpCart.KindEnum.COMMON, capacity=20, category=None):
    cart = PnpCart(
        name=name,
        kind=kind,
        capacity_positions=capacity,
        target_category=category,
    )
    db.add(cart)
    db.flush()
    return cart


def make_feeder(db, size_mm=12, capacity=100):
    # PnpFeeder has unique constraint on size_mm; use non-default to avoid conflicts
    feeder = PnpFeeder(size_mm=size_mm, capacity=capacity)
    db.add(feeder)
    db.flush()
    return feeder


def make_component(db, reference="R0805", value="10K", footprint="R0805", feeder_type="CL8-4"):
    component = Component(
        reference=reference,
        value=value,
        package="0805",
        footprint_pnp=footprint,
        feeder_type=feeder_type,
        is_fixed_feeder=False,
    )
    db.add(component)
    db.flush()
    return component


def make_active_bom_with_item(db, component, reference="PROJ-01", revision="A", category="Resistor"):
    ref = BomReference(reference=reference, category=category)
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
    item = BomItem(
        bom_revision_id=rev.id,
        reference_designator="R1",
        quantity=2,
        footprint_pnp=component.footprint_pnp,
        value=component.value,
        dnp=False,
    )
    db.add(item)
    db.flush()
    return ref, rev, item


# ── Tests: calculate_fixed_feeders ────────────────────────────────────────────

class TestCalculateFixedFeeders:
    def test_raises_when_no_common_or_category_cart(self, db):
        make_cart(db, kind=PnpCart.KindEnum.CUSTOM)
        component = make_component(db)
        make_active_bom_with_item(db, component)
        db.commit()

        with pytest.raises(ValueError, match="COMMON ou CATEGORY"):
            AssignmentFixedFeederMixin.calculate_fixed_feeders(db=db)

    def test_raises_when_no_components(self, db):
        make_cart(db, kind=PnpCart.KindEnum.COMMON)
        db.commit()

        with pytest.raises(ValueError, match="bibliotheque composants"):
            AssignmentFixedFeederMixin.calculate_fixed_feeders(db=db)

    def test_raises_when_no_active_bom(self, db):
        make_cart(db, kind=PnpCart.KindEnum.COMMON)
        make_component(db)
        # No BOM revisions at all → no usage data
        db.commit()

        with pytest.raises(ValueError, match="BOM ACTIVE"):
            AssignmentFixedFeederMixin.calculate_fixed_feeders(db=db)

    def test_assigns_multi_bom_component_to_common_cart(self, db):
        """A component used in 2+ BOM references should land on a COMMON cart."""
        cart = make_cart(db, name="CART-C", kind=PnpCart.KindEnum.COMMON, capacity=50)
        component = make_component(db, reference="C-MULTI")

        # Appear in 2 different BOM references → qualifies as common
        make_active_bom_with_item(db, component, reference="PROJ-A", revision="A", category="Resistor")
        make_active_bom_with_item(db, component, reference="PROJ-B", revision="A", category="Resistor")
        db.commit()

        result = AssignmentFixedFeederMixin.calculate_fixed_feeders(db=db)

        db.expire_all()
        db.refresh(component)
        assert component.is_fixed_feeder is True
        assert component.fixed_cart_id == cart.id
        assert result["assigned_count"] >= 1

    def test_assigns_single_category_component_to_category_cart(self, db):
        """A component used in only one BOM and one category should go to the matching category cart."""
        cart = make_cart(
            db, name="CART-RES", kind=PnpCart.KindEnum.CATEGORY, capacity=50, category="Resistor"
        )
        component = make_component(db, reference="C-CAT")
        make_active_bom_with_item(db, component, reference="PROJ-X", revision="A", category="Resistor")
        db.commit()

        result = AssignmentFixedFeederMixin.calculate_fixed_feeders(db=db)

        db.expire_all()
        db.refresh(component)
        assert component.is_fixed_feeder is True
        assert component.fixed_cart_id == cart.id

    def test_skips_component_when_no_cart_capacity(self, db):
        """When no cart has enough capacity, component should not be assigned."""
        make_cart(db, name="TINY", kind=PnpCart.KindEnum.COMMON, capacity=0)
        component = make_component(db, reference="C-BIG", feeder_type="CL56")  # slot_usage > 0
        make_active_bom_with_item(db, component, reference="PROJ-A", revision="A", category="Resistor")
        make_active_bom_with_item(db, component, reference="PROJ-B", revision="A", category="Resistor")
        db.commit()

        result = AssignmentFixedFeederMixin.calculate_fixed_feeders(db=db)

        db.expire_all()
        db.refresh(component)
        # No capacity → not assigned
        assert component.is_fixed_feeder is False or component.fixed_cart_id is None
        assert result.get("skipped_capacity_count", 0) >= 1 or result.get("skipped_no_cart_count", 0) >= 1

    def test_preserves_custom_fixed_feeder_assignments(self, db):
        """Components manually assigned to a CUSTOM cart must not be touched by calculate."""
        custom_cart = make_cart(db, name="CUSTOM-CART", kind=PnpCart.KindEnum.CUSTOM, capacity=10)
        auto_cart = make_cart(db, name="AUTO-CART", kind=PnpCart.KindEnum.COMMON, capacity=50)
        component = make_component(db, reference="C-CUSTOM")
        component.is_fixed_feeder = True
        component.fixed_cart = custom_cart
        component.fixed_cart_id = custom_cart.id

        # Needs another component in active BOM for calculate() to not raise
        other = make_component(db, reference="C-OTHER")
        make_active_bom_with_item(db, other, reference="PROJ-A", revision="A", category="Resistor")
        make_active_bom_with_item(db, other, reference="PROJ-B", revision="A", category="Resistor")
        db.commit()

        AssignmentFixedFeederMixin.calculate_fixed_feeders(db=db)

        db.expire_all()
        db.refresh(component)
        # Custom assignment preserved
        assert component.fixed_cart_id == custom_cart.id
        assert component.is_fixed_feeder is True

    def test_result_contains_expected_keys(self, db):
        cart = make_cart(db, kind=PnpCart.KindEnum.COMMON, capacity=50)
        component = make_component(db)
        make_active_bom_with_item(db, component, reference="PROJ-A", revision="A")
        make_active_bom_with_item(db, component, reference="PROJ-B", revision="A")
        db.commit()

        result = AssignmentFixedFeederMixin.calculate_fixed_feeders(db=db)

        for key in ("assigned_count", "changed_count", "carts"):
            assert key in result, f"Missing key: {key}"


# ── Tests: list_fixed_feeder_components ───────────────────────────────────────

class TestListFixedFeederComponents:
    def test_returns_only_fixed_feeders_by_default(self, db):
        cart = make_cart(db, kind=PnpCart.KindEnum.CUSTOM)
        fixed = make_component(db, reference="C-FIXED")
        fixed.is_fixed_feeder = True
        fixed.fixed_cart = cart
        fixed.fixed_cart_id = cart.id
        _unfixed = make_component(db, reference="C-FREE", value="100K")
        db.commit()

        rows, total, _unmatched = AssignmentFixedFeederMixin.list_fixed_feeder_components(
            db=db, only_fixed=True
        )

        assert all(row["is_fixed_feeder"] or row.get("fixed_cart_id") for row in rows)
        assert any(row["reference"] == "C-FIXED" for row in rows)
        assert not any(row["reference"] == "C-FREE" for row in rows)

    def test_returns_all_components_when_only_fixed_false(self, db):
        make_component(db, reference="C-A")
        make_component(db, reference="C-B", value="100K")
        db.commit()

        rows, total, _unmatched = AssignmentFixedFeederMixin.list_fixed_feeder_components(
            db=db, only_fixed=False
        )

        assert total == 2
        references = {row["reference"] for row in rows}
        assert "C-A" in references
        assert "C-B" in references

    def test_search_filters_by_reference(self, db):
        make_component(db, reference="RESC0805")
        make_component(db, reference="CAPC0402", value="100nF")
        db.commit()

        rows, total, _unmatched = AssignmentFixedFeederMixin.list_fixed_feeder_components(
            db=db, only_fixed=False, search="RESC"
        )

        assert all("RESC" in row["reference"].upper() for row in rows)

    def test_limit_and_offset_pagination(self, db):
        for i in range(5):
            make_component(db, reference=f"COMP-{i:02d}", value=f"{i}K")
        db.commit()

        rows_page1, total, _ = AssignmentFixedFeederMixin.list_fixed_feeder_components(
            db=db, only_fixed=False, limit=2, offset=0
        )
        rows_page2, _, _ = AssignmentFixedFeederMixin.list_fixed_feeder_components(
            db=db, only_fixed=False, limit=2, offset=2
        )

        assert total == 5
        assert len(rows_page1) == 2
        assert len(rows_page2) == 2
        # Pages should not overlap
        refs_p1 = {row["reference"] for row in rows_page1}
        refs_p2 = {row["reference"] for row in rows_page2}
        assert refs_p1.isdisjoint(refs_p2)


# ── Tests: update_fixed_feeder_component ─────────────────────────────────────

class TestUpdateFixedFeederComponent:
    def test_marks_component_as_fixed(self, db):
        cart = make_cart(db, kind=PnpCart.KindEnum.CUSTOM)
        component = make_component(db)
        db.commit()

        updated = AssignmentFixedFeederMixin.update_fixed_feeder_component(
            db=db,
            component_id=component.id,
            is_fixed_feeder=True,
            fixed_cart_id=cart.id,
            fixed_cart_id_provided=True,
        )

        assert updated.is_fixed_feeder is True
        assert updated.fixed_cart_id == cart.id

    def test_removes_fixed_feeder_assignment(self, db):
        cart = make_cart(db, kind=PnpCart.KindEnum.CUSTOM)
        component = make_component(db)
        component.is_fixed_feeder = True
        component.fixed_cart = cart
        component.fixed_cart_id = cart.id
        db.commit()

        updated = AssignmentFixedFeederMixin.update_fixed_feeder_component(
            db=db,
            component_id=component.id,
            is_fixed_feeder=False,
            fixed_cart_id=None,
            fixed_cart_id_provided=True,
        )

        assert updated.is_fixed_feeder is False
        assert updated.fixed_cart_id is None

    def test_raises_when_component_not_found(self, db):
        with pytest.raises(ValueError, match="not found"):
            AssignmentFixedFeederMixin.update_fixed_feeder_component(
                db=db,
                component_id=99999,
                is_fixed_feeder=True,
                fixed_cart_id=1,
                fixed_cart_id_provided=True,
            )

    def test_raises_when_cart_not_found(self, db):
        component = make_component(db)
        db.commit()

        with pytest.raises(ValueError, match="not found"):
            AssignmentFixedFeederMixin.update_fixed_feeder_component(
                db=db,
                component_id=component.id,
                is_fixed_feeder=True,
                fixed_cart_id=99999,
                fixed_cart_id_provided=True,
            )

    def test_raises_when_fixed_feeder_but_no_cart_id(self, db):
        component = make_component(db)
        db.commit()

        with pytest.raises(ValueError, match="chariot fixe est obligatoire"):
            AssignmentFixedFeederMixin.update_fixed_feeder_component(
                db=db,
                component_id=component.id,
                is_fixed_feeder=True,
                fixed_cart_id=None,
                fixed_cart_id_provided=True,
            )

    def test_updates_feeder_type_when_feeder_id_provided(self, db):
        feeder = make_feeder(db, size_mm=12)
        cart = make_cart(db, kind=PnpCart.KindEnum.CUSTOM)
        component = make_component(db, feeder_type="CL8-4")
        db.commit()

        updated = AssignmentFixedFeederMixin.update_fixed_feeder_component(
            db=db,
            component_id=component.id,
            is_fixed_feeder=True,
            fixed_cart_id=cart.id,
            fixed_cart_id_provided=True,
            feeder_id=feeder.id,
        )

        # feeder_type_from_size_mm(12) → "CL12"
        assert updated.feeder_type == "CL12"

    def test_raises_when_feeder_id_not_found(self, db):
        cart = make_cart(db, kind=PnpCart.KindEnum.CUSTOM)
        component = make_component(db)
        db.commit()

        with pytest.raises(ValueError, match="Feeder.*not found"):
            AssignmentFixedFeederMixin.update_fixed_feeder_component(
                db=db,
                component_id=component.id,
                is_fixed_feeder=True,
                fixed_cart_id=cart.id,
                fixed_cart_id_provided=True,
                feeder_id=99999,
            )


# ── Tests: _select_cart_with_capacity (static helper) ────────────────────────

class TestSelectCartWithCapacity:
    def test_returns_first_cart_with_sufficient_capacity(self, db):
        cart_a = make_cart(db, name="A", capacity=10)
        cart_b = make_cart(db, name="B", capacity=5)
        db.commit()

        remaining = {cart_a.id: 10, cart_b.id: 5}
        selected, status = AssignmentFixedFeederMixin._select_cart_with_capacity(
            [cart_a, cart_b], remaining, required_positions=4
        )

        assert selected is cart_a
        assert status == "assigned"
        assert remaining[cart_a.id] == 6

    def test_returns_no_cart_when_empty_list(self, db):
        selected, status = AssignmentFixedFeederMixin._select_cart_with_capacity(
            [], {}, required_positions=1
        )
        assert selected is None
        assert status == "no_cart"

    def test_returns_capacity_status_when_all_full(self, db):
        cart = make_cart(db, capacity=2)
        db.commit()

        remaining = {cart.id: 1}
        selected, status = AssignmentFixedFeederMixin._select_cart_with_capacity(
            [cart], remaining, required_positions=3
        )

        assert selected is None
        assert status == "capacity"

    def test_decrements_remaining_positions_on_assignment(self, db):
        cart = make_cart(db, capacity=10)
        db.commit()

        remaining = {cart.id: 10}
        AssignmentFixedFeederMixin._select_cart_with_capacity(
            [cart], remaining, required_positions=4
        )

        assert remaining[cart.id] == 6
