from datetime import datetime
import logging
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.connected_page import ConnectedPage
from app.models.user import User
from app.services.meta_oauth_service import MetaOAuthService

logger = logging.getLogger("app.api.v1.meta_oauth")

router = APIRouter(prefix="/meta", tags=["meta-oauth"])


# --- Schemas ---

class MetaOAuthLoginUrlResponse(BaseModel):
    authorization_url: str = Field(..., description="Meta OAuth 2.0 authorization redirect URL")
    state: str = Field(..., description="Tamper-proof signed CSRF state token")


class MetaOAuthCallbackRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Authorization code returned by Meta dialog")
    state: str = Field(..., min_length=1, description="CSRF state parameter returned by Meta")
    redirect_uri: str = Field(..., min_length=1, description="Exact redirect URI used in the initial authorization request")


class ConnectedPageResponse(BaseModel):
    id: uuid.UUID
    page_id: str
    name: str
    category: Optional[str] = None
    instagram_business_account_id: Optional[str] = None
    status: str
    is_webhook_subscribed: bool
    connected_by_user_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Endpoints ---

@router.get(
    "/oauth/login-url",
    response_model=MetaOAuthLoginUrlResponse,
    summary="Generate Meta OAuth 2.0 Authorization URL",
)
async def get_meta_oauth_login_url(
    redirect_uri: Optional[str] = Query(
        None,
        description="Optional explicit frontend callback URL. Defaults to frontend origin if omitted.",
    ),
    current_user: User = Depends(require_admin),
) -> MetaOAuthLoginUrlResponse:
    """Generate signed CSRF state and return Meta authorization redirect URL (Superadmin / Admin only)."""
    state = MetaOAuthService.generate_oauth_state(user_id=current_user.id)
    auth_url = MetaOAuthService.get_authorization_url(state=state, redirect_uri=redirect_uri)
    return MetaOAuthLoginUrlResponse(authorization_url=auth_url, state=state)


@router.post(
    "/oauth/callback",
    response_model=list[ConnectedPageResponse],
    summary="Handle Meta OAuth 2.0 Callback and Onboard Pages",
)
async def handle_meta_oauth_callback(
    payload: MetaOAuthCallbackRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ConnectedPageResponse]:
    """Receive authorization code, validate CSRF, fetch pages, encrypt tokens, and persist to DB (Superadmin / Admin only)."""
    # 1. Validate CSRF state signature and expiration
    MetaOAuthService.verify_oauth_state(state=payload.state, expected_user_id=current_user.id)

    # 2. Exchange code for user token (and upgrade to 60-day long-lived token)
    long_lived_user_token = await MetaOAuthService.exchange_code_for_user_token(
        code=payload.code,
        redirect_uri=payload.redirect_uri,
    )

    # 3. Fetch managed Facebook Pages and linked Instagram accounts
    pages = await MetaOAuthService.fetch_user_pages(long_lived_user_token=long_lived_user_token)
    if not pages:
        logger.warning("No Facebook Pages returned for authenticated user %s", current_user.email)
        return []

    # 4. Upsert records with encrypted tokens
    saved_pages = await MetaOAuthService.save_or_update_pages(
        pages=pages,
        user_id=current_user.id,
        db=db,
    )

    return [ConnectedPageResponse.model_validate(p) for p in saved_pages]


@router.get(
    "/connected-pages",
    response_model=list[ConnectedPageResponse],
    summary="List Connected Facebook Pages",
)
async def list_connected_pages(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ConnectedPageResponse]:
    """Retrieve all onboarded Facebook Pages without exposing encrypted or plain access tokens (Superadmin / Admin only)."""
    stmt = select(ConnectedPage).order_by(ConnectedPage.created_at.desc())
    result = await db.execute(stmt)
    pages = result.scalars().all()
    return [ConnectedPageResponse.model_validate(p) for p in pages]


class UpdatePageStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(ACTIVE|INACTIVE)$", description="New status: ACTIVE or INACTIVE")


@router.patch(
    "/connected-pages/{page_id}/status",
    response_model=ConnectedPageResponse,
    summary="Update Connected Page Status (Active/Inactive)",
)
async def update_connected_page_status(
    page_id: str,
    payload: UpdatePageStatusRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ConnectedPageResponse:
    """Toggle page operational status between ACTIVE and INACTIVE (Admin only)."""
    stmt = select(ConnectedPage).where(ConnectedPage.page_id == page_id)
    res = await db.execute(stmt)
    page = res.scalar_one_or_none()
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connected page with ID {page_id} not found.",
        )
    page.status = payload.status
    await db.commit()
    await db.refresh(page)
    logger.info("Admin %s updated page %s status to %s", current_user.email, page_id, payload.status)
    return ConnectedPageResponse.model_validate(page)


@router.delete(
    "/connected-pages/{page_id}",
    summary="Disconnect/Delete Connected Facebook Page",
)
async def delete_connected_page(
    page_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect and remove an onboarded Facebook Page record from the system (Admin only)."""
    stmt = select(ConnectedPage).where(ConnectedPage.page_id == page_id)
    res = await db.execute(stmt)
    page = res.scalar_one_or_none()
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connected page with ID {page_id} not found.",
        )
    page_name = page.name
    await db.delete(page)
    await db.commit()
    logger.info("Admin %s disconnected page %s (%s)", current_user.email, page_id, page_name)
    return {"status": "success", "message": f"تم إلغاء ربط الصفحة {page_name} بنجاح.", "page_id": page_id}


@router.post(
    "/connected-pages/{page_id}/subscribe",
    response_model=ConnectedPageResponse,
    summary="Subscribe / Re-subscribe Connected Page to App Webhooks",
)
async def subscribe_connected_page(
    page_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ConnectedPageResponse:
    """Manually trigger Meta Graph API Webhook subscription for a specific connected page (Admin only)."""
    stmt = select(ConnectedPage).where(ConnectedPage.page_id == page_id)
    res = await db.execute(stmt)
    page = res.scalar_one_or_none()
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connected page with ID {page_id} not found.",
        )
    
    token = page.decrypted_access_token
    subscribed = await MetaOAuthService.subscribe_page_to_webhooks(
        page_id=page.page_id,
        page_token=token,
    )
    page.is_webhook_subscribed = subscribed
    await db.commit()
    await db.refresh(page)
    logger.info("Admin %s subscribed page %s to webhooks: %s", current_user.email, page_id, subscribed)
    return ConnectedPageResponse.model_validate(page)

