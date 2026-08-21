# AUTHORIZATION_MATRIX.md — Complete 66-Endpoint Authorization Matrix

| Endpoint | Method | Current Auth | Current Role | Intended Auth | Intended Role | Resource Check | External Side Effect | Risk Level |
|---|---|---|---|---|---|---|---|---|
| `/api/v1/auth/login` | `POST` | None | Public | None | Public | Credentials verify | None | LOW |
| `/api/v1/auth/logout` | `POST` | Bearer | Any | Bearer | Any | None | None | LOW |
| `/api/v1/auth/me` | `GET` | Bearer | Any | Bearer | Any | User profile | None | LOW |
| `/api/v1/customers` | `GET` | None | Public | Bearer | Agent / Admin | None (Missing) | None | **HIGH** |
| `/api/v1/customers/locations` | `GET` | None | Public | Bearer | Agent / Admin | None | None | MEDIUM |
| `/api/v1/customers/{customer_id}` | `GET` | None | Public | Bearer | Agent / Admin | Customer existence | None | **HIGH** |
| `/api/v1/customers/{customer_id}` | `PATCH` | None | Public | Bearer | Agent / Admin | Customer existence | None | **HIGH** |
| `/api/v1/customers/{customer_id}` | `PUT` | None | Public | Bearer | Agent / Admin | Customer existence | None | **HIGH** |
| `/api/v1/customers/{customer_id}/identities` | `GET` | None | Public | Bearer | Agent / Admin | Identity list | None | MEDIUM |
| `/api/v1/customers/{customer_id}/tags` | `POST` | None | Public | Bearer | Agent / Admin | Customer tag update | None | **HIGH** |
| `/api/v1/customers/{customer_id}/timeline` | `GET` | None | Public | Bearer | Agent / Admin | Timeline events | None | MEDIUM |
| `/api/v1/customers/{customer_id}/notes` | `GET` | None | Public | Bearer | Agent / Admin | Customer notes | None | **HIGH** |
| `/api/v1/customers/{customer_id}/notes` | `POST` | None | Public | Bearer | Agent / Admin | Note creation | None | **HIGH** |
| `/api/v1/customers/{customer_id}/notes/{note_id}` | `DELETE` | None | Public | Bearer | Agent / Admin | Note deletion | None | **HIGH** |
| `/api/v1/admin/automations` | `GET` | Bearer | Admin | Bearer | Admin | None | None | LOW |
| `/api/v1/admin/automations` | `POST` | Bearer | Admin | Bearer | Admin | Rule creation | None | LOW |
| `/api/v1/admin/automations/{rule_id}` | `PATCH` | Bearer | Admin | Bearer | Admin | Rule update | None | LOW |
| `/api/v1/admin/automations/{rule_id}` | `DELETE` | Bearer | Admin | Bearer | Admin | Rule deletion | None | LOW |
| `/api/v1/admin/automations/logs` | `GET` | Bearer | Admin | Bearer | Admin | Log list | None | LOW |
| `/api/v1/admin/analytics/overview` | `GET` | Bearer | Admin | Bearer | Admin | KPI calculation | None | LOW |
| `/api/v1/admin/analytics/channels` | `GET` | Bearer | Admin | Bearer | Admin | Channel metric | None | LOW |
| `/api/v1/admin/analytics/brands` | `GET` | Bearer | Admin | Bearer | Admin | Brand metric | None | LOW |
| `/api/v1/admin/analytics/peak-hours` | `GET` | Bearer | Admin | Bearer | Admin | Peak hour metric | None | LOW |
| `/api/v1/admin/analytics/sla` | `GET` | Bearer | Admin | Bearer | Admin | SLA metric | None | LOW |
| `/api/v1/admin/customers/` | `GET` | Bearer | Admin | Bearer | Admin | Admin list | None | LOW |
| `/api/v1/admin/customers` | `GET` | Bearer | Admin | Bearer | Admin | Admin list | None | LOW |
| `/api/v1/admin/customers/export` | `GET` | Bearer | Admin | Bearer | Admin | CSV export | None | LOW |
| `/api/v1/admin/customers/stats` | `GET` | Bearer | Admin | Bearer | Admin | Stat summary | None | LOW |
| `/api/v1/admin/team/members` | `GET` | Bearer | Admin | Bearer | Admin | Team member list | None | LOW |
| `/api/v1/admin/team/members` | `POST` | Bearer | Admin | Bearer | Admin | User creation | None | LOW |
| `/api/v1/admin/team/members/{user_id}` | `PATCH` | Bearer | Admin | Bearer | Admin | User update | None | LOW |
| `/api/v1/admin/team/members/{user_id}` | `DELETE` | Bearer | Admin | Bearer | Admin | User deactivation | None | LOW |
| `/api/v1/admin/team/audit-logs` | `GET` | Bearer | Admin | Bearer | Admin | Audit log list | None | LOW |
| `/api/v1/conversations/unread-summary` | `GET` | None | Public | Bearer | Agent / Admin | Unread counts | None | MEDIUM |
| `/api/v1/conversations/{conversation_id}/read` | `POST` | None | Public | Bearer | Agent / Admin | Mark read status | None | **HIGH** |
| `/api/v1/conversations` | `GET` | None | Public | Bearer | Agent / Admin | Brand/agent filter | None | **HIGH** |
| `/api/v1/conversations/{conversation_id}/auto-assign` | `POST` | Bearer | Any | Bearer | Agent / Admin | Auto routing | None | LOW |
| `/api/v1/conversations/{conversation_id}` | `GET` | None | Public | Bearer | Agent / Admin | Conversation detail | None | **HIGH** |
| `/api/v1/conversations/{conversation_id}` | `PATCH` | None | Public | Bearer | Agent / Admin | Brand metadata | None | **HIGH** |
| `/api/v1/conversations/{conversation_id}/messages` | `GET` | None | Public | Bearer | Agent / Admin | Message history | None | **HIGH** |
| `/api/v1/conversations/{conversation_id}/messages` | `POST` | Optional | Any | Bearer | Agent / Admin | Message creation | **Meta/Respond.io API Send** | **CRITICAL** |
| `/api/v1/conversations/{conversation_id}/status` | `PATCH` | None | Public | Bearer | Agent / Admin | Status update | None | **HIGH** |
| `/api/v1/conversations/{conversation_id}/assign` | `PATCH` | Optional | Any | Bearer | Agent / Admin | Agent assignment | None | **CRITICAL** |
| `/api/v1/conversations/{conversation_id}/priority` | `PATCH` | None | Public | Bearer | Agent / Admin | Priority update | None | **HIGH** |
| `/api/v1/conversations/sync-now` | `POST` | None | Public | Bearer | Admin / System | Sync trigger | Meta Graph Sync | **HIGH** |
| `/api/v1/conversations/{conversation_id}/ai-analyze` | `POST` | None | Public | Bearer | Agent / Admin | AI analysis | Gemini AI API | **HIGH** |
| `/api/v1/conversations/{conversation_id}/ai-insights` | `GET` | None | Public | Bearer | Agent / Admin | AI stored insight | None | MEDIUM |
| `/api/v1/media/upload` | `POST` | None | Public | Bearer | Agent / Admin | File storage | None | **HIGH** |
| `/api/v1/media/proxy` | `GET` | None | Public | None | Public | Host whitelist | External HTTP GET | MEDIUM |
| `/api/v1/meta/test` | `GET` | None | Public | Bearer | Admin | Meta connection | Meta Graph API | MEDIUM |
| `/api/v1/meta/conversations` | `GET` | None | Public | Bearer | Admin | Meta listing | Meta Graph API | MEDIUM |
| `/api/v1/meta/import` | `POST` | None | Public | Bearer | Admin | Bulk import | Meta Graph API | **HIGH** |
| `/api/v1/meta/conversations/{conversation_id}/messages` | `POST` | None | Public | Bearer | Agent / Admin | Outbound message | Meta API Send | **CRITICAL** |
| `/api/v1/meta/messages/send` | `POST` | None | Public | Bearer | Agent / Admin | Direct send | Meta API Send | **CRITICAL** |
| `/api/v1/meta/posts` | `POST` | None | Public | Bearer | Admin | Meta page post | Meta Graph API | **HIGH** |
| `/api/v1/meta/webhook` | `GET` | None | Webhook | None | Webhook | Verify token | None | LOW |
| `/api/v1/meta/webhook` | `POST` | None | Webhook | None | Webhook | Signature verify | Inbound DB save | LOW |
| `/api/v1/respond-io/test` | `GET` | None | Public | Bearer | Admin | Respond.io test | Respond.io API | MEDIUM |
| `/api/v1/respond-io/import` | `POST` | None | Public | Bearer | Admin | Import contacts | Respond.io API | **HIGH** |
| `/api/v1/respond-io/webhook` | `POST` | None | Webhook | None | Webhook | Signature verify | Inbound DB save | LOW |
| `/api/webhooks/meta` | `GET` | None | Webhook | None | Webhook | Verify token | None | LOW |
| `/api/webhooks/meta` | `POST` | None | Webhook | None | Webhook | Signature verify | Inbound DB save | LOW |
| `/` | `GET` | None | Public | None | Public | System status | None | LOW |
| `/api/v1/health` | `GET` | None | Public | None | Public | DB/Redis ping | None | LOW |
| `/health` | `GET` | None | Public | None | Public | DB/Redis ping | None | LOW |
| `/api/v1/ws/chat` | `WS` | Query Token | Any | Query Token | Any | Connection auth | Real-time Broadcast | **HIGH** |
