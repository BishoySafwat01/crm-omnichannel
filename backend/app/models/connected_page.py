import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ConnectedPage(Base):
    __tablename__ = "connected_pages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    page_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    encrypted_access_token: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    instagram_business_account_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(32), default="ACTIVE", server_default="ACTIVE", nullable=False, index=True
    )
    is_webhook_subscribed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    connected_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    connected_by_user = relationship("User", foreign_keys=[connected_by_user_id])

    @property
    def decrypted_access_token(self) -> str:
        from app.services.connected_page_service import ConnectedPageService
        return ConnectedPageService.decrypt_token(self)

    @decrypted_access_token.setter
    def decrypted_access_token(self, value: str) -> None:
        from app.services.connected_page_service import ConnectedPageService
        ConnectedPageService.set_page_token(self, value)

    @property
    def is_active(self) -> bool:
        return self.status == "ACTIVE"

    @is_active.setter
    def is_active(self, value: bool) -> None:
        self.status = "ACTIVE" if value else "INACTIVE"

