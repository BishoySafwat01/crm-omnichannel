from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.models.enums import ChannelEnum, MessageTypeEnum, ProviderEnum, SenderTypeEnum


@dataclass
class NormalizedRespondIoContact:
    external_user_id: str
    display_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    provider: ProviderEnum = ProviderEnum.RESPOND_IO
    channel: ChannelEnum = ChannelEnum.WHATSAPP
    metadata_: dict[str, Any] = field(default_factory=dict)


@dataclass
class NormalizedRespondIoMessage:
    external_message_id: str
    sender_type: SenderTypeEnum
    sender_external_id: Optional[str] = None
    message_type: MessageTypeEnum = MessageTypeEnum.TEXT
    text: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata_: dict[str, Any] = field(default_factory=dict)


@dataclass
class NormalizedRespondIoWebhookEvent:
    event_type: str
    contact_id: str
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    channel: ChannelEnum = ChannelEnum.WHATSAPP
    external_conversation_id: str = ""
    external_message_id: Optional[str] = None
    sender_type: SenderTypeEnum = SenderTypeEnum.CUSTOMER
    sender_external_id: Optional[str] = None
    message_type: MessageTypeEnum = MessageTypeEnum.TEXT
    text: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    attachments: list[dict[str, Any]] = field(default_factory=list)
    metadata_: dict[str, Any] = field(default_factory=dict)


class RespondIoNormalizer:
    @staticmethod
    def map_channel(channel_str: Optional[str]) -> ChannelEnum:
        if not channel_str:
            return ChannelEnum.WHATSAPP
        lower = str(channel_str).lower()
        if "whatsapp" in lower:
            return ChannelEnum.WHATSAPP
        if "messenger" in lower or "facebook" in lower:
            return ChannelEnum.MESSENGER
        if "instagram" in lower:
            return ChannelEnum.INSTAGRAM
        if "tiktok" in lower:
            return ChannelEnum.TIKTOK
        return ChannelEnum.WHATSAPP

    @staticmethod
    def parse_timestamp(ts_val: Any) -> datetime:
        if isinstance(ts_val, (int, float)):
            # Convert epoch ms or s
            if ts_val > 1e11:
                ts_val = ts_val / 1000.0
            return datetime.fromtimestamp(ts_val, tz=timezone.utc)
        if isinstance(ts_val, str) and ts_val.strip():
            try:
                # Standard ISO parse
                dt = datetime.fromisoformat(ts_val.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    return dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception:
                pass
        return datetime.now(timezone.utc)

    @staticmethod
    def normalize_contact(raw_contact: dict[str, Any]) -> NormalizedRespondIoContact:
        contact_id = str(raw_contact.get("id") or raw_contact.get("contactId") or "")
        first_name = raw_contact.get("firstName") or ""
        last_name = raw_contact.get("lastName") or ""
        display_name = f"{first_name} {last_name}".strip() or raw_contact.get("name") or None
        email = raw_contact.get("email")
        phone = raw_contact.get("phone")

        raw_channel = raw_contact.get("channel") or raw_contact.get("channelType")
        channel = RespondIoNormalizer.map_channel(raw_channel)

        return NormalizedRespondIoContact(
            external_user_id=contact_id,
            display_name=display_name,
            email=email,
            phone=phone,
            provider=ProviderEnum.RESPOND_IO,
            channel=channel,
            metadata_={"raw": raw_contact},
        )

    @staticmethod
    def normalize_message(raw_msg: dict[str, Any]) -> NormalizedRespondIoMessage:
        msg_id = str(raw_msg.get("messageId") or raw_msg.get("id") or "")
        msg_type_str = str(raw_msg.get("type", "text")).lower()

        if "image" in msg_type_str:
            msg_type = MessageTypeEnum.IMAGE
        elif "video" in msg_type_str:
            msg_type = MessageTypeEnum.VIDEO
        elif "audio" in msg_type_str:
            msg_type = MessageTypeEnum.AUDIO
        elif "file" in msg_type_str or "attachment" in msg_type_str:
            msg_type = MessageTypeEnum.FILE
        else:
            msg_type = MessageTypeEnum.TEXT

        raw_sender = str(raw_msg.get("senderType") or raw_msg.get("from") or raw_msg.get("direction") or "").lower()
        if "agent" in raw_sender or "user" in raw_sender or "outbound" in raw_sender:
            sender_type = SenderTypeEnum.AGENT
        elif "system" in raw_sender or "bot" in raw_sender:
            sender_type = SenderTypeEnum.SYSTEM
        else:
            sender_type = SenderTypeEnum.CUSTOMER

        text = raw_msg.get("text") or raw_msg.get("message", {}).get("text")
        ts = RespondIoNormalizer.parse_timestamp(raw_msg.get("createdAt") or raw_msg.get("timestamp"))

        return NormalizedRespondIoMessage(
            external_message_id=msg_id,
            sender_type=sender_type,
            sender_external_id=str(raw_msg.get("senderId") or ""),
            message_type=msg_type,
            text=text,
            created_at=ts,
            metadata_={"raw": raw_msg},
        )

    @staticmethod
    def normalize_webhook_event(raw_payload: dict[str, Any]) -> NormalizedRespondIoWebhookEvent:
        event_type = str(raw_payload.get("event") or raw_payload.get("type") or "message.created")
        contact_data = raw_payload.get("contact") or {}
        message_data = raw_payload.get("message") or raw_payload

        contact_id = str(
            contact_data.get("id")
            or contact_data.get("contactId")
            or raw_payload.get("contactId")
            or raw_payload.get("contact_id")
            or ""
        )

        first_name = contact_data.get("firstName") or ""
        last_name = contact_data.get("lastName") or ""
        contact_name = f"{first_name} {last_name}".strip() or contact_data.get("name") or None
        contact_phone = contact_data.get("phone")
        contact_email = contact_data.get("email")

        raw_channel = raw_payload.get("channel") or contact_data.get("channel") or message_data.get("channel")
        channel = RespondIoNormalizer.map_channel(raw_channel)

        raw_conv_id = (
            raw_payload.get("conversationId")
            or raw_payload.get("conversation_id")
            or message_data.get("conversationId")
        )
        ext_conv_id = str(raw_conv_id) if raw_conv_id else f"resp_conv_{contact_id}"

        ext_msg_id_val = (
            message_data.get("messageId")
            or message_data.get("id")
            or raw_payload.get("messageId")
            or raw_payload.get("id")
        )
        ext_msg_id = str(ext_msg_id_val) if ext_msg_id_val else None

        # Sender type classification
        raw_direction = str(raw_payload.get("direction") or message_data.get("direction") or "").lower()
        raw_sender = str(message_data.get("senderType") or message_data.get("from") or "").lower()

        if "outbound" in raw_direction or "agent" in raw_sender:
            sender_type = SenderTypeEnum.AGENT
        elif "system" in raw_sender or "bot" in raw_sender:
            sender_type = SenderTypeEnum.SYSTEM
        else:
            sender_type = SenderTypeEnum.CUSTOMER

        # Message type classification
        msg_type_str = str(message_data.get("type", "text")).lower()
        if "image" in msg_type_str:
            msg_type = MessageTypeEnum.IMAGE
        elif "video" in msg_type_str:
            msg_type = MessageTypeEnum.VIDEO
        elif "audio" in msg_type_str:
            msg_type = MessageTypeEnum.AUDIO
        elif "file" in msg_type_str or "attachment" in msg_type_str:
            msg_type = MessageTypeEnum.FILE
        else:
            msg_type = MessageTypeEnum.TEXT

        text = message_data.get("text") or message_data.get("message", {}).get("text")
        ts = RespondIoNormalizer.parse_timestamp(
            message_data.get("createdAt") or raw_payload.get("createdAt") or raw_payload.get("timestamp")
        )

        attachments = message_data.get("attachments") or raw_payload.get("attachments") or []
        if not isinstance(attachments, list):
            attachments = [attachments] if isinstance(attachments, dict) else []

        return NormalizedRespondIoWebhookEvent(
            event_type=event_type,
            contact_id=contact_id,
            contact_name=contact_name,
            contact_phone=contact_phone,
            contact_email=contact_email,
            channel=channel,
            external_conversation_id=ext_conv_id,
            external_message_id=ext_msg_id,
            sender_type=sender_type,
            sender_external_id=str(message_data.get("senderId") or contact_id),
            message_type=msg_type,
            text=text,
            created_at=ts,
            attachments=attachments,
            metadata_={"raw": raw_payload},
        )
