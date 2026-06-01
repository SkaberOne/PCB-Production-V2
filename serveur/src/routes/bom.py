"""BOM route assembly and compatibility exports."""

from fastapi import APIRouter

from ..database import get_db  # re-exported pour les routes bom_*
from .bom_support import bom_file_service, bom_service, component_library_service

# Re-export explicite pour les imports `from .bom import get_db`
__all__ = ["router", "get_db"]

router = APIRouter(
    prefix="/bom",
    tags=["bom"],
    responses={404: {"description": "Not found"}},
)


from .bom_components import router as bom_components_router
from .bom_files import router as bom_files_router
from .bom_revisions import router as bom_revisions_router


router.include_router(bom_components_router)
router.include_router(bom_files_router)
router.include_router(bom_revisions_router)
