import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.user import User
from app.integrations.meta.client import MetaClient
from app.models.comment import SocialComment
from app.schemas.comment import (
    SocialCommentHideRequest,
    SocialCommentReplyRequest,
    SocialCommentResponse,
)

router = APIRouter()


COMMENT_AUTOMATIONS_STORE = [
    {
        "id": "rule_price_auto_dm",
        "name": "الرد التلقائي على استفسارات الأسعار بالخاص (Auto-DM)",
        "channel": "all",
        "trigger_keywords": ["سعر", "بكام", "بكم", "تفاصيل", "كم", "شحن"],
        "public_reply_text": "أهلاً بك! تم إرسال جميع التفاصيل والسعر في رسالة خاصة (DM).",
        "private_dm_text": "مرحباً بك من LUXIRA! متاح التوصيل الفوري مع خصم 15%. سعر القطعة 450 ريال.",
        "is_active": True,
        "auto_hide_toxic": True,
    },
    {
        "id": "rule_toxic_auto_hide",
        "name": "إخفاء الألفاظ المسيئة والسب تلقائياً (Auto-Hide)",
        "channel": "all",
        "trigger_keywords": ["شتيمة", "احتيال", "نصب", "scam", "spam", "bad", "fake"],
        "public_reply_text": None,
        "private_dm_text": None,
        "is_active": True,
        "auto_hide_toxic": True,
    },
]


@router.get("/automations", summary="Get Comment Automations")
async def get_comment_automations(
    admin_user: User = Depends(require_admin),
):
    """Retrieve all active comment automation rules."""
    return COMMENT_AUTOMATIONS_STORE


@router.post("/automations", summary="Create Comment Automation")
async def create_comment_automation(
    rule: dict,
    admin_user: User = Depends(require_admin),
):
    """Create a new comment automation rule."""
    rule_id = str(rule.get("id") or f"rule_{uuid.uuid4().hex[:8]}")
    rule["id"] = rule_id
    COMMENT_AUTOMATIONS_STORE.append(rule)
    return rule


@router.delete("/automations/{rule_id}", summary="Delete Comment Automation")
async def delete_comment_automation(
    rule_id: str,
    admin_user: User = Depends(require_admin),
):
    """Delete a comment automation rule."""
    global COMMENT_AUTOMATIONS_STORE
    COMMENT_AUTOMATIONS_STORE = [r for r in COMMENT_AUTOMATIONS_STORE if r.get("id") != rule_id]
    return {"status": "success", "deleted": rule_id}


@router.post("/sync", summary="Trigger live Graph API comments sync & seeding")
async def sync_meta_comments(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """Triggers live fetch from Meta Graph API for post comments & seeds sample comments if empty."""
    from app.services.meta_comment_sync_service import MetaCommentSyncService
    service = MetaCommentSyncService(db)
    result = await service.sync_page_feed_comments()
    return result


@router.get("", response_model=list[SocialCommentResponse])
async def list_comments(
    brand: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve social media comments filterable by brand, channel, sentiment, and status."""
    stmt = select(SocialComment).order_by(SocialComment.created_at.desc())

    if brand and brand.lower() != "all":
        stmt = stmt.where(SocialComment.brand == brand)
    if channel and channel.lower() != "all":
        stmt = stmt.where(SocialComment.channel == channel)
    if sentiment and sentiment.lower() != "all":
        stmt = stmt.where(SocialComment.sentiment == sentiment)
    if status_filter:
        if status_filter == "hidden":
            stmt = stmt.where(SocialComment.is_hidden == True)
        elif status_filter == "visible":
            stmt = stmt.where(SocialComment.is_hidden == False, SocialComment.is_deleted == False)

    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/{comment_uuid}/reply", response_model=SocialCommentResponse)
async def reply_to_social_comment(
    comment_uuid: uuid.UUID,
    payload: SocialCommentReplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reply publicly or via private DM to a social comment."""
    stmt = select(SocialComment).where(SocialComment.id == comment_uuid)
    res = await db.execute(stmt)
    comment = res.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    client = MetaClient()
    if payload.private_dm:
        await client.send_private_reply(comment.comment_id, payload.message)
    else:
        await client.reply_to_comment(comment.comment_id, payload.message)

    comment.auto_replied = True
    comment.reply_text = payload.message
    await db.commit()
    await db.refresh(comment)
    return comment


@router.patch("/{comment_uuid}/hide", response_model=SocialCommentResponse)
async def toggle_hide_social_comment(
    comment_uuid: uuid.UUID,
    payload: SocialCommentHideRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hide or unhide a social comment."""
    stmt = select(SocialComment).where(SocialComment.id == comment_uuid)
    res = await db.execute(stmt)
    comment = res.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    client = MetaClient()
    await client.hide_comment(comment.comment_id, is_hidden=payload.is_hidden)

    comment.is_hidden = payload.is_hidden
    await db.commit()
    await db.refresh(comment)
    return comment


@router.delete("/{comment_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_social_comment(
    comment_uuid: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a social comment."""
    stmt = select(SocialComment).where(SocialComment.id == comment_uuid)
    res = await db.execute(stmt)
    comment = res.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    client = MetaClient()
    await client.delete_comment(comment.comment_id)

    comment.is_deleted = True
    await db.commit()
    return None
