"""Endpoints : import d'une commande client PDF (ADR 0018).

Montés sous /api/marketplace (préfixe hérité de marketplace.router).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.pdf_order_import_service import PdfOrderImportService

router = APIRouter(tags=["order-import"])


class ImportLine(BaseModel):
    bom_reference_id: int = Field(..., gt=0)
    revision: str = Field(default="", max_length=20)
    quantity: int = Field(..., ge=1)


class ImportMapping(BaseModel):
    part_number: str = Field(..., max_length=100)
    bom_reference_id: int = Field(..., gt=0)


class ImportCommit(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=200)
    lines: List[ImportLine] = Field(default_factory=list)
    mappings: List[ImportMapping] = Field(default_factory=list)


@router.post("/client-orders/import-pdf")
async def import_pdf_preview(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload d'un PDF de commande → aperçu (client + cartes reconnues + codes inconnus)."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide.")
    try:
        return PdfOrderImportService.preview(db, data)
    except Exception as exc:  # parsing / PDF illisible
        raise HTTPException(status_code=422, detail=f"Lecture du PDF impossible : {exc}")


@router.post("/client-orders/import-pdf/commit")
def import_pdf_commit(request: ImportCommit, db: Session = Depends(get_db)):
    """Crée la commande client depuis l'aperçu confirmé (+ mappings de codes)."""
    try:
        return PdfOrderImportService.commit(
            db,
            client_name=request.client_name,
            lines=[l.model_dump() for l in request.lines],
            mappings=[m.model_dump() for m in request.mappings],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
