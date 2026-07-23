"""Import en masse du catalogue depuis le dépôt de conception (prompt 011).

Parcours **serveur** (lecture seule) du dossier racine **configuré dans les
Paramètres** (jamais codé en dur) : ``<racine>/KT<réf> - <nom>/Rev.X/Conception``.
Pour chaque (carte, révision) **Eagle absente** de la base, réutilise la chaîne
d'import CAO (006) pour créer BomReference/BomRevision/BomItems, puis crée en
bibliothèque les composants manquants (**MPN vide**). Eagle-only ; KiCad listé.
``dry_run`` : rapport sans écriture. Idempotent : révisions déjà en base ignorées.
"""

import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..models.bom import BomItem, BomReference, BomRevision, Component
from ..schemas.bom import CatalogueImportResponse
from ..services.catalogue_import_service import scan_catalogue
from ..services.cao.cao_import_service import prepare_cao_import
from ..services.stock_service import StockService
from ..database import get_db
from .bom_revision_imports import _persist_import_result
from .bom_support import (
    _apply_machine_footprint_catalog_defaults,
    _get_component_lookup,
    _get_footprint_lookup,
    _normalize_component_package_fields,
    bom_service,
    component_library_service,
    component_type_service,
)

router = APIRouter(tags=["bom"])


def _existing_revision_keys(db: Session) -> set:
    """Ensemble ``(RÉFÉRENCE, RÉVISION)`` (majuscules) déjà en base."""
    keys = set()
    rows = (
        db.query(BomReference.reference, BomRevision.revision)
        .join(BomRevision, BomRevision.bom_ref_id == BomReference.id)
        .all()
    )
    for reference, revision in rows:
        if reference and revision:
            keys.add((str(reference).strip().upper(), str(revision).strip().upper()))
    return keys


def _register_missing_components(db: Session, revision_id: int) -> int:
    """Crée en bibliothèque les composants ``(valeur, empreinte)`` absents (MPN vide).

    Mutualise la logique de « Enregistrer dans la base » (résolution BOM) : un
    composant par couple distinct non déjà en bibliothèque.
    """
    created = 0
    items = db.query(BomItem).filter(BomItem.bom_revision_id == revision_id).all()
    lookup = _get_component_lookup(db)
    _existing_refs = {r for (r,) in db.query(Component.reference).all()}
    seen = set()
    for item in items:
        if bool(item.dnp):
            continue
        if component_library_service.match_bom_item(lookup, item):
            continue
        value = item.value_harmonized or item.value_raw
        if not value:
            continue
        footprint_eagle = item.footprint_eagle or item.footprint_pnp
        generated_reference = component_library_service.build_component_reference(
            value=value, mpn=value, footprint_eagle=footprint_eagle,
        )
        if generated_reference in seen:
            continue
        seen.add(generated_reference)
        if generated_reference in _existing_refs:
            continue
        component = Component(reference=generated_reference)
        component.value = value
        component.mpn = None
        component.component_type = component_type_service.resolve_reference(
            db, item.reference_item, current_type=item.component_type,
        ).component_type
        component.description = value
        component.footprint_eagle = item.footprint_eagle
        component.package, component.footprint_pnp = _normalize_component_package_fields(
            item.footprint_pnp, item.footprint_pnp,
        )
        component.notes = "Créé par import catalogue (MPN à renseigner)"
        _apply_machine_footprint_catalog_defaults(db, component, overwrite=False)
        db.add(component)
        _existing_refs.add(generated_reference)
        created += 1
    if created:
        db.commit()
    return created


def _import_card_revision(db, footprint_lookup, *, reference, name, revision, files, card_type):
    """Importe une révision Eagle (toutes ses faces) + crée les composants. → nb composants."""
    preparation = prepare_cao_import(files)
    if preparation is None or not preparation.supported or not preparation.faces:
        raise ValueError("aucun composant exploitable")

    components_created = 0
    for face in preparation.faces:
        fd, tmp_path = tempfile.mkstemp(suffix=".txt")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(face.text)
            import_result = bom_service.import_bom(tmp_path, footprint_lookup)
            if not import_result.success:
                raise ValueError("; ".join(import_result.errors[:3]) or "parsing CAO échoué")
            is_valid, validation_errors = bom_service.validate_bom_data(import_result.items)
            if not is_valid:
                raise ValueError("; ".join(validation_errors[:3]) or "payload invalide")
            response = _persist_import_result(
                db, import_result,
                reference=reference, revision=revision, side=face.side,
                name=name, card_type=card_type,
            )
            components_created += _register_missing_components(db, response.bom_revision_id)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    return components_created


@router.post("/import-catalogue", response_model=CatalogueImportResponse)
def import_catalogue(
    dry_run: bool = Query(default=True, description="Aperçu sans écriture (défaut)"),
    root_path: Optional[str] = Query(default=None, description="Override ; sinon le réglage Paramètres"),
    card_type: Optional[str] = Query(default=None, description="Type de carte par défaut (SIMPLE)"),
    db: Session = Depends(get_db),
):
    """Scanne le dépôt et importe les révisions Eagle absentes (ou aperçu si dry_run)."""
    configured_root = (StockService.get_projects_root_path(db) or "").strip()
    if not configured_root:
        raise HTTPException(status_code=422, detail="Aucun dossier des projets configuré (Paramètres).")

    # Confinement strict : le client ne peut pas énumérer un dossier arbitraire du
    # serveur. Un override `root_path` n'est accepté que s'il désigne la racine
    # configurée ou un de ses sous-dossiers (résolu, anti-traversée).
    base = Path(configured_root).resolve()
    if root_path and root_path.strip():
        candidate = Path(root_path.strip()).resolve()
        if candidate != base and base not in candidate.parents:
            raise HTTPException(
                status_code=403,
                detail="Le dossier demandé est hors du dépôt des projets configuré.",
            )
        root = str(candidate)
    else:
        root = str(base)

    scan = scan_catalogue(root)
    if not scan.exists:
        raise HTTPException(status_code=422, detail=f"Dossier racine introuvable : {root}")

    existing = _existing_revision_keys(db)
    footprint_lookup = None if dry_run else _get_footprint_lookup(db)

    rows = []
    revisions_imported = 0
    components_created = 0

    for card in scan.cards:
        for rev in card.revisions:
            key = (card.reference.upper(), rev.revision.upper())
            base = {"reference": card.reference, "name": card.name, "revision": rev.revision}
            if key in existing:
                rows.append({**base, "status": "ignored"})
            elif rev.kind == "kicad":
                rows.append({**base, "status": "kicad"})
            elif not rev.supported or not rev.files:
                rows.append({**base, "status": "empty"})
            elif dry_run:
                rows.append({**base, "status": "importable"})
            else:
                try:
                    created = _import_card_revision(
                        db, footprint_lookup,
                        reference=card.reference, name=card.name, revision=rev.revision,
                        files=rev.files, card_type=card_type,
                    )
                    revisions_imported += 1
                    components_created += created
                    existing.add(key)
                    rows.append({**base, "status": "imported", "message": f"{created} composant(s) créé(s)"})
                except Exception as exc:  # noqa: BLE001 - rapport par carte, on continue
                    db.rollback()
                    rows.append({**base, "status": "error", "message": str(exc)})

    return CatalogueImportResponse(
        root_path=root,
        dry_run=dry_run,
        cards_scanned=len(scan.cards),
        revisions_imported=revisions_imported,
        components_created=components_created,
        skipped_dirs=scan.skipped_dirs,
        skipped=[{"name": d.name, "reason": d.reason, "label": d.label} for d in scan.skipped],
        rows=rows,
    )
