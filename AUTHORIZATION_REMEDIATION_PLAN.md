# AUTHORIZATION_REMEDIATION_PLAN.md — High-Level Architectural Remediation Strategy

> [!IMPORTANT]
> **Forensic Audit & Planning Only**: This document outlines architectural remediation strategies and security controls required before Phase 3B implementation. **No production code has been modified during Phase 3A.**

---

## 1. Architectural Remediation Pillars

### Pillar A: Mandatory Authentication Guard Layer
- **Control Strategy**: Apply `Depends(get_current_user)` as a baseline requirement across all CRM business routers (`conversations.py`, `customers.py`).
- **Elimination of `get_optional_current_user`**: Replace `get_optional_current_user` on state-mutating endpoints (`/messages`, `/assign`) with strict `get_current_user` dependency.
- **Explicit Exemption Allowlist**: Limit unauthenticated endpoints to:
  - System Root (`/`) and Health Check (`/health`, `/api/v1/health`)
  - User Authentication Login (`POST /api/v1/auth/login`)
  - Verified Webhooks (`GET/POST /api/webhooks/meta`, `POST /api/v1/respond-io/webhook`)

### Pillar B: Brand-Scoped Resource Isolation (BOLA Defense)
- **Control Strategy**: Integrate `user_has_brand_access` checks into query-building services.
- **Query Scoping**:
  - For non-admin agents, append `Conversation.brand.in_(current_user.brand_access)` filter to all listing and detail endpoints.
  - Reject access with `HTTP 403 Forbidden` if an agent attempts to access a conversation or customer belonging to an unauthorized brand.

### Pillar C: Status & Assignment Mutation Integrity
- **Control Strategy**:
  - Implement `ConversationService.update_conversation_status(session, conversation_id, new_status)` handling `ConversationStatusEnum` values.
  - Require `current_user` context for `/assign` and restrict manual reassignment to Admin/Supervisor roles or explicit routing logic.

### Pillar D: Administrative & Integration Endpoint Protection
- **Control Strategy**:
  - Enforce `require_admin` on all background trigger endpoints (`/meta/import`, `/respond-io/import`, `/meta/posts`).
  - Keep `require_admin` on `/admin/automations`, `/admin/analytics`, `/admin/team`, `/admin/customers`.

---

## 2. Affected Architectural Layers & Required Regression Tests

| Architectural Layer | Remediation Action | Required Regression Tests |
|---|---|---|
| **API Router Layer (`conversations.py`, `customers.py`)** | Attach `get_current_user` dependency to all business routes. | Verify 401 Unauthorized returned for all unauthenticated requests. |
| **Service Layer (`conversation_service.py`, `customer_service.py`)** | Add `update_conversation_status` method and brand-scoping filters to SQL queries. | Test status transitions and brand-filtered listings via pytest. |
| **Integration Layer (`meta.py`, `respond_io.py`)** | Require `require_admin` for bulk import/publish endpoints. | Test Admin vs Agent access on import endpoints. |
| **WebSocket Layer (`ws.py`)** | Enforce brand/conversation authorization checks before broadcasting events. | Test multi-client WS event isolation. |

---

## 3. Formal Phase 3B Readiness Assessment

### Current Status: **`BLOCKED_PENDING_SECURITY_DECISIONS`**

### Required Architectural Decisions Before Unblocking Phase 3B Implementation:
1. **Agent Brand-Isolation Scoping Rules**: Should agents be strictly prohibited from seeing conversations outside their assigned `brand_access` list?
2. **Supervisor Role Definition**: Should `SUPERVISOR` role be formally wired into dependencies (`require_supervisor_or_admin`) or merged with `ADMIN`?
3. **Public Customer API Intentionality**: Confirm that no `customers` or `conversations` endpoints were intended to be public without Bearer token auth.
