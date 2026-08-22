# SYSTEM_DATAFLOW_AUDIT_REPORT.md — End-to-End Dataflow Forensic Audit

## 1. Executive Summary & Diagnostic Findings

A strict read-only forensic audit was performed across the Meta Webhook receiver, `MetaImportService`, PostgreSQL database tables (`conversations`, `messages`, `raw_events`, `social_comments`), and the React `CommentsHub.tsx` frontend component.

### Summary Dataflow Census

| Component / Pipeline | Status | Current DB Census | Dataflow & Handler Verification |
|---|---|---|---|
| **Direct Chat Ingestion** | ✅ **Active** | 8 `MESSENGER` Conversations, 16 Messages | Ingested via `/api/v1/meta/webhook`, normalized, persisted to DB, broadcast via WebSockets |
| **Comments Webhook Pipeline** | ✅ **Wired** | 0 `social_comments` records | `MetaImportService.handle_comment_webhook` handles `field=="feed"` & `field=="comments"` webhooks |
| **Comments Database State** | ⚠️ **Empty** | 0 `social_comments` records | Table `social_comments` exists, but 0 live webhooks or seed comments have been populated |
| **Comments API & Frontend** | ✅ **Healthy** | Returns HTTP 200 `[]` | `GET /api/v1/comments` and `CommentsHub.tsx` function correctly; empty state rendered due to 0 DB records |

---

## 2. Requirement-by-Requirement Forensic Trace

### Trace 1: Direct Chat Messaging Lifecycle
1. **Webhook Ingestion (`backend/app/api/v1/meta.py`)**:
   - `POST /api/v1/meta/webhook` receives inbound JSON payloads from Meta Graph API / Ngrok.
   - Validates `x-hub-signature-256` if `META_APP_SECRET` is configured.
   - Passes payload to `MetaImportService.process_inbound_webhook(session, raw_payload)`.
2. **Customer & Identity Resolution (`backend/app/services/customer_service.py`)**:
   - Checks `CustomerIdentity` table for matching `(provider="meta", channel=norm_event.channel, external_user_id=sender_psid)`.
   - Auto-creates new `Customer` and `CustomerIdentity` if not found.
3. **Database Commitment (`backend/app/services/message_service.py`)**:
   - Creates `Message` row in PostgreSQL with `external_message_id`, `sender_type`, `text`, `metadata_`.
   - Updates `Conversation` attributes (`last_message_at`, `last_activity_at`, `unread_count`).
   - Runs `extract_location_from_text` to automatically detect Egyptian/Gulf governorates and update `customer.country` / `customer.location`.
4. **Automation & Escalation (`backend/app/services/automation_service.py`)**:
   - Evaluates active `AutomationRule` keywords.
   - If unmatched, escalates `Conversation.priority` to `urgent`.
5. **Real-time WebSockets Broadcast (`backend/app/api/v1/ws.py`)**:
   - Dispatches `NEW_MESSAGE` event over WebSocket connections to update React frontend in real-time.

---

### Trace 2: Comments Webhook & Moderation Pipeline
1. **Webhook Handler (`backend/app/services/meta_import_service.py`)**:
   - `process_inbound_webhook` checks `entry[].changes[]` items.
   - If `field == "feed"` or `field == "comments"` or `item == "comment"`:
     - Dispatches to `MetaImportService.handle_comment_webhook(session, item)`.
2. **Sentiment & Auto-Moderation Evaluation**:
   - Analyzes text for toxic/profane keywords (`شتيمة`, `احتيال`, `نصب`, `scam`, `spam`).
   - Assigns `sentiment` (`toxic`, `negative`, `neutral`, `positive`).
   - If `toxic`: Sets `is_hidden = True` and calls `MetaClient.hide_comment(comment_id, is_hidden=True)` via Meta Graph API.
3. **Database State**:
   - Saves record into `social_comments` table.
   - Current database count: **0 records** (because no live comment webhooks have been received from Meta yet, and no comment seeder script has been executed).

---

### Trace 3: Frontend Comments Hub & Brand Filtering
1. **API Endpoint (`backend/app/api/v1/comments.py`)**:
   - `GET /api/v1/comments`: Supports query filters (`brand`, `channel`, `sentiment`, `status`).
   - Tested HTTP GET `/api/v1/comments` -> Returns `200 OK` with `[]`.
2. **Frontend Hydration (`frontend/src/components/CommentsHub.tsx`)**:
   - Queries `commentsApi.getComments()`.
   - Since PostgreSQL currently has 0 rows in `social_comments`, `CommentsHub.tsx` displays the clean empty state: *"لا توجد تعليقات مطابقة لخيارات التصفية المختارة."*

---

## 3. Recommended Remediation & Seeding Plan

To allow the user to view, test, and moderate social post comments immediately in `CommentsHub.tsx`:

1. **Create Social Comments Seeder Script (`backend/scripts/seed_social_comments.py`)**:
   - Seed realistic Facebook Page & Instagram post comments (positive product inquiries, pricing questions, and toxic/negative comments auto-hidden by AI moderation).
2. **Execute Seeder & Verify Frontend Hydration**:
   - Populate PostgreSQL `social_comments` table and verify live rendering in `CommentsHub.tsx`.
