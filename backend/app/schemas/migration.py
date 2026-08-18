import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict

from app.models.enums import ChannelEnum, MigrationStatusEnum, ProviderEnum


class MigrationJobBase(BaseModel):
    provider: ProviderEnum
    channel: ChannelEnum


class MigrationJobCreate(MigrationJobBase):
    pass


class MigrationJobUpdate(BaseModel):
    status: Optional[MigrationStatusEnum] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_conversations: Optional[int] = None
    total_messages: Optional[int] = None
    processed_conversations: Optional[int] = None
    processed_messages: Optional[int] = None
    failed_items: Optional[int] = None
    error_log: Optional[list[Any]] = None


class MigrationJobResponse(MigrationJobBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: MigrationStatusEnum
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_conversations: int
    total_messages: int
    processed_conversations: int
    processed_messages: int
    failed_items: int
    error_log: Optional[list[Any]] = None
    created_at: datetime
    updated_at: datetime
