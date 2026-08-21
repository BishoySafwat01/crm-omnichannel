# ROLE_PERMISSION_MATRIX.md — Capability & RBAC Scoping Matrix

## 1. System Roles Overview
- **`ANONYMOUS`**: Unauthenticated client. Should only access login, system health, and verified webhooks.
- **`AGENT`**: Customer support representative. Should manage assigned conversations, view customer 360 info within allowed brands, and send customer messages.
- **`SUPERVISOR`**: **NOT CURRENTLY DEFINED** in backend application logic (`UserRole` Enum only contains `ADMIN`, `SUPERVISOR`, `AGENT`, but no supervisor-specific permission guards exist).
- **`ADMIN`**: Superuser with full governance, team management, analytics, and integration control.

---

## 2. Role Capability Scoping Matrix

| Capability | Anonymous | Agent | Supervisor | Admin | Current Implementation | Intended Behavior |
|---|---|---|---|---|---|---|
| **User Login** | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | Allowed | Allowed |
| **User Logout** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | Requires Token | Requires Token |
| **View Customer List & Detail** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Brand Filter |
| **Modify Customer Profile** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth |
| **View Conversation Queue** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Brand Filter |
| **Assign / Reassign Agent** | ❌ DENIED | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Admin/Supervisor |
| **Change Conversation Status** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Agent/Admin |
| **Change Conversation Priority** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Agent/Admin |
| **Send Outbound Customer Message** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Agent/Admin |
| **Create Customer Internal Note** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Agent/Admin |
| **Delete Customer Internal Note** | ❌ DENIED | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Admin/Author |
| **View Analytics & Dashboards** | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ ALLOWED | Restricted (`require_admin`) | Restricted (`require_admin`) |
| **View System Audit Logs** | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ ALLOWED | Restricted (`require_admin`) | Restricted (`require_admin`) |
| **Manage Team & Accounts** | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ ALLOWED | Restricted (`require_admin`) | Restricted (`require_admin`) |
| **Manage Automations & Rules** | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ ALLOWED | Restricted (`require_admin`) | Restricted (`require_admin`) |
| **Trigger Meta/Respond.io Import** | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Admin |
| **Trigger AI Insights Analysis** | ❌ DENIED | ✅ ALLOWED | ✅ ALLOWED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth |
| **Publish Meta Facebook Page Post** | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ ALLOWED | **ACCIDENTALLY ALLOWED** | Requires Auth & Admin |
