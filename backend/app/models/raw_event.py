import uuid
from datetime import datetime
from typing import Any, Optional
from sqlalchemy import DateTime, Enum as SAEnum, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import ProviderEnum, RawEventStatusEnum


class RawEvent(Base):
    __tablename__ = "raw_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider: Mapped[ProviderEnum] = mapped_column(
        SAEnum(ProviderEnum, native_enum=False), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    external_event_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[RawEventStatusEnum] = mapped_column(
        SAEnum(RawEventStatusEnum, native_enum=False),
        nullable=False,
        default=RawEventStatusEnum.RECEIVED,
    )
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
