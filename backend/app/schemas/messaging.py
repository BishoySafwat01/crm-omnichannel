import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import MessageTypeEnum, SenderTypeEnum


class MessageAttachmentInput(BaseModel):
    url: str
    type: str = "audio"
    filename: Optional[str] = None
    mime_type: Optional[str] = None


class SendMessageRequest(BaseModel):
    text: Optional[str] = ""
    attachments: Optional[list[dict[str, Any]]] = []
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    meta_tag: Optional[str] = None


class MessageBase(BaseModel):
    external_message_id: Optional[str] = None
    sender_type: SenderTypeEnum
    sender_external_id: Optional[str] = None
    message_type: MessageTypeEnum = MessageTypeEnum.TEXT
    text: Optional[str] = None
    metadata_: Optional[dict[str, Any]] = None


class MessageCreate(MessageBase):
    conversation_id: uuid.UUID


class MessageResponse(MessageBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    created_at: datetime
    attachments: Optional[list[dict[str, Any]]] = Field(default_factory=list)
    media_url: Optional[str] = None
    media_type: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_attachments_and_media(cls, data: Any) -> Any:
        if isinstance(data, dict):
            metadata = data.get("metadata_") or data.get("metadata") or {}
            atts = data.get("attachments") or metadata.get("attachments") or []
            url = data.get("media_url") or metadata.get("media_url")
            m_type = data.get("media_type") or metadata.get("media_type")
            text_val = (data.get("text") or "").strip()
        else:
            metadata = getattr(data, "metadata_", {}) or {}
            atts = metadata.get("attachments") or []
            url = metadata.get("media_url")
            m_type = metadata.get("media_type")
            text_val = (getattr(data, "text", "") or "").strip()

        if not atts:
            if text_val.startswith("image-") or text_val.startswith("/uploads/") or any(text_val.endswith(ext) for ext in [".ogg", ".mp4", ".m4a", ".webm", ".jpg", ".png", ".jpeg", ".webp"]):
                url_val = text_val if text_val.startswith("/uploads/") else f"/uploads/{text_val}"
                is_img = "image" in url_val or url_val.endswith((".jpg", ".png", ".jpeg", ".webp"))
                atts = [{
                    "url": url_val,
                    "type": "image" if is_img else "audio",
                    "filename": text_val,
                    "mime_type": "image/jpeg" if is_img else "audio/m4a"
                }]
                if not url:
                    url = url_val
                if not m_type:
                    m_type = "image" if is_img else "audio"

        if isinstance(data, dict):
            data["attachments"] = atts
            data["media_url"] = url
            data["media_type"] = m_type
            return data
        else:
            return {
                "id": getattr(data, "id"),
                "conversation_id": getattr(data, "conversation_id"),
                "external_message_id": getattr(data, "external_message_id", None),
                "sender_type": getattr(data, "sender_type"),
                "sender_external_id": getattr(data, "sender_external_id", None),
                "message_type": getattr(data, "message_type"),
                "text": getattr(data, "text", None),
                "metadata_": metadata,
                "created_at": getattr(data, "created_at"),
                "attachments": atts,
                "media_url": url,
                "media_type": m_type,
            }
