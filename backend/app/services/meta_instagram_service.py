import logging
from typing import Any, Dict, Optional
import httpx
from app.core.config import settings
from app.integrations.meta.client import MetaClient, MetaAPIError

logger = logging.getLogger("MetaInstagramService")


class MetaInstagramService:
    GRAPH_API_VERSION = getattr(settings, "META_GRAPH_API_VERSION", "v23.0")

    @classmethod
    async def send_text_message(
        cls,
        recipient_id: str,
        text: str,
        page_id: Optional[str] = None,
        session: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Send outbound text message to Instagram Direct recipient using Meta Graph API."""
        clean_id = recipient_id.strip()
        if clean_id.startswith("t_"):
            clean_id = clean_id[2:]

        token = None
        if page_id:
            token = await MetaClient.get_token_for_page(page_id, db=session)

        if not token and session:
            try:
                from sqlalchemy import select
                from app.models.connected_page import ConnectedPage
                stmt = select(ConnectedPage).where(
                    ConnectedPage.instagram_business_account_id.isnot(None),
                    ConnectedPage.status == "ACTIVE",
                ).limit(1)
                cp = (await session.execute(stmt)).scalars().first()
                if cp and cp.encrypted_access_token:
                    token = cp.decrypted_access_token
                if not token:
                    stmt_any = select(ConnectedPage).where(ConnectedPage.status == "ACTIVE").limit(1)
                    cp_any = (await session.execute(stmt_any)).scalars().first()
                    if cp_any and cp_any.encrypted_access_token:
                        token = cp_any.decrypted_access_token
            except Exception as exc:
                logger.warning("[Instagram Send] DB token lookup failed: %s", exc)

        if not token:
            try:
                from app.core.database import AsyncSessionLocal
                from sqlalchemy import select
                from app.models.connected_page import ConnectedPage
                async with AsyncSessionLocal() as eph_session:
                    if page_id:
                        token = await MetaClient.get_token_for_page(page_id, db=eph_session)
                    if not token:
                        stmt = select(ConnectedPage).where(
                            ConnectedPage.instagram_business_account_id.isnot(None),
                            ConnectedPage.status == "ACTIVE",
                        ).limit(1)
                        cp = (await eph_session.execute(stmt)).scalars().first()
                        if cp and cp.encrypted_access_token:
                            token = cp.decrypted_access_token
            except Exception:
                pass

        if not token:
            token = settings.META_PAGE_ACCESS_TOKEN

        url = f"https://graph.facebook.com/{cls.GRAPH_API_VERSION}/me/messages"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        payload = {
            "recipient": {"id": clean_id},
            "message": {"text": text},
        }

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.post(url, headers=headers, json=payload)
            data = resp.json() if resp.content else {}

            if resp.is_error:
                err_msg = data.get("error", {}).get("message", resp.text)
                logger.error(
                    "[Instagram Send Error] Status: %s, Body: %s",
                    resp.status_code,
                    resp.text,
                )
                raise MetaAPIError(
                    f"Meta Instagram API Error ({resp.status_code}): {err_msg}",
                    status_code=resp.status_code,
                )

            mid = data.get("message_id") or data.get("recipient_id")
            logger.info("[Instagram Send Success] Recipient: %s, MID: %s", clean_id, mid)
            return {
                "message_id": mid,
                "raw": data,
                "status": "sent",
            }

