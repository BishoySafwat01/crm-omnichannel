import uuid
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class AIAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    conversation_id: uuid.UUID
    ai_summary: Optional[str] = None
    detected_intent: Optional[str] = None
    detected_sentiment: Optional[str] = None
    ai_suggested_replies: List[str] = []
    updated_priority: str = "normal"
