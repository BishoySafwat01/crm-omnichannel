import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ports.llm_port import LLMProviderPort
from app.infrastructure.llm.groq_adapter import GroqAdapter
from app.models.conversation import Conversation
from app.models.message import Message
from app.services.llm.fallback_engine import analyze_fallback

logger = logging.getLogger(__name__)


class AIService:
    """
    Enterprise AI Engine Service for CRM Copilot Intelligence.

    Operates statelessly following Clean Architecture principles.
    Accepts an optional LLMProviderPort via method dependency injection for test mocking
    and dynamic provider swapping, defaulting to GroqAdapter.
    """

    @classmethod
    async def analyze_conversation(
        cls,
        session: AsyncSession,
        conversation: Conversation,
        llm_provider: Optional[LLMProviderPort] = None,
    ) -> Dict[str, Any]:
        """
        Analyzes recent conversation transcript using configured LLMProviderPort
        (defaulting to GroqAdapter) with automatic fallback to local rule-based NLP engine.

        Stateless Dependency Injection:
            Pass `llm_provider` to override the default GroqAdapter with an alternative
            adapter or mock implementation during testing.
        """
        provider: LLMProviderPort = llm_provider or GroqAdapter()

        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.asc())
            .limit(20)
        )
        res = await session.execute(stmt)
        raw_messages = list(res.scalars().all())

        brand_name = conversation.brand or "LUXIRA"

        formatted_messages: List[Dict[str, str]] = []
        for msg in raw_messages:
            sender_val = msg.sender_type.value if hasattr(msg.sender_type, "value") else str(msg.sender_type)
            formatted_messages.append({
                "sender": sender_val,
                "text": msg.text or "",
            })

        transcript = "\n".join(f"[{m['sender']}]: {m['text']}" for m in formatted_messages)

        # Execute LLM Analysis via injected provider with graceful fallback
        try:
            ai_res = await provider.analyze_conversation(
                transcript=transcript,
                brand_name=brand_name,
                messages=formatted_messages,
            )
        except Exception as exc:
            logger.warning(
                "LLM provider invocation failed (%s). Failing over to local rule-based NLP engine...",
                exc,
            )
            ai_res = analyze_fallback(formatted_messages, brand_name)

        summary = ai_res.get("summary", "محادثة جارية مع العميل.")
        intent = ai_res.get("intent", "استفسار عام")
        sentiment = ai_res.get("sentiment", "محايد (Neutral)")
        replies = ai_res.get("suggested_replies", [
            f"أهلاً بك في {brand_name}! كيف يمكنني مساعدتك اليوم؟",
            "يسعدنا تواصلك معنا، كيف أستطيع خدمتك؟",
            "أهلاً بك! تفضل باستفسارك وسأقوم بالرد فوراً.",
        ])
        is_urgent = ai_res.get("is_urgent", False)

        # Priority Auto-Escalation Hook for Frustrated / Complaint / Urgent Conversations
        updated_priority = conversation.priority
        if is_urgent or sentiment in ("غاضب (Frustrated)", "سلبي (Negative)") or intent in ("شكوى", "طلب إرجاع أو استبدال"):
            conversation.priority = "urgent"
            updated_priority = "urgent"

        conversation.ai_summary = summary
        conversation.detected_intent = intent
        conversation.detected_sentiment = sentiment
        conversation.ai_suggested_replies = replies

        # Auto-Persist Extracted Location to Customer Profile if Present
        detected_loc = ai_res.get("detected_location")
        if detected_loc and isinstance(detected_loc, str) and detected_loc.strip() and detected_loc.lower() != "null":
            clean_loc = detected_loc.strip()
            if conversation.customer_id:
                from app.models.customer import Customer
                cust_res = await session.execute(select(Customer).where(Customer.id == conversation.customer_id))
                cust_obj = cust_res.scalar_one_or_none()
                if cust_obj:
                    cust_obj.country = clean_loc
                    cust_obj.location = clean_loc
                    session.add(cust_obj)

        await session.commit()
        await session.refresh(conversation)

        logger.info(
            "✨ [AIService] Analyzed Conv %s | Intent: %s | Sentiment: %s | Loc: %s | Priority: %s",
            conversation.id,
            intent,
            sentiment,
            detected_loc,
            updated_priority,
        )

        return {
            "conversation_id": str(conversation.id),
            "ai_summary": summary,
            "detected_intent": intent,
            "detected_sentiment": sentiment,
            "ai_suggested_replies": replies,
            "updated_priority": updated_priority,
        }
