from datetime import datetime
import html
import logging
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
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
    redirect_uri: Optional[str] = Field(None, description="Exact redirect URI used in the initial authorization request")


class ConnectedPageResponse(BaseModel):
    id: uuid.UUID
    page_id: str
    name: str
    category: Optional[str] = None
    instagram_business_account_id: Optional[str] = None
    status: str
    is_active: bool = True
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
    request: Request,
    redirect_uri: Optional[str] = Query(
        None,
        description="Optional explicit frontend callback URL. Defaults to https://webluxira.com/api/v1/meta/oauth/callback if omitted.",
    ),
    current_user: User = Depends(require_admin),
) -> MetaOAuthLoginUrlResponse:
    """Generate signed CSRF state and return Meta authorization redirect URL (Superadmin / Admin only)."""
    # Dynamic redirect URI resolution: default to https://webluxira.com/api/v1/meta/oauth/callback
    resolved_redirect_uri = (
        redirect_uri.strip()
        if (redirect_uri and redirect_uri.strip())
        else "https://webluxira.com/api/v1/meta/oauth/callback"
    )

    state = MetaOAuthService.generate_oauth_state(user_id=current_user.id, redirect_uri=resolved_redirect_uri)
    auth_url = MetaOAuthService.get_authorization_url(state=state, redirect_uri=resolved_redirect_uri)
    return MetaOAuthLoginUrlResponse(authorization_url=auth_url, state=state)


@router.get(
    "/oauth/callback",
    summary="Handle Meta OAuth 2.0 Browser Callback Redirect",
)
async def handle_meta_oauth_browser_redirect(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_code: Optional[str] = Query(None),
    error_message: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """
    Pure backend OAuth landing page.
    Terminates Meta OAuth redirect at FastAPI, exchanges tokens, persists pages to PostgreSQL,
    and returns a standalone HTML payload that calls window.opener.postMessage and window.close().
    React NEVER mounts inside the popup.
    """
    # 1. Handle user cancellation or error from Meta
    if error or error_code or error_message or error_description or not code or not state:
        raw_error = (
            error_message
            or error_description
            or error
            or (f"Meta error code {error_code}" if error_code else "User cancelled or authorization failed")
        )
        safe_error = html.escape(str(raw_error))
        logger.warning("Meta OAuth browser callback received error/cancellation: %s (code=%s)", raw_error, error_code)

        error_html = f"""<!DOCTYPE html>
<html>
<head><title>Meta OAuth Error</title></head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f87171;">
  <div style="text-align: center;">
    <h3>فشل الاتصال بـ Meta</h3>
    <p>جاري إغلاق هذه النافذة...</p>
  </div>
  <script>
    if (window.opener) {{
      try {{
        window.opener.postMessage({{ type: 'META_OAUTH_COMPLETE', status: 'error', error: '{safe_error}' }}, window.location.origin);
      }} catch(e) {{}}
      try {{
        window.opener.postMessage({{ type: 'META_OAUTH_COMPLETE', status: 'error', error: '{safe_error}' }}, '*');
      }} catch(e) {{}}
    }}
    setTimeout(() => window.close(), 1200);
  </script>
</body>
</html>"""
        return HTMLResponse(content=error_html, status_code=200)

    # 2. Process Code & State Handshake on the Server
    try:
        # A. Validate CSRF state signature and extract authenticated user_id
        state_payload = MetaOAuthService.verify_oauth_state(state=state)
        user_id_str = state_payload.get("sub")
        if not user_id_str:
            raise ValueError("State payload missing authenticated user identity (sub).")
        user_id = uuid.UUID(user_id_str)

        # B. Resolve effective redirect URI matching authorization request
        effective_redirect = state_payload.get("redirect_uri") or "https://webluxira.com/api/v1/meta/oauth/callback"

        # C. Exchange code for long-lived User Access Token (60 days)
        long_lived_user_token = await MetaOAuthService.exchange_code_for_user_token(
            code=code,
            redirect_uri=effective_redirect,
        )

        # D. Fetch managed Facebook Pages and linked Instagram accounts
        pages = await MetaOAuthService.fetch_user_pages(long_lived_user_token=long_lived_user_token)

        # E. Idempotently upsert records into connected_pages table and auto-subscribe to webhooks
        if pages:
            await MetaOAuthService.save_or_update_pages(
                pages=pages,
                user_id=user_id,
                db=db,
            )
            await db.commit()
            logger.info("Successfully onboarded %d Meta pages for user %s via server callback.", len(pages), user_id)
        else:
            logger.warning("No Facebook Pages returned for user %s during server callback.", user_id)

        # F. Return pure HTML success response
        success_html = """<!DOCTYPE html>
<html>
<head><title>Meta OAuth Success</title></head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #4ade80;">
  <div style="text-align: center;">
    <h3>✓ تم ربط صفحاتك بنجاح!</h3>
    <p>جاري تحديث لوحة التحكم وإغلاق النافذة تلقائياً...</p>
  </div>
  <script>
    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'META_OAUTH_COMPLETE', status: 'success' }, window.location.origin);
      } catch(e) {}
      try {
        window.opener.postMessage({ type: 'META_OAUTH_COMPLETE', status: 'success' }, '*');
      } catch(e) {}
    }
    setTimeout(() => window.close(), 1000);
  </script>
</body>
</html>"""
        return HTMLResponse(content=success_html, status_code=200)

    except Exception as exc:
        logger.error("Failed to complete Meta OAuth handshake in server callback: %s", exc, exc_info=True)
        safe_error = html.escape(str(exc))
        error_html = f"""<!DOCTYPE html>
<html>
<head><title>Meta OAuth Error</title></head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f87171;">
  <div style="text-align: center;">
    <h3>فشل الاتصال بـ Meta</h3>
    <p>جاري إغلاق هذه النافذة...</p>
  </div>
  <script>
    if (window.opener) {{
      try {{
        window.opener.postMessage({{ type: 'META_OAUTH_COMPLETE', status: 'error', error: '{safe_error}' }}, window.location.origin);
      }} catch(e) {{}}
      try {{
        window.opener.postMessage({{ type: 'META_OAUTH_COMPLETE', status: 'error', error: '{safe_error}' }}, '*');
      }} catch(e) {{}}
    }}
    setTimeout(() => window.close(), 1200);
  </script>
</body>
</html>"""
        return HTMLResponse(content=error_html, status_code=200)


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
    effective_redirect_uri = (
        payload.redirect_uri.strip()
        if (payload.redirect_uri and payload.redirect_uri.strip())
        else "https://webluxira.com/api/v1/meta/oauth/callback"
    )
    long_lived_user_token = await MetaOAuthService.exchange_code_for_user_token(
        code=payload.code,
        redirect_uri=effective_redirect_uri,
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

