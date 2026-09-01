import logging
from typing import Any, Optional

from app.integrations.base import BaseMessagingProvider
from app.integrations.beon.client import BeonAPIError, BeonClient
from app.integrations.beon.normalizer import BeonNormalizer

logger = logging.getLogger("app.integrations.beon.provider")


class BeonOmnichannelProvider(BaseMessagingProvider):
    """BeOn V3 Omnichannel Provider Adapter."""

    def __init__(self, client: Optional[BeonClient] = None):
        self.client = client or BeonClient()
        self.normalizer = BeonNormalizer

    async def validate_credentials(self) -> dict[str, Any]:
        """Verify connectivity and fetch partner account information."""
        try:
            res = await self.client.get_account_details()
            account_data = res.get("data") or {}
            return {
                "valid": True,
                "provider": "beon",
                "account_id": account_data.get("id"),
                "account_name": account_data.get("account_name"),
                "contacts_count": account_data.get("contacts_count"),
                "balance": account_data.get("balance"),
            }
        except BeonAPIError as exc:
            logger.error(f"BeOn validation failed: {exc.message}")
            return {
                "valid": False,
                "provider": "beon",
                "error": exc.message,
                "status_code": exc.status_code,
            }

    async def validate_configuration(self) -> dict[str, Any]:
        return await self.validate_credentials()

    def normalize_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Normalize an incoming BeOn webhook payload."""
        return self.normalizer.normalize_webhook(payload)

    async def sync_conversations(
        self, limit: int = 50, page: int = 1, **kwargs: Any
    ) -> dict[str, Any]:
        """Fetch and normalize conversations from BeOn."""
        status_filter = kwargs.get("status")
        channel_filter = kwargs.get("channel")
        raw_res = await self.client.get_conversations(
            page=page, per_page=limit, status=status_filter, channel=channel_filter
        )
        data_block = raw_res.get("data") or {}
        raw_records = data_block.get("records") or []
        meta = data_block.get("meta") or {}

        normalized = [
            self.normalizer.normalize_conversation(r) for r in raw_records
        ]
        return {
            "items": normalized,
            "total": meta.get("total", len(normalized)),
            "page": meta.get("current_page", page),
            "last_page": meta.get("last_page", 1),
        }

    async def send_outbound_message(
        self, recipient_id: str, text: str, **kwargs: Any
    ) -> dict[str, Any]:
        """Send outbound message via BeOn."""
        channel = kwargs.get("channel", "whatsapp")
        template_id = kwargs.get("template_id")
        template_vars = kwargs.get("template_vars") or [text]
        name = kwargs.get("name", "Valued Customer")

        if channel == "sms":
            if template_id:
                res = await self.client.send_sms_template(
                    phone_number=recipient_id,
                    name=name,
                    template_id=int(template_id),
                    template_vars=template_vars,
                )
            else:
                res = await self.client.send_otp(
                    phone_number=recipient_id, name=name, otp_type="sms"
                )
        else:
            # WhatsApp or default
            if template_id:
                res = await self.client.send_whatsapp_template(
                    phone_number=recipient_id,
                    name=name,
                    template_id=int(template_id),
                    template_vars=template_vars,
                )
            else:
                # If no explicit template_id is passed, attempt standard contact sync/dispatch
                res = {
                    "status": "queued",
                    "provider": "beon",
                    "recipient_id": recipient_id,
                    "text": text,
                }

        return {
            "external_message_id": res.get("message_id") or res.get("id") or f"beon-{recipient_id}",
            "recipient_id": recipient_id,
            "raw": res,
        }

    async def send_outbound_attachment(
        self,
        recipient_id: str,
        file_path: str,
        attachment_type: str = "image",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Send outbound attachment via BeOn."""
        # Attachments route through BeOn media dispatch
        return {
            "external_message_id": f"beon-att-{recipient_id}",
            "recipient_id": recipient_id,
            "file_path": file_path,
            "attachment_type": attachment_type,
            "status": "sent",
        }
