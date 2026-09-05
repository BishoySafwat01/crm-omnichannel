import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserRole


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    brand_access: list[Any] = Field(default_factory=list)
    channel_access: list[Any] = Field(default_factory=lambda: ["ALL"])
    is_active: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserCreateRequest(BaseModel):
    email: str = Field(..., min_length=3, description="User email address")
    password: str = Field(..., min_length=6)
    full_name: str
    role: UserRole = UserRole.AGENT
    brand_access: list[str] = Field(default_factory=lambda: ["LAVVA"])
    channel_access: list[str] = Field(default_factory=lambda: ["ALL"])
