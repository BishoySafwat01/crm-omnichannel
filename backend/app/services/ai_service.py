import logging
from typing import Any, Dict, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation
from app.models.enums import SenderTypeEnum
from app.models.message import Message

logger = logging.getLogger(__name__)


class AIService:
    """Fault-Tolerant AI Engine Service for CRM Copilot Intelligence."""

    INTENT_MAP = [
        (["مكسور", "إرجاع", "استبدال", "تالف", "استرجاع"], "طلب إرجاع أو استبدال"),
        (["سعر", "بكام", "تكلفة", "خصم", "عرض", "ثمن"], "استفسار عن سعر"),
        (["تأخير", "شحن", "وصل", "توصيل", "فين الطلب", "متابعة"], "متابعة شحن وطلب"),
        (["غضبان", "سيء", "شكوى", "مشكلة", "زفت", "تأخير فظيع"], "شكوى"),
    ]

    @staticmethod
    async def analyze_conversation(
        session: AsyncSession,
        conversation: Conversation,
    ) -> Dict[str, Any]:
        """Analyzes recent transcript to extract summary, intent, sentiment, and 3 smart replies."""
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.asc())
            .limit(20)
        )
        res = await session.execute(stmt)
        messages = list(res.scalars().all())

        brand_name = conversation.brand or "LUXIRA"

        if not messages:
            summary = "محادثة جديدة بدون رسائل سابقة. في انتظار استفسار العميل."
            intent = "استفسار عام"
            sentiment = "محايد (Neutral)"
            replies = [
                f"أهلاً بك في {brand_name}! كيف يمكنني مساعدتك اليوم؟",
                "يسعدنا تواصلك معنا، كيف أستطيع خدمتك؟",
                "أهلاً بك! تفضل باستفسارك وسأقوم بالرد فوراً.",
            ]
        else:
            customer_texts = [
                m.text for m in messages if m.sender_type == SenderTypeEnum.CUSTOMER and m.text
            ]
            combined_cust_text = " ".join(customer_texts)
            last_cust_text = customer_texts[-1] if customer_texts else ""

            # 1. Intent Detection
            intent = "استفسار عام"
            for keywords, matched_intent in AIService.INTENT_MAP:
                if any(kw in combined_cust_text for kw in keywords):
                    intent = matched_intent
                    break

            # 2. Sentiment Detection
            low_text = combined_cust_text.lower()
            if any(kw in low_text for kw in ["غضبان", "مكسور", "سيء", "زفت", "استرجاع فوري", "تأخير فظيع"]):
                sentiment = "غاضب (Frustrated)"
            elif any(kw in low_text for kw in ["مشكلة", "للأسف", "خطأ", "تأخير", "تالف"]):
                sentiment = "سلبي (Negative)"
            elif any(kw in low_text for kw in ["شكراً", "ممتاز", "جميل", "يعطيك العافية", "رائع", "شكرا"]):
                sentiment = "إيجابي (Positive)"
            else:
                sentiment = "محايد (Neutral)"

            # 3. Summary Generation
            if last_cust_text:
                summary = f"العميل يتواصل بخصوص {intent}. الرسالة الأخيرة: '{last_cust_text[:90]}'."
            else:
                summary = f"المحادثة جارية مع العميل بخصوص {intent}."

            # 4. Contextual Smart Replies Generation
            replies = AIService._generate_replies_for_intent(intent, brand_name, last_cust_text)

        # Priority Auto-Escalation Hook for Frustrated / Complaint Conversations
        updated_priority = conversation.priority
        if sentiment in ("غاضب (Frustrated)", "سلبي (Negative)") or intent in ("شكوى", "طلب إرجاع أو استبدال"):
            conversation.priority = "urgent"
            updated_priority = "urgent"

        conversation.ai_summary = summary
        conversation.detected_intent = intent
        conversation.detected_sentiment = sentiment
        conversation.ai_suggested_replies = replies

        await session.commit()
        await session.refresh(conversation)

        logger.info(
            "✨ [AI Engine] Analyzed Conv %s | Intent: %s | Sentiment: %s | Priority: %s",
            conversation.id,
            intent,
            sentiment,
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

    @staticmethod
    def _generate_replies_for_intent(intent: str, brand_name: str, last_text: str) -> List[str]:
        if intent == "طلب إرجاع أو استبدال":
            return [
                f"أهلاً بك! نأسف جداً لذلك، سنقوم ببدء إجراءات الإستبدال والتعويض فوراً لرضاكم في {brand_name}.",
                "يرجى تزويدنا برقم الطلب وصورة للمنتج لنتمكن من شحن بديل فوراً بدون أي تكلفة.",
                "تم تحويل طلبك للقسم المختص للمتابعة العاجلة والشحن الفوري.",
            ]
        elif intent == "استفسار عن سعر":
            return [
                f"أهلاً بك! يسعدنا اهتمامك بمنتجات {brand_name}، يتوفر خصم خاص حالياً شامل الشحن.",
                "السعر حالياً يشمل العرض المميز لفترة محدودة، هل ترغب في حجز طلبك الآن؟",
                "يتوفر لدينا تفاصيل ومواصفات المنتج مع ضمان شامل، هل أساعدك في إتمام الطلب؟",
            ]
        elif intent == "متابعة شحن وطلب":
            return [
                "أهلاً بك! جاري متابعة حالة الشحنة مع شركة التوصيل وسنزودك برقم التتبع خلال دقائق.",
                "طلبكم في مرحلة التجهيز النهائية وسيصلكم خلال الموعد المحدد بإذن الله.",
                "يرجى تأكيد العنوان ورقم التواصل للتنسيق مع مندوب الشحن فوراً.",
            ]
        elif intent == "شكوى":
            return [
                f"أهلاً بك! نعتذر بشدة عن أي إزعاج، فريق {brand_name} يعمل على حل المشكلة فوراً.",
                "حقك علينا كامل! يرجى توضيح التفاصيل وسنقوم بالمعالجة العاجلة وتوفير التعويض المناسب.",
                "تم رفع الشكوى للإدارة للمتابعة المباشرة وتأكيد التواصل معكم اليوم.",
            ]
        else:
            return [
                f"أهلاً بك في {brand_name}! يسعدنا تواصلك معنا، كيف يمكننا مساعدتك اليوم؟",
                "شكراً لتواصلك! تفضل باستفسارك وسنقوم بخدمتك فوراً.",
                "أهلاً بك، نحن هنا لمساعدتك وتوفير أفضل تجربة تسوق لك.",
            ]
