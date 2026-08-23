import uuid
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict


class SocialCommentBase(BaseModel):
    brand: str = "LUXIRA"
    platform: str = "facebook"
    post_id: str
    post_title: str
    post_thumbnail: Optional[str] = None
    author_name: str
    author_avatar: Optional[str] = None
    comment_text: str
    sentiment: str = "positive"
    sentiment_score: int = 50
    moderation_status: str = "active"
    ai_action_reason: Optional[str] = None
    auto_replied_text: Optional[str] = None
    likes_count: int = 0
    replies_count: int = 0
    is_direct_message_sent: bool = False


class SocialCommentResponse(SocialCommentBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SocialCommentListResponse(BaseModel):
    items: List[SocialCommentResponse] = []
    total: int = 0
    page: int = 1
    page_size: int = 50
    total_pages: int = 1


class CommentStatsResponse(BaseModel):
    total_comments: int = 0
    auto_deleted_or_hidden: int = 0
    auto_replied_dms: int = 0
    positive_rate: int = 50
    active_auto_delete_enabled: bool = True


class UpdateCommentStatusRequest(BaseModel):
    status: str # active, auto_deleted, auto_hidden, replied, flagged
    reason: Optional[str] = None


class ReplyCommentRequest(BaseModel):
    reply_text: str
    send_dm: bool = False
    dm_text: Optional[str] = None


class ModerationSettingsPayload(BaseModel):
    auto_delete_negative: bool = True
    auto_hide_spam: bool = True
    auto_reply_inquiries: bool = True
    strictness_level: str = "strict"
    action_for_negative: str = "delete_and_dm"
    negative_keywords: List[str] = []
    inquiry_keywords: List[str] = []
    inquiry_reply_text: str = ""
    inquiry_dm_text: str = ""
    negative_dm_apology_text: str = ""


class ModerationLogResponse(BaseModel):
    id: uuid.UUID
    comment_id: Optional[uuid.UUID] = None
    comment_author: str = ""
    action_type: str
    performed_by: str
    details: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AiSimulationRequest(BaseModel):
    comment_text: str
    brand: Optional[str] = "all"


class AiSimulationResponse(BaseModel):
    sentiment: str
    sentiment_score: int
    matched_action: str
    matched_keywords: List[str] = []
    generated_reply: Optional[str] = None
    generated_dm: Optional[str] = None
    decision_reason: str
