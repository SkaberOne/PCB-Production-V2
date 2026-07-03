"""Marketplace router assembly."""

from fastapi import APIRouter

from ..database import get_db
from .marketplace_commands import router as marketplace_commands_router
from .marketplace_inventory import router as marketplace_inventory_router
from .marketplace_machines import router as marketplace_machines_router
from .marketplace_productions import router as marketplace_productions_router
from .marketplace_supplier_offers import router as marketplace_supplier_offers_router
from .marketplace_erp_defaults import router as marketplace_erp_defaults_router
from .marketplace_production_command import router as marketplace_production_command_router
from .marketplace_stock import router as marketplace_stock_router

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

router.include_router(marketplace_commands_router)
router.include_router(marketplace_productions_router)
router.include_router(marketplace_machines_router)
router.include_router(marketplace_inventory_router)
router.include_router(marketplace_supplier_offers_router)
router.include_router(marketplace_erp_defaults_router)
router.include_router(marketplace_production_command_router)
router.include_router(marketplace_stock_router)
