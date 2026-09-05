from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class AnalyticsOverviewResponse(BaseModel):
    total_conversations: int = 0
    unresolved_conversations: int = 0
    total_inbound_messages: int = 0
    total_outbound_messages: int = 0
    automation_resolutions: int = 0
    automation_resolution_rate: float = 0.0

    model_config = ConfigDict(from_attributes=True)


class ChannelItem(BaseModel):
    channel: str
    count: int = 0
    percentage: float = 0.0


class ChannelDistributionResponse(BaseModel):
    total: int = 0
    channels: list[ChannelItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class BrandItem(BaseModel):
    brand: str
    total_conversations: int = 0
    active_unread: int = 0
    total_messages: int = 0


class BrandVolumeResponse(BaseModel):
    brands: list[BrandItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class HourItem(BaseModel):
    hour: int
    message_count: int = 0


class PeakHoursResponse(BaseModel):
    hours: list[HourItem] = Field(default_factory=list)
    peak_hour: int = 0
    peak_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class SlaMetricsResponse(BaseModel):
    avg_first_response_minutes: float = 0.0
    within_sla_count: int = 0
    total_evaluated: int = 0
    sla_compliance_rate: float = 0.0

    model_config = ConfigDict(from_attributes=True)
