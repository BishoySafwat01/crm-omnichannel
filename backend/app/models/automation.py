import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    channels: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )  # e.g. ["messenger", "instagram", "whatsapp"]
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False, default="keyword_match")
    match_type: Mapped[str] = mapped_column(String(50), nullable=False, default="contains")  # exact, contains, regex
    keywords: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )  # e.g. ["خصم", "عروض"]
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    response_media_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    execution_logs: Mapped[list["AutomationExecutionLog"]] = relationship(
        "AutomationExecutionLog", back_populates="rule", cascade="all, delete-orphan"
    )


class AutomationExecutionLog(Base):
    __tablename__ = "automation_execution_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    rule: Mapped["AutomationRule"] = relationship("AutomationRule", back_populates="execution_logs")
