# AUTHORIZATION_FINDINGS.md — Detailed Security & Authorization Findings

## 1. Critical Severity Findings

### FINDING-CRIT-01: Authentication Bypass on Conversation Agent Assignment
- **Finding ID**: `FINDING-CRIT-01`
- **Endpoint**: `PATCH /api/v1/conversations/{conversation_id}/assign`
- **Severity**: **CRITICAL**
- **Vulnerability Type**: Broken Function-Level Authorization / Missing Auth Guard (OWASP API1:2023)
- **Current Behavior**: `assign_conversation_agent` in `conversations.py` uses `Depends(get_optional_current_user)`. When an unauthenticated request arrives, `current_user` evaluates to `None`, but the handler still updates the database with `assigned_agent_id` and returns `HTTP 200 OK`.
- **Expected Behavior**: Require valid JWT authentication (`Depends(get_current_user)`) and reject unauthenticated requests with `HTTP 401 Unauthorized`. Restrict assignment privileges to Admin/Supervisor roles or explicit routing.
- **Attack Scenario**: An anonymous attacker on the network can iterate conversation UUIDs and modify agent assignments across the CRM system.
- **Business Impact**: Disruption of customer support operations, unauthorized routing manipulation, and loss of agent accountability.

---

### FINDING-CRIT-02: Unauthenticated Outbound Messaging Trigger
- **Finding ID**: `FINDING-CRIT-02`
- **Endpoints**: 
  - `POST /api/v1/conversations/{conversation_id}/messages`
  - `POST /api/v1/meta/conversations/{conversation_id}/messages`
  - `POST /api/v1/meta/messages/send`
- **Severity**: **CRITICAL**
- **Vulnerability Type**: Missing Authentication Guard / External Side Effect Vulnerability (OWASP API2:2023)
- **Current Behavior**: Handler `send_outbound_reply` uses `get_optional_current_user`. Unauthenticated calls execute provider dispatch logic to Meta Graph API / Respond.io API.
- **Expected Behavior**: Enforce strict `Depends(get_current_user)` authentication and verify agent brand access before contacting external messaging APIs.
- **Attack Scenario**: An attacker sends unauthenticated POST requests, spamming external customers via WhatsApp/Messenger and consuming API quotas or incurring messaging charges.
- **Business Impact**: Financial loss, domain ban on WhatsApp/Meta Graph API, brand reputation damage.

---

### FINDING-CRIT-03: Unhandled 500 Error on Status Update Handler
- **Finding ID**: `FINDING-CRIT-03`
- **Endpoint**: `PATCH /api/v1/conversations/{conversation_id}/status`
- **Severity**: **CRITICAL** (Application Stability & Contract Failure)
- **Vulnerability Type**: Missing Method / Exception Handling Failure
- **Current Behavior**: Line 343 in `conversations.py` invokes `ConversationService.update_conversation_status(...)`, which does not exist on `ConversationService`, raising `AttributeError` and returning `HTTP 500 Internal Server Error`.
- **Expected Behavior**: Provide proper service method handling status updates, validate enum input, and enforce authentication.

---

## 2. High Severity Findings

### FINDING-HIGH-01: Public Exposure of Customer 360 & Personal Identifiable Information (PII)
- **Finding ID**: `FINDING-HIGH-01`
- **Endpoints**: `GET /api/v1/customers`, `GET /api/v1/customers/{id}`, `PATCH /api/v1/customers/{id}`, `PUT /api/v1/customers/{id}`
- **Severity**: **HIGH**
- **Vulnerability Type**: Excessive Data Exposure / Missing Authentication (OWASP API3:2023)
- **Current Behavior**: Endpoints in `customers.py` take `db: AsyncSession = Depends(get_db)` without any `get_current_user` dependency. Any unauthenticated caller can query names, phone numbers, emails, locations, and identities.
- **Expected Behavior**: Require JWT Bearer authentication for all customer endpoints.

---

### FINDING-HIGH-02: Public Exposure of Conversation Queue & Message History
- **Finding ID**: `FINDING-HIGH-02`
- **Endpoints**: `GET /api/v1/conversations`, `GET /api/v1/conversations/{id}`, `GET /api/v1/conversations/{id}/messages`
- **Severity**: **HIGH**
- **Vulnerability Type**: Broken Object Level Authorization / Missing Authentication (OWASP API1:2023)
- **Current Behavior**: No authentication dependencies attached. Anonymous callers can dump conversation histories.
- **Expected Behavior**: Enforce `Depends(get_current_user)` and apply brand-scoping filters.

---

### FINDING-HIGH-03: Unauthenticated Internal Note Creation & Deletion
- **Finding ID**: `FINDING-HIGH-03`
- **Endpoints**: `POST /api/v1/customers/{id}/notes`, `DELETE /api/v1/customers/{id}/notes/{note_id}`
- **Severity**: **HIGH**
- **Vulnerability Type**: Missing Authentication & Authorization
- **Current Behavior**: Anonymous callers can attach notes or delete existing notes from customer records.

---

### FINDING-HIGH-04: Unprotected Meta/Respond.io History Import Triggers
- **Finding ID**: `FINDING-HIGH-04`
- **Endpoints**: `POST /api/v1/meta/import`, `POST /api/v1/respond-io/import`, `POST /api/v1/meta/posts`
- **Severity**: **HIGH**
- **Vulnerability Type**: Unauthenticated System Resource Abuse
- **Current Behavior**: Anonymous requests can trigger bulk API sync operations with Meta and Respond.io.

---

### FINDING-HIGH-05: Missing Resource-Level Brand Scoping on Agent Requests
- **Finding ID**: `FINDING-HIGH-05`
- **Component**: All conversation and customer endpoints
- **Severity**: **HIGH**
- **Vulnerability Type**: Broken Object Level Authorization (BOLA / Multi-Tenant Isolation)
- **Current Behavior**: `user.brand_access` control list is never filtered in database queries. An agent assigned to brand `LAVVA` can retrieve conversations for `LUXIRA`.
- **Expected Behavior**: Query filters must check `Conversation.brand.in_(user.brand_access)` for non-admin agents.

---

## 3. Medium Severity Findings

### FINDING-MED-01: WebSocket Connection Broadcast Scoping
- **Finding ID**: `FINDING-MED-01`
- **Endpoint**: `/api/v1/ws/chat`
- **Severity**: **MEDIUM**
- **Vulnerability Type**: Over-Broad Real-Time Event Broadcast
- **Current Behavior**: Events like `TYPING_INDICATOR` and `MESSAGE_STATUS` are broadcast to all connected WebSocket clients regardless of brand access.

---

### FINDING-MED-02: Media Proxy Whitelist Strictness
- **Finding ID**: `FINDING-MED-02`
- **Endpoint**: `GET /api/v1/media/proxy`
- **Severity**: **MEDIUM**
- **Vulnerability Type**: SSRF Defense vs Operational Media Proxying
- **Current Behavior**: Rejects valid media proxy requests if domain is not on hardcoded list.

---

## 4. Summary Table of Findings

| Finding ID | Severity | Endpoint / Component | Vulnerability Type | Code Fix Required? | Phase 3B Blocker? |
|---|---|---|---|---|---|
| `FINDING-CRIT-01` | **CRITICAL** | `PATCH /conversations/{id}/assign` | Auth Bypass / BOLA | Yes | Yes |
| `FINDING-CRIT-02` | **CRITICAL** | `POST /conversations/{id}/messages` | Unauth External API Send | Yes | Yes |
| `FINDING-CRIT-03` | **CRITICAL** | `PATCH /conversations/{id}/status` | AttributeError 500 | Yes | Yes |
| `FINDING-HIGH-01` | **HIGH** | `GET /customers/*` | PII Data Exposure | Yes | Yes |
| `FINDING-HIGH-02` | **HIGH** | `GET /conversations/*` | Unauth Queue Exposure | Yes | Yes |
| `FINDING-HIGH-03` | **HIGH** | `POST/DELETE /customers/{id}/notes` | Unauth Note Mutation | Yes | Yes |
| `FINDING-HIGH-04` | **HIGH** | `POST /meta/import` | Unauth System Trigger | Yes | Yes |
| `FINDING-HIGH-05` | **HIGH** | Service Layer Queries | Missing Brand Scoping | Yes | Yes |
| `FINDING-MED-01` | **MEDIUM** | `/api/v1/ws/chat` | Over-Broad WS Broadcast | Yes | No |
| `FINDING-MED-02` | **MEDIUM** | `GET /media/proxy` | Host Whitelist Strictness | Yes | No |
