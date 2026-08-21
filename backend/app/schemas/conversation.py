import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models.enums import ChannelEnum, ConversationStatusEnum, ProviderEnum
from app.schemas.customer import CustomerIdentityResponse, CustomerResponse


class ConversationBase(BaseModel):
    provider: ProviderEnum = ProviderEnum.META
    channel: ChannelEnum = ChannelEnum.MESSENGER
    external_conversation_id: str
    subject: Optional[str] = None
    brand: Optional[str] = "LAVVA"
    status: ConversationStatusEnum = ConversationStatusEnum.OPEN
    assigned_agent_id: Optional[uuid.UUID] = None
    priority: str = "normal"


class ConversationCreate(ConversationBase):
    customer_id: uuid.UUID


class ConversationUpdate(BaseModel):
    status: Optional[ConversationStatusEnum] = None
    brand: Optional[str] = None
    subject: Optional[str] = None
    last_message_at: Optional[datetime] = None


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    external_conversation_id: str
    channel: ChannelEnum = ChannelEnum.MESSENGER
    provider: ProviderEnum = ProviderEnum.META
    subject: Optional[str] = None
    brand: Optional[str] = "LAVVA"
    status: ConversationStatusEnum = ConversationStatusEnum.OPEN
    priority: str = "normal"
    assigned_agent_id: Optional[uuid.UUID] = None
    unread_count: int = 0
    customer_id: Optional[uuid.UUID] = None
    customer_display_name: Optional[str] = "مستخدم Messenger"
    customer_avatar_url: Optional[str] = None
    last_message_text: Optional[str] = ""
    last_message_at: Optional[datetime] = None
    last_customer_message_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    sla_status: str = "none"
    first_response_time_seconds: Optional[int] = None
    ai_summary: Optional[str] = None
    detected_intent: Optional[str] = None
    detected_sentiment: Optional[str] = None
    ai_suggested_replies: list[str] = []
    customer: Optional[CustomerResponse] = None


class ConversationDetailResponse(ConversationResponse):
    customer: Optional[CustomerResponse] = None
    identities: list[CustomerIdentityResponse] = []
