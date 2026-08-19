import uuid
from datetime import datetime
from typing import Any, Optional
from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import MessageTypeEnum, SenderTypeEnum


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_message_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )
    sender_type: Mapped[SenderTypeEnum] = mapped_column(
        SAEnum(SenderTypeEnum, native_enum=False), nullable=False
    )
    sender_external_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    message_type: Mapped[MessageTypeEnum] = mapped_column(
        SAEnum(MessageTypeEnum, native_enum=False),
        nullable=False,
        default=MessageTypeEnum.TEXT,
    )
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    metadata_: Mapped[Optional[dict[str, Any]]] = mapped_column(
        "metadata", JSONB, nullable=True, default=dict
    )

    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="messages"
    )

    @property
    def media_url(self) -> Optional[str]:
        meta = self.metadata_ or {}
        if not isinstance(meta, dict):
            return None

        if meta.get("media_url"):
            return meta.get("media_url")

        attachments = meta.get("attachments", [])
        if isinstance(attachments, list) and len(attachments) > 0:
            first = attachments[0]
            if isinstance(first, dict):
                img_data = first.get("image_data") or {}
                payload = first.get("payload") or {}
                return (
                    first.get("url")
                    or payload.get("url")
                    or img_data.get("url")
                    or img_data.get("preview_url")
                    or first.get("file_url")
                )
        return None

    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "external_message_id",
            name="uq_message_conversation_ext_msg_id",
        ),
    )
