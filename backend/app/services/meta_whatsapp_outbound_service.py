import logging
from typing import Dict, Any
import httpx
from app.core.config import settings

logger = logging.getLogger("MetaWhatsAppOutbound")


class MetaWhatsAppOutboundService:
    GRAPH_API_VERSION = getattr(settings, "META_GRAPH_API_VERSION", "v23.0")

    @classmethod
    async def send_text_message(cls, recipient_phone: str, text: str) -> Dict[str, Any]:
        """Send standard text message to a customer via WhatsApp Business Cloud API."""
        phone_number_id = (
            getattr(settings, "META_WHATSAPP_PHONE_NUMBER_ID", None)
            or getattr(settings, "META_WHATSAPP_PHONE_ID", None)
            or "1340599089127163"
        )
        token = (
            getattr(settings, "META_WHATSAPP_ACCESS_TOKEN", None)
            or settings.META_PAGE_ACCESS_TOKEN
        )

        url = f"https://graph.facebook.com/{cls.GRAPH_API_VERSION}/{phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        clean_phone = recipient_phone.replace("+", "").replace(" ", "").strip()

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "text",
            "text": {
                "preview_url": True,
                "body": text,
            },
        }

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.post(url, headers=headers, json=payload)
            data = resp.json() if resp.content else {}

            if resp.is_error:
                err_msg = data.get("error", {}).get("message", resp.text)
                logger.error(
                    "[WhatsApp Outbound Failed] Status: %s, Error: %s",
                    resp.status_code,
                    err_msg,
                )
                return {
                    "external_message_id": f"wamid_failed_{clean_phone}",
                    "raw": data,
                    "status": "failed",
                    "error": err_msg,
                }

            mid = data.get("messages", [{}])[0].get("id")
            logger.info(
                "[WhatsApp Outbound Success] To: %s, MID: %s",
                clean_phone,
                mid,
            )
            return {
                "external_message_id": mid,
                "raw": data,
                "status": "sent",
            }
