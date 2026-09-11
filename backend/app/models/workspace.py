import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

DEFAULT_WORKSPACE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    # Dynamic Enterprise Subsidiary / Multi-Brand Customization
    brand_display_name: Mapped[Optional[str]] = mapped_column(
        String(255), default="LUXIRA Omnichannel CRM", server_default="LUXIRA Omnichannel CRM", nullable=True
    )
    brand_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    favicon_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    theme_primary_color: Mapped[str] = mapped_column(
        String(20), default="#1A73E8", server_default="#1A73E8", nullable=False
    )
    canned_responses: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    custom_domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
