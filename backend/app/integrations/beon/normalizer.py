from datetime import datetime, timezone
import logging
from typing import Any, Optional

from app.models.enums import ChannelEnum, MessageTypeEnum, ProviderEnum, SenderTypeEnum

logger = logging.getLogger("app.integrations.beon.normalizer")


class BeonNormalizer:
    """Normalizes BeOn payload schemas into canonical CRM representations."""

    @staticmethod
    def map_channel(channel_str: Optional[str]) -> ChannelEnum:
        if not channel_str:
            return ChannelEnum.WHATSAPP
        c = str(channel_str).lower().strip()
        if "messenger" in c or "facebook" in c:
            return ChannelEnum.MESSENGER
        if "instagram" in c or "ig" in c:
            return ChannelEnum.INSTAGRAM
        if "whatsapp" in c or "wa" in c:
            return ChannelEnum.WHATSAPP
        if "sms" in c:
            return ChannelEnum.SMS
        if "tiktok" in c:
            return ChannelEnum.TIKTOK
        return ChannelEnum.WHATSAPP

    @staticmethod
    def map_message_type(type_str: Optional[str]) -> MessageTypeEnum:
        if not type_str:
            return MessageTypeEnum.TEXT
        t = str(type_str).lower().strip()
        if t in ("text", "chat"):
            return MessageTypeEnum.TEXT
        if t in ("image", "photo", "sticker"):
            return MessageTypeEnum.IMAGE
        if t in ("audio", "voice"):
            return MessageTypeEnum.AUDIO
        if t in ("video",):
            return MessageTypeEnum.VIDEO
        if t in ("file", "document", "pdf"):
            return MessageTypeEnum.FILE
        return MessageTypeEnum.TEXT

    @staticmethod
    def parse_datetime(dt_val: Any) -> datetime:
        if isinstance(dt_val, datetime):
            return dt_val if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
        if isinstance(dt_val, str) and dt_val.strip():
            # Try ISO 8601
            try:
                clean_str = dt_val.replace("Z", "+00:00")
                return datetime.fromisoformat(clean_str)
            except Exception:
                pass
            # Try standard format '%Y-%m-%d %H:%M:%S'
            try:
                return datetime.strptime(dt_val.strip(), "%Y-%m-%d %H:%M:%S").replace(
                    tzinfo=timezone.utc
                )
            except Exception:
                pass
        return datetime.now(timezone.utc)

    @classmethod
    def normalize_conversation(cls, raw_conv: dict[str, Any]) -> dict[str, Any]:
        """Convert BeOn conversation record to CRM normalized dictionary."""
        conv_id = str(raw_conv.get("id") or "")
        channel_info = raw_conv.get("channel") or {}
        contact_info = raw_conv.get("contact") or {}

        channel_identifier = channel_info.get("identifier") or channel_info.get("name")
        channel = cls.map_channel(channel_identifier)

        brand_name = channel_info.get("name") or "LUXIRA"
        contact_id = str(contact_info.get("id") or "")
        contact_name = contact_info.get("name") or "عميل BeOn"
        contact_phone = contact_info.get("phone")

        status_raw = str(raw_conv.get("status") or "open").lower()
        if status_raw in ("pending", "waiting"):
            status = "pending"
        elif status_raw in ("closed", "resolved", "archived"):
            status = "closed"
        else:
            status = "open"

        last_msg_time = cls.parse_datetime(
            raw_conv.get("last_message_at") or raw_conv.get("updated_at")
        )

        return {
            "external_conversation_id": conv_id,
            "provider": ProviderEnum.BEON,
            "channel": channel,
            "brand": brand_name,
            "status": status,
            "customer_external_id": contact_id or contact_phone or conv_id,
            "customer_name": contact_name,
            "customer_phone": contact_phone,
            "last_message_at": last_msg_time,
            "raw": raw_conv,
        }

    @classmethod
    def normalize_message(
        cls,
        raw_msg: dict[str, Any],
        conversation_external_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Convert BeOn message record to CRM normalized dictionary."""
        beon_msg_id = raw_msg.get("id")
        ext_msg_id = raw_msg.get("message_id") or f"beon-msg-{beon_msg_id}"
        msg_type_str = raw_msg.get("type") or "text"
        message_type = cls.map_message_type(msg_type_str)

        direction = str(raw_msg.get("message_type") or "incoming").lower()
        if direction in ("incoming", "inbound", "customer"):
            sender_type = SenderTypeEnum.CUSTOMER
            sender_ext_id = str(raw_msg.get("contact_id") or "")
        else:
            sender_type = SenderTypeEnum.AGENT
            sender_ext_id = str(raw_msg.get("agent_id") or "beon_agent")

        text = raw_msg.get("body") or raw_msg.get("caption") or ""
        created_at = cls.parse_datetime(raw_msg.get("created_at"))

        metadata: dict[str, Any] = {
            "beon_id": beon_msg_id,
            "delivery_status": raw_msg.get("status") or "delivered",
            "read_status": raw_msg.get("read_status"),
            "replay_id": raw_msg.get("replay_id"),
        }

        return {
            "external_message_id": str(ext_msg_id),
            "conversation_external_id": str(conversation_external_id or ""),
            "sender_type": sender_type,
            "sender_external_id": sender_ext_id,
            "message_type": message_type,
            "text": text,
            "created_at": created_at,
            "metadata": metadata,
            "raw": raw_msg,
        }

    @classmethod
    def normalize_webhook(cls, payload: dict[str, Any]) -> dict[str, Any]:
        """Normalize an incoming BeOn webhook payload."""
        event_type = payload.get("event") or payload.get("type") or "message_created"
        data = payload.get("data") or payload

        conv_id = str(data.get("conversation_id") or data.get("id") or "")
        message_data = data.get("message") or data

        norm_msg = cls.normalize_message(message_data, conversation_external_id=conv_id)
        norm_conv = cls.normalize_conversation(data)

        return {
            "event_type": event_type,
            "conversation": norm_conv,
            "message": norm_msg,
            "raw": payload,
        }
