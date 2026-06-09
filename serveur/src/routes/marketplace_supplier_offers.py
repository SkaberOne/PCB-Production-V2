"""Supplier offers endpoints: cached price/availability + real-time refresh.

See ADR 0004. Cache is the default read path; refresh hits the supplier APIs.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from ..database import get_db
from ..schemas.marketplace import SupplierOfferRefreshRequest
from ..services import supplier_credentials
from ..services.supplier_offer_service import SupplierOfferService
from ..services.suppliers import MouserConnector, DigiKeyConnector, FarnellConnector

router = APIRouter(prefix="/supplier-offers", tags=["supplier-offers"])


def _build_connector(name: str, stored: dict):
    """Instantiate one connector with stored-credential overlay over .env defaults."""
    creds = stored.get(name) or {}
    if name == "mouser":
        return MouserConnector(api_key=(creds.get("api_key") or None))
    if name == "farnell":
        return FarnellConnector(api_key=(creds.get("api_key") or None))
    return DigiKeyConnector(
        client_id=(creds.get("client_id") or None),
        client_secret=(creds.get("client_secret") or None),
    )


class SupplierCredentialUpdate(BaseModel):
    auth_type: Optional[str] = Field(default=None, max_length=40)
    api_key: Optional[str] = Field(default=None, max_length=400)
    client_id: Optional[str] = Field(default=None, max_length=400)
    client_secret: Optional[str] = Field(default=None, max_length=400)


class SupplierCredentialsUpdateRequest(BaseModel):
    mouser: Optional[SupplierCredentialUpdate] = None
    digikey: Optional[SupplierCredentialUpdate] = None
    farnell: Optional[SupplierCredentialUpdate] = None


class ApplyMpnRequest(BaseModel):
    component_id: int = Field(..., gt=0)
    mpn: str = Field(..., min_length=1, max_length=200)


class ApplyMpnBatchItem(BaseModel):
    component_id: int = Field(..., gt=0)
    mpn: str = Field(..., min_length=1, max_length=200)


class ApplyMpnBatchRequest(BaseModel):
    items: List[ApplyMpnBatchItem] = Field(..., min_length=1)


@router.get("/status")
def connectors_status(
    test: bool = Query(False, description="If true, do a live sample lookup per configured connector"),
    sample_mpn: str = Query("GRM188R71H104KA93D", description="MPN used for the live test"),
):
    """Report which supplier connectors are configured (and optionally test them live).

    Secrets are never returned — only booleans and result counts. Use ?test=true to
    confirm credentials actually work (DigiKey OAuth token + a sample search).
    """
    stored = supplier_credentials.load_credentials()
    result = []
    for connector in (
        _build_connector("mouser", stored),
        _build_connector("digikey", stored),
        _build_connector("farnell", stored),
    ):
        entry = {"supplier": connector.name, "configured": connector.is_configured}
        if test and connector.is_configured:
            try:
                offers = connector.search_by_mpn(sample_mpn)
                entry["live_test"] = "ok"
                entry["offers_found"] = len(offers)
            except Exception as exc:  # pragma: no cover - network dependent
                entry["live_test"] = "error"
                entry["error"] = str(exc)[:200]
        result.append(entry)
    return {"connectors": result}


@router.get("/credentials")
def get_supplier_credentials():
    """Return the saved supplier credentials in a UI-safe form (secrets masked)."""
    return {"providers": supplier_credentials.masked_credentials()}


@router.put("/credentials")
def update_supplier_credentials(request: SupplierCredentialsUpdateRequest):
    """Persist Mouser / DigiKey credentials. Blank secret fields keep their stored value."""
    payload = {}
    for provider in supplier_credentials.SUPPORTED_PROVIDERS:
        entry = getattr(request, provider, None)
        if entry is not None:
            payload[provider] = entry.model_dump(exclude_none=True)
    masked = supplier_credentials.save_credentials(payload)
    return {"providers": masked}


def _parse_ids(component_ids: str) -> List[int]:
    ids: List[int] = []
    for token in (component_ids or "").split(","):
        token = token.strip()
        if token:
            try:
                ids.append(int(token))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid component id: {token}")
    return ids


@router.get("")
def list_offers(
    component_ids: str = Query(..., description="Comma-separated component ids"),
    db: Session = Depends(get_db),
):
    """Return cached supplier offers grouped by component id."""
    ids = _parse_ids(component_ids)
    if not ids:
        raise HTTPException(status_code=400, detail="component_ids is required")
    return {"offers": SupplierOfferService.get_offers(db, ids)}


@router.post("/refresh")
def refresh_offers(
    request: SupplierOfferRefreshRequest,
    db: Session = Depends(get_db),
):
    """Force a real-time refresh of the given components from the supplier APIs."""
    try:
        offers = SupplierOfferService.refresh_offers(db, request.component_ids)
        return {"offers": offers}
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=f"Error refreshing offers: {exc}")


@router.get("/best")
def best_offers(
    component_ids: str = Query(..., description="Comma-separated component ids"),
    strategy: str = Query("cheapest", pattern="^(cheapest|priority)$"),
    priority_supplier: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return the retained offer per component for the chosen sort strategy."""
    ids = _parse_ids(component_ids)
    if not ids:
        raise HTTPException(status_code=400, detail="component_ids is required")
    quantities = {cid: 1 for cid in ids}
    best = SupplierOfferService.best_offers_for_components(
        db, quantities, strategy=strategy, priority_supplier=priority_supplier
    )
    return {"best": best}


@router.get("/mpn-proposals")
def mpn_proposals(
    component_ids: Optional[str] = Query(None, description="Optional comma-separated component ids"),
    live: bool = Query(False, description="Query supplier APIs (else cache-only, no quota cost)"),
    limit: int = Query(
        25, ge=1, le=200, description="Max empty-MPN components examined per run (quota guard)"
    ),
    db: Session = Depends(get_db),
):
    """List tiered MPN proposals (high / medium / manual) for empty-MPN components.

    Cache-only by default. Pass ``live=true`` to hit the supplier APIs; ``limit``
    bounds how many components are examined so we stay under supplier quotas.
    """
    ids = _parse_ids(component_ids) if component_ids else None
    proposals = SupplierOfferService.build_mpn_proposals(
        db, component_ids=ids, live=live, limit=limit
    )
    counts = {"high": 0, "medium": 0, "manual": 0}
    for proposal in proposals:
        counts[proposal["confidence"]] = counts.get(proposal["confidence"], 0) + 1
    return {"proposals": proposals, "counts": counts, "live": live, "limit": limit}


@router.post("/mpn-apply")
def apply_mpn(request: ApplyMpnRequest, db: Session = Depends(get_db)):
    """Write a reviewed MPN onto a component (only if currently empty)."""
    applied = SupplierOfferService.apply_mpn(db, request.component_id, request.mpn)
    if not applied:
        raise HTTPException(
            status_code=409,
            detail="MPN not applied (component missing or already has an MPN).",
        )
    return {"applied": True, "component_id": request.component_id, "mpn": request.mpn.strip()}


@router.post("/mpn-apply-batch")
def apply_mpn_batch(request: ApplyMpnBatchRequest, db: Session = Depends(get_db)):
    """Apply several reviewed MPNs at once (e.g. all HIGH-confidence proposals)."""
    result = SupplierOfferService.apply_mpn_batch(
        db, [item.model_dump() for item in request.items]
    )
    return result
