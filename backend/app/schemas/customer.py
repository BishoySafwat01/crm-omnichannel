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
    location: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    tier: Optional[str] = "درجة أولى"
    skin_type: Optional[str] = "عادية"
    stage: Optional[str] = "جديد"
    locale: Optional[str] = None
    tags: Optional[list[str]] = []
    is_blocked: bool = False
    blocked_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    tier: Optional[str] = None
    skin_type: Optional[str] = None
    stage: Optional[str] = None
    is_blocked: Optional[bool] = None
    blocked_reason: Optional[str] = None


class CustomerBlockRequest(BaseModel):
    reason: Optional[str] = None


class CustomerResponse(CustomerBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    last_activity_at: Optional[datetime] = None
    is_blocked: bool = False
    blocked_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None


class CustomerDetailResponse(CustomerResponse):
    identities: list[CustomerIdentityResponse] = []
    brand: Optional[str] = None
    channel: Optional[str] = None
    conversation_id: Optional[uuid.UUID] = None
    conversation_status: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    assigned_agent_name: Optional[str] = None
    last_agent_name: Optional[str] = None
    last_interaction: Optional[str] = None


class AdminCustomerItem(CustomerResponse):
    brand: Optional[str] = None
    channel: Optional[str] = None
    conversation_id: Optional[uuid.UUID] = None
    conversation_status: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    assigned_agent_name: Optional[str] = None
    last_agent_name: Optional[str] = None
    last_interaction: Optional[str] = None


class AdminCustomerListResponse(BaseModel):
    items: list[AdminCustomerItem] = []
    total: int = 0
    page: int = 1
    page_size: int = 50
    total_pages: int = 1

    model_config = ConfigDict(from_attributes=True)


class CustomerStageStat(BaseModel):
    stage: str
    count: int = 0


class CustomerTierStat(BaseModel):
    tier: str
    count: int = 0


class CustomerStatsResponse(BaseModel):
    total_customers: int = 0
    stages: list[CustomerStageStat] = []
    tiers: list[CustomerTierStat] = []

    model_config = ConfigDict(from_attributes=True)


class CustomerNoteCreate(BaseModel):
    text: str


class CustomerNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    author_user_id: Optional[uuid.UUID] = None
    author_name: Optional[str] = "موظف الدعم"
    text: str
    created_at: datetime


class CustomerTimelineEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    event_type: str
    channel: str = "system"
    summary: str
    details: Optional[dict[str, Any]] = None
    created_at: datetime


class CustomerTimelineListResponse(BaseModel):
    items: list[CustomerTimelineEventResponse] = []
    total: int = 0
    page: int = 1
    page_size: int = 30

