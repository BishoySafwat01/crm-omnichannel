import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SocialComment(Base):
    __tablename__ = "social_comments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    post_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    post_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    post_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    post_thumbnail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comment_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    author_name: Mapped[str] = mapped_column(String(255), nullable=False)
    author_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(String(50), nullable=False, default="facebook")  # facebook, instagram
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    sentiment: Mapped[str] = mapped_column(String(50), nullable=False, default="neutral")  # positive, neutral, negative, toxic
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    auto_replied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reply_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dm_thread_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        index=True,
    )
