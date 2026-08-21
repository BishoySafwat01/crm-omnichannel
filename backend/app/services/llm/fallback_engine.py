"""
Local Offline Rule-Based NLP Fallback Engine (Tier 3).
Guarantees 100% availability and 0 HTTP 500 errors when cloud LLMs are unconfigured or unreachable.
"""

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

INTENT_MAP = [
    (["مكسور", "إرجاع", "استبدال", "تالف", "استرجاع", "return", "refund", "damaged"], "طلب إرجاع أو استبدال"),
    (["سعر", "بكام", "تكلفة", "خصم", "عرض", "ثمن", "price", "cost", "discount"], "استفسار عن سعر"),
    (["تأخير", "شحن", "وصل", "توصيل", "فين الطلب", "متابعة", "shipping", "delivery", "track"], "متابعة شحن وطلب"),
    (["غضبان", "سيء", "شكوى", "مشكلة", "زفت", "تأخير فظيع", "bad", "terrible", "complaint"], "شكوى"),
]


def _generate_replies_for_intent(intent: str, brand_name: str) -> List[str]:
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


def analyze_fallback(messages: List[Dict[str, str]], brand_name: str) -> Dict[str, Any]:
    """
    Tier 3: Local Offline Rule-Based NLP Analyzer.
    """
    if not messages:
        return {
            "summary": "محادثة جديدة بدون رسائل سابقة. في انتظار استفسار العميل.",
            "intent": "استفسار عام",
            "sentiment": "محايد (Neutral)",
            "suggested_replies": [
                f"أهلاً بك في {brand_name}! كيف يمكنني مساعدتك اليوم؟",
                "يسعدنا تواصلك معنا، كيف أستطيع خدمتك؟",
                "أهلاً بك! تفضل باستفسارك وسأقوم بالرد فوراً.",
            ],
            "is_urgent": False,
        }

    customer_texts = [m["text"] for m in messages if m.get("text") and m.get("sender") in ("customer", "CUSTOMER")]
    combined_cust_text = " ".join(customer_texts)
    last_cust_text = customer_texts[-1] if customer_texts else ""

    # 1. Intent Detection
    intent = "استفسار عام"
    for keywords, matched_intent in INTENT_MAP:
        if any(kw in combined_cust_text.lower() for kw in keywords):
            intent = matched_intent
            break

    # 2. Sentiment Detection
    low_text = combined_cust_text.lower()
    if any(kw in low_text for kw in ["غضبان", "مكسور", "سيء", "زفت", "استرجاع فوري", "تأخير فظيع", "terrible", "bad"]):
        sentiment = "غاضب (Frustrated)"
    elif any(kw in low_text for kw in ["مشكلة", "للأسف", "خطأ", "تأخير", "تالف", "issue", "delay"]):
        sentiment = "سلبي (Negative)"
    elif any(kw in low_text for kw in ["شكراً", "ممتاز", "جميل", "يعطيك العافية", "رائع", "شكرا", "thanks", "great"]):
        sentiment = "إيجابي (Positive)"
    else:
        sentiment = "محايد (Neutral)"

    # 3. Executive Summary
    if last_cust_text:
        summary = f"العميل يتواصل بخصوص {intent}. الرسالة الأخيرة: '{last_cust_text[:90]}'."
    else:
        summary = f"المحادثة جارية مع العميل بخصوص {intent}."

    # 4. Contextual Smart Replies
    replies = _generate_replies_for_intent(intent, brand_name)

    # 5. Urgency Calculation
    is_urgent = sentiment in ("غاضب (Frustrated)", "سلبي (Negative)") or intent in ("شكوى", "طلب إرجاع أو استبدال")

    from app.services.location_extractor import extract_location_from_text
    all_texts = " ".join([m.get("text", "") for m in messages if m.get("text")])
    detected_location = extract_location_from_text(all_texts)

    logger.info("✨ [Tier 3 Fallback Engine] Intent: %s | Sentiment: %s | Urgent: %s | Loc: %s", intent, sentiment, is_urgent, detected_location)

    return {
        "summary": summary,
        "intent": intent,
        "sentiment": sentiment,
        "detected_location": detected_location,
        "suggested_replies": replies,
        "is_urgent": is_urgent,
    }
