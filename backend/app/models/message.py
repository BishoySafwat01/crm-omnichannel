import uuid
from datetime import datetime
from typing import Any, Optional
from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Index, String, Text, UniqueConstraint, func, text as sa_text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sqlalchemy.types import TypeDecorator
from app.core.database import Base
from app.models.enums import MessageTypeEnum, SenderTypeEnum


class SafeMessageType(TypeDecorator):
    """Resilient type decorator that maps DB strings to MessageTypeEnum case-insensitively and falls back to UNKNOWN."""
    impl = String(50)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if hasattr(value, 'name'):
            return value.name
        return str(value).upper()

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        val_str = str(value).upper()
        if val_str in MessageTypeEnum.__members__:
            return MessageTypeEnum[val_str]
        for m in MessageTypeEnum:
            if m.value.upper() == val_str:
                return m
        return MessageTypeEnum.UNKNOWN


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
    sender_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    message_type: Mapped[MessageTypeEnum] = mapped_column(
        SafeMessageType(),
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
    sender_user: Mapped[Optional["User"]] = relationship(
        "User", viewonly=True
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
        Index(
            "ix_messages_conv_created_asc",
            "conversation_id",
            sa_text("created_at ASC"),
        ),
    )
