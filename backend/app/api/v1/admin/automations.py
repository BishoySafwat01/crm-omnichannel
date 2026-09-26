import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.automation import AutomationExecutionLog, AutomationRule
from app.models.connected_page import ConnectedPage
from app.models.user import User
from app.schemas.automation import (
    AutomationExecutionLogResponse,
    AutomationKeywordsUpdate,
    AutomationRuleCreate,
    AutomationRuleResponse,
    AutomationRuleUpdate,
    AutomationSettingsResponse,
    AutomationSettingsUpdate,
    GlobalAutomationToggleRequest,
    GlobalAutomationToggleResponse,
    RestrictedAutomationRuleCreate,
)
from app.services.audit_service import AuditService
from app.services.automation_service import (
    AutomationAuthorizationError,
    AutomationService,
    is_global_automation_enabled,
    set_global_automation_enabled,
)

router = APIRouter()


def _role_name(user: User) -> str:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return str(role).strip().lower()


def _can_manage_rule_keywords(
    user: User,
    rule: AutomationRule,
    page_names: dict[str, str],
) -> bool:
    if _role_name(user) in ("admin", "superadmin"):
        return True
    if _role_name(user) not in ("agent", "call_center"):
        return False

    allowed = {
        str(value).strip().casefold()
        for value in (user.brand_access or [])
        if str(value).strip()
    }
    if not allowed:
        return False

    target_page_ids = [
        str(page_id)
        for page_id in [rule.page_id, *(rule.page_responses or {}).keys()]
        if page_id
    ]
    normalized_brand = str(rule.brand_id or "").strip().casefold()
    is_global_rule = not target_page_ids and normalized_brand in ("", "all", "الكل")
    if is_global_rule:
        return False
    if allowed.intersection({"all", "الكل"}):
        return True
    if target_page_ids:
        pages_are_allowed = all(
            str(page_id).strip().casefold() in allowed
            or page_names.get(str(page_id), "").strip().casefold() in allowed
            for page_id in target_page_ids
        )
        if pages_are_allowed:
            return True

        # Legacy single-page rules may only carry a recognizable brand_id even
        # when their page identifier is not present in brand_access.
        return len(target_page_ids) == 1 and normalized_brand in allowed

    return normalized_brand in allowed


def _keyword_rule_payload(
    rule: AutomationRule, page_names: Optional[dict[str, str]] = None
) -> dict:
    page_names = page_names or {}
    return {
        "id": rule.id,
        "name": rule.name,
        "brand_id": rule.brand_id or page_names.get(str(rule.page_id or "")),
        "page_id": rule.page_id,
        "keywords": rule.keywords,
        "is_active": rule.is_active,
        "created_by": rule.created_by,
        "created_at": rule.created_at,
    }


async def _connected_page_names(db: AsyncSession) -> dict[str, str]:
    rows = (
        await db.execute(
            select(ConnectedPage.page_id, ConnectedPage.name).where(
                ConnectedPage.deleted_at.is_(None)
            )
        )
    ).all()
    return {str(page_id): str(name) for page_id, name in rows}


@router.get("/global-toggle", response_model=GlobalAutomationToggleResponse)
async def get_global_automation_toggle(
    admin_user: User = Depends(require_admin),
):
    enabled = await is_global_automation_enabled()
    return GlobalAutomationToggleResponse(is_global_automation_enabled=enabled, status="ok")


@router.post("/global-toggle", response_model=GlobalAutomationToggleResponse)
async def set_global_automation_toggle_endpoint(
    payload: GlobalAutomationToggleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    enabled = await set_global_automation_enabled(payload.enabled)

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=admin_user.id,
        action="automation.global_toggle",
        resource_type="automation",
        resource_id="global",
        payload={
            "is_global_automation_enabled": enabled,
            "action": "enabled" if enabled else "disabled",
        },
        ip_address=client_ip,
    )

    return GlobalAutomationToggleResponse(is_global_automation_enabled=enabled, status="ok")


@router.get("/settings", response_model=AutomationSettingsResponse)
async def get_automation_settings(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    return await AutomationService.get_settings(db)


@router.put("/settings", response_model=AutomationSettingsResponse)
async def update_automation_settings(
    payload: AutomationSettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    automation_settings = await AutomationService.update_settings(
        db,
        **payload.model_dump(),
    )
    await AuditService.log_action(
        session=db,
        user_id=admin_user.id,
        action="automation.settings_updated",
        resource_type="automation",
        resource_id="built_in_bots",
        payload=payload.model_dump(),
        ip_address=request.client.host if request.client else None,
    )
    return automation_settings


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
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    rule = AutomationRule(
        name=payload.name.strip(),
        brand_id=payload.brand_id.strip() if payload.brand_id else None,
        page_id=payload.page_id.strip() if payload.page_id else None,
        channels=payload.channels,
        trigger_type=payload.trigger_type,
        match_type=payload.match_type,
        keywords=list(dict.fromkeys([k.strip() for k in (payload.keywords or []) if isinstance(k, str) and k.strip()])),
        response_text=payload.response_text.strip(),
        response_media_url=payload.response_media_url,
        page_responses=payload.page_responses or {},
        split_lines=payload.split_lines,
        delay_seconds=payload.delay_seconds,
        human_typing_simulation=payload.human_typing_simulation,
        cooldown_minutes=payload.cooldown_minutes,
        is_active=payload.is_active,
        created_by=admin_user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=admin_user.id,
        action="automation.created",
        resource_type="automation",
        resource_id=str(rule.id),
        payload={
            "name": rule.name,
            "brand_id": rule.brand_id,
            "trigger_type": rule.trigger_type,
            "is_active": rule.is_active,
        },
        ip_address=client_ip,
    )

    return rule


@router.get("/keywords")
async def list_automation_rule_keywords(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _role_name(current_user) not in ("admin", "superadmin", "agent", "call_center"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    rules = list(
        (
            await db.execute(
                select(AutomationRule).order_by(AutomationRule.created_at.desc())
            )
        ).scalars().all()
    )
    page_names = await _connected_page_names(db)
    return [
        _keyword_rule_payload(rule, page_names)
        for rule in rules
        if _can_manage_rule_keywords(current_user, rule, page_names)
    ]


@router.post("/keywords", status_code=status.HTTP_201_CREATED)
async def create_restricted_automation_rule(
    payload: RestrictedAutomationRuleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        rule = await AutomationService.create_restricted_keyword_rule(
            session=db,
            user=current_user,
            name=payload.name,
            brand_id=payload.brand_id,
            keywords=payload.keywords,
        )
    except AutomationAuthorizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    await AuditService.log_action(
        session=db,
        user_id=current_user.id,
        action="automation.created",
        resource_type="automation",
        resource_id=str(rule.id),
        payload={
            "name": rule.name,
            "brand_id": rule.brand_id,
            "page_id": rule.page_id,
            "keywords": rule.keywords,
            "creation_mode": "restricted_operator",
        },
        ip_address=request.client.host if request.client else None,
    )
    return _keyword_rule_payload(rule, {str(rule.page_id): str(rule.brand_id)})


@router.patch("/keywords/{rule_id}")
async def update_automation_rule_keywords(
    rule_id: uuid.UUID,
    payload: AutomationKeywordsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = (
        await db.execute(select(AutomationRule).where(AutomationRule.id == rule_id))
    ).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automation rule not found.")

    page_names = await _connected_page_names(db)
    if not _can_manage_rule_keywords(current_user, rule, page_names):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this store.")

    try:
        AutomationService.validate_keyword_update(
            current_user,
            rule,
            payload.keywords,
        )
    except AutomationAuthorizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    rule.keywords = payload.keywords
    await db.commit()
    await db.refresh(rule)
    await AuditService.log_action(
        session=db,
        user_id=current_user.id,
        action="automation.keywords_updated",
        resource_type="automation",
        resource_id=str(rule.id),
        payload={"name": rule.name, "keywords": rule.keywords},
        ip_address=request.client.host if request.client else None,
    )
    return _keyword_rule_payload(rule, page_names)


@router.patch("/{rule_id}", response_model=AutomationRuleResponse)
async def update_automation_rule(
    rule_id: uuid.UUID,
    payload: AutomationRuleUpdate,
    request: Request,
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

    old_active = rule.is_active
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "keywords" and value is not None:
            setattr(rule, key, list(dict.fromkeys([k.strip() for k in value if isinstance(k, str) and k.strip()])))
        elif key == "name" and value is not None:
            setattr(rule, key, value.strip())
        elif key in ("brand_id", "page_id") and value is not None:
            setattr(rule, key, value.strip() if value else None)
        elif value is not None:
            setattr(rule, key, value)

    await db.commit()
    await db.refresh(rule)

    action_name = "automation.updated"
    if "is_active" in update_data and len(update_data) == 1:
        action_name = "automation.enabled" if rule.is_active else "automation.disabled"

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=admin_user.id,
        action=action_name,
        resource_type="automation",
        resource_id=str(rule.id),
        payload={
            "name": rule.name,
            "changes": update_data,
            "previous_active": old_active,
            "is_active": rule.is_active,
        },
        ip_address=client_ip,
    )

    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation_rule(
    rule_id: uuid.UUID,
    request: Request,
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

    rule_name = rule.name
    await db.delete(rule)
    await db.commit()

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=admin_user.id,
        action="automation.deleted",
        resource_type="automation",
        resource_id=str(rule_id),
        payload={"name": rule_name},
        ip_address=client_ip,
    )

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
