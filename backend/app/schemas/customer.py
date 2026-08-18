import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict

from app.models.enums import ChannelEnum, ProviderEnum


class CustomerIdentityBase(BaseModel):
    provider: ProviderEnum
    channel: ChannelEnum
    external_user_id: str
    metadata_: Optional[dict[str, Any]] = None


class CustomerIdentityCreate(CustomerIdentityBase):
    pass


class CustomerIdentityResponse(CustomerIdentityBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class CustomerBase(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    locale: Optional[str] = None
    tags: Optional[list[str]] = []


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class CustomerResponse(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class CustomerDetailResponse(CustomerResponse):
    identities: list[CustomerIdentityResponse] = []
