import asyncio
import logging
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import encrypt_token
from app.models.connected_page import ConnectedPage

logger = logging.getLogger("app.services.meta_oauth")

VALID_SCOPES = [
    "pages_show_list",
    "pages_messaging",
    "pages_read_engagement",
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_manage_messages",
]

DEFAULT_SCOPES = VALID_SCOPES

DEFAULT_SUBSCRIBED_WEBHOOK_FIELDS = [
    "messages",
    "messaging_postbacks",
    "messaging_referrals",
    "message_echoes",
]


class MetaOAuthService:
    """OAuth 2.0 Service for Meta (Facebook & Instagram) Multi-Page Onboarding."""

    @staticmethod
    def generate_oauth_state(user_id: uuid.UUID, redirect_uri: Optional[str] = None) -> str:
        """Generate a tamper-proof, signed JWT CSRF state token for the OAuth handshake."""
        payload: dict[str, Any] = {
            "sub": str(user_id),
            "type": "meta_oauth_csrf",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        }
        if redirect_uri:
            payload["redirect_uri"] = str(redirect_uri).strip()
        return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

    @staticmethod
    def verify_oauth_state(state: str, expected_user_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        """Verify the authenticity and freshness of the OAuth state token."""
        try:
            payload = jwt.decode(state, settings.SECRET_KEY, algorithms=["HS256"])
            if payload.get("type") != "meta_oauth_csrf":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid OAuth state parameter type.",
                )
            if expected_user_id and payload.get("sub") != str(expected_user_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="OAuth state user identity mismatch.",
                )
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OAuth session state has expired. Please initiate login again.",
            )
        except jwt.PyJWTError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or tampered OAuth state parameter.",
            )

    @classmethod
    def get_authorization_url(cls, state: str, redirect_uri: Optional[str] = None) -> str:
        """Build the Meta OAuth dialog authorization URL."""
        app_id = settings.META_APP_ID
        if not app_id or not str(app_id).strip():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Meta App ID is not configured on this server.",
            )

        version = settings.META_GRAPH_API_VERSION or "v23.0"
        base_url = f"https://www.facebook.com/{version}/dialog/oauth"

        effective_redirect = (
            str(redirect_uri).strip()
            if (redirect_uri and str(redirect_uri).strip())
            else "https://webluxira.com/api/v1/meta/oauth/callback"
        )

        params = {
            "client_id": str(app_id).strip(),
            "state": state,
            "scope": ",".join(VALID_SCOPES),
            "response_type": "code",
            "redirect_uri": effective_redirect,
        }

        encoded_params = urllib.parse.urlencode(params)
        return f"{base_url}?{encoded_params}"

    @classmethod
    async def exchange_code_for_user_token(cls, code: str, redirect_uri: str) -> str:
        """Exchange the authorization code for a short-lived user token and upgrade to a 60-day long-lived token."""
        app_id = settings.META_APP_ID
        app_secret = settings.META_APP_SECRET
        if not app_id or not app_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Meta App ID or App Secret is not configured.",
            )

        version = settings.META_GRAPH_API_VERSION or "v23.0"
        token_endpoint = f"https://graph.facebook.com/{version}/oauth/access_token"

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Step 1: Exchange code for short-lived User Token
            params_short = {
                "client_id": str(app_id).strip(),
                "client_secret": str(app_secret).strip(),
                "redirect_uri": redirect_uri,
                "code": code,
            }
            logger.info("Exchanging authorization code for short-lived user token...")
            resp_short = await client.get(token_endpoint, params=params_short)
            if resp_short.status_code != 200:
                err_data = resp_short.json().get("error", {}) if resp_short.content else {}
                err_msg = err_data.get("message", resp_short.text)
                logger.error("Failed to exchange code for user token: %s", err_msg)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Meta token exchange error: {err_msg}",
                )

            short_token = resp_short.json().get("access_token")
            if not short_token:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Meta response did not contain an access_token.",
                )

            # Step 2: Upgrade to long-lived (60-day) User Token
            params_long = {
                "grant_type": "fb_exchange_token",
                "client_id": str(app_id).strip(),
                "client_secret": str(app_secret).strip(),
                "fb_exchange_token": short_token,
            }
            logger.info("Upgrading to 60-day long-lived user token...")
            resp_long = await client.get(token_endpoint, params=params_long)
            if resp_long.status_code != 200:
                logger.warning(
                    "Could not upgrade to long-lived token (%s), falling back to short-lived token.",
                    resp_long.text,
                )
                return short_token

            long_token = resp_long.json().get("access_token")
            return long_token or short_token

    @classmethod
    async def fetch_user_pages(cls, long_lived_user_token: str) -> list[dict[str, Any]]:
        """Fetch all managed Facebook Pages and linked Instagram accounts for the authenticated user."""
        version = settings.META_GRAPH_API_VERSION or "v23.0"
        url = f"https://graph.facebook.com/{version}/me/accounts"
        params = {
            "fields": "id,name,access_token,category,tasks,picture,instagram_business_account{id,username,profile_picture_url}",
            "access_token": long_lived_user_token,
            "limit": 100,
        }

        pages: list[dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            while url:
                resp = await client.get(url, params=params if "?" not in url else None)
                if resp.status_code != 200:
                    err_data = resp.json().get("error", {}) if resp.content else {}
                    err_msg = err_data.get("message", resp.text)
                    logger.error("Failed to query /me/accounts: %s", err_msg)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Meta accounts fetch error: {err_msg}",
                    )

                body = resp.json()
                data = body.get("data", [])
                pages.extend(data)

                # Check for next page
                paging = body.get("paging", {})
                url = paging.get("next")
                params = {}  # URL already includes query parameters

        logger.info("Successfully fetched %d Facebook Pages from /me/accounts.", len(pages))
        return pages

    @classmethod
    async def subscribe_page_to_webhooks(
        cls,
        page_id: str,
        page_token: str,
        subscribed_fields: Optional[list[str] | str] = None,
    ) -> bool:
        """
        Autonomous Webhook App Subscription:
        Sends POST https://graph.facebook.com/v23.0/{page_id}/subscribed_apps
        with subscribed_fields=messages,messaging_postbacks,messaging_referrals,message_echoes
        using the specific Page access_token.
        Returns True on {"success": true}, sets is_webhook_subscribed = True, handles Meta errors cleanly.
        """
        if not page_id or not page_token:
            return False

        version = settings.META_GRAPH_API_VERSION or "v23.0"
        url = f"https://graph.facebook.com/{version}/{page_id}/subscribed_apps"

        if subscribed_fields is None:
            fields_str = ",".join(DEFAULT_SUBSCRIBED_WEBHOOK_FIELDS)
        elif isinstance(subscribed_fields, list):
            fields_str = ",".join(subscribed_fields)
        else:
            fields_str = str(subscribed_fields)

        params = {
            "subscribed_fields": fields_str,
            "access_token": page_token,
        }
        headers = {
            "Authorization": f"Bearer {page_token}",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, params=params, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    success = bool(data.get("success", False)) if isinstance(data, dict) else False
                    if success:
                        logger.info("Successfully subscribed page %s to webhooks with fields: %s", page_id, fields_str)
                    else:
                        logger.warning("Page %s webhook subscription returned non-true response: %s", page_id, data)
                    return success
                else:
                    err_msg = resp.text
                    logger.warning(
                        "Failed to subscribe page %s to webhooks (HTTP %d): %s",
                        page_id,
                        resp.status_code,
                        err_msg,
                    )
                    return False
        except Exception as exc:
            logger.error("Exception subscribing page %s to webhooks: %s", page_id, exc)
            return False

    @classmethod
    async def save_or_update_pages(
        cls,
        pages: list[dict[str, Any]],
        user_id: uuid.UUID,
        db: AsyncSession,
    ) -> list[ConnectedPage]:
        """Upsert fetched pages into connected_pages table with encrypted page tokens and auto-subscribe webhooks."""
        saved_records: list[ConnectedPage] = []

        for pdata in pages:
            page_id = str(pdata.get("id", "")).strip()
            if not page_id:
                continue

            name = pdata.get("name") or f"Page {page_id}"
            category = pdata.get("category")
            raw_token = pdata.get("access_token") or ""
            encrypted_token = encrypt_token(raw_token)

            ig_account = pdata.get("instagram_business_account")
            ig_id = None
            if ig_account:
                if isinstance(ig_account, dict):
                    ig_id = str(ig_account.get("id", "")).strip() or None
                    ig_username = ig_account.get("username")
                    if ig_username:
                        logger.info("Discovered linked Instagram Business Account: @%s (ID: %s) for Page %s", ig_username, ig_id, name)
                else:
                    ig_id = str(ig_account).strip() or None

            # Milestone 2: Autonomous Webhook App Subscription
            is_subscribed = False
            if raw_token:
                try:
                    is_subscribed = await cls.subscribe_page_to_webhooks(page_id=page_id, page_token=raw_token)
                except Exception as sub_exc:
                    logger.warning("Autonomous webhook subscription for page %s failed: %s", page_id, sub_exc)
                    is_subscribed = False

            stmt = select(ConnectedPage).where(ConnectedPage.page_id == page_id)
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                existing.name = name
                existing.encrypted_access_token = encrypted_token
                existing.category = category
                existing.instagram_business_account_id = ig_id
                existing.status = "ACTIVE"
                existing.is_active = True
                if is_subscribed:
                    existing.is_webhook_subscribed = True
                existing.connected_by_user_id = user_id
                existing.updated_at = datetime.now(timezone.utc)
                saved_records.append(existing)
            else:
                new_page = ConnectedPage(
                    page_id=page_id,
                    name=name,
                    encrypted_access_token=encrypted_token,
                    category=category,
                    instagram_business_account_id=ig_id,
                    status="ACTIVE",
                    is_webhook_subscribed=is_subscribed,
                    connected_by_user_id=user_id,
                )
                db.add(new_page)
                saved_records.append(new_page)

        await db.commit()
        for record in saved_records:
            await db.refresh(record)

        logger.info("Successfully saved/updated %d ConnectedPage records.", len(saved_records))

        # Milestone 3: Trigger immediate background historical sync (30 days) for newly onboarded active pages
        for record in saved_records:
            if record.status == "ACTIVE" and record.page_id:
                asyncio.create_task(cls._trigger_background_sync(page_id=record.page_id, since_days=30))

        return saved_records

    @staticmethod
    async def _trigger_background_sync(page_id: str, since_days: int = 30) -> None:
        """Run historical sync for newly onboarded page in isolated session without blocking HTTP flow."""
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.meta_import_service import MetaImportService

            async with AsyncSessionLocal() as bg_session:
                logger.info("[AutoOnboarding] Triggering background historical sync for page %s (since_days=%d)...", page_id, since_days)
                job = await MetaImportService.run_import(
                    session=bg_session,
                    page_id=page_id,
                    since_days=since_days,
                )
                logger.info(
                    "[AutoOnboarding] Finished background sync for page %s: %d convs, %d msgs (status: %s)",
                    page_id,
                    job.processed_conversations,
                    job.processed_messages,
                    job.status,
                )
        except Exception as exc:
            logger.error("[AutoOnboarding] Error in background sync for page %s: %s", page_id, exc)

