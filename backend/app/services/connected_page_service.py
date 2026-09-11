import logging
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_token as core_decrypt_token, encrypt_token as core_encrypt_token
from app.models.connected_page import ConnectedPage

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
