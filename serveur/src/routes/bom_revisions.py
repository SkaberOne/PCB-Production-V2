"""BOM revision route assembly."""

from fastapi import APIRouter

from .bom_revision_imports import router as bom_revision_imports_router
from .bom_revision_mutations import router as bom_revision_mutations_router
from .bom_revision_queries import router as bom_revision_queries_router
from .bom_catalogue_import import router as bom_catalogue_import_router

router = APIRouter(tags=["bom"])

router.include_router(bom_revision_imports_router)
router.include_router(bom_revision_queries_router)
router.include_router(bom_revision_mutations_router)
router.include_router(bom_catalogue_import_router)
