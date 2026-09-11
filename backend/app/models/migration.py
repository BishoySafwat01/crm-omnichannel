import uuid
from datetime import datetime
from typing import Any, Optional
from sqlalchemy import DateTime, Enum as SAEnum, Integer, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import ChannelEnum, MigrationStatusEnum, ProviderEnum


class MigrationJob(Base):
    __tablename__ = "migration_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider: Mapped[ProviderEnum] = mapped_column(
        SAEnum(ProviderEnum, native_enum=False), nullable=False
    )
    channel: Mapped[ChannelEnum] = mapped_column(
        SAEnum(ChannelEnum, native_enum=False), nullable=False
    )
    status: Mapped[MigrationStatusEnum] = mapped_column(
        SAEnum(MigrationStatusEnum, native_enum=False),
        nullable=False,
        default=MigrationStatusEnum.PENDING,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    total_conversations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_messages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_conversations: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    processed_messages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_items: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    error_log: Mapped[Optional[list[Any]]] = mapped_column(
        JSONB, nullable=True, default=list
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
