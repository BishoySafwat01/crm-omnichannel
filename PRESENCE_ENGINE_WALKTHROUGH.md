# Walkthrough — Event-Driven Inferred Customer Presence Engine

Implemented an enterprise-grade, **Event-Driven Inferred Customer Presence Engine** across FastAPI backend (PostgreSQL TIMESTAMPTZ index, WebSockets typing events, schema serialization) and React frontend (pure Arabic grammar presence utility, 30s dynamic interval ticker hook, Zustand store, and UI component bindings).

---

## 1. Accomplished Features & Architecture

### Backend Engine (`FastAPI & PostgreSQL`)
- **Database Schema & Indexing**: Added `last_activity_at` (`TIMESTAMPTZ`, `server_default=NOW()`, `index=True`) to `conversations` and `customers` tables.
- **Alembic Migration**: Created and executed migration `2026_08_21_0400-c7e908f1a234_add_last_activity_at_to_conversations_and_customers.py`.
- **Event Pipeline**: Updated `MessageService.create_message` to refresh `conversation.last_activity_at` and `customer.last_activity_at` on inbound/outbound interaction.
- **WebSockets Ephemeral Typing**: Broadcasted `customer_typing` events over WebSockets on `typing_on` webhooks.
- **API Serialization**: Updated `ConversationResponse` and `CustomerResponse` Pydantic schemas to expose `last_activity_at`.

### Frontend Engine (`React, TypeScript & Zustand`)
- **Arabic Presence Utility (`formatCustomerPresence`)**:
  - `isTyping = true` → `يكتب الآن...` (`bg-emerald-500 animate-pulse`)
  - `delta < 2 min` → `متصل الآن` (`bg-emerald-500`)
  - `2 <= delta < 60 min` → Dual: `نشط منذ دقيقتين`, Plural 3-10: `نشط منذ X دقائق`, Singular 11+: `نشط منذ X دقيقة` (`bg-slate-400`)
  - `1 <= delta_hours < 24 hr` → Dual: `نشط منذ ساعتين`, Plural 3-10: `نشط منذ X ساعات`, Singular 11+: `نشط منذ X ساعة` (`bg-slate-400`)
  - `1 <= delta_days < 30 days` → Dual: `نشط منذ يومين`, Plural 3-10: `نشط منذ X أيام`, Singular 11+: `نشط منذ X يوم` (`bg-slate-400`)
  - `delta >= 30 days` / `null` → `غير متصل` (`bg-slate-300`)
- **Dynamic 30-Second Ticker Hook (`useCustomerPresence`)**: Recomputes relative presence without requiring manual page refresh.
- **UI Bindings**:
  - `ChatCanvas.tsx` (`ChatHeader`): Render dynamic presence status text and dot.
  - `CustomerProfileSidebar.tsx`: Render dynamic customer status text and dot.
  - `ConversationList.tsx`: Render presence indicator dot on user avatar items.

---

## 2. Verification & Test Results

### Automated Backend Test Suite
Executed `docker compose exec backend pytest -v`:
```text
tests/test_presence.py::test_presence_last_activity_at_models_and_migration PASSED [ 66%]
tests/test_presence.py::test_message_service_updates_last_activity_at PASSED [ 67%]
tests/test_presence.py::test_api_conversations_includes_last_activity_at PASSED [ 68%]

============================= 80 passed in 30.64s ==============================
```

### Frontend Production Build
Executed `npm --prefix frontend run build`:
```text
vite v6.4.3 building for production...
✓ 1599 modules transformed.
dist/index.html                     0.89 kB │ gzip:  0.52 kB
dist/assets/index-et7rwp0y.css   45.14 kB │ gzip:  8.04 kB
dist/assets/index-Bf-BwRkR.js   333.15 kB │ gzip: 87.35 kB
✓ built in 15.65s
```
Zero TypeScript compilation errors.
