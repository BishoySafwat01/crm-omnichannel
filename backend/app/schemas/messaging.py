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
    reply_to_message_id: Optional[uuid.UUID] = None


class EditMessageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="New message text")


class ReactionRequest(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=10, description="Emoji symbol to react with")


class ForwardMessageRequest(BaseModel):
    target_conversation_id: uuid.UUID = Field(..., description="Target conversation ID to forward message to")


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
    sender_user_id: Optional[uuid.UUID] = None
    sender_name: Optional[str] = None
    created_at: datetime
    attachments: Optional[list[dict[str, Any]]] = Field(default_factory=list)
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    updated_customer_location: Optional[str] = None
    # P3-2: Delivery tracking and Meta messaging tag
    delivery_status: Optional[str] = None
    meta_tag: Optional[str] = None

    # Message Actions & State Metadata
    reply_to: Optional[dict[str, Any]] = None
    is_edited: Optional[bool] = False
    edited_at: Optional[datetime] = None
    edited_by_user_id: Optional[uuid.UUID] = None
    is_deleted: Optional[bool] = False
    deleted_at: Optional[datetime] = None
    deleted_by_name: Optional[str] = None
    reactions: Optional[list[dict[str, Any]]] = Field(default_factory=list)
    forwarded: Optional[bool] = False
    forwarded_from: Optional[dict[str, Any]] = None
    is_pinned: Optional[bool] = False
    pinned_at: Optional[datetime] = None
    pinned_by_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_attachments_and_media(cls, data: Any) -> Any:
        if isinstance(data, dict):
            metadata = data.get("metadata_") or data.get("metadata") or {}
            atts = data.get("attachments") or metadata.get("attachments") or []
            url = data.get("media_url") or metadata.get("media_url")
            m_type = data.get("media_type") or metadata.get("media_type") or data.get("message_type")
            text_val = (data.get("text") or "").strip()
            loc = data.get("updated_customer_location")
            s_user_id = data.get("sender_user_id")
            s_name = data.get("sender_name")
        else:
            metadata = getattr(data, "metadata_", {}) or {}
            atts = metadata.get("attachments") or []
            url = getattr(data, "media_url", None) or metadata.get("media_url")
            m_type = getattr(data, "media_type", None) or getattr(data, "message_type", None) or metadata.get("media_type")
            if hasattr(m_type, "value"):
                m_type = m_type.value
            text_val = (getattr(data, "text", "") or "").strip()
            loc = getattr(data, "updated_customer_location", None)
            s_user_id = getattr(data, "sender_user_id", None)
            s_name = getattr(data, "sender_name", None)
            try:
                from sqlalchemy import inspect as sa_inspect
                insp = sa_inspect(data)
                if insp and "sender_user" not in insp.unloaded:
                    sender_user = data.sender_user
                    if sender_user and hasattr(sender_user, "full_name") and sender_user.full_name:
                        s_name = s_name or sender_user.full_name
            except Exception:
                pass

        if atts and isinstance(atts, list) and len(atts) > 0 and isinstance(atts[0], dict):
            first = atts[0]
            extracted_url = (
                first.get("url")
                or first.get("payload", {}).get("url")
                or first.get("image_data", {}).get("url")
                or first.get("image_data", {}).get("preview_url")
                or first.get("file_url")
            )
            if extracted_url and not url:
                url = extracted_url
            if first.get("image_data") or (first.get("mime_type") or "").startswith("image/"):
                m_type = "image"

        if not atts and url:
            is_img = "image" in str(m_type) or str(url).endswith((".jpg", ".png", ".jpeg", ".webp", ".gif"))
            atts = [{
                "url": url,
                "type": "image" if is_img else "file",
                "filename": text_val or "attachment",
            }]

        if not atts and text_val:
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

        # Action metadata extraction from metadata JSONB
        meta_dict = metadata if isinstance(metadata, dict) else {}
        reply_to = meta_dict.get("reply_to")
        is_edited = meta_dict.get("is_edited", False)
        edited_at = meta_dict.get("edited_at")
        edited_by_user_id = meta_dict.get("edited_by_user_id")
        is_deleted = meta_dict.get("is_deleted", False)
        deleted_at = meta_dict.get("deleted_at")
        deleted_by_name = meta_dict.get("deleted_by_name")
        reactions = meta_dict.get("reactions", [])
        forwarded = meta_dict.get("forwarded", False)
        forwarded_from = meta_dict.get("forwarded_from")
        is_pinned = meta_dict.get("is_pinned", False)
        pinned_at = meta_dict.get("pinned_at")
        pinned_by_name = meta_dict.get("pinned_by_name")

        if is_deleted:
            atts = []
            url = None
            text_val = ""

        if isinstance(data, dict):
            data["attachments"] = atts
            data["media_url"] = url
            data["media_type"] = str(m_type) if (m_type and not is_deleted) else None
            data["updated_customer_location"] = loc
            data.setdefault("sender_user_id", s_user_id)
            data.setdefault("sender_name", s_name)
            # P3-2: propagate delivery_status and meta_tag from raw dict
            data.setdefault("delivery_status", data.get("delivery_status"))
            data.setdefault("meta_tag", data.get("meta_tag"))

            # Message Actions
            data["reply_to"] = reply_to
            data["is_edited"] = is_edited
            data["edited_at"] = edited_at
            data["edited_by_user_id"] = edited_by_user_id
            data["is_deleted"] = is_deleted
            data["deleted_at"] = deleted_at
            data["deleted_by_name"] = deleted_by_name
            data["reactions"] = reactions
            data["forwarded"] = forwarded
            data["forwarded_from"] = forwarded_from
            data["is_pinned"] = is_pinned
            data["pinned_at"] = pinned_at
            data["pinned_by_name"] = pinned_by_name
            return data
        else:
            return {
                "id": getattr(data, "id"),
                "conversation_id": getattr(data, "conversation_id"),
                "external_message_id": getattr(data, "external_message_id", None),
                "sender_type": getattr(data, "sender_type"),
                "sender_external_id": getattr(data, "sender_external_id", None),
                "sender_user_id": s_user_id,
                "sender_name": s_name,
                "message_type": m_type or getattr(data, "message_type"),
                "text": None if is_deleted else getattr(data, "text", None),
                "metadata_": metadata,
                "created_at": getattr(data, "created_at"),
                "attachments": atts,
                "media_url": url,
                "media_type": str(m_type) if m_type else None,
                "updated_customer_location": loc,
                # P3-2: include delivery_status and meta_tag from ORM object
                "delivery_status": getattr(data, "delivery_status", None),
                "meta_tag": getattr(data, "meta_tag", None),

                # Message Actions
                "reply_to": reply_to,
                "is_edited": is_edited,
                "edited_at": edited_at,
                "edited_by_user_id": edited_by_user_id,
                "is_deleted": is_deleted,
                "deleted_at": deleted_at,
                "deleted_by_name": deleted_by_name,
                "reactions": reactions,
                "forwarded": forwarded,
                "forwarded_from": forwarded_from,
                "is_pinned": is_pinned,
                "pinned_at": pinned_at,
                "pinned_by_name": pinned_by_name,
            }
