import uuid
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class TeamMemberCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="User password")
    full_name: str = Field(..., min_length=2, max_length=255)
    role: UserRole = UserRole.AGENT
    brand_access: List[str] = Field(default_factory=lambda: ["LAVVA"])
    is_active: bool = True


class TeamMemberUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    brand_access: Optional[List[str]] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=6)


class TeamMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: str
    brand_access: List[Any]
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    active_conversations_count: int = 0


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    ip_address: Optional[str] = None
    created_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None


class AuditLogListResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
