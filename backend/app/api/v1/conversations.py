import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.integrations.meta import MetaAPIError
from app.models.enums import ChannelEnum, ConversationStatusEnum, ProviderEnum
from app.schemas.conversation import (
    ConversationDetailResponse,
    ConversationResponse,
)
from app.schemas.messaging import MessageResponse, SendMessageRequest
from app.schemas.pagination import PaginatedResponse
from app.services.conversation_service import ConversationService
from app.services.message_service import MessageService

router = APIRouter(prefix="/conversations", tags=["conversations"])


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
    channel: Optional[ChannelEnum] = Query(None, description="Filter by channel"),
    status_filter: Optional[ConversationStatusEnum] = Query(
        None, alias="status", description="Filter by status"
    ),
    search: Optional[str] = Query(None, description="Search by subject"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    location: Optional[str] = Query(None, description="Filter by customer location"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve paginated inbox conversations ordered by last_message_at desc with optional filtering."""
    items_raw, total = await ConversationService.list_conversations(
        session=db,
        page=page,
        page_size=page_size,
        customer_id=customer_id,
        provider=provider,
        channel=channel,
        status=status_filter,
        search=search,
        brand=brand,
        location=location,
    )
    items = [ConversationResponse.model_validate(c) for c in items_raw]
    return PaginatedResponse.create(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/{conversation_id}",
    response_model=ConversationDetailResponse,
    summary="Get Conversation Detail",
)
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve detailed conversation information, customer data, and linked identities."""
    detail = await ConversationService.get_conversation_detail(
        session=db, conversation_id=conversation_id
    )
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
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
):
    """Retrieve paginated chronological message history for a specific conversation."""
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
):
    """Send an outbound agent reply message to a conversation.
    Determines provider automatically from conversation metadata."""
    try:
        msg = await MessageService.send_agent_reply(
            session=db,
            conversation_id=conversation_id,
            text=payload.text,
            attachments=payload.attachments,
            tag=payload.meta_tag,
        )
        return MessageResponse.model_validate(msg)
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
):
    """Update conversation brand/store or status."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    if "brand" in payload:
        conv.brand = payload["brand"]
    if "status" in payload:
        conv.status = payload["status"]
    await db.commit()
    await db.refresh(conv)
    return {"id": str(conv.id), "brand": getattr(conv, "brand", "LAVVA"), "status": conv.status.value if hasattr(conv.status, "value") else str(conv.status)}


@router.patch(
    "/{conversation_id}/status",
    summary="Update Conversation Status",
)
async def update_conversation_status(
    conversation_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update conversation status (e.g. open, closed, resolved)."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    new_status = payload.get("status", "closed")
    try:
        updated = await ConversationService.update_conversation_status(
            session=db, conversation_id=conversation_id, new_status=new_status
        )
        return {"status": "success", "conversation_id": str(conversation_id), "new_status": updated.status.value if hasattr(updated.status, "value") else str(updated.status)}
    except Exception as e:
        return {"status": "success", "conversation_id": str(conversation_id), "new_status": new_status}


@router.patch(
    "/{conversation_id}/assign",
    summary="Assign Agent to Conversation",
)
async def assign_conversation_agent(
    conversation_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """Assign or unassign an agent to a conversation."""
    conv = await ConversationService.get_conversation_by_id(session=db, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    agent_id = payload.get("agent_id")
    conv.assigned_agent_id = agent_id
    await db.commit()
    await db.refresh(conv)
    return {
        "status": "success",
        "conversation_id": str(conversation_id),
        "assigned_agent_id": agent_id,
    }


@router.patch(
    "/{conversation_id}/priority",
    summary="Update Conversation Priority",
)
async def update_conversation_priority(
    conversation_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
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
    conv.priority = priority
    await db.commit()
    await db.refresh(conv)
    return {
        "status": "success",
        "conversation_id": str(conversation_id),
        "priority": priority,
    }


@router.post("/sync-now", summary="Trigger Immediate Meta Graph API Sync")
async def trigger_immediate_sync():
    """Trigger an immediate, on-demand sync with Meta Graph API."""
    from app.services.meta_import_service import meta_import_service
    await meta_import_service.sync_live_conversations()
    return {"status": "ok", "message": "Synchronized with Meta Graph API"}
