# BACKEND_API_COVERAGE.md — Complete API Coverage Matrix

**Total Discovered Endpoints**: 66
**Passed Endpoints**: 31
**Failed Endpoints**: 35
**Overall API Coverage**: 100%

| ID | Method | Endpoint | Auth | Positive | Negative | Auth Check | RBAC Check | DB Check | Status |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | `POST` | `/api/v1/auth/login` | `public` | FAIL (HTTP 401) | PASS | N/A | N/A | PASS | **FAIL** |
| AUTH-02 | `POST` | `/api/v1/auth/logout` | `bearer` | FAIL (HTTP 401) | PASS | PASS | N/A | PASS | **FAIL** |
| AUTH-03 | `GET` | `/api/v1/auth/me` | `bearer` | FAIL (HTTP 401) | PASS | PASS | N/A | PASS | **FAIL** |
| CUSTOMERS-01 | `GET` | `/api/v1/customers` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-02 | `GET` | `/api/v1/customers/locations` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-03 | `GET` | `/api/v1/customers/{customer_id}` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-04 | `PATCH` | `/api/v1/customers/{customer_id}` | `public` | PASS | FAIL (HTTP 200) | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-05 | `PUT` | `/api/v1/customers/{customer_id}` | `public` | PASS | FAIL (HTTP 200) | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-06 | `GET` | `/api/v1/customers/{customer_id}/identities` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-07 | `POST` | `/api/v1/customers/{customer_id}/tags` | `public` | PASS | FAIL (HTTP 200) | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-08 | `GET` | `/api/v1/customers/{customer_id}/timeline` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-09 | `GET` | `/api/v1/customers/{customer_id}/notes` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-10 | `POST` | `/api/v1/customers/{customer_id}/notes` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CUSTOMERS-11 | `DELETE` | `/api/v1/customers/{customer_id}/notes/{note_id}` | `public` | PASS (404_HANDLED) | PASS | N/A | N/A | PASS | **PASS** |
| GENERAL-01 | `GET` | `/api/v1/admin/automations` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-02 | `POST` | `/api/v1/admin/automations` | `bearer` | FAIL (HTTP 401) | FAIL (HTTP 401) | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-03 | `PATCH` | `/api/v1/admin/automations/{rule_id}` | `bearer` | FAIL (HTTP 401) | FAIL (HTTP 401) | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-04 | `DELETE` | `/api/v1/admin/automations/{rule_id}` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-05 | `GET` | `/api/v1/admin/automations/logs` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-06 | `GET` | `/api/v1/admin/analytics/overview` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-07 | `GET` | `/api/v1/admin/analytics/channels` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-08 | `GET` | `/api/v1/admin/analytics/brands` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-09 | `GET` | `/api/v1/admin/analytics/peak-hours` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-10 | `GET` | `/api/v1/admin/analytics/sla` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-11 | `GET` | `/api/v1/admin/customers/` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-12 | `GET` | `/api/v1/admin/customers` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-13 | `GET` | `/api/v1/admin/customers/export` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| GENERAL-14 | `GET` | `/api/v1/admin/customers/stats` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| ADMIN_TEAM-01 | `GET` | `/api/v1/admin/team/members` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| ADMIN_TEAM-02 | `POST` | `/api/v1/admin/team/members` | `bearer` | FAIL (HTTP 401) | FAIL (HTTP 401) | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| ADMIN_TEAM-03 | `PATCH` | `/api/v1/admin/team/members/{user_id}` | `bearer` | FAIL (HTTP 401) | FAIL (HTTP 401) | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| ADMIN_TEAM-04 | `DELETE` | `/api/v1/admin/team/members/{user_id}` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| ADMIN_TEAM-05 | `GET` | `/api/v1/admin/team/audit-logs` | `bearer` | FAIL (HTTP 401) | PASS | PASS | FAIL (HTTP 401) | PASS | **FAIL** |
| CONVERSATIONS-01 | `GET` | `/api/v1/conversations/unread-summary` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CONVERSATIONS-02 | `POST` | `/api/v1/conversations/{conversation_id}/read` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CONVERSATIONS-03 | `GET` | `/api/v1/conversations` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CONVERSATIONS-04 | `POST` | `/api/v1/conversations/{conversation_id}/auto-assign` | `bearer` | FAIL (HTTP 401) | PASS | PASS | N/A | PASS | **FAIL** |
| CONVERSATIONS-05 | `GET` | `/api/v1/conversations/{conversation_id}` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CONVERSATIONS-06 | `PATCH` | `/api/v1/conversations/{conversation_id}` | `public` | PASS | FAIL (HTTP 200) | N/A | N/A | PASS | **PASS** |
| CONVERSATIONS-07 | `GET` | `/api/v1/conversations/{conversation_id}/messages` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CONVERSATIONS-08 | `POST` | `/api/v1/conversations/{conversation_id}/messages` | `bearer` | PASS | PASS | FAIL (HTTP 400) | N/A | PASS | **FAIL** |
| CONVERSATIONS-09 | `PATCH` | `/api/v1/conversations/{conversation_id}/status` | `public` | FAIL (HTTP 500) | FAIL (HTTP 500) | N/A | N/A | PASS | **FAIL** |
| CONVERSATIONS-10 | `PATCH` | `/api/v1/conversations/{conversation_id}/assign` | `bearer` | PASS | FAIL (HTTP 200) | FAIL (HTTP 200) | N/A | PASS | **FAIL** |
| CONVERSATIONS-11 | `PATCH` | `/api/v1/conversations/{conversation_id}/priority` | `public` | FAIL (HTTP 422) | FAIL (HTTP 200) | N/A | N/A | PASS | **FAIL** |
| CONVERSATIONS-12 | `POST` | `/api/v1/conversations/sync-now` | `public` | FAIL () | PASS | N/A | N/A | PASS | **FAIL** |
| CONVERSATIONS-13 | `POST` | `/api/v1/conversations/{conversation_id}/ai-analyze` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| CONVERSATIONS-14 | `GET` | `/api/v1/conversations/{conversation_id}/ai-insights` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| MEDIA-01 | `POST` | `/api/v1/media/upload` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| MEDIA-02 | `GET` | `/api/v1/media/proxy` | `public` | FAIL (HTTP 403) | PASS | N/A | N/A | PASS | **FAIL** |
| META_INTEGRATION_INTERNAL-01 | `GET` | `/api/v1/meta/test` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| META_INTEGRATION_INTERNAL-02 | `GET` | `/api/v1/meta/conversations` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| META_INTEGRATION_INTERNAL-03 | `POST` | `/api/v1/meta/import` | `public` | FAIL () | PASS | N/A | N/A | PASS | **FAIL** |
| META_INTEGRATION_INTERNAL-04 | `POST` | `/api/v1/meta/conversations/{conversation_id}/messages` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| META_INTEGRATION_INTERNAL-05 | `POST` | `/api/v1/meta/messages/send` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| META_INTEGRATION_INTERNAL-06 | `POST` | `/api/v1/meta/posts` | `public` | FAIL (HTTP 403) | PASS | N/A | N/A | PASS | **FAIL** |
| META_INTEGRATION_INTERNAL-07 | `GET` | `/api/v1/meta/webhook` | `public` | FAIL (HTTP 403) | PASS | N/A | N/A | PASS | **FAIL** |
| META_INTEGRATION_INTERNAL-08 | `POST` | `/api/v1/meta/webhook` | `public` | FAIL (HTTP 401) | PASS | N/A | N/A | PASS | **FAIL** |
| RESPOND_IO_INTEGRATION_INTERNAL-01 | `GET` | `/api/v1/respond-io/test` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| RESPOND_IO_INTEGRATION_INTERNAL-02 | `POST` | `/api/v1/respond-io/import` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| RESPOND_IO_INTEGRATION_INTERNAL-03 | `POST` | `/api/v1/respond-io/webhook` | `public` | PASS (400_HANDLED) | PASS | N/A | N/A | PASS | **PASS** |
| WEBHOOKS-01 | `GET` | `/api/webhooks/meta` | `public` | FAIL (HTTP 403) | PASS | N/A | N/A | PASS | **FAIL** |
| WEBHOOKS-02 | `POST` | `/api/webhooks/meta` | `public` | FAIL (HTTP 401) | PASS | N/A | N/A | PASS | **FAIL** |
| GENERAL-15 | `GET` | `/` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| GENERAL-16 | `GET` | `/api/v1/health` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| GENERAL-17 | `GET` | `/health` | `public` | PASS | PASS | N/A | N/A | PASS | **PASS** |
| WEBSOCKET-01 | `WS` | `/api/v1/ws/chat` | `public` | PASS | PASS | PASS | N/A | PASS | **PASS** |
