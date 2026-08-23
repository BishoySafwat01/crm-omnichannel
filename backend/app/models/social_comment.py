import uuid
from datetime import datetime
from typing import Any, List, Optional
from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SocialComment(Base):
    __tablename__ = "social_comments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    brand: Mapped[str] = mapped_column(String(255), default="LUXIRA", server_default="LUXIRA", index=True)
    platform: Mapped[str] = mapped_column(String(50), default="facebook", index=True)
    post_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    post_title: Mapped[str] = mapped_column(String(500), nullable=False)
    post_thumbnail: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    author_name: Mapped[str] = mapped_column(String(255), nullable=False)
    author_avatar: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)

    sentiment: Mapped[str] = mapped_column(String(50), default="positive", index=True)
    sentiment_score: Mapped[int] = mapped_column(Integer, default=50)
    moderation_status: Mapped[str] = mapped_column(String(50), default="active", index=True)
    ai_action_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    auto_replied_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    likes_count: Mapped[int] = mapped_column(Integer, default=0)
    replies_count: Mapped[int] = mapped_column(Integer, default=0)
    is_direct_message_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class CommentModerationLog(Base):
    __tablename__ = "comment_moderation_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    comment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    comment_author: Mapped[str] = mapped_column(String(255), default="")
    action_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    performed_by: Mapped[str] = mapped_column(String(100), default="AI_AUTO_MODERATION")
    details: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class CommentModerationSetting(Base):
    __tablename__ = "comment_moderation_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    brand: Mapped[str] = mapped_column(String(255), default="all", unique=True, index=True)
    auto_delete_negative: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_hide_spam: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_reply_inquiries: Mapped[bool] = mapped_column(Boolean, default=True)
    strictness_level: Mapped[str] = mapped_column(String(50), default="strict")
    action_for_negative: Mapped[str] = mapped_column(String(50), default="delete_and_dm")

    negative_keywords: Mapped[Optional[list[str]]] = mapped_column(
        JSONB,
        default=list,
    )
    inquiry_keywords: Mapped[Optional[list[str]]] = mapped_column(
        JSONB,
        default=list,
    )

    inquiry_reply_text: Mapped[str] = mapped_column(
        Text,
        default="أهلاً بك! تم إرسال كافة التفاصيل والأسعار والعروض في رسالة خاصة عبر الدايركت 💌",
    )
    inquiry_dm_text: Mapped[str] = mapped_column(
        Text,
        default="أهلاً بك! سعداء باهتمامك بمنتجاتنا ✨ إليك قائمة الأسعار وخصم 10% إضافي عند الطلب اليوم: https://luxira.com",
    )
    negative_dm_apology_text: Mapped[str] = mapped_column(
        Text,
        default="أهلاً بك، نعتذر بشدة عن أي تجربة غير مرضية. يرجى تزويدنا برقم الهاتف أو الطلب وسيتواصل معك مدير خدمة العملاء فوراً لحل المشكلة وتعويضك 🤝",
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
