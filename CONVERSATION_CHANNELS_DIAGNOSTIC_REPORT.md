# CONVERSATION_CHANNELS_DIAGNOSTIC_REPORT.md — Forensic Audit Report

## 1. Executive Summary

This diagnostic investigation audited why filtering by **"واتساب (WhatsApp)"** or **"إنستجرام (Instagram)"** displays `"لا توجد محادثات متطابقة (0 من 8 محادثة)"` in `ConversationList.tsx`.

Executing live database census, API query testing, and webhook pipeline tracing revealed:
1. **Database Reality**: PostgreSQL currently contains **8 Messenger conversations**, **0 WhatsApp conversations**, and **0 Instagram conversations**.
2. **Page ID Webhook Filter Bug**: `process_inbound_webhook` strictly compared `entry.id` against `META_PAGE_ID`. Incoming WhatsApp webhooks carry `WHATSAPP_WABA_ID` as `entry.id`, causing WhatsApp webhooks to be dropped.
3. **UI Active Conversation Retention**: When switching filters to a channel with 0 conversations, `useCrmStore.ts` empties `conversations[]` but leaves `activeConversationId` attached to the old Messenger conversation, preventing `ChatCanvas.tsx` from displaying the empty state view.

---

## 2. Layer-by-Layer Forensic Findings

### A. Database Census Results (`conversations` & `customer_identities`)

```text
=====================================================
DATABASE CHANNEL CENSUS
=====================================================
Conversations Table:
- ChannelEnum.MESSENGER : 8 Conversations (100%)
- ChannelEnum.WHATSAPP  : 0 Conversations (0%)
- ChannelEnum.INSTAGRAM : 0 Conversations (0%)

Customer Identities Table:
- ChannelEnum.MESSENGER : 8 Records (100%)
- ChannelEnum.WHATSAPP  : 0 Records
- ChannelEnum.INSTAGRAM : 0 Records
=====================================================
```

---

### B. API Query Parameter & Enum Case Sensitivity

| Query String | HTTP Status | Response Payload | Analysis |
|---|---|---|---|
| `GET /api/v1/conversations?channel=messenger` | **200 OK** | `{"total": 8, "items": [...]}` | Valid lowercase enum match. Returns 8 Messenger conversations. |
| `GET /api/v1/conversations?channel=whatsapp` | **200 OK** | `{"total": 0, "items": []}` | Valid query, correctly reflects 0 WhatsApp conversations in DB. |
| `GET /api/v1/conversations?channel=instagram` | **200 OK** | `{"total": 0, "items": []}` | Valid query, correctly reflects 0 Instagram conversations in DB. |
| `GET /api/v1/conversations?channel=WHATSAPP` | **422 Unprocessable** | `{"detail": "Input should be 'messenger', 'whatsapp'..."}` | FastAPI `ChannelEnum` validates against lowercase strings. |
| `GET /api/v1/conversations?channel=all` | **422 Unprocessable** | `{"detail": "Input should be 'messenger'..."}` | `"all"` is a UI filter value; backend expects omitted `channel` parameter for all channels. |

---

### C. Webhook Pipeline Filter Bug (`meta_import_service.py` L421-425)

```python
# File: backend/app/services/meta_import_service.py
for entry in entries:
    entry_page_id = str(entry.get("id", ""))
    if expected_page_id and expected_page_id.strip() and entry_page_id and entry_page_id.strip() != expected_page_id.strip():
        logger.warning("Meta webhook: ignoring entry for page_id '%s' (expected '%s')", entry_page_id, expected_page_id)
        continue
```
- **Diagnostic Finding**: `expected_page_id` is set to `META_PAGE_ID` (`1302055352987458`).
- When a WhatsApp Cloud webhook event arrives, `entry.id` contains the `WHATSAPP_WABA_ID` (`948301847582019`).
- Because `entry.id` (`948301847582019`) != `META_PAGE_ID` (`1302055352987458`), WhatsApp webhooks are logged as warnings and dropped!

---

### D. UI Canvas Active Conversation Retention Bug (`useCrmStore.ts`)

- When the agent selects "واتساب" or "إنستجرام" in `TopBar.tsx`, `fetchConversations()` sends `GET /api/v1/conversations?channel=whatsapp`.
- Backend returns `items: [], total: 0`.
- `useCrmStore.ts` sets `conversations: []`.
- **Bug**: `activeConversationId` remains set to the previously selected Messenger conversation ID.
- Because `activeConversationId` is not cleared when filtering yields 0 results, `ChatCanvas.tsx` continues rendering the previous Messenger conversation rather than an empty state canvas.

---

## 3. Action Plan for Phase 2 Implementation

1. **Seed Multi-Channel Test Conversations**:
   - Create a database seeder script to populate realistic WhatsApp (`+201001234567`) and Instagram Direct (`@luxira_vip`) conversations and messages in PostgreSQL.
2. **Fix Webhook Page ID Validation (`meta_import_service.py`)**:
   - Allow `entry.id` to match `META_PAGE_ID`, `WHATSAPP_WABA_ID`, or `INSTAGRAM_ACCOUNT_ID`.
3. **Fix API Parameter Lowercased Normalization (`conversations.py`)**:
   - Normalize string parameter `channel` to lower case before enum parsing (support `all`, `whatsapp`, `WHATSAPP`).
4. **Fix UI Active Conversation State (`useCrmStore.ts` & `ConversationList.tsx`)**:
   - When filtering returns 0 conversations, reset `activeConversationId = null` or clear `selectedConversation` so `ChatCanvas.tsx` renders the empty state canvas.
