import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.automation import AutomationExecutionLog, AutomationRule
from app.models.user import User
from app.schemas.automation import (
    AutomationExecutionLogResponse,
    AutomationRuleCreate,
    AutomationRuleResponse,
    AutomationRuleUpdate,
)

router = APIRouter()


@router.get("", response_model=list[AutomationRuleResponse])
async def list_automation_rules(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    stmt = select(AutomationRule).order_by(AutomationRule.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=AutomationRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_automation_rule(
    payload: AutomationRuleCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    rule = AutomationRule(
        name=payload.name.strip(),
        brand_id=payload.brand_id.strip() if payload.brand_id else None,
        channels=payload.channels,
        trigger_type=payload.trigger_type,
        match_type=payload.match_type,
        keywords=[k.strip() for k in payload.keywords if k.strip()],
        response_text=payload.response_text.strip(),
        response_media_url=payload.response_media_url,
        cooldown_minutes=payload.cooldown_minutes,
        is_active=payload.is_active,
        created_by=admin_user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/{rule_id}", response_model=AutomationRuleResponse)
async def update_automation_rule(
    rule_id: uuid.UUID,
    payload: AutomationRuleUpdate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    stmt = select(AutomationRule).where(AutomationRule.id == rule_id)
    res = await db.execute(stmt)
    rule = res.scalar_one_or_none()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Automation rule {rule_id} not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "keywords" and value is not None:
            setattr(rule, key, [k.strip() for k in value if k.strip()])
        elif key == "name" and value is not None:
            setattr(rule, key, value.strip())
        elif key == "brand_id" and value is not None:
            setattr(rule, key, value.strip() if value else None)
        elif value is not None:
            setattr(rule, key, value)

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    stmt = select(AutomationRule).where(AutomationRule.id == rule_id)
    res = await db.execute(stmt)
    rule = res.scalar_one_or_none()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Automation rule {rule_id} not found.",
        )

    await db.delete(rule)
    await db.commit()
    return None


@router.get("/logs", response_model=list[AutomationExecutionLogResponse])
async def list_automation_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    stmt = (
        select(AutomationExecutionLog, AutomationRule.name.label("rule_name"))
        .outerjoin(AutomationRule, AutomationExecutionLog.rule_id == AutomationRule.id)
        .order_by(AutomationExecutionLog.executed_at.desc())
        .limit(limit)
    )
    res = await db.execute(stmt)
    rows = res.all()

    logs = []
    for log_obj, rule_name in rows:
        log_dict = {
            "id": log_obj.id,
            "rule_id": log_obj.rule_id,
            "conversation_id": log_obj.conversation_id,
            "customer_id": log_obj.customer_id,
            "executed_at": log_obj.executed_at,
            "rule_name": rule_name or "قاعدة محذوفة",
        }
        logs.append(AutomationExecutionLogResponse.model_validate(log_dict))

    return logs
