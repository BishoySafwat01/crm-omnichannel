# SYSTEM AUDIT & ARCHITECTURAL STATUS SPECIFICATION

**Document Reference:** `DOC-AUDIT-CRM-V1.6-20260909`  
**System Target:** CRM Omnichannel Platform (`crm-omnichannel`)  
**Software Version:** `Release Candidate V1.6` (Branch: `feature/crm-omnichannel-V1.6`, Commit: `3b7326b`)  
**Audit Timestamp:** `2026-09-09T04:19:20+03:00`  
**Authority:** Principal Systems Auditor, Staff Full-Stack Architect & Security Officer  
**Classification:** Internal Technical Audit & Compliance Certification  
**Release Readiness Decision:** ❌ **NO-GO FOR PRODUCTION DEPLOYMENT**  

---

## 1. Executive Status & Version Overview

This formal specification documents the exhaustive, 100% evidence-based forensic system audit conducted across the entire `crm-omnichannel` monorepo at release candidate `V1.6` prior to any code refactoring or cloud deployment.

### 1.1 High-Level Operational Status
The platform exhibits severe architectural, security, and runtime deficiencies that render it unsuitable for cloud deployment in its current state. Critical impediments include an unhandled missing Python dependency (`cryptography`) halting container boot, database schema drift from an unapplied migration (`connected_pages`), complete authentication bypasses exposing 100% of customer PII and message histories to unauthenticated public requests, wildcard CORS regex with credentials enabled, and runtime container drift where active containers execute an obsolete revision (`crm-omnichannel-V5`).

### 1.2 Quantitative Forensic Inventory (PostgreSQL 16.14 Live Database)
Verified via runtime inspection on database `crm_omnichannel` (`crm_postgres` container):

| Metric Description | Exact Value | Verification Status |
| :--- | :---: | :--- |
| **Active Database Engine** | `PostgreSQL 16.14 (Alpine)` | Running on container `crm_postgres` (Port 5432) |
| **Total Ingested Conversations** | `1,710` | 100% Provider: `BEON`, 100% Channel: `MESSENGER`, 100% Status: `PENDING` |
| **Total Ingested Messages** | `23,376` | `AGENT`: 17,845 \| `CUSTOMER`: 5,531 |
| **Message Payload Types** | `TEXT`: 22,861 \| `IMAGE`: 471 \| `VIDEO`: 35 \| `AUDIO`: 9 | Live message type breakdown |
| **Total Customer Records** | `1,710` | 1,709 with `country=NULL`, 0 phone numbers captured |
| **Customer Identities** | `1,710` | Linked to BeOn external IDs |
| **User Accounts** | `1` | `admin@luxira.com` (Role: `ADMIN`, Status: `ACTIVE`) |
| **User Audit Logs** | `75` | Security and operational actions recorded |
| **Migration Job Histories** | `25` | Provider synchronization logs |
| **Social Comments & Moderation** | `6` comments \| `6` logs \| `6` settings | Facebook & Instagram moderation records |
| **Connected Facebook Pages** | **0 (Table Missing)** | **CRITICAL:** Table `connected_pages` does not exist in DB |
| **Alembic Schema Head (Codebase)** | `dbceb4858689` | `2026_09_06_0515-dbceb4858689_add_connected_pages_table.py` |
| **Alembic Version (Live DB)** | `b57db77d7a85` | **DRIFT DETECTED:** Head migration unapplied |

---

## 2. Core Defect & Vulnerability Registry

| Defect ID | Architectural Layer | Severity | Verified Code Location | Technical Impact & Root Cause | Mandatory Remediation Path |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **CRIT-01** | Backend / Startup | **Critical** | `backend/app/core/security.py:8`<br>`backend/requirements.txt:17` | `from cryptography.fernet import Fernet` was introduced for token encryption, but the package is not installed in the Docker image or local venv. Startup fails with `ModuleNotFoundError: No module named 'cryptography'`. | Rebuild Docker container image from scratch with `requirements.txt` containing `cryptography>=41.0.0`. |
| **CRIT-02** | Database / Schema | **Critical** | `backend/alembic/versions/2026_09_06_0515-dbceb4858689_add_connected_pages_table.py:14-36` | Migration `dbceb4858689` is unapplied in PostgreSQL. Calling `/api/v1/meta/connected-pages`, OAuth callback, or inbound webhooks (`meta_import_service.py:724`) crashes with `UndefinedTableError: relation "connected_pages" does not exist`. | Run `alembic upgrade head` in PostgreSQL and ensure automated migration execution in container entrypoints. |
| **CRIT-03** | Security / Auth | **Critical** | `backend/app/api/v1/conversations.py:171`<br>`backend/app/api/v1/conversations.py:276`<br>`backend/app/api/v1/conversations.py:305` | Routes use `get_optional_current_user`. If unauthenticated, `current_user` is `None`, skipping `require_conversation_access` and returning all 1,710 conversations and their private messages to any public request without a token. | Replace `get_optional_current_user` with mandatory `get_current_user` and enforce `require_conversation_access`. |
| **CRIT-04** | Security / PII | **Critical** | `backend/app/api/v1/customers.py:32`<br>`backend/app/api/v1/customers.py:79`<br>`backend/app/api/v1/customers.py:98`<br>`backend/app/api/v1/customers.py:157` | Customer endpoints omit authentication dependencies entirely or use optional auth. Any unauthenticated caller can enumerate all customer PII, identities, and modify customer profiles (`update_customer`). | Add `current_user: User = Depends(get_current_user)` to all customer listing, retrieval, and mutation routes. |
| **CRIT-05** | Security / Network | **Critical** | `backend/app/main.py:164-169` | `allow_origin_regex=r"https?://.*"` combined with `allow_credentials=True` allows any external webpage to make credentialed cross-origin requests, completely disabling Same-Origin Protection. | Remove the wildcard regex. Whitelist only explicitly verified production/staging domains in `settings.CORS_ORIGINS`. |
| **CRIT-06** | DevOps / Orchestration | **Critical** | Host Docker Runtime Inspection | Running container `crm_backend` is bind-mounted to `/home/bishoy/crm-omnichannel-V5/backend`, not `crm-omnichannel-V1.6`. V1.6 code changes are not active in the runtime container. | Reconfigure Docker Compose volumes and rebuild containers against `/home/bishoy/crm-omnichannel-V1.6`. |
| **HIGH-01** | Real-Time / Engine | **High** | `backend/app/api/v1/ws.py:122-125`<br>`backend/app/api/v1/ws.py:184-188` | `manager.broadcast` pushes real-time events to all active sockets without brand scoping. Furthermore, `JOIN_CONVERSATION` lacks access checks, allowing agents to join arbitrary brand rooms. | Enforce brand/channel scoping on WebSocket broadcasts and validate `user_has_conversation_access` on room join. |
| **HIGH-02** | Real-Time / PubSub | **High** | `backend/app/api/v1/ws.py:206-233` | `publish_realtime_event` is never invoked by any service. Messages are broadcast solely in-memory within the local worker process, breaking horizontal multi-worker scalability. | Refactor `MessageService`, `MetaImportService`, and `BeonSyncService` to route events via Redis Pub/Sub. |
| **HIGH-03** | Security / SSRF | **High** | `backend/app/api/v1/media.py:69`<br>`backend/app/api/v1/media.py:201-221` | `ALLOWED_DOMAIN_SUFFIXES` contains `"localhost"`. Attackers can use `/api/v1/media/proxy?url=http://localhost:8000/...` to probe loopback services and internal ports. | Remove `"localhost"` from allowlist and restrict URLs strictly to validated Meta CDN domains. |
| **HIGH-04** | Security / Secrets | **High** | `docker-compose.prod.yml:60, 67` | Insecure fallback defaults are hardcoded in the compose definition (`SECRET_KEY=4d71c9b6...`, `BEON_API_KEY=ZUiczQBL...`). | Remove fallback values; mandate environment variable presence via deployment secret managers. |
| **MED-01**  | Backend / Media | **Medium** | `backend/app/api/v1/media.py:158-160` | In `upload_media`, audit logging references `request.client.host` and `db`, but neither `request: Request` nor `db: AsyncSession` is declared in the route signature. | Add `request: Request` and `db: AsyncSession = Depends(get_db)` to `upload_media` signature. |
| **MED-02**  | Backend / Routing | **Medium** | `backend/app/main.py:229`<br>`backend/app/api/webhooks.py:4` | Duplicate route prefix generates `/api/v1/api/webhooks/meta`. External webhooks configured to `/api/webhooks/meta` receive HTTP 404 Not Found. | Mount `webhooks_router` at root `app.include_router(webhooks_router)` or adjust router prefix. |
| **MED-03**  | Architecture | **Medium** | `backend/app/services/message_service.py:284` | Core message dispatch imports a script from outside `app/`: `from scripts.fix_media_attachments import transcode_to_m4a`, violating clean architecture boundaries. | Move `transcode_to_m4a` into `app/services/media_service.py`. |
| **MED-04**  | Frontend / Mock | **Medium** | `frontend/src/constants/brands.ts:33-47` | 10 brands define synthetic Facebook Page IDs (`100099887766555`..`563`) and are hardcoded across 12 UI files instead of using live connected accounts. | Dynamically populate brands from `useChannelsStore` / `/api/v1/meta/connected-pages`. |
| **MED-05**  | Database / Perf | **Medium** | `backend/app/models/conversation.py:84-90`<br>`backend/app/models/message.py:46-50` | Missing composite indexes on `(brand, channel, last_activity_at DESC)` and `(conversation_id, created_at ASC)`. | Generate Alembic migration adding composite B-Tree indexes for inbox and thread sorting. |

---

## 3. Deep-Dive Vector Evaluations

### Vector 1: Backend Routing & Controller Integrity
- **Endpoint Registry:** 48 active endpoints registered in `app.main:app`.
- **Router Prefix Defect:**
  ```python
  # backend/app/api/webhooks.py:4
  router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

  # backend/app/main.py:229
  app.include_router(webhooks_router, prefix="/api/v1")
  # RESULT: Route is mounted as /api/v1/api/webhooks/meta
  ```
- **Empty Stubs:** `backend/app/api/v1/messages.py` is 0 bytes; all message actions are currently managed in `conversations.py`.

### Vector 2: Database Schema & Relational Integrity
- **Alembic Drift Evidence:**
  ```bash
  $ docker exec crm_backend python -c "from sqlalchemy import text; ... res = conn.execute(text('SELECT version_num FROM alembic_version;')); print(res.fetchall())"
  Output: [('b57db77d7a85',)]
  ```
  Host contains migration `2026_09_06_0515-dbceb4858689_add_connected_pages_table.py` which has not executed against PostgreSQL.
- **Index Deficiencies:**
  - `conversations` has no composite index on `(brand, channel, last_activity_at DESC)`.
  - `messages` has no composite index on `(conversation_id, created_at ASC)`.

### Vector 3: Real-Time Engine & Worker Daemons
- **Broadcast Scope:**
  ```python
  # backend/app/api/v1/ws.py:122-125
  async def broadcast(self, message: dict) -> None:
      target_sockets = self.active_connections
      await self._dispatch_to_sockets(target_sockets, message)
  ```
  Global fanout without brand filtering permits unauthorized cross-brand conversation monitoring.
- **Redis Pub/Sub Bypass:** `publish_realtime_event` is never called by any service. In-memory broadcasts restrict updates to the local worker process.
- **Worker Daemon Graceful Termination:** Lifespan cancels daemons cleanly on `asyncio.CancelledError`. However, `BeonClient` lacks backoff logic on HTTP 429 rate limits.

### Vector 4: Inbound & Outbound Messaging Lifecycles
- **Meta Inbound Webhook Failure:**
  ```python
  # backend/app/services/meta_import_service.py:724-726
  cp_single = (await session.execute(
      select(ConnectedPage).where(ConnectedPage.page_id == entry_page_id)
  )).scalar_one_or_none()
  ```
  Throws `UndefinedTableError` because `connected_pages` does not exist in PostgreSQL, breaking Meta inbound message ingestion.
- **BeOn Inbound Concurrency:** Lacks `try...except IntegrityError` on duplicate message inserts, causing unhandled 500 errors on concurrent network retries.

### Vector 5: Frontend State & Static Mock Analysis
- **TypeScript Compilation:** Validated clean via `npx tsc --noEmit` (0 type errors).
- **Zustand Sorting:** `sortConversationsByLatest` operates correctly on timestamps, ensuring newest messages bump conversations to the top.
- **Mock Distribution:** `MOCK_BRANDS` with synthetic page IDs is statically imported in:
  - `ConversationAvatar.tsx`, `TopBar.tsx`, `AutomationPage.tsx`, `ChannelsPage.tsx`, `ConversationList.tsx`, `CustomerProfileSidebar.tsx`, `CommentsPage.tsx`, `CustomersPage.tsx`, `DashboardPage.tsx`, `TeamPage.tsx`, `api.ts`.

### Vector 6: Security, RBAC & Vulnerability Audit
- **Unauthenticated Data Exposure Proof:**
  - `curl -s "http://localhost:8000/api/v1/conversations?page=1&page_size=1"`: Returns full conversation details without authentication.
  - `curl -s "http://localhost:8000/api/v1/conversations/9e9b2dc0-3856-4895-b2cc-6c5edae4c109/messages"`: Returns raw customer messages without authentication.
  - `curl -s "http://localhost:8000/api/v1/customers?page=1&page_size=1"`: Returns customer PII without authentication.
- **CORS Vulnerability:** `allow_origin_regex=r"https?://.*"` allows arbitrary origin access.

### Vector 7: DevOps, Containerization & AWS EC2 Readiness
- **Runtime Mount Drift:**
  ```json
  [{"Type":"bind","Source":"/home/bishoy/crm-omnichannel-V5/backend","Destination":"/app"}]
  ```
  Active container `crm_backend` mounts `/home/bishoy/crm-omnichannel-V5/backend`. Changes in `crm-omnichannel-V1.6` are not being executed.

---

## 4. Component Health Scorecard

| Architectural Domain | Health Score | Operational Status | Key Vulnerability / Failure Mode |
| :--- | :---: | :---: | :--- |
| **Backend Core & APIs** | **35%** | **At Risk** | Missing `cryptography` dependency, duplicate webhook route prefix. |
| **Database & Schema** | **50%** | **At Risk** | Missing `connected_pages` table, missing composite query indexes. |
| **Real-Time & Workers** | **40%** | **At Risk** | Cross-tenant broadcast leakage, unutilized Redis Pub/Sub, no 429 backoff. |
| **Frontend Store & UI** | **65%** | **At Risk** | Pervasive static mocks (`MOCK_BRANDS`), unthrottled infinite scroll listener. |
| **Security & Authorization**| **15%** | **Broken** | Public access to all customer PII and chat messages, wildcard CORS. |
| **Deployment & Containers** | **30%** | **Broken** | Active containers execute obsolete V5 path; hardcoded fallback credentials. |

---

## 5. Certification Verdict & Remediation Roadmap

### Final Release Gate Decision: ❌ NO-GO

The system cannot be certified for cloud staging or production deployment until the sequential remediation phases below are fully executed and verified.

### Phased Remediation Plan

#### Phase 1: Build & Database Parity (Immediate)
1. Update backend Dockerfile and local environments to guarantee `cryptography>=41.0.0` is installed.
2. Execute `alembic upgrade head` in PostgreSQL to create `connected_pages`.
3. Normalize route mounting in `backend/app/main.py` for `/api/webhooks/meta`.
4. Fix missing `request` and `db` parameters in `upload_media` (`media.py:91`).

#### Phase 2: Security & RBAC Enforcement (Day 1)
1. Mandate `Depends(get_current_user)` across all conversation and customer read/write endpoints.
2. Replace wildcard CORS regex in `main.py` with an explicit origin allowlist.
3. Remove `"localhost"` from `ALLOWED_DOMAIN_SUFFIXES` in `media.py`.
4. Purge hardcoded fallback secrets from `docker-compose.prod.yml`.

#### Phase 3: Real-Time & Performance Hardening (Day 2)
1. Restrict WebSocket broadcasts by agent `brand_access` and enforce permission checks on `JOIN_CONVERSATION`.
2. Route real-time events through Redis Pub/Sub (`publish_realtime_event`).
3. Add composite indexes on `conversations` and `messages`.
4. Implement backoff and rate-limit handling in `BeonClient`.

#### Phase 4: Frontend Hydration & Deployment Synchronization (Day 3)
1. Replace `MOCK_BRANDS` across all 12 frontend views with dynamic channels from `useChannelsStore`.
2. Add scroll throttling in `ConversationList.tsx`.
3. Re-point Docker Compose bind mounts to `/home/bishoy/crm-omnichannel-V1.6` and execute full smoke testing.
