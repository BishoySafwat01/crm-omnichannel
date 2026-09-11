from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, require_admin
from app.models.user import User
from app.models.audit import UserAuditLog
from app.services.moderation_service import ModerationService

router = APIRouter(prefix="/moderation", tags=["Moderation & Security Alerts"])


class ModerationConfigPayload(BaseModel):
    is_active: bool = True
    bad_words: List[str] = []
    notify_admin_toast: bool = True
    notify_admin_email: bool = True
    admin_alert_email: Optional[str] = "admin@luxira.com"


@router.get("/config", summary="Get Chat Moderation & Bad Words Config")
async def get_moderation_config(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Retrieve the current bad words dictionary and alert settings."""
    return ModerationService.get_config()


@router.post("/config", summary="Update Chat Moderation & Bad Words Config")
async def update_moderation_config(
    payload: ModerationConfigPayload,
    current_user: User = Depends(require_admin),
) -> dict:
    """Update bad words dictionary and moderation settings (Admin only)."""
    cfg = payload.model_dump()
    saved = ModerationService.save_config(cfg)
    return saved


@router.get("/audit-logs", summary="Get Moderation & Message Deletion Audit Logs")
async def get_moderation_audit_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> List[dict]:
    """Get recent audit logs for deleted messages and bad word detections (Admin only)."""
    stmt = (
        select(UserAuditLog)
        .where(
            UserAuditLog.action.in_([
                "message.deleted",
                "moderation.bad_word_detected",
            ])
        )
        .order_by(desc(UserAuditLog.created_at))
        .limit(limit)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()
    return [
        {
            "id": str(l.id),
            "action": l.action,
            "resource_type": l.resource_type,
            "resource_id": l.resource_id,
            "payload": l.payload,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
