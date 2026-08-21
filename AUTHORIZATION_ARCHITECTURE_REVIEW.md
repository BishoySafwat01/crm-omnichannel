# Phase 3A — Authorization Architecture Review & Security Contract Audit

## 1. Executive Summary & Architectural Overview

This document presents a comprehensive forensic security audit of the **Luxira Omnichannel CRM FastAPI Backend**. The audit evaluates authentication mechanisms, role-based authorization controls, resource-level ownership boundaries, webhook signature verification, and WebSocket security across all **66 registered application endpoints**.

---

## 2. Authentication Architecture

### Current Implementation
- **Mechanism**: JWT Bearer Tokens using HMAC SHA-256 (`HS256`).
- **Dependencies**: 
  - `deps.py:reusable_oauth2`: Extracts Bearer token from HTTP `Authorization` header (`Bearer <token>`).
  - `deps.py:get_current_user`: Decodes JWT (`decode_access_token`), resolves `sub` claim to `user_id` UUID, and retrieves active `User` record from PostgreSQL database.
  - `deps.py:get_optional_current_user`: Catches `HTTPException` and returns `None` if token is missing or invalid.
- **Key Flaws Identified**:
  - `get_optional_current_user` is attached to state-mutating conversation endpoints (`/assign`, `/messages`), causing FastAPI to pass `current_user=None` on unauthenticated requests instead of throwing HTTP 401 Unauthorized.

---

## 3. Authorization Architecture

### Current Implementation
- **Role Model**: `UserRole` Enum (`ADMIN`, `SUPERVISOR`, `AGENT`).
- **Role Enforcement Guard**: `deps.py:require_admin` enforces `current_user.role == UserRole.ADMIN` (or string value `"admin"`).
- **Brand-Access Guard**: `deps.py:user_has_brand_access` checks if `current_user` is Admin or if target brand exists in `user.brand_access` list.
- **Key Flaws Identified**:
  - `require_brand_access` dependency is **never attached to any APIRoute in the entire codebase**. `list_conversations`, `get_conversation`, `update_customer`, and `send_outbound_reply` execute raw database queries without filtering by `current_user.brand_access` or agent assignment.
  - No `require_supervisor` or `require_agent` dependencies exist.

---

## 4. Resource-Level Authorization Analysis

### Current State
- **Conversation Visibility**: Any caller can retrieve conversation details (`GET /api/v1/conversations/{id}`), read message history (`GET /api/v1/conversations/{id}/messages`), or query AI insights (`GET /api/v1/conversations/{id}/ai-insights`) without any user context or brand restriction.
- **Customer 360 Visibility**: Any caller can query full customer details, identities, and timeline events (`GET /api/v1/customers/*`) without authentication.
- **Internal Notes**: Any caller can create or delete internal notes on customer profiles (`POST /api/v1/customers/{id}/notes`, `DELETE /api/v1/customers/{id}/notes/{note_id}`) without authentication.

---

## 5. Webhook & WebSocket Security

### Webhook Security
- **Meta Webhook Hub (`/api/webhooks/meta`, `/api/v1/meta/webhook`)**:
  - Verification: Correctly validates `hub.verify_token` against `settings.META_WEBHOOK_VERIFY_TOKEN`.
  - Inbound POST Events: Checks `X-Hub-Signature-256` header.
- **Respond.io Webhook (`/api/v1/respond-io/webhook`)**:
  - Validates `X-RespondIO-Signature` header when secret is configured.

### WebSocket Security (`/api/v1/ws/chat`)
- Token is supplied via URL query string `?token=<jwt>`.
- `_authenticate_token` verifies token validity and user status before connection accept.
- **Flaw**: Once connected, broadcast events (`TYPING_INDICATOR`, `MESSAGE_STATUS`) are broadcast to all connected sockets without verifying brand access or conversation assignment.

---

## 6. OpenAPI Declaration vs. Actual FastAPI Dependencies

| Endpoint | Method | OpenAPI Security Spec | Actual FastAPI Dependency | Intended Security Contract |
|---|---|---|---|---|
| `/api/v1/conversations` | `GET` | None (Public) | `Depends(get_db)` | `AUTHENTICATED` / `AGENT` |
| `/api/v1/conversations/{id}/assign` | `PATCH` | None (Public) | `Depends(get_optional_current_user)` | `AUTHENTICATED` / `AGENT` / `SUPERVISOR` |
| `/api/v1/conversations/{id}/messages` | `POST` | None (Public) | `Depends(get_optional_current_user)` | `AUTHENTICATED` / `AGENT` |
| `/api/v1/conversations/{id}/status` | `PATCH` | None (Public) | `Depends(get_db)` | `AUTHENTICATED` / `AGENT` |
| `/api/v1/customers` | `GET` | None (Public) | `Depends(get_db)` | `AUTHENTICATED` / `AGENT` |
| `/api/v1/customers/{id}/notes` | `POST` | None (Public) | `Depends(get_db)` | `AUTHENTICATED` / `AGENT` |
| `/api/v1/admin/*` | Various | `OAuth2PasswordBearer` | `Depends(require_admin)` | `ADMIN` |
