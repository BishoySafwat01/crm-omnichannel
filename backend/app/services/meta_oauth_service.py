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
from sqlalchemy.sql import func

from app.core.config import settings
from app.core.security import encrypt_token
from app.models.connected_page import ConnectedPage
from app.services.connected_page_service import ConnectedPageService

logger = logging.getLogger("app.services.meta_oauth")

VALID_SCOPES = [
    "pages_show_list",
    "pages_messaging",
    "pages_read_engagement",
    "pages_manage_metadata",
    "public_profile",
    "instagram_basic",
    "instagram_manage_messages",
]

DEFAULT_SCOPES = VALID_SCOPES

DEFAULT_SUBSCRIBED_WEBHOOK_FIELDS = [
    "messages",
    "messaging_postbacks",
    "message_echoes",
    "standby",
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
    async def fetch_user_pages(
        cls,
        long_lived_user_token: str,
        db: Optional[AsyncSession] = None,
    ) -> list[dict[str, Any]]:
        """Fetch all managed Facebook Pages and linked Instagram accounts for the authenticated user.
        Uses /me/accounts and candidate page direct resolution to ensure all diverse admin pages are captured
        with permanent (never-expiring) tokens.
        """
        version = settings.META_GRAPH_API_VERSION or "v23.0"
        app_id = settings.META_APP_ID
        app_secret = settings.META_APP_SECRET
        url = f"https://graph.facebook.com/{version}/me/accounts"
        params = {
            "fields": "id,name,access_token,category,tasks,picture,instagram_business_account{id,username,profile_picture_url}",
            "access_token": long_lived_user_token,
            "limit": 100,
        }

        pages_map: dict[str, dict[str, Any]] = {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Primary discovery via /me/accounts
            while url:
                try:
                    resp = await client.get(url, params=params if "?" not in url else None)
                    if resp.status_code == 200:
                        body = resp.json()
                        data = body.get("data", [])
                        for item in data:
                            pid = str(item.get("id", "")).strip()
                            if pid:
                                pages_map[pid] = item
                        paging = body.get("paging", {})
                        url = paging.get("next")
                        params = {}
                    else:
                        err_data = resp.json().get("error", {}) if resp.content else {}
                        err_msg = err_data.get("message", resp.text)
                        logger.warning("Query /me/accounts returned status %d: %s", resp.status_code, err_msg)
                        break
                except Exception as exc:
                    logger.warning("Error fetching from /me/accounts: %s", exc)
                    break

            # 2. Resilient candidate resolution for pages assigned via Business Manager or existing in system
            candidate_pids: set[str] = set()
            pages_cfg = settings.get_meta_pages()
            for pid in pages_cfg.keys():
                if pid and str(pid).strip():
                    candidate_pids.add(str(pid).strip())
            if settings.META_PAGE_ID and str(settings.META_PAGE_ID).strip():
                candidate_pids.add(str(settings.META_PAGE_ID).strip())

            if db is not None:
                try:
                    stmt = select(ConnectedPage.page_id)
                    res = await db.execute(stmt)
                    for (c_pid,) in res.all():
                        if c_pid and str(c_pid).strip():
                            candidate_pids.add(str(c_pid).strip())
                except Exception as db_exc:
                    logger.debug("Failed to query candidate page_ids from db: %s", db_exc)

            for c_pid in candidate_pids:
                if c_pid not in pages_map:
                    try:
                        p_url = f"https://graph.facebook.com/{version}/{c_pid}"
                        p_params = {
                            "fields": "id,name,access_token,category,tasks,picture,instagram_business_account{id,username,profile_picture_url}",
                            "access_token": long_lived_user_token,
                        }
                        p_resp = await client.get(p_url, params=p_params)
                        if p_resp.status_code == 200:
                            p_data = p_resp.json()
                            if p_data.get("access_token"):
                                pages_map[c_pid] = p_data
                                logger.info(
                                    "[MetaOAuth] Directly resolved candidate page %s (%s) using user token.",
                                    c_pid,
                                    p_data.get("name"),
                                )
                    except Exception as exc:
                        logger.debug("Direct resolution for candidate page %s skipped: %s", c_pid, exc)

            # 3. Validate token non-expiring status via debug_token
            if app_id and app_secret:
                app_token = f"{str(app_id).strip()}|{str(app_secret).strip()}"
                for pid, pdata in list(pages_map.items()):
                    ptok = pdata.get("access_token")
                    if ptok:
                        try:
                            d_url = f"https://graph.facebook.com/{version}/debug_token"
                            d_resp = await client.get(d_url, params={"input_token": ptok, "access_token": app_token})
                            if d_resp.status_code == 200:
                                d_data = d_resp.json().get("data", {})
                                exp_at = d_data.get("expires_at")
                                is_v = d_data.get("is_valid")
                                logger.info(
                                    "[MetaOAuth] Page %s (%s) debug_token: is_valid=%s, expires_at=%s (0=Permanent)",
                                    pid,
                                    pdata.get("name"),
                                    is_v,
                                    exp_at,
                                )
                        except Exception as d_exc:
                            logger.debug("debug_token check failed for page %s: %s", pid, d_exc)

        logger.info("Successfully fetched %d Facebook Pages for user.", len(pages_map))
        return list(pages_map.values())

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
        with subscribed_fields=messages,messaging_postbacks,message_echoes,standby
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

        # Resolve default workspace ID for new records
        from app.models.workspace import Workspace
        ws_stmt = select(Workspace).order_by(Workspace.created_at.asc()).limit(1)
        ws_res = await db.execute(ws_stmt)
        default_ws = ws_res.scalar_one_or_none()
        default_ws_id = default_ws.id if default_ws else None

        for pdata in pages:
            page_id = str(pdata.get("id", "")).strip()
            if not page_id:
                continue

            name = pdata.get("name") or f"Page {page_id}"
            category = pdata.get("category")
            raw_token = pdata.get("access_token") or ""
            encrypted_token = ConnectedPageService.encrypt_token(raw_token) if raw_token else ""

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

            # Autonomous Webhook App Subscription
            is_subscribed = False
            if raw_token:
                try:
                    is_subscribed = await cls.subscribe_page_to_webhooks(
                        page_id=page_id,
                        page_token=raw_token,
                        subscribed_fields=DEFAULT_SUBSCRIBED_WEBHOOK_FIELDS,
                    )
                except Exception as sub_exc:
                    logger.warning("Autonomous webhook subscription for page %s failed: %s", page_id, sub_exc)
                    is_subscribed = False

            stmt = select(ConnectedPage).where(ConnectedPage.page_id == page_id)
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                existing.name = name
                if encrypted_token:
                    existing.encrypted_access_token = encrypted_token
                if category:
                    existing.category = category
                if ig_id:
                    existing.instagram_business_account_id = ig_id
                existing.status = "ACTIVE"
                existing.is_active = True
                if is_subscribed:
                    existing.is_webhook_subscribed = True
                existing.connected_by_user_id = user_id
                existing.updated_at = func.now()
                saved_records.append(existing)
            else:
                new_page = ConnectedPage(
                    id=uuid.uuid4(),
                    workspace_id=default_ws_id,
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

        # Trigger immediate background historical sync (30 days) for newly onboarded active pages
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

