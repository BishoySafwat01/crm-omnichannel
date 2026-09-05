import logging
import secrets
from typing import Any, Optional
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.config import settings
from app.core.database import get_db
from app.integrations.beon import BeonAPIError, BeonClient, BeonNormalizer
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ChannelEnum, MessageTypeEnum, ProviderEnum, SenderTypeEnum
from app.models.message import Message
from app.models.user import User

logger = logging.getLogger("app.api.beon")

router = APIRouter(prefix="/beon", tags=["beon-integration"])


@router.get("/status", summary="Get BeOn Integration Status")
async def get_beon_status():
    """Returns current BeOn integration status, account details, and active provider mode."""
    client = BeonClient()
    try:
        acc = await client.get_account_details()
        acc_data = acc.get("data", {})
        return {
            "status": "connected",
            "provider": "beon",
            "base_url": settings.BEON_API_BASE_URL,
            "direct_meta_enabled": settings.ENABLE_DIRECT_META,
            "account": {
                "id": acc_data.get("id"),
                "account_name": acc_data.get("account_name"),
                "contacts_count": acc_data.get("contacts_count"),
                "timezone": acc_data.get("timezone"),
                "balance": acc_data.get("balance"),
            },
        }
    except BeonAPIError as exc:
        return {
            "status": "error",
            "provider": "beon",
            "direct_meta_enabled": settings.ENABLE_DIRECT_META,
            "error": exc.message,
            "status_code": exc.status_code,
        }
    except Exception as exc:
        return {
            "status": "unavailable",
            "provider": "beon",
            "direct_meta_enabled": settings.ENABLE_DIRECT_META,
            "error": str(exc),
        }


@router.post("/webhook", summary="Receive Real-Time Inbound BeOn Webhook Event")
async def receive_beon_webhook(
    request: Request,
    x_beon_token: Optional[str] = Header(None, alias="x-beon-token"),
    x_beon_secret: Optional[str] = Header(None, alias="x-beon-secret"),
    db: AsyncSession = Depends(get_db),
):
    """Inbound webhook receiver for real-time BeOn messages and events."""
    # 1. Optional Secret/Token validation if configured
    if settings.BEON_WEBHOOK_SECRET and settings.BEON_WEBHOOK_SECRET.strip():
        provided_secret = x_beon_secret or x_beon_token
        if not provided_secret or not secrets.compare_digest(
            provided_secret.strip(), settings.BEON_WEBHOOK_SECRET.strip()
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid BeOn webhook signature or secret.",
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

    # 3. Normalize BeOn Event
    norm_data = BeonNormalizer.normalize_webhook(payload)
    conv_data = norm_data.get("conversation") or {}
    msg_data = norm_data.get("message") or {}

    ext_conv_id = conv_data.get("external_conversation_id")
    if not ext_conv_id:
        return {"status": "ignored", "reason": "No conversation ID present"}

    channel = conv_data.get("channel", ChannelEnum.WHATSAPP)
    brand = conv_data.get("brand", "LUXIRA")
    cust_ext_id = conv_data.get("customer_external_id", ext_conv_id)
    cust_name = conv_data.get("customer_name", "عميل BeOn")
    cust_phone = conv_data.get("customer_phone")

    # 4. Upsert Customer & CustomerIdentity
    ident_stmt = select(CustomerIdentity).where(
        CustomerIdentity.provider == ProviderEnum.BEON,
        CustomerIdentity.channel == channel,
        CustomerIdentity.external_user_id == str(cust_ext_id),
    )
    identity_res = await db.execute(ident_stmt)
    identity = identity_res.scalar_one_or_none()

    if identity:
        customer = await db.get(Customer, identity.customer_id)
    else:
        customer = Customer(
            id=uuid.uuid4(),
            display_name=cust_name,
            phone=cust_phone,
        )
        db.add(customer)
        await db.flush()

        identity = CustomerIdentity(
            id=uuid.uuid4(),
            customer_id=customer.id,
            provider=ProviderEnum.BEON,
            channel=channel,
            external_user_id=str(cust_ext_id),
            metadata={"source": "beon_webhook"},
        )
        db.add(identity)
        await db.flush()

    # 5. Upsert Conversation
    conv_stmt = select(Conversation).where(
        Conversation.provider == ProviderEnum.BEON,
        Conversation.channel == channel,
        Conversation.external_conversation_id == str(ext_conv_id),
    )
    conv_res = await db.execute(conv_stmt)
    conversation = conv_res.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if not conversation:
        conversation = Conversation(
            id=uuid.uuid4(),
            customer_id=customer.id,
            provider=ProviderEnum.BEON,
            channel=channel,
            external_conversation_id=str(ext_conv_id),
            brand=brand,
            status="open",
            last_message_at=now,
            last_activity_at=now,
            unread_count=1 if msg_data.get("sender_type") == SenderTypeEnum.CUSTOMER else 0,
        )
        db.add(conversation)
        await db.flush()
    else:
        conversation.last_message_at = now
        conversation.last_activity_at = now
        if msg_data.get("sender_type") == SenderTypeEnum.CUSTOMER:
            conversation.unread_count = (conversation.unread_count or 0) + 1

    # 6. Idempotently Save Message
    ext_msg_id = msg_data.get("external_message_id")
    if ext_msg_id:
        msg_stmt = select(Message).where(
            Message.conversation_id == conversation.id,
            Message.external_message_id == str(ext_msg_id),
        )
        existing_msg = (await db.execute(msg_stmt)).scalar_one_or_none()
        if not existing_msg:
            msg_obj = Message(
                id=uuid.uuid4(),
                conversation_id=conversation.id,
                external_message_id=str(ext_msg_id),
                sender_type=msg_data.get("sender_type", SenderTypeEnum.CUSTOMER),
                sender_external_id=msg_data.get("sender_external_id"),
                message_type=msg_data.get("message_type", MessageTypeEnum.TEXT),
                text=msg_data.get("text", ""),
                metadata=msg_data.get("metadata", {}),
                created_at=msg_data.get("created_at", now),
            )
            db.add(msg_obj)
            await db.flush()

            # WebSocket Broadcast
            try:
                from app.api.v1.ws import manager
                await manager.broadcast(
                    {
                        "type": "NEW_MESSAGE",
                        "conversation_id": str(conversation.id),
                        "message": {
                            "id": str(msg_obj.id),
                            "conversation_id": str(conversation.id),
                            "external_message_id": msg_obj.external_message_id,
                            "sender_type": str(msg_obj.sender_type.value if hasattr(msg_obj.sender_type, "value") else msg_obj.sender_type),
                            "text": msg_obj.text,
                            "created_at": msg_obj.created_at.isoformat(),
                        },
                    }
                )
            except Exception as ws_err:
                logger.warning(f"Failed to broadcast WebSocket event: {ws_err}")

    await db.commit()
    return {"status": "success", "conversation_id": str(conversation.id)}
