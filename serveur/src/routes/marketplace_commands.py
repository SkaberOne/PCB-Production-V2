"""Marketplace command route assembly."""

from fastapi import APIRouter

from .marketplace_command_core import router as marketplace_command_core_router
from .marketplace_command_plans import router as marketplace_command_plans_router

router = APIRouter()

router.include_router(marketplace_command_core_router, prefix="/commands")
router.include_router(marketplace_command_plans_router, prefix="/commands")
