"""BOM import endpoints (fichier `.txt` harmonisé + import CAO par dossier)."""

import os
import shutil
import tempfile
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models.bom import BomReference, BomRevision
from ..schemas.bom import BomImportResponse, CaoImportResponse
from ..services.cao.cao_import_service import prepare_cao_import
from ..utils.uploads import read_upload_capped
from .bom import get_db
from .bom_support import (
    _collapse_duplicate_revisions,
    _ensure_bom_category,
    _enum_value,
    _get_component_lookup,
    _get_footprint_lookup,
    _get_logical_revisions,
    _replace_revision_items,
    _serialize_bom_item,
    _try_save_revision_snapshot,
    bom_service,
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["bom"])


def _normalize_card_type(value: Optional[str]) -> str:
    """SIMPLE par défaut ; ASSEMBLY seulement si explicitement demandé."""
    return "ASSEMBLY" if str(value or "").strip().upper() == "ASSEMBLY" else "SIMPLE"


def _persist_import_result(
    db: Session,
    import_result,
    *,
    reference: str,
    revision: str,
    side: str,
    category: Optional[str] = None,
    description: Optional[str] = None,
    name: Optional[str] = None,
    card_type: Optional[str] = None,
) -> BomImportResponse:
    """Persiste un résultat d'import harmonisé (réf/révision/face) → réponse.

    Point d'entrée **commun** à l'import `.txt` et à l'import CAO : crée/actualise
    la `BomReference`, résout la révision logique, remplace les items et renvoie
    le payload sérialisé. La face (`side`) est appliquée à la révision ; chaque
    item conserve sa face via la chaîne de persistance existante.
    """
    bom_ref = db.query(BomReference).filter(BomReference.reference == reference).first()
    if not bom_ref:
        bom_ref = BomReference(
            reference=reference,
            category=_ensure_bom_category(db, category),
            description=description,
            name=(name.strip() or None) if name is not None else None,
            card_type=_normalize_card_type(card_type),
            created_at=utcnow(),
            updated_at=utcnow(),
        )
        db.add(bom_ref)
        db.flush()
    else:
        bom_ref.updated_at = utcnow()
        if category is not None:
            bom_ref.category = _ensure_bom_category(db, category)
        if description is not None:
            bom_ref.description = description
        # Nom : ne remplacer que si une valeur est fournie (vide = on ne touche
        # pas, pour préserver un nom déjà saisi sur la page Cartes).
        if name is not None and name.strip():
            bom_ref.name = name.strip()
        # Type : ne toucher que si explicitement fourni (évite de forcer SIMPLE
        # sur une carte déjà marquée ASSEMBLY lors d'un ré-import).
        if card_type is not None and card_type.strip():
            bom_ref.card_type = _normalize_card_type(card_type)

    existing_revisions = _get_logical_revisions(db, bom_ref.id, revision, side)
    if existing_revisions:
        bom_revision = existing_revisions[0]
        _collapse_duplicate_revisions(db, bom_revision, existing_revisions[1:])
        bom_revision.created_at = utcnow()
        bom_revision.status = BomRevision.StatusEnum.DRAFT
    else:
        bom_revision = BomRevision(
            bom_ref_id=bom_ref.id,
            revision=revision,
            type=BomRevision.TypeEnum(side),
            created_at=utcnow(),
            status=BomRevision.StatusEnum.DRAFT,
        )
        db.add(bom_revision)
        db.flush()

    persisted_items = _replace_revision_items(
        db,
        bom_revision,
        import_result.items,
        side,
    )

    db.commit()
    db.refresh(bom_revision)
    response_warnings = list(import_result.warnings)
    _try_save_revision_snapshot(bom_revision, warnings=response_warnings, action="import")

    component_lookup = _get_component_lookup(db)
    serialized_items = [_serialize_bom_item(db, item, component_lookup) for item in persisted_items]

    return BomImportResponse(
        success=True,
        bom_reference_id=bom_ref.id,
        bom_revision_id=bom_revision.id,
        reference=bom_ref.reference,
        revision=bom_revision.revision,
        side=_enum_value(bom_revision.type),
        status=_enum_value(bom_revision.status),
        message=f"Successfully imported {len(import_result.items)} items",
        item_count=len(import_result.items),
        items=serialized_items,
        stats=import_result.stats,
        errors=import_result.errors,
        warnings=response_warnings,
    )


@router.post("/import", response_model=BomImportResponse)
async def import_bom_file(
    file: UploadFile = File(...),
    reference: str = Query(..., min_length=1, max_length=100, description="BOM reference name"),
    revision: str = Query(default="REV_A", description="Revision identifier"),
    side: str = Query(default="TOP", pattern="^(TOP|BOT)$", description="PCB side: TOP or BOT"),
    category: Optional[str] = Query(None, description="Optional card category applied to the full reference"),
    description: Optional[str] = Query(None, description="BOM description"),
    name: Optional[str] = Query(None, description="Nom lisible de la carte (catalogue Cartes)"),
    card_type: Optional[str] = Query(None, description="Type de carte : SIMPLE ou ASSEMBLY"),
    db: Session = Depends(get_db),
):
    """Import an Eagle-style BOM text file, harmonize it, then persist it."""
    tmp_path: Optional[str] = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".txt") as tmp_file:
            tmp_file.write(await read_upload_capped(file))
            tmp_path = tmp_file.name

        footprint_lookup = _get_footprint_lookup(db)
        import_result = bom_service.import_bom(tmp_path, footprint_lookup)
        if not import_result.success:
            raise HTTPException(
                status_code=422,
                detail=f"BOM parsing failed: {'; '.join(import_result.errors[:5])}",
            )

        is_valid, validation_errors = bom_service.validate_bom_data(import_result.items)
        if not is_valid:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid BOM payload: {'; '.join(validation_errors[:5])}",
            )

        response = _persist_import_result(
            db,
            import_result,
            reference=reference,
            revision=revision,
            side=side,
            category=category,
            description=description,
            name=name,
            card_type=card_type,
        )
        return response

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("Import failed")
        raise HTTPException(status_code=500, detail="Erreur interne du serveur.")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.post("/import-cao", response_model=CaoImportResponse)
async def import_cao_files(
    files: List[UploadFile] = File(..., description="Lot de fichiers CAO d'un dossier carte"),
    reference: str = Query(..., min_length=1, max_length=100, description="BOM reference name"),
    revision: str = Query(default="REV_A", description="Revision identifier"),
    category: Optional[str] = Query(None, description="Optional card category applied to the full reference"),
    description: Optional[str] = Query(None, description="BOM description"),
    name: Optional[str] = Query(None, description="Nom lisible de la carte (catalogue Cartes)"),
    card_type: Optional[str] = Query(None, description="Type de carte : SIMPLE ou ASSEMBLY"),
    db: Session = Depends(get_db),
):
    """Import direct d'un **dossier CAO** (Eagle) → BOM + centroïde.

    Détecte les fichiers (`services/cao/detect`), parse le `.brd`/`.sch`
    (`parser_eagle`), transforme en placements machine, puis **réutilise la
    chaîne d'import `.txt` existante** (harmonisation + persistance) via un
    revision par face. KiCad est reconnu mais reporté (« support à venir »).
    """
    tmp_dir = tempfile.mkdtemp(prefix="cao_import_")

    try:
        saved: Dict[str, str] = {}
        for upload in files:
            safe_name = os.path.basename(upload.filename or "").strip()
            if not safe_name:
                continue
            dest = os.path.join(tmp_dir, safe_name)
            with open(dest, "wb") as handle:
                handle.write(await read_upload_capped(upload))
            saved[safe_name] = dest

        if not saved:
            raise HTTPException(status_code=422, detail="Aucun fichier reçu.")

        preparation = prepare_cao_import(saved)
        if preparation is None:
            raise HTTPException(
                status_code=422,
                detail="Aucun fichier CAO reconnu (.brd/.sch ou .kicad_pcb/.kicad_sch attendus).",
            )

        if not preparation.supported:
            # KiCad reconnu mais reporté — ce n'est pas une erreur (pas de crash).
            return CaoImportResponse(
                success=False,
                kind=preparation.kind,
                supported=False,
                board=preparation.board,
                schematic=preparation.schematic,
                message=preparation.message or "Format CAO non supporté pour le moment.",
                reference=reference,
                revision=revision,
                faces=[],
                revisions=[],
                warnings=preparation.warnings,
            )

        if not preparation.faces:
            raise HTTPException(
                status_code=422,
                detail="Aucun composant placé exploitable dans les fichiers CAO fournis.",
            )

        footprint_lookup = _get_footprint_lookup(db)
        revisions: List[BomImportResponse] = []
        warnings: List[str] = list(preparation.warnings)

        for face in preparation.faces:
            face_path = os.path.join(tmp_dir, f"cao_{face.side}.txt")
            with open(face_path, "w", encoding="utf-8") as handle:
                handle.write(face.text)

            import_result = bom_service.import_bom(face_path, footprint_lookup)
            if not import_result.success:
                raise HTTPException(
                    status_code=422,
                    detail=f"Échec parsing CAO ({face.side}) : {'; '.join(import_result.errors[:5])}",
                )

            is_valid, validation_errors = bom_service.validate_bom_data(import_result.items)
            if not is_valid:
                raise HTTPException(
                    status_code=422,
                    detail=f"Payload CAO invalide ({face.side}) : {'; '.join(validation_errors[:5])}",
                )

            face_response = _persist_import_result(
                db,
                import_result,
                reference=reference,
                revision=revision,
                side=face.side,
                category=category,
                description=description,
                name=name,
                card_type=card_type,
            )
            revisions.append(face_response)
            warnings.extend(face_response.warnings)

        faces_found = [face.side for face in preparation.faces]
        total_items = sum(item.item_count for item in revisions)
        if len(faces_found) == 1:
            warnings.append(f"Une seule face détectée ({faces_found[0]}).")

        message = (
            f"Import CAO {preparation.kind} : {total_items} composant(s) "
            f"sur {len(faces_found)} face(s) ({', '.join(faces_found)})."
        )

        return CaoImportResponse(
            success=True,
            kind=preparation.kind,
            supported=True,
            board=preparation.board,
            schematic=preparation.schematic,
            message=message,
            reference=reference,
            revision=revision,
            faces=faces_found,
            revisions=revisions,
            warnings=warnings,
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("Import CAO échoué")
        raise HTTPException(status_code=500, detail="Erreur interne du serveur.")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
