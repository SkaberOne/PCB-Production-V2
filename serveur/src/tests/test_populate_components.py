"""Tests du remplissage COMPONENTS depuis les datasheets (matching + updates)."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base
import src.models  # noqa: F401  (enregistre toutes les tables pour create_all)
from src.models.bom import Component

import populate_components_from_datasheets as pop


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


class TestSelectComponent:
    def test_match_by_reference_case_insensitive(self, db):
        db.add(Component(reference="BAV199", mpn="BAV199"))
        db.commit()
        assert pop.select_component(db, "bav199", None) is not None

    def test_match_by_mpn(self, db):
        db.add(Component(reference="DIODE_A", mpn="BAV199"))
        db.commit()
        assert pop.select_component(db, "inconnu", "BAV199") is not None

    def test_no_match(self, db):
        assert pop.select_component(db, "RIEN", "RIEN") is None

    def test_match_by_value_with_suffix(self, db):
        # reference = ID interne, identifiant réel dans `value` (avec suffixe ,118)
        db.add(Component(reference="LIB-ABC", value="PSMN3R8-100BS,118"))
        db.commit()
        comp = pop.select_component(db, "PSMN3R8-100BS", None, value_token="PSMN3R8-100BS")
        assert comp is not None
        assert comp.reference == "LIB-ABC"

    def test_value_match_does_not_confuse_similar(self, db):
        db.add(Component(reference="LIB-DEF", value="DN1509K1-G"))
        db.commit()
        # DN2530 ne doit pas matcher DN1509
        assert pop.select_component(db, "DN2530", None, value_token="DN2530") is None


class TestComputeUpdates:
    def test_fills_empty_fields_only(self):
        comp = Component(reference="X", pitch_mm=99.0)  # déjà rempli
        extracted = {"pitch_mm": 4.0, "tape_width_mm": 8.0, "feeder": "CL8",
                     "qty_per_reel": None, "reel_outer_diameter_mm": None,
                     "reel_hub_diameter_mm": None}
        updates = pop.compute_updates(comp, extracted, package="0805", force=False)
        assert "pitch_mm" not in updates           # déjà renseigné -> pas touché
        assert updates["tape_width_mm"] == 8.0
        assert updates["feeder_type"] == "CL8"
        assert updates["package"] == "0805"

    def test_force_overwrites(self):
        comp = Component(reference="X", pitch_mm=99.0)
        extracted = {"pitch_mm": 4.0, "tape_width_mm": 8.0, "feeder": "CL8",
                     "qty_per_reel": None, "reel_outer_diameter_mm": None,
                     "reel_hub_diameter_mm": None}
        updates = pop.compute_updates(comp, extracted, package=None, force=True)
        assert updates["pitch_mm"] == 4.0


class TestProcessPdf:
    def test_match_and_fill_from_eia(self, db):
        db.add(Component(reference="BAV199", mpn="BAV199"))
        db.commit()
        # PDF inexistant -> texte vide -> seule la table EIA-481 (package 0805) alimente
        res = pop.process_pdf(db, "inexistant.pdf", reference="BAV199", package="0805")
        assert res["matched"] is True
        assert res["updates"]["pitch_mm"] == 4.0
        assert res["updates"]["tape_width_mm"] == 8.0
        assert res["updates"]["feeder_type"] == "CL8"
        comp = pop.select_component(db, "BAV199", None)
        assert comp.pitch_mm == 4.0  # l'objet ORM a bien été modifié

    def test_miss_when_no_component(self, db):
        res = pop.process_pdf(db, "inexistant.pdf", reference="ABSENT", package="0805")
        assert res["matched"] is False
        assert res["updates"] == {}
