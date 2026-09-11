import logging
from typing import Any, Optional
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class WhatsAppCloudAdapter:
    """Direct Meta WhatsApp Cloud API v19.0 Provider Adapter."""

    def __init__(
        self,
        access_token: Optional[str] = None,
        phone_number_id: Optional[str] = None,
    ):
        self.access_token = access_token or settings.META_PAGE_ACCESS_TOKEN
        self.phone_number_id = phone_number_id or getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None) or "default_phone_id"
        self.base_url = "https://graph.facebook.com/v19.0"

    async def send_text_message(
        self,
        recipient_phone: str,
        text: str,
        phone_number_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Dispatches an outbound WhatsApp text message via Meta Graph API v19.0."""
        target_phone_id = phone_number_id or self.phone_number_id
        url = f"{self.base_url}/{target_phone_id}/messages"

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        # Clean recipient phone number (remove + or whitespace)
        clean_phone = recipient_phone.replace("+", "").replace(" ", "").replace("-", "").strip()

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": text,
            },
        }

        logger.info("[WhatsApp Cloud API] Dispatching text message to %s (Phone ID: %s)", clean_phone, target_phone_id)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=payload)

            if res.status_code not in (200, 201):
                logger.error("[WhatsApp Cloud API] Error %d: %s", res.status_code, res.text)
                return {
                    "status": "error",
                    "status_code": res.status_code,
                    "error": res.text,
                    "external_message_id": None,
                }

            data = res.json()
            messages = data.get("messages", [])
            wamid = messages[0].get("id") if messages else None

            logger.info("✅ [WhatsApp Cloud API] Message dispatched successfully (WAMID: %s)", wamid)
            return {
                "status": "sent",
                "external_message_id": wamid,
                "raw": data,
            }
        except Exception as e:
            logger.error("[WhatsApp Cloud API] Exception during dispatch: %s", e)
            return {
                "status": "error",
                "error": str(e),
                "external_message_id": None,
            }

    async def send_media_message(
        self,
        recipient_phone: str,
        media_type: str,
        media_url: str,
        caption: Optional[str] = None,
        phone_number_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Dispatches an outbound WhatsApp media message (image, document, audio, video) via Meta Graph API v19.0."""
        target_phone_id = phone_number_id or self.phone_number_id
        url = f"{self.base_url}/{target_phone_id}/messages"

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        clean_phone = recipient_phone.replace("+", "").replace(" ", "").replace("-", "").strip()

        norm_type = media_type.lower()
        if norm_type not in ("image", "document", "audio", "video"):
            norm_type = "document"

        media_obj: dict[str, Any] = {"link": media_url}
        if caption and norm_type in ("image", "document", "video"):
            media_obj["caption"] = caption

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": norm_type,
            norm_type: media_obj,
        }

        logger.info("[WhatsApp Cloud API] Dispatching %s message to %s", norm_type, clean_phone)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=payload)

            if res.status_code not in (200, 201):
                logger.error("[WhatsApp Cloud API] Media Error %d: %s", res.status_code, res.text)
                return {
                    "status": "error",
                    "status_code": res.status_code,
                    "error": res.text,
                    "external_message_id": None,
                }

            data = res.json()
            messages = data.get("messages", [])
            wamid = messages[0].get("id") if messages else None

            logger.info("✅ [WhatsApp Cloud API] Media message dispatched (WAMID: %s)", wamid)
            return {
                "status": "sent",
                "external_message_id": wamid,
                "raw": data,
            }
        except Exception as e:
            logger.error("[WhatsApp Cloud API] Media exception: %s", e)
            return {
                "status": "error",
                "error": str(e),
                "external_message_id": None,
            }


whatsapp_cloud_adapter = WhatsAppCloudAdapter()
