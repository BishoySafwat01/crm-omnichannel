# CRM Omnichannel V1.6

Production-ready, decoupled omnichannel CRM platform featuring the **Meta Dynamic Integration Engine**, multi-provider routing (Meta Direct Graph API & BeOn Gateway V3), real-time WebSocket messaging, automated Webhook subscription synchronization, and isolated multi-service runtime architecture.

---

## 🚀 Key Features in V1.6

### 1. Meta Dynamic Integration Engine
- **OAuth 2.0 Page Onboarding**: Superadmin and Admin users authenticate with Meta to dynamically onboard managed Facebook Pages and linked Instagram Business Accounts.
- **Fernet Symmetrical Encryption**: Page access tokens are encrypted before persistence to the database (`connected_pages` table) and decrypted strictly in transient memory. Raw tokens are never logged, stored in plain text, or exposed to the frontend.
- **Database-First Dynamic Token Resolution**: Outbound messaging (`MetaClient`, `MetaProvider`) dynamically resolves active access tokens from `connected_pages` with backward-compatible fallback to `.env` configuration.
- **Automated Webhook Subscriptions**: Upon onboarding, each page is automatically subscribed to application webhooks (`POST /{page_id}/subscribed_apps`) with `messages`, `messaging_postbacks`, `message_reads`, and `message_deliveries` fields.
- **Dynamic Inbound Brand Resolution**: Inbound webhooks resolve brand identity dynamically from active database page records, eliminating hardcoded page-to-brand mappings.

### 2. Channels & Pages Management UI
- **Strict Role-Based Access Control (RBAC)**: Channels settings and connection triggers are strictly guarded in the frontend (`user.role === 'admin' || user.role === 'superadmin'`) and enforced on backend endpoints with HTTP 403 / 401 challenges.
- **Interactive Onboarding Hub**:
  - Facebook OAuth Connect trigger button with CSRF-protected redirect.
  - Real-time connected page statistics (Total Pages, Subscribed Webhooks, Active Pages).
  - Page cards with quick copy for Page ID, linked Instagram accounts, live status indicators, and webhook subscription badges.
  - Direct test ping tools for WhatsApp Cloud, Instagram Direct, and Messenger.

### 3. Realigned Admin API & Team Hierarchy
- **Realigned Admin Endpoints**:
  - `GET /api/v1/admin/customers`: Customer management with unified search, pagination, and channel metrics.
  - `GET /api/v1/admin/team/members`: Full team roster and role breakdown.
- **4-Tier Operational Roles**:
  - Full support for `superadmin`, `admin`, `supervisor`, and `agent` profiles with granular inbox and settings permissions.

### 4. Public Legal & Compliance Router
- **Meta App Review Ready Endpoints**:
  - `GET /privacy-policy`: Public HTML Privacy Policy for LUXIRA CRM.
  - `GET /terms-of-service`: Public HTML Terms of Service.
  - `GET /data-deletion`: Self-service instructions and callback URL for Meta user data deletion.

---

## 🛠 Isolated Runtime Architecture (V1.6 Topology)

| Service | Port | Target / Database | Description |
| :--- | :---: | :--- | :--- |
| **Backend API (FastAPI)** | `8001` | `crm_omnichannel_v16` | Async SQLAlchemy 2.0, Uvicorn ASGI daemon, Redis Pub/Sub listener |
| **Frontend UI (Vite / React)** | `5174` | `http://127.0.0.1:8001/api/v1` | TailwindCSS, Zustand stores, Glassmorphism UI |
| **PostgreSQL 16** | `5432` | `crm_omnichannel_v16` | Dedicated isolated database with Alembic migration chaining (`dbceb4858689`) |
| **Redis 7** | `6379` | `DB 1` (`redis://127.0.0.1:6379/1`) | Pub/Sub real-time event bus and session store |

---

## 🔒 Security & RBAC Guardrails

1. **Token Hygiene**:
   - Access tokens are stored encrypted using Fernet symmetric encryption (`ENCRYPTION_KEY`).
   - Decryption occurs in transient memory during API dispatch and is never serialized in API responses or displayed in the DOM.
2. **CSRF State Security**:
   - OAuth state parameters are signed JWTs encoding user identity and expiration timestamps to prevent cross-site request forgery and user hijacking.
3. **Agent Role Restrictions**:
   - Normal agents and supervisors have access solely to conversation management and messaging. Channel settings and OAuth triggers are omitted from their UI and blocked by backend middleware.

---

## 🧪 Quick Health Checks & Smoke Probes

```bash
# Backend Health Probe
curl -s http://127.0.0.1:8001/health

# Guarded Meta Connected Pages Endpoint (Challenge expected: 401 Unauthorized)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/api/v1/meta/connected-pages

# Protected Admin Team Members Endpoint (Challenge expected: 401 Unauthorized)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/api/v1/admin/team/members

# Public Compliance Endpoints (Expected: 200 OK)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/privacy-policy
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/terms-of-service
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/data-deletion

# Frontend Dev Server Readiness
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5174/
```
