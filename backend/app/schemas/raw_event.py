import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict

from app.models.enums import ProviderEnum, RawEventStatusEnum


class RawEventBase(BaseModel):
    provider: ProviderEnum
    event_type: str
    external_event_id: Optional[str] = None
    payload: dict[str, Any]


class RawEventCreate(RawEventBase):
    pass


class RawEventResponse(RawEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    received_at: datetime
    processed_at: Optional[datetime] = None
    status: RawEventStatusEnum
    error: Optional[str] = None
