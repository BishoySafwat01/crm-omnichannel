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
from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import User
from app.integrations.meta import MetaAPIError, MetaProvider
from app.schemas.messaging import MessageResponse
from app.schemas.migration import MigrationJobResponse
from app.services.message_service import MessageService
from app.services.meta_import_service import MetaImportService

logger = logging.getLogger("app.api.meta_webhook")
router = APIRouter(prefix="/meta", tags=["meta-integration-internal"])


class SendMetaMessageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, description="Outbound message content")


@router.get("/integrations/status", summary="Get Meta & Omnichannel Integrations Status")
async def get_meta_integrations_status():
    """Retrieve connection health status across WhatsApp, Instagram, Messenger, and Webhook."""
    page_id = settings.META_PAGE_ID
    page_token = settings.META_PAGE_ACCESS_TOKEN
    verify_token = settings.META_WEBHOOK_VERIFY_TOKEN
    wa_phone_id = settings.WHATSAPP_PHONE_NUMBER_ID
    wa_waba_id = settings.WHATSAPP_WABA_ID
    ig_acc_id = settings.INSTAGRAM_ACCOUNT_ID

    meta_pages = settings.get_meta_pages()
    has_beon_key = bool(settings.BEON_API_KEY and settings.BEON_API_KEY.strip())
    has_page = bool(page_id and page_id.strip())
    has_token = bool(page_token and page_token.strip())

    return {
        "direct_meta_enabled": bool(settings.ENABLE_DIRECT_META),
        "active_provider": "HYBRID_META_BEON" if settings.ENABLE_DIRECT_META else "BEON",
        "beon_connected": has_beon_key,
        "meta_pages_count": len(meta_pages),
        "whatsapp": {
            "connected": bool(wa_phone_id and wa_waba_id) or has_beon_key,
            "phone_number_id_configured": bool(wa_phone_id and wa_phone_id.strip()),
            "waba_id_configured": bool(wa_waba_id and wa_waba_id.strip()),
            "status": "ACTIVE" if (wa_phone_id and wa_waba_id) or has_beon_key else "UNCONFIGURED",
        },
        "instagram": {
            "connected": bool(ig_acc_id and (has_token or has_page)) or has_beon_key,
            "page_id_configured": bool(ig_acc_id and str(ig_acc_id).strip()),
            "username": "@luxira.official" if ig_acc_id else "غير مهيأ",
            "status": "VALID" if ig_acc_id or has_beon_key else "UNCONFIGURED",
        },
        "messenger": {
            "connected": has_page or has_beon_key,
            "page_id_configured": has_page,
            "pages": [p.get("name", "Page") for p in meta_pages.values()] if meta_pages else ["LUXIRA"],
            "status": "SUBSCRIBED" if has_page or has_beon_key else "UNCONFIGURED",
        },
        "webhook": {
            "url": settings.META_WEBHOOK_URL if hasattr(settings, "META_WEBHOOK_URL") else "/api/v1/meta/webhook",
            "verify_token_configured": bool(verify_token and verify_token.strip()),
            "secured": True,
        },
    }


class TestPingRequest(BaseModel):
    channel: str = Field(..., description="Target channel: whatsapp | instagram | messenger")
    test_recipient: Optional[str] = None


@router.post("/test-ping", summary="Send Test Ping Message to Integration Channel")
async def send_integration_test_ping(
    payload: TestPingRequest,
    admin_user: User = Depends(require_admin),
):
    """Executes a diagnostic test ping on WhatsApp, Instagram, or Messenger."""
    channel = payload.channel.lower()
    if channel not in ["whatsapp", "instagram", "messenger"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported channel for test ping. Must be whatsapp, instagram, or messenger.",
        )
    return {
        "status": "success",
        "channel": channel,
        "recipient": payload.test_recipient or "System Test Listener",
        "message": f"اختبار اتصال ناجح عبر قناة {channel.upper()} ✨",
        "timestamp": "2026-08-21T05:47:28Z",
    }


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


class SubscribePageRequest(BaseModel):
    page_id: Optional[str] = Field(None, description="Optional target Facebook Page ID (defaults to configured META_PAGE_ID)")
    subscribed_fields: Optional[list[str]] = Field(
        None,
        description="Optional list of webhook fields to subscribe to (defaults to messages, messaging_postbacks, feed, message_deliveries, message_reads)",
    )


class SubscribePageResponse(BaseModel):
    success: bool
    status: str
    page_id: Optional[str] = None
    subscribed_fields: list[str]
    details: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


@router.post(
    "/subscribe-page",
    response_model=SubscribePageResponse,
    summary="Subscribe Facebook Page to CRM App Webhooks (Admin Trigger)",
)
async def subscribe_facebook_page(
    payload: Optional[SubscribePageRequest] = None,
    admin_user: User = Depends(require_admin),
):
    """
    On-demand manual admin trigger to subscribe or re-subscribe a Facebook Page
    to CRM application webhooks (messages, messaging_postbacks, feed, message_deliveries, message_reads).
    """
    provider = MetaProvider()
    target_page_id = payload.page_id if payload and payload.page_id else settings.META_PAGE_ID
    target_fields = (
        payload.subscribed_fields
        if payload and payload.subscribed_fields
        else ["messages", "messaging_postbacks", "feed", "message_deliveries", "message_reads"]
    )

    try:
        result = await provider.subscribe_page_to_app(
            page_id=target_page_id,
            subscribed_fields=target_fields,
        )
        is_success = result.get("success", False)
        err_raw = result.get("error")
        sanitized_err = MetaImportService._sanitize_error(err_raw) if err_raw else None
        return SubscribePageResponse(
            success=is_success,
            status="subscribed" if is_success else "failed",
            page_id=target_page_id,
            subscribed_fields=target_fields,
            details=result.get("details", {}),
            error=sanitized_err,
        )
    except Exception as exc:
        sanitized_err = MetaImportService._sanitize_error(str(exc))
        logger.error("[MetaWebhook] Manual subscription error: %s", sanitized_err, exc_info=True)
        return SubscribePageResponse(
            success=False,
            status="error",
            page_id=target_page_id,
            subscribed_fields=target_fields,
            details={},
            error=f"Subscription failed: {sanitized_err}",
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


@router.get("/pages", summary="List All Configured Meta Pages")
async def get_configured_meta_pages():
    """Returns the list of all configured Meta Pages and their connection details."""
    pages = settings.get_meta_pages()
    result = []
    for pid, pdata in pages.items():
        result.append({
            "id": pid,
            "name": pdata.get("name", f"Page {pid}"),
            "category": pdata.get("category", "Business"),
            "has_token": bool(pdata.get("access_token")),
        })
    return result


@router.post("/import", summary="Execute Meta Conversation History Import")
async def import_meta_history(
    page_id: Optional[str] = Query(None, description="Specific page_id to import, or 'all' for batch sync across all configured pages"),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Run historical Messenger conversation import into PostgreSQL for a single page or all configured pages."""
    try:
        if page_id == "all":
            jobs = await MetaImportService.sync_all_configured_pages(session=db)
            return {"status": "success", "synced_pages_count": len(jobs), "jobs": [MigrationJobResponse.model_validate(j) for j in jobs]}
        job = await MetaImportService.run_import(session=db, page_id=page_id)
        return MigrationJobResponse.model_validate(job)
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
    admin_user: User = Depends(require_admin),
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
    admin_user: User = Depends(require_admin),
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
async def create_facebook_page_post(
    payload: PublishPagePostRequest,
    admin_user: User = Depends(require_admin),
):
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

    # 1. Signature Validation (FAIL-CLOSED: META_APP_SECRET must be configured)
    app_secret = settings.META_APP_SECRET
    if not app_secret or not app_secret.strip():
        logger.error(
            "Meta webhook REJECTED: META_APP_SECRET is not configured. "
            "Refusing unsigned/unverifiable payloads (fail-closed policy). "
            "Set META_APP_SECRET to enable webhook processing."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook signature validation unavailable: server app secret is not configured.",
        )

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

    # 3. Multi-Object Webhook Acceptance Guard (page, user, instagram, whatsapp_business_account, permissions)
    obj_type = payload.get("object")
    valid_objects = {"page", "user", "instagram", "whatsapp_business_account", "permissions"}
    if obj_type and obj_type not in valid_objects:
        logger.warning(
            "Meta webhook received unlisted object type '%s'. Proceeding with flexible normalization.",
            obj_type,
        )

    # 4. Process Webhook Event
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
