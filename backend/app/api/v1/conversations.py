from datetime import datetime, timezone
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    get_optional_current_user,
    require_admin,
    require_conversation_access,
    user_has_conversation_access,
)
from app.core.database import get_db
from app.integrations.meta import MetaAPIError
from app.models.conversation import Conversation
from app.models.enums import ChannelEnum, ConversationStatusEnum, MessageTypeEnum, ProviderEnum, SenderTypeEnum, UserRole
from app.models.message import Message
from app.models.user import User
from app.schemas.conversation import (
    ConversationDetailResponse,
    ConversationResponse,
)
from app.schemas.messaging import (
    EditMessageRequest,
    ForwardMessageRequest,
    MessageResponse,
    ReactionRequest,
    SendMessageRequest,
)
from app.schemas.pagination import PaginatedResponse
from app.services.audit_service import AuditService
from app.services.conversation_service import ConversationService
from app.services.message_actions_service import MessageActionsService
from app.services.message_service import MessageService

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get(
    "/unread-summary",
    summary="Get Aggregated Unread Counts Grouped by Channels and Brands",
)
async def get_unread_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Return total, per-channel, and per-brand unread message counts, scoped to caller's authorized brands and channels."""
    user = current_user
    if not user:
        auth_header = request.headers.get("Authorization")
        if auth_header:
            try:
                from app.api.deps import get_current_user
                user = await get_current_user(request=request, db=db)
            except Exception:
                pass

    stmt = select(Conversation)
    res = await db.execute(stmt)
    all_convs = res.scalars().all()

    total_unread = 0
    channels_map = {"all": 0, "messenger": 0, "instagram": 0, "whatsapp": 0, "tiktok": 0}
    brands_map = {}

    for conv in all_convs:
        if user and not user_has_conversation_access(user, conv):
            continue

        conv_brand = getattr(conv, "brand", "LAVVA") or "LAVVA"
        cnt = getattr(conv, "unread_count", 0) or 0
        total_unread += cnt

        ch = (conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)).lower()
        if ch in channels_map:
            channels_map[ch] += cnt

        brands_map[conv_brand] = brands_map.get(conv_brand, 0) + cnt

    channels_map["all"] = total_unread

    return {
        "total_unread": total_unread,
        "channels": channels_map,
        "brands": brands_map,
    }


@router.post(
    "/{conversation_id}/read",
    summary="Mark Conversation as Read",
)
async def mark_conversation_read(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reset unread count to 0 and set last_read_at timestamp to now."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )

    now_utc = datetime.now(timezone.utc)
    conv.unread_count = 0
    conv.last_read_at = now_utc

    await db.commit()

    try:
        from app.api.v1.ws import manager
        await manager.broadcast({
            "type": "CONVERSATION_READ",
            "conversation_id": str(conversation_id),
            "unread_count": 0,
        })
    except Exception:
        pass

    return {
        "status": "success",
        "conversation_id": str(conversation_id),
        "unread_count": 0,
    }


@router.get(
    "",
    response_model=PaginatedResponse[ConversationResponse],
    summary="List Normalized Conversations",
)
async def list_conversations(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    customer_id: Optional[uuid.UUID] = Query(None, description="Filter by customer ID"),
    provider: Optional[ProviderEnum] = Query(None, description="Filter by provider"),
    channel: Optional[str] = Query(None, description="Filter by channel"),
    status_filter: Optional[ConversationStatusEnum] = Query(
        None, alias="status", description="Filter by status"
    ),
    search: Optional[str] = Query(None, description="Search by subject"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    location: Optional[str] = Query(None, description="Filter by customer location"),
    country: Optional[str] = Query(None, description="Filter by customer country"),
    sla_status: Optional[str] = Query(None, description="Filter by SLA status: pending, met, breached"),
    assigned_agent_id: Optional[str] = Query(None, description="Filter by assigned agent ID or name"),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Retrieve paginated inbox conversations ordered by last_message_at desc with optional filtering."""
    # Fallback/alias location to country if location not provided
    effective_country = country if country is not None else location

    parsed_channel: Optional[ChannelEnum] = None
    if channel:
        if isinstance(channel, ChannelEnum):
            parsed_channel = channel
        elif isinstance(channel, str):
            norm_ch = channel.strip().lower()
            if norm_ch not in ["all", "none", "", "الكل"]:
                try:
                    parsed_channel = ChannelEnum(norm_ch)
                except ValueError:
                    parsed_channel = None

    # Compute authorized brand and channel scoping for non-admin users
    allowed_brands = None
    allowed_channels = None
    if current_user:
        role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
        if role_val != UserRole.ADMIN.value:
            user_b = current_user.brand_access or []
            norm_b = [str(x).strip().lower() for x in user_b]
            if "all" not in norm_b and "الكل" not in norm_b:
                allowed_brands = user_b
            user_c = getattr(current_user, "channel_access", None)
            if user_c is not None:
                norm_c = [str(x).strip().lower() for x in user_c]
                if "all" not in norm_c and "الكل" not in norm_c:
                    allowed_channels = user_c

    items_raw, total = await ConversationService.list_conversations(
        session=db,
        page=page,
        page_size=page_size,
        customer_id=customer_id,
        provider=provider,
        channel=parsed_channel,
        status=status_filter,
        search=search,
        brand=brand,
        location=effective_country,
        country=effective_country,
        sla_status=sla_status,
        assigned_agent_id=assigned_agent_id,
        allowed_brands=allowed_brands,
        allowed_channels=allowed_channels,
    )
    items = [ConversationResponse.model_validate(c) for c in items_raw]
    return PaginatedResponse.create(items=items, total=total, page=page, page_size=page_size)


@router.post(
    "/{conversation_id}/auto-assign",
    summary="Trigger Smart Auto-Assignment for Conversation",
)
async def auto_assign_conversation(
    conversation_id: uuid.UUID,
    strategy: str = Query("least_loaded", description="Routing strategy: least_loaded or round_robin"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger smart auto-assignment to route conversation to eligible brand agent."""
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found."
        )

    from app.services.routing_service import RoutingService
    assigned_agent = await RoutingService.assign_conversation_smart(db, conv, strategy=strategy)
    await db.commit()

    if not assigned_agent:
        return {
            "status": "unassigned",
            "message": "No active eligible agents found for brand.",
            "conversation_id": str(conversation_id),
            "assigned_agent": None,
        }

    return {
        "status": "assigned",
        "conversation_id": str(conversation_id),
        "assigned_agent_id": str(assigned_agent.id),
        "assigned_agent_name": assigned_agent.full_name,
        "strategy": strategy,
    }


@router.get(
    "/{conversation_id}",
    response_model=ConversationDetailResponse,
    summary="Get Conversation Detail",
)
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Retrieve detailed conversation information, customer data, and linked identities."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)

    detail = await ConversationService.get_conversation_detail(
        session=db, conversation_id=conversation_id
    )
    return ConversationDetailResponse.model_validate(detail)


@router.get(
    "/{conversation_id}/messages",
    response_model=PaginatedResponse[MessageResponse],
    summary="Get Conversation Messages",
)
async def get_conversation_messages(
    conversation_id: uuid.UUID,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(200, ge=1, le=500, description="Page size"),
    order: str = Query("asc", pattern="^(asc|desc)$", description="Sort order: asc or desc"),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Retrieve paginated chronological message history for a specific conversation."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)

    try:
        messages, total = await MessageService.list_paginated_messages(
            session=db,
            conversation_id=conversation_id,
            page=page,
            page_size=page_size,
            order=order,
        )
        items = [MessageResponse.model_validate(m) for m in messages]
        return PaginatedResponse.create(
            items=items, total=total, page=page, page_size=page_size
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageResponse,
    summary="Send Provider-Agnostic Outbound Agent Reply",
)
async def send_outbound_reply(
    conversation_id: uuid.UUID,
    payload: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send an outbound agent reply message to a conversation.
    Determines provider automatically from conversation metadata."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)

    try:
        reply_to_dict = None
        if payload.reply_to_message_id:
            from sqlalchemy.orm import selectinload
            ref_stmt = (
                select(Message)
                .options(selectinload(Message.sender_user))
                .where(
                    Message.id == payload.reply_to_message_id,
                    Message.conversation_id == conversation_id,
                )
            )
            ref_res = await db.execute(ref_stmt)
            ref_msg = ref_res.scalar_one_or_none()
            if ref_msg:
                ref_sender_name = "موظف الدعم"
                if ref_msg.sender_type == SenderTypeEnum.CUSTOMER:
                    ref_sender_name = conv.customer.display_name if (getattr(conv, "customer", None) and conv.customer and conv.customer.display_name) else "العميل"
                elif ref_msg.sender_user and ref_msg.sender_user.full_name:
                    ref_sender_name = ref_msg.sender_user.full_name
                reply_to_dict = {
                    "message_id": str(ref_msg.id),
                    "text": ref_msg.text or (ref_msg.metadata_ or {}).get("media_url") or "مرفق وسائط",
                    "sender_name": ref_sender_name,
                    "sender_type": ref_msg.sender_type.value if hasattr(ref_msg.sender_type, "value") else str(ref_msg.sender_type),
                    "message_type": ref_msg.message_type.value if hasattr(ref_msg.message_type, "value") else str(ref_msg.message_type),
                }

        msg = await MessageService.send_agent_reply(
            session=db,
            conversation_id=conversation_id,
            text=payload.text,
            attachments=payload.attachments,
            tag=payload.meta_tag,
            sender_user_id=current_user.id if current_user else None,
            reply_to=reply_to_dict,
        )
        resp = MessageResponse.model_validate(msg)
        try:
            from app.api.v1.ws import manager as ws_manager
            await ws_manager.broadcast({
                "type": "NEW_MESSAGE",
                "conversation_id": str(conversation_id),
                "message": resp.model_dump(mode="json"),
            })
        except Exception:
            pass
        return resp
    except ValueError as exc:
        err_msg = str(exc)
        if "not found" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=err_msg,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg,
        )
    except MetaAPIError as exc:
        raise HTTPException(
            status_code=exc.status_code or status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Outbound message send failed: {str(exc)}",
        )


@router.patch(
    "/{conversation_id}",
    summary="Update Conversation Brand or Metadata",
)
async def update_conversation_metadata(
    conversation_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Update conversation brand/store or status."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)

    if "brand" in payload:
        conv.brand = payload["brand"]
    if "status" in payload:
        conv.status = payload["status"]
    await db.commit()
    await db.refresh(conv)

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=current_user.id if current_user else None,
        action="conversation.metadata_updated",
        resource_type="conversation",
        resource_id=str(conversation_id),
        payload={"conversation_id": str(conversation_id), "changes": payload},
        ip_address=client_ip,
    )

    return {"id": str(conv.id), "brand": getattr(conv, "brand", "LAVVA"), "status": conv.status.value if hasattr(conv.status, "value") else str(conv.status)}


@router.patch(
    "/{conversation_id}/status",
    summary="Update Conversation Status",
)
async def update_conversation_status(
    conversation_id: uuid.UUID,
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Update conversation status (e.g. open, closed, resolved)."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)

    old_status = conv.status.value if hasattr(conv.status, "value") else str(conv.status)
    new_status = payload.get("status", "closed")
    updated = await ConversationService.update_conversation_status(
        session=db, conversation_id=conversation_id, new_status=new_status
    )

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=current_user.id if current_user else None,
        action="conversation.status_changed",
        resource_type="conversation",
        resource_id=str(conversation_id),
        payload={
            "conversation_id": str(conversation_id),
            "customer_id": str(conv.customer_id) if conv.customer_id else None,
            "previous_status": old_status,
            "new_status": new_status,
            "brand": getattr(conv, "brand", "LAVVA"),
        },
        ip_address=client_ip,
    )

    if conv.customer_id:
        try:
            from app.services.customer_timeline_service import CustomerTimelineService
            status_map_ar = {"open": "مفتوحة", "closed": "مغلقة", "pending": "قيد الانتظار", "resolved": "تم الحل"}
            st_ar = status_map_ar.get(new_status, new_status)
            chan_str = conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)
            await CustomerTimelineService.record_event(
                session=db,
                customer_id=conv.customer_id,
                event_type="conversation.status_changed",
                channel=chan_str,
                summary=f"تغيير حالة المحادثة إلى '{st_ar}'",
                details={"status": new_status, "conversation_id": str(conv.id), "brand": getattr(conv, "brand", "LAVVA"), "channel": chan_str},
            )
            await db.commit()
        except Exception:
            pass

    return {
        "status": "success",
        "conversation_id": str(conversation_id),
        "new_status": updated.status.value if hasattr(updated.status, "value") else str(updated.status),
    }


@router.patch(
    "/{conversation_id}/assign",
    summary="Assign Agent to Conversation",
)
async def assign_conversation_agent(
    conversation_id: uuid.UUID,
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign or unassign an agent to a conversation."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)

    previous_agent_id = conv.assigned_agent_id
    raw_agent_id = payload.get("assigned_agent_id") if "assigned_agent_id" in payload else payload.get("agent_id")
    agent_id = str(raw_agent_id) if raw_agent_id is not None else None
    reason = payload.get("reason")

    conv.assigned_agent_id = agent_id
    await db.commit()
    await db.refresh(conv)

    assigned_by_uuid = current_user.id if current_user else None
    assigned_to_uuid = None
    assigned_agent_name = "الموظف"
    if agent_id:
        try:
            assigned_to_uuid = uuid.UUID(agent_id)
            agent_u = await db.get(User, assigned_to_uuid)
            if agent_u and agent_u.full_name:
                assigned_agent_name = agent_u.full_name
        except ValueError:
            assigned_to_uuid = None

    client_ip = request.client.host if request.client else None
    # Log assignment via AuditService
    await AuditService.log_assignment(
        session=db,
        conversation_id=conversation_id,
        assigned_by_user_id=assigned_by_uuid,
        assigned_to_user_id=assigned_to_uuid,
        previous_agent_id=previous_agent_id,
        reason=reason,
        ip_address=client_ip,
    )

    # Log Customer 360 Timeline event
    if conv.customer_id:
        try:
            from app.services.customer_timeline_service import CustomerTimelineService
            assigner_name = current_user.full_name if current_user else "النظام"
            chan_str = conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)
            action_desc = f"قام {assigner_name} بتعيين المحادثة إلى {assigned_agent_name}" if agent_id else f"قام {assigner_name} بإلغاء تعيين المحادثة"
            await CustomerTimelineService.record_event(
                session=db,
                customer_id=conv.customer_id,
                event_type="conversation.assigned",
                channel=chan_str,
                summary=action_desc,
                details={
                    "assigned_to": assigned_agent_name if agent_id else None,
                    "assigned_by": assigner_name,
                    "conversation_id": str(conv.id),
                    "brand": getattr(conv, "brand", "LAVVA"),
                    "channel": chan_str,
                },
            )
            await db.commit()
        except Exception:
            pass

    # Broadcast WebSocket event
    try:
        from app.api.v1.ws import manager as ws_manager
        await ws_manager.broadcast({
            "type": "CONVERSATION_ASSIGNED",
            "data": {
                "conversation_id": str(conversation_id),
                "assigned_agent_id": str(assigned_to_uuid) if assigned_to_uuid else None,
                "assigned_by_user_id": str(assigned_by_uuid) if assigned_by_uuid else None,
                "reason": reason,
            }
        })
    except Exception:
        pass

    return {
        "status": "success",
        "conversation_id": str(conversation_id),
        "assigned_agent_id": str(raw_agent_id) if raw_agent_id is not None else None,
    }


@router.patch(
    "/{conversation_id}/priority",
    summary="Update Conversation Priority",
)
async def update_conversation_priority(
    conversation_id: uuid.UUID,
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Update priority level of a conversation (low, normal, high, urgent)."""
    priority = payload.get("priority", "normal")
    if priority not in ["low", "normal", "high", "urgent"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid priority value. Must be low, normal, high, or urgent.",
        )
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)

    old_priority = conv.priority
    conv.priority = priority
    await db.commit()
    await db.refresh(conv)

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=current_user.id if current_user else None,
        action="conversation.priority_changed",
        resource_type="conversation",
        resource_id=str(conversation_id),
        payload={
            "conversation_id": str(conversation_id),
            "customer_id": str(conv.customer_id) if conv.customer_id else None,
            "previous_priority": old_priority,
            "new_priority": priority,
        },
        ip_address=client_ip,
    )

    return {
        "status": "success",
        "conversation_id": str(conversation_id),
        "priority": priority,
    }


@router.post("/sync-now", summary="Trigger Immediate Meta Graph API Sync")
async def trigger_immediate_sync(
    admin_user: User = Depends(require_admin),
):
    """Trigger an immediate, on-demand sync with Meta Graph API."""
    from app.services.meta_import_service import meta_import_service
    await meta_import_service.sync_live_conversations()
    return {"status": "ok", "message": "Synchronized with Meta Graph API"}


@router.post(
    "/{conversation_id}/ai-analyze",
    summary="Trigger AI Conversation Analysis & Insights",
)
async def analyze_conversation_ai(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Trigger AI analysis on a conversation to detect intent, sentiment, summary, and smart replies."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)

    from app.services.ai_service import AIService
    result = await AIService.analyze_conversation(session=db, conversation=conv)
    return result


@router.get(
    "/{conversation_id}/ai-insights",
    summary="Get AI Insights for Conversation",
)
async def get_conversation_ai_insights(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve existing AI insights (summary, intent, sentiment, smart replies) for a conversation."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if current_user:
        require_conversation_access(conv, current_user)
    return {
        "conversation_id": str(conv.id),
        "ai_summary": conv.ai_summary,
        "detected_intent": conv.detected_intent,
        "detected_sentiment": conv.detected_sentiment,
        "ai_suggested_replies": conv.ai_suggested_replies or [],
        "priority": conv.priority,
    }


# ============================================================================
# MESSAGE ACTIONS (EDIT, DELETE, REACT, PIN, FORWARD)
# ============================================================================

@router.patch(
    "/{conversation_id}/messages/{message_id}",
    response_model=MessageResponse,
    summary="Edit Outbound Text Message",
)
async def edit_conversation_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    payload: EditMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an existing agent text message with strict RBAC & ownership enforcement."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    require_conversation_access(conv, current_user)
    msg = await MessageActionsService.edit_message(
        session=db,
        conversation_id=conversation_id,
        message_id=message_id,
        new_text=payload.text,
        user=current_user,
    )
    return MessageResponse.model_validate(msg)


@router.delete(
    "/{conversation_id}/messages/{message_id}",
    response_model=MessageResponse,
    summary="Soft-Delete / Redact Message",
)
async def delete_conversation_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete/redact an existing message with strict RBAC & ownership enforcement."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    require_conversation_access(conv, current_user)
    msg = await MessageActionsService.delete_message(
        session=db,
        conversation_id=conversation_id,
        message_id=message_id,
        user=current_user,
    )
    return MessageResponse.model_validate(msg)


@router.post(
    "/{conversation_id}/messages/{message_id}/reactions",
    response_model=MessageResponse,
    summary="Toggle Emoji Reaction on Message",
)
async def toggle_conversation_message_reaction(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    payload: ReactionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle an emoji reaction on a message in an authorized conversation."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    require_conversation_access(conv, current_user)
    msg = await MessageActionsService.toggle_reaction(
        session=db,
        conversation_id=conversation_id,
        message_id=message_id,
        emoji=payload.emoji,
        user=current_user,
    )
    return MessageResponse.model_validate(msg)


@router.post(
    "/{conversation_id}/messages/{message_id}/pin",
    response_model=MessageResponse,
    summary="Toggle Pin Status on Message",
)
async def toggle_conversation_message_pin(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle pinned status on a message in an authorized conversation."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    require_conversation_access(conv, current_user)
    msg = await MessageActionsService.toggle_pin(
        session=db,
        conversation_id=conversation_id,
        message_id=message_id,
        user=current_user,
    )
    return MessageResponse.model_validate(msg)


@router.post(
    "/{conversation_id}/messages/{message_id}/forward",
    response_model=MessageResponse,
    summary="Forward Message to Another Conversation",
)
async def forward_conversation_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    payload: ForwardMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Forward a message to another authorized conversation without duplicating file storage."""
    source_conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not source_conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source conversation {conversation_id} not found.",
        )
    require_conversation_access(source_conv, current_user)
    msg = await MessageActionsService.forward_message(
        session=db,
        source_conversation_id=conversation_id,
        message_id=message_id,
        target_conversation_id=payload.target_conversation_id,
        user=current_user,
    )
    return MessageResponse.model_validate(msg)
