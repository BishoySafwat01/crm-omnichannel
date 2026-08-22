import logging
import secrets
from typing import Any, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import User
from app.integrations.respond_io import RespondIoAPIError, RespondIoProvider
from app.models.enums import ChannelEnum
from app.schemas.migration import MigrationJobResponse
from app.services.respond_io_import_service import RespondIoImportService

logger = logging.getLogger("app.api.respond_io")

router = APIRouter(prefix="/respond-io", tags=["respond-io-integration-internal"])


@router.get("/test", summary="Verify Respond.io Credentials and Connection")
async def test_respond_io_access():
    """Internal development endpoint to test Respond.io API configuration."""
    provider = RespondIoProvider()
    try:
        res = await provider.validate_configuration()
        return {
            "status": "ok",
            "provider": "respond_io",
            "valid": res.get("valid", True),
        }
    except RespondIoAPIError as exc:
        raise HTTPException(
            status_code=exc.status_code or status.HTTP_400_BAD_REQUEST,
            detail=RespondIoImportService._sanitize_error(exc.message),
        )


@router.post(
    "/import",
    response_model=MigrationJobResponse,
    summary="Import Real Respond.io Contacts into PostgreSQL",
)
async def import_respond_io_contacts(
    channel: ChannelEnum = ChannelEnum.WHATSAPP,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Triggers real Respond.io contact import into provider-agnostic CRM database."""
    job = await RespondIoImportService.run_import(
        session=db,
        channel=channel,
    )
    return job


@router.post(
    "/webhook",
    summary="Receive Inbound Respond.io Webhook Event",
)
async def receive_respond_io_webhook(
    request: Request,
    x_respond_secret: Optional[str] = Header(None, alias="x-respond-secret"),
    x_webhook_secret: Optional[str] = Header(None, alias="x-webhook-secret"),
    db: AsyncSession = Depends(get_db),
):
    """Inbound webhook receiver for real-time Respond.io events."""
    # 1. Secret authentication check (FAIL-CLOSED: RESPOND_IO_WEBHOOK_SECRET must be configured)
    expected_secret = settings.RESPOND_IO_WEBHOOK_SECRET
    if not expected_secret or not expected_secret.strip():
        logger.error(
            "Respond.io webhook REJECTED: RESPOND_IO_WEBHOOK_SECRET is not configured. "
            "Refusing unauthenticated payloads (fail-closed policy). "
            "Set RESPOND_IO_WEBHOOK_SECRET to enable webhook processing."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook secret validation unavailable: server secret is not configured.",
        )

    provided_secret = x_respond_secret or x_webhook_secret
    if not provided_secret or not secrets.compare_digest(
        provided_secret.strip(), expected_secret.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Respond.io webhook secret.",
        )

    # 2. Parse request JSON body safely
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload structure.",
        )

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload structure.",
        )

    # 3. Process webhook event
    try:
        res = await RespondIoImportService.process_inbound_webhook(
            session=db,
            raw_payload=payload,
        )
        return res
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=RespondIoImportService._sanitize_error(str(exc)),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process Respond.io webhook event.",
        )
