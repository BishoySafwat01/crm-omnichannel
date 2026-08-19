import hmac
import hashlib
import logging
import secrets
import uuid
from typing import Any, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.integrations.meta import MetaAPIError, MetaProvider
from app.schemas.messaging import MessageResponse
from app.schemas.migration import MigrationJobResponse
from app.services.message_service import MessageService
from app.services.meta_import_service import MetaImportService

logger = logging.getLogger("app.api.meta_webhook")
router = APIRouter(prefix="/meta", tags=["meta-integration-internal"])


class SendMetaMessageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, description="Outbound message content")


@router.get("/test", summary="Verify Meta Page Access Token and Page Configuration")
async def test_meta_access():
    """Internal development endpoint to test Meta Page access."""
    provider = MetaProvider()
    try:
        res = await provider.validate_configuration()
        return {
            "status": "access_valid",
            "page_id": res.get("page_id"),
            "page_name": res.get("page_name"),
            "category": res.get("category"),
        }
    except MetaAPIError as exc:
        raise HTTPException(
            status_code=exc.status_code or status.HTTP_400_BAD_REQUEST,
            detail=MetaImportService._sanitize_error(exc.message),
        )


@router.get("/conversations", summary="Fetch Meta Conversations (Read-Only Preview)")
async def get_meta_conversations_preview():
    """Fetch normalized Messenger conversations from Meta Graph API without persisting."""
    provider = MetaProvider()
    try:
        conversations = await provider.get_all_conversations()
        return {
            "count": len(conversations),
            "conversations": [
                {
                    "external_conversation_id": c.external_conversation_id,
                    "customer_external_user_id": c.customer_external_user_id,
                    "customer_display_name": c.customer_display_name,
                    "last_message_at": c.last_message_at.isoformat(),
                    "provider": c.provider,
                    "channel": c.channel,
                }
                for c in conversations
            ],
        }
    except MetaAPIError as exc:
        raise HTTPException(
            status_code=exc.status_code or status.HTTP_400_BAD_REQUEST,
            detail=MetaImportService._sanitize_error(exc.message),
        )


@router.post("/import", response_model=MigrationJobResponse, summary="Execute Meta Conversation History Import")
async def import_meta_history(db: AsyncSession = Depends(get_db)):
    """Run historical Messenger conversation import into PostgreSQL."""
    try:
        job = await MetaImportService.run_import(session=db)
        return job
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=MetaImportService._sanitize_error(f"Meta history import failed: {str(exc)}"),
        )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
    summary="Send Outbound Agent Reply via Meta Messenger",
)
async def send_meta_outbound_message(
    conversation_id: uuid.UUID,
    payload: SendMetaMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send an agent reply to a Messenger conversation through the Meta Graph API."""
    try:
        msg = await MessageService.send_agent_reply(
            session=db,
            conversation_id=conversation_id,
            text=payload.text,
        )
        return msg
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=MetaImportService._sanitize_error(str(exc)),
        )
    except MetaAPIError as exc:
        raise HTTPException(
            status_code=exc.status_code or status.HTTP_400_BAD_REQUEST,
            detail=MetaImportService._sanitize_error(exc.message),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=MetaImportService._sanitize_error(f"Outbound messaging failed: {str(exc)}"),
        )


class MetaDirectSendMessageRequest(BaseModel):
    conversation_id: Optional[uuid.UUID] = None
    recipient_psid: Optional[str] = None
    text: str = Field(..., min_length=1, max_length=2000)


@router.post(
    "/messages/send",
    summary="Send Outbound Message via Meta Send API",
)
async def send_meta_direct_message(
    payload: MetaDirectSendMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send outbound Meta message directly by conversation_id or recipient_psid."""
    if payload.conversation_id:
        return await send_meta_outbound_message(
            conversation_id=payload.conversation_id,
            payload=SendMetaMessageRequest(text=payload.text),
            db=db,
        )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="conversation_id is required for sending Meta outbound messages.",
    )


class PublishPagePostRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Post text content")
    link: Optional[str] = None
    image_url: Optional[str] = None


@router.post("/posts", summary="Publish Post to Facebook Page Feed with Click-to-Chat CTA")
async def create_facebook_page_post(payload: PublishPagePostRequest):
    """Publish a new post to Facebook Page feed with 'Send Message' CTA button."""
    provider = MetaProvider()
    try:
        res = await provider.client.publish_page_post(
            message=payload.message,
            link=payload.link,
            image_url=payload.image_url,
        )
        return {"status": "published", "post_id": res.get("id"), "raw_response": res}
    except MetaAPIError as exc:
        raise HTTPException(
            status_code=exc.status_code or status.HTTP_400_BAD_REQUEST,
            detail=MetaImportService._sanitize_error(exc.message),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=MetaImportService._sanitize_error(f"Failed to publish post: {str(exc)}"),
        )


@router.get("/webhook", summary="Meta Webhook Hub Verification Challenge")
async def verify_meta_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    """Meta Webhook GET verification endpoint for subscription challenge."""
    logger.info("Meta webhook verification attempt: hub_mode=%s", hub_mode)

    if not hub_mode or not hub_verify_token or not hub_challenge:
        logger.warning("Meta webhook verification failed: missing verification parameters")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing verification parameters.",
        )

    expected_token = settings.META_WEBHOOK_VERIFY_TOKEN
    if not expected_token or not expected_token.strip():
        logger.warning("Meta webhook verification failed: META_WEBHOOK_VERIFY_TOKEN is unconfigured")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Meta webhook verify token is unconfigured.",
        )

    if hub_mode == "subscribe" and secrets.compare_digest(
        hub_verify_token.strip(), expected_token.strip()
    ):
        logger.info("Meta webhook verification successful: hub_challenge verified")
        return Response(content=hub_challenge, media_type="text/plain", status_code=200)

    logger.warning("Meta webhook verification failed: token mismatch")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Invalid verification token.",
    )


@router.post("/webhook", summary="Receive Inbound Meta Messenger Webhook Event")
async def receive_meta_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None, alias="x-hub-signature-256"),
    db: AsyncSession = Depends(get_db),
):
    """Inbound Meta Messenger webhook receiver for real-time customer events."""
    body_bytes = await request.body()
    logger.info("Meta webhook POST event received: payload_size=%d bytes", len(body_bytes))

    # 1. Optional Signature Validation (if META_APP_SECRET is configured)
    app_secret = settings.META_APP_SECRET
    if app_secret and app_secret.strip():
        if not x_hub_signature_256 or not x_hub_signature_256.startswith("sha256="):
            logger.warning("Meta webhook signature validation failed: missing or invalid X-Hub-Signature-256 header")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid X-Hub-Signature-256 header.",
            )

        expected_sig = "sha256=" + hmac.new(
            app_secret.strip().encode("utf-8"),
            body_bytes,
            hashlib.sha256,
        ).hexdigest()

        if not secrets.compare_digest(x_hub_signature_256, expected_sig):
            logger.warning("Meta webhook signature validation failed: HMAC signature mismatch")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid X-Hub-Signature-256 signature.",
            )

    # 2. Parse JSON Body
    try:
        payload = await request.json()
    except Exception as exc:
        logger.error("Meta webhook error: invalid JSON payload structure: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload structure.",
        )

    if not isinstance(payload, dict):
        logger.error("Meta webhook error: JSON payload is not a dictionary")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload structure.",
        )

    # 3. Process Webhook Event
    try:
        res = await MetaImportService.process_inbound_webhook(
            session=db, raw_payload=payload
        )
        return res
    except ValueError as exc:
        logger.error("Meta webhook processing error: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=MetaImportService._sanitize_error(str(exc)),
        )
    except Exception as exc:
        logger.error("Meta webhook unhandled server error: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process Meta webhook event.",
        )
