from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.models.enums import (
    ChannelEnum,
    ConversationStatusEnum,
    MessageTypeEnum,
    ProviderEnum,
    SenderTypeEnum,
)


@dataclass
class NormalizedCustomer:
    external_user_id: str
    display_name: Optional[str]
    provider: ProviderEnum = ProviderEnum.META
    channel: ChannelEnum = ChannelEnum.MESSENGER
    metadata_: dict[str, Any] = field(default_factory=dict)


@dataclass
class NormalizedConversation:
    external_conversation_id: str
    customer_external_user_id: str
    customer_display_name: Optional[str]
    last_message_at: datetime
    provider: ProviderEnum = ProviderEnum.META
    channel: ChannelEnum = ChannelEnum.MESSENGER
    status: ConversationStatusEnum = ConversationStatusEnum.OPEN
    subject: Optional[str] = None
    metadata_: dict[str, Any] = field(default_factory=dict)


@dataclass
class NormalizedMessage:
    external_message_id: str
    sender_type: SenderTypeEnum
    sender_external_id: Optional[str]
    message_type: MessageTypeEnum
    text: Optional[str]
    created_at: datetime
    metadata_: dict[str, Any] = field(default_factory=dict)


@dataclass
class NormalizedMetaWebhookEvent:
    page_id: str
    sender_psid: str
    recipient_id: str
    external_message_id: Optional[str]
    sender_type: SenderTypeEnum
    message_type: MessageTypeEnum
    text: Optional[str]
    created_at: datetime
    attachments: list[dict[str, Any]] = field(default_factory=list)
    metadata_: dict[str, Any] = field(default_factory=dict)


class MetaNormalizer:
    @staticmethod
    def parse_iso_timestamp(ts_str: Optional[str]) -> datetime:
        if not ts_str or not isinstance(ts_str, str):
            raise ValueError(f"Invalid timestamp format: {ts_str}")
        try:
            clean_str = ts_str.replace("+0000", "+00:00")
            return datetime.fromisoformat(clean_str)
        except Exception as exc:
            raise ValueError(f"Unable to parse timestamp '{ts_str}': {str(exc)}")

    @staticmethod
    def parse_epoch_timestamp(ts_val: Any) -> datetime:
        if isinstance(ts_val, (int, float)):
            if ts_val > 1e11:  # milliseconds
                ts_val = ts_val / 1000.0
            return datetime.fromtimestamp(ts_val, tz=timezone.utc)
        if isinstance(ts_val, str) and ts_val.strip():
            try:
                return MetaNormalizer.parse_iso_timestamp(ts_val)
            except ValueError:
                pass
        return datetime.now(timezone.utc)

    @staticmethod
    def normalize_conversation(
        raw_conv: dict[str, Any], page_id: str, channel: ChannelEnum = ChannelEnum.MESSENGER
    ) -> NormalizedConversation:
        ext_conv_id = raw_conv.get("id", "")

        try:
            updated_time = MetaNormalizer.parse_iso_timestamp(raw_conv.get("updated_time"))
        except ValueError:
            updated_time = datetime.now(timezone.utc)

        participants = raw_conv.get("participants", {}).get("data", [])
        customer_id = ""
        customer_name = None

        for participant in participants:
            p_id = str(participant.get("id", ""))
            if p_id and p_id != page_id:
                customer_id = p_id
                customer_name = participant.get("name")
                break

        if not customer_id and participants:
            customer_id = str(participants[0].get("id", ""))
            customer_name = participants[0].get("name")

        return NormalizedConversation(
            external_conversation_id=ext_conv_id,
            customer_external_user_id=customer_id,
            customer_display_name=customer_name,
            last_message_at=updated_time,
            provider=ProviderEnum.META,
            channel=channel,
            status=ConversationStatusEnum.OPEN,
            subject=f"Messenger Conversation {ext_conv_id}",
            metadata_={"link": raw_conv.get("link")},
        )

    @staticmethod
    def normalize_message(
        raw_msg: dict[str, Any], page_id: str
    ) -> NormalizedMessage:
        ext_msg_id = raw_msg.get("id", "")

        try:
            created_time = MetaNormalizer.parse_iso_timestamp(raw_msg.get("created_time"))
        except ValueError:
            created_time = datetime.now(timezone.utc)

        from_data = raw_msg.get("from", {})
        sender_id = str(from_data.get("id", ""))
        sender_name = from_data.get("name")

        # Determine Sender Type
        if raw_msg.get("is_system") or sender_id == "system":
            sender_type = SenderTypeEnum.SYSTEM
        elif sender_id == page_id:
            sender_type = SenderTypeEnum.AGENT
        else:
            sender_type = SenderTypeEnum.CUSTOMER

        text_content = raw_msg.get("message")
        raw_attachments = raw_msg.get("attachments", {}).get("data", [])

        normalized_attachments = []
        msg_type = MessageTypeEnum.TEXT

        if raw_attachments:
            first_att = raw_attachments[0]
            att_type_str = str(first_att.get("type", "")).lower()

            if "image" in att_type_str:
                msg_type = MessageTypeEnum.IMAGE
            elif "video" in att_type_str:
                msg_type = MessageTypeEnum.VIDEO
            elif "audio" in att_type_str:
                msg_type = MessageTypeEnum.AUDIO
            elif "file" in att_type_str or "doc" in att_type_str:
                msg_type = MessageTypeEnum.FILE
            else:
                msg_type = MessageTypeEnum.UNKNOWN

            for att in raw_attachments:
                payload = att.get("payload", {})
                url = payload.get("url") or att.get("file_url")
                normalized_attachments.append({
                    "id": att.get("id"),
                    "type": att.get("type"),
                    "title": att.get("name") or payload.get("title"),
                    "url": url,
                    "mime_type": payload.get("mime_type"),
                })
        elif not text_content:
            msg_type = MessageTypeEnum.UNKNOWN

        metadata = {
            "from_name": sender_name,
            "attachments": normalized_attachments,
        }

        return NormalizedMessage(
            external_message_id=ext_msg_id,
            sender_type=sender_type,
            sender_external_id=sender_id,
            message_type=msg_type,
            text=text_content,
            created_at=created_time,
            metadata_=metadata,
        )

    @staticmethod
    def normalize_webhook_event(
        raw_item: dict[str, Any], page_id: str
    ) -> NormalizedMetaWebhookEvent:
        sender_data = raw_item.get("sender", {})
        recipient_data = raw_item.get("recipient", {})
        sender_psid = str(sender_data.get("id", ""))
        recipient_id = str(recipient_data.get("id", ""))

        msg_data = raw_item.get("message", {})
        ext_msg_id_val = msg_data.get("mid") or msg_data.get("id")
        ext_msg_id = str(ext_msg_id_val) if ext_msg_id_val else None

        ts_val = raw_item.get("timestamp") or raw_item.get("time")
        created_at = MetaNormalizer.parse_epoch_timestamp(ts_val)

        if sender_psid == page_id:
            sender_type = SenderTypeEnum.AGENT
        elif sender_psid == "system":
            sender_type = SenderTypeEnum.SYSTEM
        else:
            sender_type = SenderTypeEnum.CUSTOMER

        text_content = msg_data.get("text")
        raw_attachments = msg_data.get("attachments", [])

        normalized_attachments = []
        msg_type = MessageTypeEnum.TEXT

        if raw_attachments:
            first_att = raw_attachments[0]
            att_type_str = str(first_att.get("type", "")).lower()

            if "image" in att_type_str:
                msg_type = MessageTypeEnum.IMAGE
            elif "video" in att_type_str:
                msg_type = MessageTypeEnum.VIDEO
            elif "audio" in att_type_str:
                msg_type = MessageTypeEnum.AUDIO
            elif "file" in att_type_str or "doc" in att_type_str:
                msg_type = MessageTypeEnum.FILE
            else:
                msg_type = MessageTypeEnum.UNKNOWN

            for att in raw_attachments:
                payload = att.get("payload", {})
                url = payload.get("url")
                normalized_attachments.append({
                    "type": att.get("type"),
                    "title": payload.get("title"),
                    "url": url,
                })
        elif not text_content:
            msg_type = MessageTypeEnum.UNKNOWN

        return NormalizedMetaWebhookEvent(
            page_id=page_id,
            sender_psid=sender_psid,
            recipient_id=recipient_id,
            external_message_id=ext_msg_id,
            sender_type=sender_type,
            message_type=msg_type,
            text=text_content,
            created_at=created_at,
            attachments=normalized_attachments,
            metadata_={"raw": raw_item},
        )
