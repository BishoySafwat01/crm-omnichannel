import uuid
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.user import User
from app.models.social_comment import SocialComment, CommentModerationLog, CommentModerationSetting
from app.schemas.social_comment import (
    AiSimulationRequest,
    AiSimulationResponse,
    CommentStatsResponse,
    ModerationLogResponse,
    ModerationSettingsPayload,
    ReplyCommentRequest,
    SocialCommentListResponse,
    SocialCommentResponse,
    UpdateCommentStatusRequest,
)
from app.services.comment_moderation_service import CommentModerationService

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
    return COMMENT_AUTOMATIONS_STORE


@router.post("/automations", summary="Create Comment Automation")
async def create_comment_automation(
    rule: dict,
    admin_user: User = Depends(require_admin),
):
    rule_id = str(rule.get("id") or f"rule_{uuid.uuid4().hex[:8]}")
    rule["id"] = rule_id
    COMMENT_AUTOMATIONS_STORE.append(rule)
    return rule


@router.delete("/automations/{rule_id}", summary="Delete Comment Automation")
async def delete_comment_automation(
    rule_id: str,
    admin_user: User = Depends(require_admin),
):
    global COMMENT_AUTOMATIONS_STORE
    COMMENT_AUTOMATIONS_STORE = [r for r in COMMENT_AUTOMATIONS_STORE if r.get("id") != rule_id]
    return {"status": "success", "deleted": rule_id}


@router.post("/sync", summary="Trigger live Graph API comments sync & seeding")
async def sync_meta_comments(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    from app.services.meta_comment_sync_service import MetaCommentSyncService
    service = MetaCommentSyncService(db)
    result = await service.sync_page_feed_comments()
    return result


@router.get("", response_model=SocialCommentListResponse)
async def list_comments(
    brand: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    sentiment: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    comments, total, total_pages = await CommentModerationService.list_comments(
        session=db,
        brand=brand,
        platform=platform,
        sentiment=sentiment,
        status=status,
        search=search,
        page=page,
        page_size=page_size,
    )
    return SocialCommentListResponse(
        items=[SocialCommentResponse.model_validate(c) for c in comments],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/stats", response_model=CommentStatsResponse)
async def get_comment_stats(
    db: AsyncSession = Depends(get_db),
):
    return await CommentModerationService.get_stats(db)


@router.post("/{comment_id}/status", response_model=SocialCommentResponse)
async def update_comment_status(
    comment_id: uuid.UUID,
    payload: UpdateCommentStatusRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await CommentModerationService.update_comment_status(
        session=db,
        comment_id=comment_id,
        new_status=payload.status,
        performed_by=current_user.full_name or current_user.email,
        reason=payload.reason,
    )
    return SocialCommentResponse.model_validate(comment)


@router.post("/{comment_id}/reply", response_model=SocialCommentResponse)
async def reply_to_comment(
    comment_id: uuid.UUID,
    payload: ReplyCommentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await CommentModerationService.reply_to_comment(
        session=db,
        comment_id=comment_id,
        reply_text=payload.reply_text,
        send_dm=payload.send_dm,
        dm_text=payload.dm_text,
        performed_by=current_user.full_name or current_user.email,
    )
    return SocialCommentResponse.model_validate(comment)


@router.get("/settings")
async def get_moderation_settings(
    brand: str = Query("all"),
    db: AsyncSession = Depends(get_db),
):
    return await CommentModerationService.get_or_create_settings(db, brand=brand)


@router.put("/settings")
async def update_moderation_settings(
    payload: ModerationSettingsPayload,
    brand: str = Query("all"),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await CommentModerationService.update_settings(db, brand=brand, payload=payload)


@router.get("/logs", response_model=list[ModerationLogResponse])
async def get_moderation_logs(
    db: AsyncSession = Depends(get_db),
):
    return await CommentModerationService.get_logs(db)


@router.post("/simulate-ai", response_model=AiSimulationResponse)
async def simulate_ai(
    payload: AiSimulationRequest,
    db: AsyncSession = Depends(get_db),
):
    return await CommentModerationService.simulate_ai(
        session=db,
        comment_text=payload.comment_text,
        brand=payload.brand or "all",
    )
