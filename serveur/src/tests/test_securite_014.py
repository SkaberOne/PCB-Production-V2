"""Tests de non-régression — durcissement sécurité backend (prompt 014).

Couvre : message d'erreur 500 générique (pas de fuite), neutralisation de la
traversée de chemin (`..`) + confinement sous la racine de stockage, confinement
de `root_path` pour l'import catalogue, plafonnement des uploads (413), parseur
XML durci (defusedxml), et fail-fast API_KEY en production.
"""
from pathlib import Path

import pytest

from src.config import settings
from src.services.bom_file_service import BomFileService
from src.services.stock_service import StockService

from .conftest import client, TestingSessionLocal


# ── Item 2 : path traversal ───────────────────────────────────────────────────
def test_sanitize_segment_neutralise_traversee():
    assert BomFileService.sanitize_segment("..") == "UNDEFINED"
    assert BomFileService.sanitize_segment(".") == "UNDEFINED"
    assert BomFileService.sanitize_segment("") == "UNDEFINED"
    assert BomFileService.sanitize_segment("   ") == "UNDEFINED"
    # lecture normale préservée
    assert BomFileService.sanitize_segment("KT190562") == "KT190562"


def test_assert_within_root_refuse_sortie(tmp_path):
    svc = BomFileService(storage_root=str(tmp_path))
    with pytest.raises(ValueError):
        svc._assert_within_root(Path(tmp_path) / ".." / "evil.txt")
    # chemin descendant accepté
    svc._assert_within_root(Path(tmp_path) / "ref" / "rev" / "file.txt")


# ── Item 3 : énumération via root_path ────────────────────────────────────────
def test_import_catalogue_refuse_root_hors_racine(tmp_path):
    with TestingSessionLocal() as s:
        StockService.set_projects_root_path(s, str(tmp_path))
    resp = client.post(
        "/api/bom/import-catalogue",
        params={"dry_run": True, "root_path": str(tmp_path.parent)},
    )
    assert resp.status_code == 403, resp.text


def test_import_catalogue_sans_racine_configuree_422(tmp_path):
    resp = client.post(
        "/api/bom/import-catalogue",
        params={"dry_run": True, "root_path": str(tmp_path)},
    )
    assert resp.status_code == 422, resp.text


# ── Item 4 : upload plafonné ──────────────────────────────────────────────────
def test_upload_pdf_plafonne_413(monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    big = b"%PDF-1.4\n" + b"0" * (2 * 1024 * 1024)  # ~2 Mo > 1 Mo
    resp = client.post(
        "/api/marketplace/client-orders/import-pdf",
        files={"file": ("big.pdf", big, "application/pdf")},
    )
    assert resp.status_code == 413, resp.text


# ── Item 1 : 500 générique, sans fuite ────────────────────────────────────────
def test_500_message_generique_sans_fuite(monkeypatch):
    from src.services.assignment_service import AssignmentService

    def boom(*a, **k):
        raise RuntimeError("SECRET_INTERNAL_abcxyz")

    monkeypatch.setattr(AssignmentService, "list_carts", boom)
    resp = client.get("/api/marketplace/carts")
    assert resp.status_code == 500
    assert resp.json() == {"detail": "Erreur interne du serveur."}
    assert "SECRET_INTERNAL_abcxyz" not in resp.text


# ── Item 5 : XML durci ────────────────────────────────────────────────────────
def test_parser_eagle_uses_defusedxml():
    from src.services.cao import parser_eagle

    assert parser_eagle.ET.__name__.startswith("defusedxml")


# ── Item 8 : fail-fast API_KEY en production ──────────────────────────────────
def test_fail_fast_api_key_en_production(monkeypatch):
    from src import app as app_module

    monkeypatch.setattr(app_module.settings, "api_env", "production")
    monkeypatch.setattr(app_module.settings, "api_key", None)
    with pytest.raises(RuntimeError):
        app_module.create_app()


def test_create_app_ok_en_production_avec_cle(monkeypatch):
    from src import app as app_module

    monkeypatch.setattr(app_module.settings, "api_env", "production")
    monkeypatch.setattr(app_module.settings, "api_key", "un-secret")
    # ne doit pas lever
    app_module.create_app()
