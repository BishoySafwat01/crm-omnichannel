import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.user import User
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

router = APIRouter(prefix="/comments", tags=["social-comments"])


@router.get("", response_model=SocialCommentListResponse, summary="List Social Comments")
async def list_social_comments(
    brand: Optional[str] = Query(None, description="Filter by brand"),
    platform: Optional[str] = Query(None, description="Filter by platform (facebook/instagram)"),
    sentiment: Optional[str] = Query(None, description="Filter by sentiment"),
    status: Optional[str] = Query(None, description="Filter by moderation status"),
    search: Optional[str] = Query(None, description="Search term"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List social comments across Facebook & Instagram with rich filtering."""
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
    items = [SocialCommentResponse.model_validate(c) for c in comments]
    return SocialCommentListResponse(
        items=items, total=total, page=page, page_size=page_size, total_pages=total_pages
    )


@router.get("/stats", response_model=CommentStatsResponse, summary="Get Comment Moderation Stats")
async def get_comment_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve aggregate moderation statistics."""
    return await CommentModerationService.get_stats(session=db)


@router.post("/{comment_id}/status", response_model=SocialCommentResponse, summary="Update Comment Status")
async def update_comment_status(
    comment_id: uuid.UUID,
    payload: UpdateCommentStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete, hide, restore, or flag a social comment."""
    try:
        comment = await CommentModerationService.update_comment_status(
            session=db,
            comment_id=comment_id,
            new_status=payload.status,
            reason=payload.reason,
            performed_by=current_user.full_name or "ADMIN",
        )
        return SocialCommentResponse.model_validate(comment)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{comment_id}/reply", response_model=SocialCommentResponse, summary="Reply to Comment & Send DM")
async def reply_to_comment(
    comment_id: uuid.UUID,
    payload: ReplyCommentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Post an official public reply to a comment and optionally dispatch a private DM."""
    try:
        comment = await CommentModerationService.reply_to_comment(
            session=db,
            comment_id=comment_id,
            reply_text=payload.reply_text,
            send_dm=payload.send_dm,
            dm_text=payload.dm_text,
            performed_by=current_user.full_name or "ADMIN",
        )
        return SocialCommentResponse.model_validate(comment)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/settings", response_model=ModerationSettingsPayload, summary="Get Moderation Settings")
async def get_moderation_settings(
    brand: str = Query("all"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch AI Auto-Moderation rules and keyword lists."""
    sett = await CommentModerationService.get_or_create_settings(session=db, brand=brand)
    return ModerationSettingsPayload(
        auto_delete_negative=sett.auto_delete_negative,
        auto_hide_spam=sett.auto_hide_spam,
        auto_reply_inquiries=sett.auto_reply_inquiries,
        strictness_level=sett.strictness_level,
        action_for_negative=sett.action_for_negative,
        negative_keywords=sett.negative_keywords or [],
        inquiry_keywords=sett.inquiry_keywords or [],
        inquiry_reply_text=sett.inquiry_reply_text,
        inquiry_dm_text=sett.inquiry_dm_text,
        negative_dm_apology_text=sett.negative_dm_apology_text,
    )


@router.put("/settings", response_model=ModerationSettingsPayload, summary="Update Moderation Settings")
async def update_moderation_settings(
    payload: ModerationSettingsPayload,
    brand: str = Query("all"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Update AI Auto-Moderation rules (Admin Only)."""
    sett = await CommentModerationService.update_settings(
        session=db, brand=brand, payload=payload
    )
    return ModerationSettingsPayload(
        auto_delete_negative=sett.auto_delete_negative,
        auto_hide_spam=sett.auto_hide_spam,
        auto_reply_inquiries=sett.auto_reply_inquiries,
        strictness_level=sett.strictness_level,
        action_for_negative=sett.action_for_negative,
        negative_keywords=sett.negative_keywords or [],
        inquiry_keywords=sett.inquiry_keywords or [],
        inquiry_reply_text=sett.inquiry_reply_text,
        inquiry_dm_text=sett.inquiry_dm_text,
        negative_dm_apology_text=sett.negative_dm_apology_text,
    )


@router.get("/logs", response_model=List[ModerationLogResponse], summary="List Moderation Execution Logs")
async def list_moderation_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve audit history of AI and Admin moderation actions."""
    logs, total = await CommentModerationService.list_logs(
        session=db, page=page, page_size=page_size
    )
    return [ModerationLogResponse.model_validate(l) for l in logs]


@router.post("/simulate-ai", response_model=AiSimulationResponse, summary="Simulate AI Comment Moderation")
async def simulate_ai_comment(
    payload: AiSimulationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test AI comment classification, sentiment scoring, and automated responses."""
    return await CommentModerationService.simulate_ai(
        session=db, comment_text=payload.comment_text, brand=payload.brand or "all"
    )
