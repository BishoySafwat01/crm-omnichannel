import logging
from typing import Any

from fastapi import APIRouter, Request

logger = logging.getLogger("app.api.beon")

router = APIRouter(prefix="/beon", tags=["beon-integration"])


@router.get("/status", summary="Get BeOn Integration Status")
async def get_beon_status():
    """Returns current BeOn integration status (disabled in pure Meta Direct mode)."""
    return {
        "status": "disabled",
        "provider": "beon",
        "message": "BeOn integration is disabled. CRM is operating in pure Meta Direct mode.",
        "direct_meta_enabled": True,
        "beon_connected": False,
    }


@router.post("/webhook", summary="Receive Real-Time Inbound BeOn Webhook Event")
async def receive_beon_webhook(request: Request):
    """Inbound webhook receiver for BeOn - disabled in pure Meta Direct mode."""
    logger.info("[BeOn Webhook] Received webhook call, but BeOn integration is disabled.")
    return {
        "status": "disabled",
        "message": "BeOn integration is disabled. CRM is operating in pure Meta Direct mode.",
    }

