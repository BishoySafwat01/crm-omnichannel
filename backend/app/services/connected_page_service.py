import logging
from typing import Any, Dict, Optional
import uuid

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decrypt_token as core_decrypt_token, encrypt_token as core_encrypt_token
from app.models.connected_page import ConnectedPage
from app.models.conversation import Conversation
from app.models.message import Message

logger = logging.getLogger("app.services.connected_page_service")


class ConnectedPageService:
    """Encapsulates secure token encryption, decryption, and page credential retrieval.
    Removes cryptographic infrastructure dependencies from domain entities.
    """

    @staticmethod
    def decrypt_token(page: ConnectedPage) -> str:
        """Decrypt page access token securely from encrypted storage."""
        if not page or not page.encrypted_access_token:
            return ""
        return core_decrypt_token(page.encrypted_access_token)

    @staticmethod
    def encrypt_token(plain_token: str) -> str:
        """Encrypt plain text access token for database storage."""
        return core_encrypt_token(plain_token)

    @staticmethod
    def set_page_token(page: ConnectedPage, plain_token: str) -> None:
        """Set encrypted token on connected page entity."""
        page.encrypted_access_token = core_encrypt_token(plain_token)

    @staticmethod
    async def get_decrypted_token_by_page_id(
        session: AsyncSession,
        page_id: str,
    ) -> Optional[str]:
        """Lookup active ConnectedPage by page_id or instagram account ID and return decrypted token."""
        if not page_id or not str(page_id).strip():
            return None
        pid = str(page_id).strip()
        try:
            stmt = select(ConnectedPage).where(
                or_(
                    ConnectedPage.page_id == pid,
                    ConnectedPage.instagram_business_account_id == pid,
                ),
                ConnectedPage.status == "ACTIVE",
            )
            result = await session.execute(stmt)
            page = result.scalar_one_or_none()
            if page and page.encrypted_access_token:
                return ConnectedPageService.decrypt_token(page)
        except Exception as exc:
            logger.warning("[ConnectedPageService] Failed to lookup token for page %s: %s", pid, exc)
        return None

    @classmethod
    async def subscribe_page_to_webhooks(
        cls,
        session: AsyncSession,
        page_id: str,
        subscribed_fields: Optional[str] = "messages,messaging_postbacks,message_echoes,messaging_referrals,standby",
    ) -> bool:
        """Subscribe page to Meta App Webhook via POST /{page_id}/subscribed_apps and mark active in DB."""
        if not page_id or not str(page_id).strip():
            return False
        pid = str(page_id).strip()
        token = await cls.get_decrypted_token_by_page_id(session, pid) or settings.get_page_token(pid)
        if not token:
            logger.warning("[ConnectedPageService] Cannot subscribe page %s: No token found.", pid)
            return False

        version = settings.META_GRAPH_API_VERSION or "v23.0"
        url = f"https://graph.facebook.com/{version}/{pid}/subscribed_apps"
        params = {"access_token": token, "subscribed_fields": subscribed_fields}
        headers = {"Authorization": f"Bearer {token}"}

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, params=params, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    success = bool(data.get("success", False)) if isinstance(data, dict) else False
                    if success:
                        stmt = select(ConnectedPage).where(ConnectedPage.page_id == pid)
                        p_row = (await session.execute(stmt)).scalar_one_or_none()
                        if p_row:
                            p_row.is_webhook_subscribed = True
                            p_row.status = "ACTIVE"
                            await session.commit()

                            if p_row.instagram_business_account_id:
                                try:
                                    from app.services.meta_oauth_service import MetaOAuthService
                                    await MetaOAuthService.subscribe_instagram_to_webhooks(
                                        ig_id=p_row.instagram_business_account_id,
                                        page_token=token,
                                    )
                                except Exception as ig_sub_err:
                                    logger.warning("[ConnectedPageService] Linked IG %s webhook subscription failed: %s", p_row.instagram_business_account_id, ig_sub_err)

                        logger.info("[ConnectedPageService] Successfully subscribed page %s to webhooks", pid)
                        return True
                    else:
                        logger.warning("[ConnectedPageService] Webhook subscription for page %s returned: %s", pid, data)
                else:
                    logger.warning("[ConnectedPageService] Webhook subscription for page %s failed with status %d: %s", pid, res.status_code, res.text)
        except Exception as exc:
            logger.warning("[ConnectedPageService] Exception subscribing page %s: %s", pid, exc)
        return False

    @classmethod
    async def refresh_and_discover_pages(
        cls,
        session: AsyncSession,
        user_id: Optional[uuid.UUID] = None,
    ) -> dict[str, Any]:
        """
        Dynamically refresh and discover Facebook pages:
        1. Fetch active admin user token from Redis/memory.
        2. If user token exists:
           - Calls GET /me/accounts via MetaOAuthService.fetch_user_pages.
           - Identifies newly added pages vs existing DB pages.
           - Upserts discovered pages into connected_pages and auto-subscribes webhooks.
        3. If user token is missing or expired:
           - Re-checks and re-subscribes all existing connected_pages in the DB.
           - Returns summary with needs_reauth flag.
        """
        from app.services.meta_oauth_service import MetaOAuthService

        user_token = await MetaOAuthService.get_active_admin_user_token()

        # Query existing active/non-deleted pages from DB
        stmt = (
            select(ConnectedPage)
            .where(ConnectedPage.deleted_at.is_(None))
            .order_by(ConnectedPage.created_at.desc())
        )
        existing_res = await session.execute(stmt)
        existing_pages = list(existing_res.scalars().all())
        existing_pids = {p.page_id for p in existing_pages}

        if user_token:
            try:
                logger.info("[ConnectedPageService] Executing dynamic discovery via /me/accounts with admin user token...")
                discovered_pages = await MetaOAuthService.fetch_user_pages(
                    long_lived_user_token=user_token,
                    db=session,
                )

                if discovered_pages:
                    # Identify newly authorized page IDs
                    new_pids = [
                        str(p.get("id")).strip()
                        for p in discovered_pages
                        if str(p.get("id")).strip() and str(p.get("id")).strip() not in existing_pids
                    ]

                    # Save / update all discovered pages & auto-subscribe webhooks
                    saved_records = await MetaOAuthService.save_or_update_pages(
                        pages=discovered_pages,
                        user_id=user_id or (existing_pages[0].connected_by_user_id if existing_pages and existing_pages[0].connected_by_user_id else uuid.uuid4()),
                        db=session,
                    )

                    new_page_names = [p.name for p in saved_records if p.page_id in new_pids]

                    logger.info(
                        "[ConnectedPageService] Dynamic discovery completed: %d total pages, %d newly added (%s)",
                        len(saved_records),
                        len(new_pids),
                        ", ".join(new_page_names) if new_page_names else "none",
                    )

                    msg = (
                        f"تم اكتشاف وتفعيل {len(new_pids)} صفحة جديدة بنجاح ({', '.join(new_page_names)}) وتفعيل اشتراك الويب هـوك تلقائياً ✨"
                        if len(new_pids) > 0
                        else f"تم التحقق وتحديث {len(saved_records)} صفحة بنجاح. جميع الصفحات المصرح بها متصلة ونشطة بالفعل."
                    )

                    return {
                        "success": True,
                        "status": "success",
                        "total_pages": len(saved_records),
                        "new_pages_count": len(new_pids),
                        "new_pages": new_page_names,
                        "needs_reauth": False,
                        "message": msg,
                        "pages": saved_records,
                    }
                else:
                    logger.warning("[ConnectedPageService] /me/accounts returned no pages for admin user token.")
            except Exception as fetch_exc:
                logger.warning(
                    "[ConnectedPageService] Dynamic page discovery with user token failed (%s). Falling back to DB verification.",
                    fetch_exc,
                )

        # Fallback branch: Verify & re-subscribe existing pages in DB
        logger.info("[ConnectedPageService] Running fallback verification and re-subscription for %d existing DB pages...", len(existing_pages))
        subscribed_count = 0
        for p in existing_pages:
            try:
                sub_ok = await cls.subscribe_page_to_webhooks(session, p.page_id)
                if sub_ok:
                    subscribed_count += 1
            except Exception as sub_err:
                logger.debug("Fallback webhook subscription failed for page %s: %s", p.page_id, sub_err)

        msg = (
            f"تم تحديث والتحقق من {len(existing_pages)} صفحة متصلة واشتراكات الويب هـوك ({subscribed_count} نشطة). "
            "لاكتشاف صفحات جديدة تم إنشاؤها حديثاً على فيسبوك، يرجى الضغط على زر 'ربط صفحة فيسبوك جديدة' لمنح الصلاحيات."
            if existing_pages
            else "لا توجد صفحات متصلة حالياً. يرجى الضغط على 'ربط صفحة فيسبوك جديدة' للبدء."
        )

        return {
            "success": True,
            "status": "warning",
            "total_pages": len(existing_pages),
            "new_pages_count": 0,
            "new_pages": [],
            "needs_reauth": True,
            "message": msg,
            "pages": existing_pages,
        }


    @classmethod
    async def soft_delete_page(
        cls,
        session: AsyncSession,
        page_id: str,
    ) -> Dict[str, Any]:
        """Cascading soft-delete for a connected page:
        1. Find ConnectedPage record by page_id (or UUID id).
        2. Soft-delete the ConnectedPage: set deleted_at = func.now(), status = 'DELETED', is_webhook_subscribed = False.
        3. Attempt to unsubscribe from Meta Graph API: DELETE https://graph.facebook.com/v23.0/{page_id}/subscribed_apps.
        4. Cascade soft-delete conversations: UPDATE conversations SET deleted_at = func.now() WHERE page_id = target_page_id OR brand = page.name OR connected_page_id = page.id.
        5. Cascade soft-delete messages: UPDATE messages SET deleted_at = func.now() WHERE conversation_id IN (SELECT id FROM conversations WHERE deleted_at IS NOT NULL) AND deleted_at IS NULL.
        """
        if not page_id or not str(page_id).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Page ID is required for soft-delete.",
            )

        target_pid = str(page_id).strip()

        # Find ConnectedPage
        conditions = [ConnectedPage.page_id == target_pid]
        try:
            val_uuid = uuid.UUID(target_pid)
            conditions.append(ConnectedPage.id == val_uuid)
        except (ValueError, AttributeError):
            pass

        stmt = select(ConnectedPage).where(or_(*conditions))
        res = await session.execute(stmt)
        page = res.scalar_one_or_none()

        page_name = target_pid
        page_token = None

        if page:
            page_name = page.name
            target_pid = page.page_id
            page_token = cls.decrypt_token(page)
            # Mark connected_pages with deleted_at = func.now(), status = 'DELETED', is_webhook_subscribed = False
            page.deleted_at = func.now()
            page.status = "DELETED"
            page.is_webhook_subscribed = False

        # Attempt to unsubscribe from Meta Graph API
        token_to_use = page_token or settings.get_page_token(target_pid)
        if token_to_use:
            try:
                version = settings.META_GRAPH_API_VERSION or "v23.0"
                unsub_url = f"https://graph.facebook.com/{version}/{target_pid}/subscribed_apps"
                params = {"access_token": token_to_use}
                headers = {"Authorization": f"Bearer {token_to_use}"}
                async with httpx.AsyncClient(timeout=15.0) as client:
                    unsub_resp = await client.delete(unsub_url, params=params, headers=headers)
                    logger.info(
                        "[ConnectedPageService] Meta unsubscribe for page %s returned status %d: %s",
                        target_pid,
                        unsub_resp.status_code,
                        unsub_resp.text,
                    )
            except Exception as meta_exc:
                logger.warning(
                    "[ConnectedPageService] Failed to unsubscribe page %s from Meta: %s",
                    target_pid,
                    meta_exc,
                )

        # Cascade soft-delete conversations:
        conv_conds = [
            Conversation.page_id == target_pid,
            Conversation.brand == target_pid,
        ]
        if page:
            if page.name:
                conv_conds.append(Conversation.brand == page.name)
            conv_conds.append(Conversation.connected_page_id == page.id)
            if page.instagram_business_account_id:
                conv_conds.append(Conversation.page_id == page.instagram_business_account_id)
                conv_conds.append(Conversation.brand == page.instagram_business_account_id)

        conv_update_stmt = (
            update(Conversation)
            .where(
                or_(*conv_conds),
                Conversation.deleted_at.is_(None),
            )
            .values(deleted_at=func.now())
        )
        await session.execute(conv_update_stmt)

        # Cascade soft-delete messages:
        msg_subq = (
            select(Conversation.id)
            .where(Conversation.deleted_at.isnot(None))
        )
        msg_update_stmt = (
            update(Message)
            .where(
                Message.conversation_id.in_(msg_subq),
                Message.deleted_at.is_(None),
            )
            .values(deleted_at=func.now())
        )
        await session.execute(msg_update_stmt)

        await session.commit()
        if page:
            await session.refresh(page)

        logger.info(
            "[ConnectedPageService] Page %s (%s) soft-deleted with cascading conversations & messages.",
            target_pid,
            page_name,
        )

        return {
            "status": "success",
            "message": f"تم حذف الصفحة {page_name} ونقل محادثاتها ورسائلها إلى المحذوفات بنجاح.",
            "page_id": target_pid,
        }
