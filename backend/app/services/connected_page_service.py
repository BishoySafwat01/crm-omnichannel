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
