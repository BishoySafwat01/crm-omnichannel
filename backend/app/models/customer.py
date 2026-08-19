import uuid
from datetime import datetime
from typing import Any, List, Optional
from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ChannelEnum, ProviderEnum


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="درجة أولى", server_default="درجة أولى")
    skin_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="عادية", server_default="عادية")
    stage: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="جديد", server_default="جديد")
    locale: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tags: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    identities: Mapped[List["CustomerIdentity"]] = relationship(
        "CustomerIdentity", back_populates="customer", cascade="all, delete-orphan"
    )
    conversations: Mapped[List["Conversation"]] = relationship(
        "Conversation", back_populates="customer", cascade="all, delete-orphan"
    )


class CustomerIdentity(Base):
    __tablename__ = "customer_identities"

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
        SAEnum(ProviderEnum, native_enum=False), nullable=False
    )
    channel: Mapped[ChannelEnum] = mapped_column(
        SAEnum(ChannelEnum, native_enum=False), nullable=False
    )
    external_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_: Mapped[Optional[dict[str, Any]]] = mapped_column(
        "metadata", JSONB, nullable=True, default=dict
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

    customer: Mapped["Customer"] = relationship("Customer", back_populates="identities")

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "channel",
            "external_user_id",
            name="uq_customer_identity_provider_channel_ext_user_id",
        ),
    )
