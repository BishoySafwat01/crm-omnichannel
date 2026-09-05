from datetime import datetime
import uuid
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    brand_id: Optional[str] = Field(None, max_length=100)
    channels: list[str] = Field(default_factory=lambda: ["messenger", "instagram", "whatsapp"])
    trigger_type: str = Field("keyword_match", max_length=50)
    match_type: str = Field("contains", max_length=50)  # exact, contains, regex
    keywords: list[str] = Field(default_factory=list)
    response_text: str = Field(..., min_length=1)
    response_media_url: Optional[str] = None
    split_lines: bool = True
    delay_seconds: int = Field(2, ge=0, le=60)
    human_typing_simulation: bool = True
    cooldown_minutes: int = Field(15, ge=0)
    is_active: bool = True


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    brand_id: Optional[str] = None
    channels: Optional[list[str]] = None
    trigger_type: Optional[str] = None
    match_type: Optional[str] = None
    keywords: Optional[list[str]] = None
    response_text: Optional[str] = None
    response_media_url: Optional[str] = None
    split_lines: Optional[bool] = None
    delay_seconds: Optional[int] = Field(None, ge=0, le=60)
    human_typing_simulation: Optional[bool] = None
    cooldown_minutes: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class AutomationRuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    brand_id: Optional[str] = None
    channels: list[str]
    trigger_type: str
    match_type: str
    keywords: list[str]
    response_text: str
    response_media_url: Optional[str] = None
    split_lines: bool = True
    delay_seconds: int = 2
    human_typing_simulation: bool = True
    cooldown_minutes: int
    is_active: bool
    created_by: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AutomationExecutionLogResponse(BaseModel):
    id: uuid.UUID
    rule_id: uuid.UUID
    conversation_id: uuid.UUID
    customer_id: uuid.UUID
    executed_at: datetime
    rule_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
