import logging
from typing import Dict, Any
import httpx
from app.core.config import settings

logger = logging.getLogger("MetaInstagramService")


class MetaInstagramService:
    GRAPH_API_VERSION = getattr(settings, "META_GRAPH_API_VERSION", "v23.0")

    @classmethod
    async def send_text_message(cls, recipient_id: str, text: str) -> Dict[str, Any]:
        """Send outbound text message to Instagram Direct recipient using Meta Graph API."""
        clean_id = recipient_id.strip()
        if clean_id.startswith("t_"):
            clean_id = clean_id[2:]

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
                logger.error(
                    "[Instagram Send Error] Status: %s, Body: %s",
                    resp.status_code,
                    resp.text,
                )
                return {
                    "message_id": f"ig_failed_{clean_id}",
                    "raw": data,
                    "status": "failed",
                    "error": data.get("error", {}).get("message", resp.text),
                }

            mid = data.get("message_id") or data.get("recipient_id")
            logger.info("[Instagram Send Success] Recipient: %s, MID: %s", clean_id, mid)
            return {
                "message_id": mid,
                "raw": data,
                "status": "sent",
            }
