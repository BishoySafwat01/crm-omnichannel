import logging
from typing import Any, Dict, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation
from app.models.message import Message
from app.services.llm.groq_client import analyze_with_groq_cascade

logger = logging.getLogger(__name__)


class AIService:
    """Enterprise AI Engine Service for CRM Copilot Intelligence with 3-Tier Groq Cascade."""

    @staticmethod
    async def analyze_conversation(
        session: AsyncSession,
        conversation: Conversation,
    ) -> Dict[str, Any]:
        """
        Analyzes recent conversation transcript using 3-Tier Groq AI Cascade:
        Tier 1: openai/gpt-oss-120b
        Tier 2: openai/gpt-oss-20b
        Tier 3: Local Rule-Based Heuristic NLP Fallback Engine
        """
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

        # Execute 3-Tier Cascading AI Analysis
        ai_res = await analyze_with_groq_cascade(formatted_messages, brand_name)

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
            "✨ [AIService Cascade] Analyzed Conv %s | Intent: %s | Sentiment: %s | Loc: %s | Priority: %s",
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
