import math
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.core.security import get_password_hash
from app.models.audit import UserAuditLog
from app.models.conversation import Conversation
from app.models.enums import ChannelEnum, ConversationStatusEnum, UserRole
from app.models.user import User
from app.schemas.team import (
    AuditLogListResponse,
    AuditLogResponse,
    TeamMemberCreate,
    TeamMemberResponse,
    TeamMemberUpdate,
)
from app.services.audit_service import AuditService

router = APIRouter(tags=["admin-team"])


@router.get(
    "/channels",
    response_model=List[str],
    summary="Get List of Supported Channels in System",
)
async def list_available_channels(
    current_user: User = Depends(require_admin),
):
    """Return all canonical channels supported by the CRM based on ChannelEnum."""
    return [c.value for c in ChannelEnum]


@router.get(
    "/members",
    response_model=List[TeamMemberResponse],
    summary="List Team Members with Active Conversation Counts",
)
async def list_team_members(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Retrieve all team members and their active conversation assignments."""
    stmt = select(User).order_by(User.created_at.desc())
    res = await db.execute(stmt)
    users = list(res.scalars().all())

    # Count active assigned conversations per agent
    counts_stmt = (
        select(Conversation.assigned_agent_id, func.count(Conversation.id))
        .where(
            Conversation.status == ConversationStatusEnum.OPEN,
            Conversation.assigned_agent_id.isnot(None),
        )
        .group_by(Conversation.assigned_agent_id)
    )
    counts_res = await db.execute(counts_stmt)
    counts_map = {row[0]: row[1] for row in counts_res.all()}

    result = []
    for user in users:
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
        active_count = counts_map.get(str(user.id), 0)
        resp = TeamMemberResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=role_str,
            brand_access=user.brand_access or [],
            channel_access=user.channel_access or ["ALL"],
            is_active=user.is_active,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            last_active_at=user.last_active_at,
            active_conversations_count=active_count,
        )
        result.append(resp)

    return result


@router.post(
    "/members",
    response_model=TeamMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision New Team Member",
)
async def create_team_member(
    payload: TeamMemberCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create and provision a new team member account."""
    existing_stmt = select(User).where(User.email == payload.email.lower().strip())
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{payload.email}' already exists.",
        )

    pwd_hash = get_password_hash(payload.password)
    new_user = User(
        email=payload.email.lower().strip(),
        password_hash=pwd_hash,
        full_name=payload.full_name.strip(),
        role=payload.role,
        brand_access=payload.brand_access,
        channel_access=payload.channel_access or ["ALL"],
        is_active=payload.is_active,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    client_ip = request.client.host if request.client else None
    role_str = new_user.role.value if hasattr(new_user.role, "value") else str(new_user.role)

    await AuditService.log_action(
        session=db,
        user_id=current_user.id,
        action="user.created",
        resource_type="user",
        resource_id=str(new_user.id),
        payload={
            "email": new_user.email,
            "role": role_str,
            "full_name": new_user.full_name,
            "brand_access": new_user.brand_access or [],
            "channel_access": new_user.channel_access or ["ALL"],
        },
        ip_address=client_ip,
    )

    return TeamMemberResponse(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        role=role_str,
        brand_access=new_user.brand_access or [],
        channel_access=new_user.channel_access or ["ALL"],
        is_active=new_user.is_active,
        created_at=new_user.created_at,
        last_login_at=new_user.last_login_at,
        last_active_at=new_user.last_active_at,
        active_conversations_count=0,
    )


@router.patch(
    "/members/{user_id}",
    response_model=TeamMemberResponse,
    summary="Update Team Member Profile or Status",
)
async def update_team_member(
    user_id: uuid.UUID,
    payload: TeamMemberUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update profile, role, brand access, channel access, or active status of a team member."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team member with ID '{user_id}' not found.",
        )

    # Protect primary superadmin against deactivation
    if user.email.lower() == "admin@luxira.com" and payload.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary superadmin account cannot be deactivated.",
        )

    changes = {}
    if payload.full_name is not None and payload.full_name.strip() != user.full_name:
        changes["full_name"] = {"from": user.full_name, "to": payload.full_name.strip()}
        user.full_name = payload.full_name.strip()
    if payload.role is not None and payload.role != user.role:
        old_r = user.role.value if hasattr(user.role, "value") else str(user.role)
        new_r = payload.role.value if hasattr(payload.role, "value") else str(payload.role)
        changes["role"] = {"from": old_r, "to": new_r}
        user.role = payload.role
    if payload.brand_access is not None and payload.brand_access != user.brand_access:
        changes["brand_access"] = {"from": user.brand_access or [], "to": payload.brand_access}
        user.brand_access = payload.brand_access
    if payload.channel_access is not None and payload.channel_access != user.channel_access:
        changes["channel_access"] = {"from": user.channel_access or ["ALL"], "to": payload.channel_access}
        user.channel_access = payload.channel_access
    if payload.is_active is not None and payload.is_active != user.is_active:
        changes["is_active"] = {"from": user.is_active, "to": payload.is_active}
        user.is_active = payload.is_active
    if payload.password:
        user.password_hash = get_password_hash(payload.password)
        changes["password_changed"] = True

    await db.commit()
    await db.refresh(user)

    action_name = "user.updated"
    if "is_active" in changes and len(changes) == 1:
        action_name = "user.activated" if user.is_active else "user.deactivated"

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=current_user.id,
        action=action_name,
        resource_type="user",
        resource_id=str(user.id),
        payload={"email": user.email, "changes": changes} if changes else {"email": user.email},
        ip_address=client_ip,
    )

    role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
    return TeamMemberResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=role_str,
        brand_access=user.brand_access or [],
        channel_access=user.channel_access or ["ALL"],
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        last_active_at=user.last_active_at,
        active_conversations_count=0,
    )


@router.delete(
    "/members/{user_id}",
    summary="Deactivate Team Member",
)
async def deactivate_team_member(
    user_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Deactivate a team member account."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team member with ID '{user_id}' not found.",
        )

    if user.email.lower() == "admin@luxira.com":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary superadmin account cannot be deactivated.",
        )

    user.is_active = False
    await db.commit()

    client_ip = request.client.host if request.client else None
    await AuditService.log_action(
        session=db,
        user_id=current_user.id,
        action="user.deactivated",
        resource_type="user",
        resource_id=str(user.id),
        payload={"email": user.email, "full_name": user.full_name},
        ip_address=client_ip,
    )

    return {"status": "success", "message": f"User {user.email} deactivated successfully."}


@router.get(
    "/audit-logs",
    response_model=AuditLogListResponse,
    summary="List System & Operational Audit Logs",
)
async def list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action name"),
    user_id: Optional[uuid.UUID] = Query(None, description="Filter by actor user_id"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    search: Optional[str] = Query(None, description="Search in action, user, or resource ID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Retrieve paginated system audit logs with optional filters."""
    from sqlalchemy import or_

    query = select(UserAuditLog, User).outerjoin(User, UserAuditLog.user_id == User.id)

    if action and action.strip() and action.strip().lower() not in ("all", "الكل"):
        query = query.where(UserAuditLog.action == action.strip())
    if user_id:
        query = query.where(UserAuditLog.user_id == user_id)
    if resource_type and resource_type.strip() and resource_type.strip().lower() not in ("all", "الكل"):
        query = query.where(UserAuditLog.resource_type == resource_type.strip())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                UserAuditLog.action.ilike(term),
                UserAuditLog.resource_type.ilike(term),
                UserAuditLog.resource_id.ilike(term),
                User.full_name.ilike(term),
                User.email.ilike(term),
            )
        )

    # Count total matching rows
    count_stmt = select(func.count()).select_from(query.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one()
    total_pages = math.ceil(total / max(page_size, 1)) if total > 0 else 1

    # Paginate and order by created_at desc
    offset = (page - 1) * page_size
    query = query.order_by(UserAuditLog.created_at.desc()).offset(offset).limit(page_size)

    res = await db.execute(query)
    rows = res.all()

    items = []
    for audit, user_obj in rows:
        items.append(
            AuditLogResponse(
                id=audit.id,
                user_id=audit.user_id,
                action=audit.action,
                resource_type=audit.resource_type,
                resource_id=audit.resource_id,
                payload=audit.payload,
                ip_address=audit.ip_address,
                created_at=audit.created_at,
                user_name=user_obj.full_name if user_obj else None,
                user_email=user_obj.email if user_obj else None,
            )
        )

    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
