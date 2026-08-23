# CRM Omnichannel Frontend — Architecture & Developer Handoff

Welcome to the **CRM Omnichannel Frontend** codebase. This document serves as a comprehensive architectural guide for developers, AI assistants, and maintainers.

---

## 1. Architecture Overview

The frontend is built with **React 18 + TypeScript + Vite + Tailwind CSS + Zustand**, designed around a clean, scalable **Feature / Page-Based Architecture**.

### Key Architectural Rules:
- **Feature-Centricity:** Page-specific components and data live directly inside their feature folder (`src/pages/<Feature>/`).
- **Shared Isolation:** Only truly generic UI primitives (`src/components/ui/`), application layout components (`src/components/layout/`), and common app modals/boundaries (`src/components/common/`) live outside feature folders.
- **Service Layer Separation:** Components never perform raw `fetch` calls. All API communication routes through `src/services/` using strongly-typed methods.
- **Centralized State:** Global CRM, session, and WebSocket events are handled through Zustand stores (`src/store/`). Local UI state remains inside local components.

---

## 2. Directory Structure & Responsibilities

```
frontend/src/
├── pages/                   # Feature / Page modules
│   ├── Chat/                # Multi-pane Live Chat Workspace
│   │   ├── ChatPage.tsx     # 3-pane Layout entry point
│   │   └── components/      # Chat-specific subcomponents
│   │       ├── ChatCanvas.tsx              # Active conversation stream & composer
│   │       ├── ConversationList.tsx        # Conversation queue & multi-filter toolbar
│   │       ├── CustomerProfileSidebar.tsx  # Customer CRM profile, tags, notes & scripts
│   │       ├── ForwardMessageModal.tsx     # Message forwarding modal
│   │       ├── MessageActionsMenu.tsx      # Actions popover (edit, reply, pin, delete)
│   │       └── MessageReactionPicker.tsx   # Floating emoji reaction picker
│   │
│   ├── Comments/            # Social Comments Management
│   │   └── CommentsPage.tsx # Meta Graph API comments sync, sentiment & auto-reply
│   │
│   ├── Automation/          # Chat & Comment Automation Rules
│   │   └── AutomationPage.tsx # Trigger keywords, delay sequences & preview simulator
│   │
│   ├── Dashboard/           # SLA & Executive Analytics
│   │   └── DashboardPage.tsx # Volume by brand, channel distribution, peak hours
│   │
│   ├── Customers/           # Customer Data Hub & CRM Database
│   │   └── CustomersPage.tsx # Customer directory, filters, timeline & CSV exports
│   │
│   └── Team/                # Team Governance & Access Control
│       └── TeamPage.tsx     # Agent roster, brand access RBAC & audit logs
│
├── components/              # Shared components (Reusable across features)
│   ├── ui/                  # UI Primitives (UserAvatar, GlassCard, GlassButton, etc.)
│   ├── layout/              # App chrome (TopBar with Brand/Channel/Country filters)
│   └── common/              # App-level common components (LoginModal, IntegrationsModal, ErrorBoundary)
│
├── services/                # API communication & real-time clients
│   ├── api.ts               # Domain-grouped API methods (conversations, messages, team, comments)
│   └── websocket.ts         # Real-time WebSocket connection manager & subscriber registry
│
├── store/                   # Global State (Zustand)
│   ├── useAuthStore.ts      # Authentication, user session & tokens
│   └── useCrmStore.ts       # Conversations, active chat, filters, unread counts & team state
│
├── types/                   # Shared TypeScript domain models
│   └── crm.ts               # Conversation, Message, Customer, TeamMember, Brand, SocialComment
│
├── constants/               # Static configuration & data
│   ├── brands.ts            # Brand definitions (LAVVA, LUXIRA, etc.) with badges & page IDs
│   └── salesScripts.ts      # Structured sales playbook responses by customer tier/skin type
│
├── config/                  # Environment & connection endpoints
│   └── appConfig.ts         # API base URLs, page sizes & polling intervals
│
├── utils/                   # Shared utility helpers
│   ├── dateUtils.ts         # Chat date dividers & day comparison helpers
│   └── presence.ts          # Customer online/offline presence & typing formatting
│
├── hooks/                   # Shared custom React hooks
│   └── useCustomerPresence.ts # Real-time customer activity calculator
│
├── theme/                   # Theme tokens and glassmorphism definitions
│   ├── tokens.ts
│   └── index.ts
│
├── App.tsx                  # Root layout & active feature view router
├── main.tsx                 # React DOM mount & ErrorBoundary wrapper
└── index.css                # Tailwind CSS imports & custom scrollbar utilities
```

---

## 3. State Management (`src/store/`)

### `useCrmStore.ts`:
- **Active State:** `activeConversationId`, `conversations`, `messages`, `unreadSummary`.
- **Filtering State:** `selectedBrandId`, `selectedChannel`, `selectedCountry`, `selectedEmployeeId`, `activeFilterTab`, `searchQuery`.
- **Real-Time Integration:** `handleRealtimeEvent(event)` consumes WebSocket events (`NEW_MESSAGE`, `TYPING_INDICATOR`, `MESSAGE_STATUS`, `MESSAGE_UPDATED`, etc.) and immutably updates conversation queues and unread counters.
- **Team & Metadata:** `availableEmployees`, `availableCountries`, `fetchTeamMembers()`, `fetchAvailableCountries()`.

### `useAuthStore.ts`:
- **Session:** `user` (id, email, full_name, role, brand_access), `token`, `isAuthenticated`, `isLoading`, `error`.
- **Actions:** `login(email, password)`, `logout()`, `fetchMe()`.

---

## 4. API & Service Layer (`src/services/`)

All requests pass through `safeFetch` which includes automated authorization headers (`Bearer <token>`) and fallback endpoint cascading:
- **`apiService`**: Conversation retrieval, message history, media message dispatch.
- **`customerApi` / `adminCustomerApi`**: Customer profile management, tags, stage updates, timeline events, and notes.
- **`commentsApi`**: Social comments retrieval, Meta Graph API sync trigger, hide/unhide toggle, public and private DM replies.
- **`commentAutomationApi`**: Comment automation rules CRUD.
- **`automationApi`**: Chatbot auto-reply rules and execution log auditing.
- **`analyticsApi`**: SLA performance metrics, volume by brand, channel analytics, peak hours.
- **`teamApi`**: Team members directory, member invite/update/deactivation, audit trail.
- **`metaApi`**: Meta Graph API connection status and channel test pings.
- **`messageActionsApi`**: Message reactions, message edit, pin, delete, forward.

---

## 5. Domain Types (`src/types/crm.ts`)

| Type / Interface | Description |
| :--- | :--- |
| `Conversation` | Represents a live customer conversation (brand, channel, status, unread count, SLA, AI summary). |
| `Message` | Individual message in a thread (text, media, sender_type, sender_user_id, delivery status, reactions). |
| `Customer` | CRM profile of the lead (display name, phone, email, location, skin type, tier, stage, tags). |
| `TeamMember` | System user / employee (id, email, full_name, role: admin/supervisor/agent, brand_access). |
| `SocialComment` | Meta social post comment (post_id, post_title, post_url, comment_id, sentiment, is_hidden). |
| `CommentAutomationRule`| Keyword-based automation rule for social comments with optional public reply and private DM. |
| `WebSocketEvent` | Normalized incoming real-time event dispatched from the backend WS manager. |

---

## 6. Real-Time WebSocket Architecture

1. `App.tsx` establishes a singleton connection via `realtimeService.connect()`.
2. A periodic `PING` maintains connection liveness.
3. If WebSocket is connected, background polling is automatically suppressed.
4. Incoming events are dispatched directly to `useCrmStore.handleRealtimeEvent(event)` to update message lists, badge counts, and typing indicators without requiring full page refetches.

---

## 7. How to Run & Build

### Development:
```bash
# From repository root:
npm --prefix frontend run dev

# Or directly in frontend folder:
cd frontend
npm run dev
```
Development server runs on `http://localhost:3000` (proxies `/api` and `/ws` to `http://localhost:8000`).

### Production Build:
```bash
npm --prefix frontend run build
```
Executes `tsc` (TypeScript compiler) followed by `vite build`. Output is written to `frontend/dist/`.

---

## 8. Connecting to a Different Backend

To change the backend target:
1. **In Development:** Edit `frontend/vite.config.ts` under `server.proxy` to point `/api` and `/ws` to your target backend address.
2. **In Production:** Configure `src/config/appConfig.ts` (`API_BASE` and `FALLBACK_API_BASE`).

---

## 9. Known Backend Dependencies & Pending Endpoints

1. **Meta Page Profile Picture:** The backend `ConversationResponse` returns `brand: str` but does not currently include a live `page_avatar_url`. The frontend gracefully renders an adaptive store icon placeholder until the field is exposed by backend.
2. **Server-side Message Delay Engine:** Chat automation message splitting and delays are configured and simulated in the frontend modal (`AutomationPage.tsx`). Delayed queue execution in production will require backend Celery/Redis queue implementation.
