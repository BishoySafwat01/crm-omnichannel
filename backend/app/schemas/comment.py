import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SocialCommentResponse(BaseModel):
    id: uuid.UUID
    post_id: str
    post_title: Optional[str] = None
    post_url: Optional[str] = None
    post_thumbnail: Optional[str] = None
    comment_id: str
    author_name: str
    author_id: str
    text: str
    channel: str
    brand: Optional[str] = None
    sentiment: str
    is_hidden: bool
    is_deleted: bool
    auto_replied: bool
    reply_text: Optional[str] = None
    dm_thread_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SocialCommentReplyRequest(BaseModel):
    message: str = Field(..., min_length=1)
    private_dm: bool = Field(False)


class SocialCommentHideRequest(BaseModel):
    is_hidden: bool = Field(True)
