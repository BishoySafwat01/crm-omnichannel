import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_optional_current_user, require_admin
from app.core.database import get_db
from app.models.user import User
from app.models.workspace import DEFAULT_WORKSPACE_ID, Workspace

logger = logging.getLogger("app.api.v1.portal")

router = APIRouter(prefix="/portal", tags=["portal"])


class PortalBrandingResponse(BaseModel):
    workspace_id: uuid.UUID
    workspace_name: str
    workspace_slug: str
    brand_display_name: str
    brand_logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    theme_primary_color: str = "#1A73E8"
    canned_responses: Optional[dict[str, Any]] = None
    custom_domain: Optional[str] = None


class PortalBrandingUpdateRequest(BaseModel):
    brand_display_name: Optional[str] = Field(None, max_length=255)
    brand_logo_url: Optional[str] = Field(None, max_length=500)
    favicon_url: Optional[str] = Field(None, max_length=500)
    theme_primary_color: Optional[str] = Field(None, max_length=20)
    canned_responses: Optional[dict[str, Any]] = None


@router.get(
    "/branding",
    response_model=PortalBrandingResponse,
    summary="Retrieve active enterprise portal branding & theme",
)
async def get_portal_branding(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
) -> PortalBrandingResponse:
    """Dynamically resolves corporate branding based on authenticated user division,

    custom domain headers, or system default workspace.
    """
    workspace: Optional[Workspace] = None

    # Resolution Vector 1: Authenticated User Division / Workspace Context
    if current_user and current_user.workspace_id:
        stmt = select(Workspace).where(
            Workspace.id == current_user.workspace_id,
            Workspace.is_active == True,
        )
        res = await db.execute(stmt)
        workspace = res.scalar_one_or_none()

    # Resolution Vector 2: Request Host / Custom Domain Mapping
    if not workspace:
        host_header = (
            request.headers.get("x-forwarded-host")
            or request.headers.get("host")
            or ""
        )
        clean_host = host_header.split(":")[0].strip().lower()
        if clean_host and clean_host not in ("localhost", "127.0.0.1"):
            stmt = select(Workspace).where(
                func.lower(Workspace.custom_domain) == clean_host,
                Workspace.is_active == True,
            )
            res = await db.execute(stmt)
            workspace = res.scalar_one_or_none()

    # Resolution Vector 3: System Default Organization Workspace
    if not workspace:
        stmt = select(Workspace).where(
            Workspace.id == DEFAULT_WORKSPACE_ID,
            Workspace.is_active == True,
        )
        res = await db.execute(stmt)
        workspace = res.scalar_one_or_none()

    # Resolution Vector 4: Fallback to any active workspace
    if not workspace:
        stmt = select(Workspace).where(Workspace.is_active == True).limit(1)
        res = await db.execute(stmt)
        workspace = res.scalar_one_or_none()

    if workspace:
        return PortalBrandingResponse(
            workspace_id=workspace.id,
            workspace_name=workspace.name,
            workspace_slug=workspace.slug,
            brand_display_name=workspace.brand_display_name or "مجموعة لوكسيرا - نظام إدارة العملاء الموحد",
            brand_logo_url=workspace.brand_logo_url,
            favicon_url=workspace.favicon_url,
            theme_primary_color=workspace.theme_primary_color or "#1A73E8",
            canned_responses=workspace.canned_responses,
            custom_domain=workspace.custom_domain,
        )

    # Absolute safe fallback
    return PortalBrandingResponse(
        workspace_id=DEFAULT_WORKSPACE_ID,
        workspace_name="LUXIRA Group",
        workspace_slug="default",
        brand_display_name="مجموعة لوكسيرا - نظام إدارة العملاء الموحد",
        brand_logo_url=None,
        favicon_url=None,
        theme_primary_color="#1A73E8",
        canned_responses=None,
        custom_domain=None,
    )


@router.patch(
    "/branding",
    response_model=PortalBrandingResponse,
    summary="Update enterprise portal branding & theme settings",
)
async def update_portal_branding(
    payload: PortalBrandingUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> PortalBrandingResponse:
    """Updates division / workspace branding parameters for the active corporate portal."""
    workspace_id = current_user.workspace_id or DEFAULT_WORKSPACE_ID

    stmt = select(Workspace).where(Workspace.id == workspace_id)
    res = await db.execute(stmt)
    workspace = res.scalar_one_or_none()

    if not workspace:
        # Fallback to default workspace
        stmt = select(Workspace).where(Workspace.id == DEFAULT_WORKSPACE_ID)
        res = await db.execute(stmt)
        workspace = res.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Corporate workspace not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "theme_primary_color" in update_data and not update_data["theme_primary_color"]:
        update_data["theme_primary_color"] = "#1A73E8"

    for field, value in update_data.items():
        if hasattr(workspace, field):
            setattr(workspace, field, value)

    await db.commit()
    await db.refresh(workspace)

    logger.info(
        "Updated portal branding for workspace %s (%s) by admin user %s: %s",
        workspace.id,
        workspace.name,
        current_user.id,
        list(update_data.keys()),
    )

    return PortalBrandingResponse(
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        workspace_slug=workspace.slug,
        brand_display_name=workspace.brand_display_name or "مجموعة لوكسيرا - نظام إدارة العملاء الموحد",
        brand_logo_url=workspace.brand_logo_url,
        favicon_url=workspace.favicon_url,
        theme_primary_color=workspace.theme_primary_color or "#1A73E8",
        canned_responses=workspace.canned_responses,
        custom_domain=workspace.custom_domain,
    )

