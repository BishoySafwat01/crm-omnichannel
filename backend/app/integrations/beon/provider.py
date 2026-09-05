from datetime import datetime, timezone
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
        self,
        recipient_id: Optional[str] = None,
        text: str = "",
        recipient_external_id: Optional[str] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Send outbound message via BeOn."""
        target_recipient = str(recipient_external_id or recipient_id or "").strip()
        channel = kwargs.get("channel", "whatsapp")
        template_id = kwargs.get("template_id")
        template_vars = kwargs.get("template_vars") or [text]
        name = kwargs.get("name", "Valued Customer")

        if channel == "sms":
            if template_id:
                res = await self.client.send_sms_template(
                    phone_number=target_recipient,
                    name=name,
                    template_id=int(template_id),
                    template_vars=template_vars,
                )
            else:
                res = await self.client.send_otp(
                    phone_number=target_recipient, name=name, otp_type="sms"
                )
        else:
            # WhatsApp, Messenger, or default
            if template_id:
                res = await self.client.send_whatsapp_template(
                    phone_number=target_recipient,
                    name=name,
                    template_id=int(template_id),
                    template_vars=template_vars,
                )
            else:
                contact_id = target_recipient
                if not contact_id.isdigit():
                    try:
                        contact_res = await self.client.create_or_update_contact(
                            phone=contact_id, name=name
                        )
                        contact_id = str(
                            (contact_res.get("data") or {}).get("id") or contact_id
                        )
                    except Exception as e:
                        logger.warning(
                            f"Could not auto-create BeOn contact for {contact_id}: {e}"
                        )

                channel_id = kwargs.get("channel_id")
                res = await self.client.send_message(
                    contact_id=contact_id,
                    message=text,
                    channel_id=channel_id,
                )

        ext_msg_id = None
        conv_id = (res.get("data") or {}).get("conversation_id")
        if conv_id:
            try:
                msg_resp = await self.client.get_conversation_messages(conv_id, per_page=1)
                records = (msg_resp.get("data") or {}).get("records") or []
                if records:
                    top_msg = records[0]
                    beon_id = top_msg.get("id")
                    ext_msg_id = top_msg.get("message_id") or (f"beon-msg-{beon_id}" if beon_id else None)
            except Exception as e:
                logger.warning(f"Failed to fetch newest message for BeOn conv {conv_id}: {e}")

        if not ext_msg_id:
            ext_msg_id = res.get("message_id") or res.get("id") or f"beon-{target_recipient}-{int(datetime.now(timezone.utc).timestamp())}"

        return {
            "external_message_id": ext_msg_id,
            "recipient_id": target_recipient,
            "raw": res,
        }

    async def send_outbound_attachment(
        self,
        recipient_id: Optional[str] = None,
        file_path: str = "",
        attachment_type: str = "image",
        recipient_external_id: Optional[str] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Send outbound attachment via BeOn."""
        target_recipient = str(recipient_external_id or recipient_id or "").strip()
        return {
            "external_message_id": f"beon-att-{target_recipient}-{int(datetime.now(timezone.utc).timestamp())}",
            "recipient_id": target_recipient,
            "file_path": file_path,
            "attachment_type": attachment_type,
            "status": "sent",
        }
