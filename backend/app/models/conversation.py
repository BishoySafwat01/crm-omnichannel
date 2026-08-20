import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ChannelEnum, ConversationStatusEnum, ProviderEnum


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[ProviderEnum] = mapped_column(
        SAEnum(ProviderEnum, native_enum=False), nullable=False, index=True
    )
    channel: Mapped[ChannelEnum] = mapped_column(
        SAEnum(ChannelEnum, native_enum=False), nullable=False, index=True
    )
    external_conversation_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    status: Mapped[ConversationStatusEnum] = mapped_column(
        SAEnum(ConversationStatusEnum, native_enum=False),
        nullable=False,
        default=ConversationStatusEnum.OPEN,
        index=True,
    )
    assigned_agent_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    priority: Mapped[str] = mapped_column(String(50), nullable=False, default="normal", server_default="normal")
    brand: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, default="LAVVA", server_default="LAVVA", index=True)
    subject: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    unread_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    last_read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    sla_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    sla_status: Mapped[str] = mapped_column(String(50), default="none", server_default="none", nullable=False, index=True)
    first_response_time_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detected_intent: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    detected_sentiment: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    ai_suggested_replies: Mapped[List[str]] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)


    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    customer: Mapped["Customer"] = relationship("Customer", back_populates="conversations")
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "channel",
            "external_conversation_id",
            name="uq_conversation_provider_channel_ext_conv_id",
        ),
    )
