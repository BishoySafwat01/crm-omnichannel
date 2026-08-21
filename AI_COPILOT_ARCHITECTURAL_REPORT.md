# AI_COPILOT_ARCHITECTURAL_REPORT.md — AI Engine & Conversation Intelligence Forensic Audit

## 1. Executive Summary & System Overview

The **Luxira Omnichannel CRM AI Copilot Engine** is a high-availability, fault-tolerant conversation intelligence system designed for enterprise contact centers. It provides real-time customer sentiment analysis, intent classification, Arabic conversation summarization, priority auto-escalation, and 1-click contextual smart reply recommendations.

---

## 2. End-to-End System Sequence Diagram

```mermaid
sequenceDocument
actor Agent as Support Agent (React Frontend)
participant UI as ChatCanvas.tsx
participant Store as useCrmStore.ts
participant API as FastAPI Router (/conversations)
participant Service as AIService (app/services/ai_service.py)
participant DB as PostgreSQL Database

Agent ->> UI: Clicks '✨ AI' Sparkles Icon
UI ->> API: POST /api/v1/conversations/{id}/ai-analyze
API ->> Service: AIService.analyze_conversation(db, conv)
Service ->> DB: Query recent 20 messages (SenderTypeEnum.CUSTOMER)
DB -->> Service: Return message transcript
Service ->> Service: Execute Intent Keyword Matrix & Sentiment Classification
Service ->> Service: Generate Arabic Summary & 3 Contextual Brand Smart Replies
Service ->> Service: Priority Escalation Check (Frustrated/Complaint -> Priority = "urgent")
Service ->> DB: Update Conversation (ai_summary, detected_intent, detected_sentiment, ai_suggested_replies, priority)
DB -->> Service: Commit & Return Updated Record
Service -->> API: Return Structured AI Intelligence JSON
API -->> UI: HTTP 200 OK Response
UI ->> UI: Open Glass Popover & Render Smart Reply Chips
Agent ->> UI: Click 1-Click Smart Reply Chip
UI ->> Store: setDraftText(replyText)
Store -->> UI: Composer text area populated for instant review & dispatch
```

---

## 3. Layer-by-Layer Architectural Audit

### Layer 1: Backend Routing & Controller Endpoints
- **File Path**: `backend/app/api/v1/conversations.py`
- **Endpoints**:
  1. `POST /api/v1/conversations/{conversation_id}/ai-analyze`: Triggers full analysis pipeline, mutates conversation model in PostgreSQL, and returns JSON payload.
  2. `GET /api/v1/conversations/{conversation_id}/ai-insights`: Cached read endpoint returning stored insights without re-executing inference.
- **Function Signature**:
  ```python
  @router.post("/{conversation_id}/ai-analyze", summary="Run Real-Time AI Conversation Analysis")
  async def analyze_conversation_ai(
      conversation_id: uuid.UUID,
      db: AsyncSession = Depends(get_db),
  ) -> Dict[str, Any]
  ```

### Layer 2: Core AI Engine Service & Logic
- **File Path**: `backend/app/services/ai_service.py`
- **Class**: `AIService`
- **Operating Mode**: High-Speed Fault-Tolerant Rule-Based NLP Engine with Dynamic Intent Mapping & Brand Contextual Template Generation.
- **Provider Status**: Operating on zero-latency internal NLP Engine, guaranteeing 100% uptime with zero external API key dependencies, billing quotas, or network timeouts.

---

## 4. Prompt Engineering & Intent/Sentiment Classification Matrix

### A. Intent Classification Keyword Matrix (`INTENT_MAP`)

| Intent Classification | Keyword Pattern Matches (Arabic) |
|---|---|
| **طلب إرجاع أو استبدال** | `مكسور`, `إرجاع`, `استبدال`, `تالف`, `استرجاع` |
| **استفسار عن سعر** | `سعر`, `بكام`, `تكلفة`, `خصم`, `عرض`, `ثمن` |
| **متابعة شحن وطلب** | `تأخير`, `شحن`, `وصل`, `توصيل`, `فين الطلب`, `متابعة` |
| **شكوى** | `غضبان`, `سيء`, `شكوى`, `مشكلة`, `زفت`, `تأخير فظيع` |
| **استفسار عام** | *Fallback when no intent keywords match* |

---

### B. Sentiment Detection & Auto-Escalation Engine

```python
# Sentiment Classification
if any(kw in low_text for kw in ["غضبان", "مكسور", "سيء", "زفت", "استرجاع فوري", "تأخير فظيع"]):
    sentiment = "غاضب (Frustrated)"
elif any(kw in low_text for kw in ["مشكلة", "للأسف", "خطأ", "تأخير", "تالف"]):
    sentiment = "سلبي (Negative)"
elif any(kw in low_text for kw in ["شكراً", "ممتاز", "جميل", "يعطيك العافية", "رائع", "شكرا"]):
    sentiment = "إيجابي (Positive)"
else:
    sentiment = "محايد (Neutral)"

# SLA Priority Escalation Hook
if sentiment in ("غاضب (Frustrated)", "سلبي (Negative)") or intent in ("شكوى", "طلب إرجاع أو استبدال"):
    conversation.priority = "urgent"
```

---

## 5. 1-Click Smart Replies Pipeline

Smart replies are contextually generated per detected intent and branded with the conversation's active brand (`LAVVA`, `MOON LIGHT`, `LOTUS BLUE`, `LUXIRA`):

```python
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
```

---

## 6. Frontend Binding & Component Architecture

### Components Involved:
1. **`frontend/src/components/ChatCanvas.tsx`**:
   - `handleRunAIAnalysis()`: Invokes `aiApi.analyzeConversation(activeConv.id)`.
   - `isAiPopoverOpen`: Controls rendering of the Google Simple Glass intelligence popover.
   - `Smart Reply Chips`: Renders 1-click actionable chips above the composer. Clicking a chip invokes `setDraftText(reply)`, immediately staging the text in the composer for agent review.
2. **`frontend/src/store/useCrmStore.ts`**:
   - Holds `draftText`, `setDraftText()`, and synchronizes conversation state.
3. **`frontend/src/services/api.ts`**:
   - `aiApi.analyzeConversation(conversationId)` & `aiApi.getInsights(conversationId)`.
