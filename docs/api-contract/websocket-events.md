# WebSocket Protocol Contract — `/ws/chat`

**Source of truth:** branch `remediation/p0-p1-fixes` — backend `app/api/v1/ws.py` + broadcast call-sites across `app/services/*` and `app/api/v1/conversations.py`; frontend `services/websocket.ts`, `store/useCrmStore.ts:handleRealtimeEvent`, `App.tsx`.
**Purpose:** freeze the current wire protocol so the SignalR port can be verified for behavioral parity before any change.

> ⚠️ **Deferred issues carried into the port** (documented, intentionally not fixed here):
> - Broadcasts are **unscoped**: every connected user receives every event, regardless of brand/channel access (`ws.py:47-60`). This is the deferred WS-scoping P1.
> - The endpoint is registered **twice** in `main.py` (bare `/ws/chat` and `/api/v1/ws/chat`) — same handler, doubled surface. Frontend uses `/ws/chat`.
> - The **typing feature is dead end-to-end**: no backend emitter and no frontend sender exist (see events 8a/8b below).

---

## Transport & Authentication

| Aspect | Current behavior |
|---|---|
| URL | `ws(s)://{host}/ws/chat` |
| Auth | **JWT passed as query string**: `?token=<JWT>` (`websocket.ts:22-27`) — flagged P2; must move to SignalR `access_token` negotiation in the .NET port |
| Handshake rejection | Invalid/expired token → server closes with **code `4001`** before accept (`ws.py:96-100`); frontend stops reconnecting on 4001 but does NOT log the user out (known gap) |
| Reconnect | Frontend auto-reconnects: 3 s initial, ×1.5 backoff, 15 s cap (`websocket.ts:10-12`) |
| Keepalive | Client sends `{type:"PING"}` every 10 s (`App.tsx:66`); server replies `{type:"PONG"}` |
| Message framing | JSON text frames, one object per frame, discriminator field `type` |

---

## Event Catalog

### A. Client → Server (2)

#### 1. `PING`
- **Emitted by:** frontend heartbeat, every 10 s (`App.tsx:63-71`)
- **Payload:** `{ "type": "PING" }`
- **Server handling:** replies `{type:"PONG"}` (`ws.py:107-108`)
- **Port note:** replaced by SignalR's built-in heartbeat; do not port as a hub method.

#### 2. `TYPING_INDICATOR` / `MESSAGE_STATUS` *(relay-only, vestigial)*
- **Emitted by:** nobody in this codebase (no frontend sender found)
- **Server handling:** if received, the raw object is rebroadcast verbatim to ALL users (`ws.py:109-110`)
- **Payload:** arbitrary — whatever the sender includes
- **Port note:** either implement properly (typed payload + scoping) or drop. Do not port the verbatim-relay behavior.

### B. Server → Client (9)

#### 3. `PONG`
- **Emitted by:** server, in response to `PING`
- **Payload:** `{ "type": "PONG" }`
- **Consumed by:** frontend connection-state detection (`App.tsx:54-59`; note the condition `event.type === 'PONG' || event.type` is always truthy — any event marks the socket "connected")

#### 4. `NEW_MESSAGE` ✅ consumed
- **Emitted by (4 sites):**
  - `meta_import_service.py:609` (webhook single-message path)
  - `meta_import_service.py:666` (webhook attachment path)
  - `meta_import_service.py:1037` (5-second poller path)
  - `automation_service.py:154` (auto-reply dispatched as agent message)
- **Payload shape:**
  ```json
  {
    "type": "NEW_MESSAGE",
    "conversation_id": "uuid-string",
    "message": {
      "id": "uuid-string",
      "conversation_id": "uuid-string",
      "external_message_id": "string|null",
      "sender_type": "customer|agent|system",
      "sender_external_id": "string|null",
      "message_type": "text|image|video|audio|file|share_reel|share_post|system|unknown",
      "text": "string|null",
      "created_at": "ISO-8601 string",
      "delivery_status": "delivered"
    }
  }
  ```
  (automation path hard-codes `"sender_type":"agent"`, `"sender_external_id":"automation_bot"`, `"delivery_status":"delivered"`; poller/webhook paths build the equivalent fields per message)
- **Consumed by:** `useCrmStore.handleRealtimeEvent` → appends message (dedup by `id`/`external_message_id`), bumps unread counters, refreshes unread summary
- ⚠️ **Casing quirk #1:** frontend also accepts lowercase `'new_message'` (`useCrmStore.ts:755`) — **no backend site emits it today**; it is defensive legacy. **Canonical for .NET: `NEW_MESSAGE`.**

#### 5. `CONVERSATION_READ` ✅ consumed
- **Emitted by:** `POST /conversations/{id}/read` route (`conversations.py:106`)
- **Payload:**
  ```json
  { "type": "CONVERSATION_READ", "conversation_id": "uuid-string", "unread_count": 0 }
  ```
- **Consumed by:** frontend triggers `fetchUnreadSummary()` only (`useCrmStore.ts:732-735`); it does not use the payload fields.

#### 6. `CONVERSATION_ASSIGNED` ❌ emitted, NOT consumed — two divergent shapes
- **Emitter 1:** manual-assign route `PATCH /conversations/{id}/assign` (`conversations.py:~416`)
  ```json
  { "type": "CONVERSATION_ASSIGNED",
    "data": { "conversation_id": "uuid", "assigned_agent_id": "uuid|null",
              "assigned_by_user_id": "uuid|null", "reason": "string|null" } }
  ```
- **Emitter 2:** smart routing `routing_service.py:129`
  ```json
  { "type": "CONVERSATION_ASSIGNED",
    "data": { "conversation_id": "uuid", "assigned_agent_id": "uuid",
              "assigned_agent_name": "string", "reason": "string" } }
  ```
- **Consumed by:** nothing (frontend has no handler). ⚠️ Shapes differ (`assigned_agent_name` vs `assigned_by_user_id`) — unify during port even though no consumer exists yet.

#### 7. `SLA_BREACHED` ❌ emitted, NOT consumed
- **Emitted by:** SLA evaluator loop (`sla_service.py:88-101`), inside its 30-second cycle
- **Payload:**
  ```json
  { "type": "SLA_BREACHED",
    "data": { "conversation_id": "uuid", "brand": "string|null",
              "sla_due_at": "ISO-8601|null", "priority": "urgent" } }
  ```

#### 8a. `CUSTOMER_BLOCKED` ✅ consumed
- **Emitted by:** `CustomerService.block_customer` (`customer_service.py:364-372`)
- **Payload:**
  ```json
  { "type": "CUSTOMER_BLOCKED", "customer_id": "uuid", "is_blocked": true, "blocked_reason": "string|null" }
  ```
- **Consumed by:** store patches matching conversations' embedded customer objects.

#### 8b. `CUSTOMER_UNBLOCKED` ✅ consumed
- **Emitted by:** `CustomerService.unblock_customer` (`customer_service.py:425-433`)
- **Payload:**
  ```json
  { "type": "CUSTOMER_UNBLOCKED", "customer_id": "uuid", "is_blocked": false }
  ```
  (note: **no** `blocked_reason` field, unlike BLOCKED — frontend reads it defensively via optional access)

#### 9. Typing indicators — `TYPING_INDICATOR` / `customer_typing` ✅ consumed / ⚠️ never emitted
- **Consumed by:** `useCrmStore.ts:737-753` accepts **both casings**, sets a per-conversation typing flag that self-clears after 5 s:
  ```json
  { "type": "TYPING_INDICATOR", "conversation_id": "uuid", "is_typing": true }
  ```
- **Emitted by:** **nobody** — no backend emitter, no frontend sender exists in this tree. The feature is fully vestigial here.
- ⚠️ **Casing quirk #2:** dual casing accepted, zero emitters. **Canonical for .NET: pick `TYPING_INDICATOR`** when/if the feature is implemented properly.

#### 10. `conversation:unmatched_escalation` ❌ emitted, NOT consumed
- **Emitted by:** automation engine escalation path (`automation_service.py:182-189`)
- **Payload:**
  ```json
  { "type": "conversation:unmatched_escalation", "conversation_id": "uuid",
    "priority": "urgent", "customer_name": "string" }
  ```
- ⚠️ **Naming quirk #3:** the only colon-namespaced (`domain:event`) event in the protocol — everything else is SCREAMING_SNAKE. Normalize to `UNMATCHED_ESCALATION` in .NET or drop.

#### 11. `new_message` (lowercase) — accepted, never emitted
See quirk #1 under event 4. Listed separately so contract tests explicitly assert it is **absent** from the wire after the port (unless a compatibility shim is chosen).

---

## Casing Summary & Canonical Decisions for the .NET Port

| Quirk | Forms seen | Currently emitted? | Canonical decision proposed |
|---|---|---|---|
| #1 | `NEW_MESSAGE` / `new_message` | only `NEW_MESSAGE` | `NEW_MESSAGE` |
| #2 | `TYPING_INDICATOR` / `customer_typing` | neither | `TYPING_INDICATOR` (if implemented) |
| #3 | `conversation:unmatched_escalation` | yes | rename to `UNMATCHED_ESCALATION` |

Frontend `types/crm.ts` union (`WebSocketEvent.type`) currently declares: `NEW_MESSAGE | MESSAGE_STATUS | TYPING_INDICATOR | PONG | customer_typing | new_message` — note it omits five backend-emitted types (`CONVERSATION_READ`, `CONVERSATION_ASSIGNED`, `SLA_BREACHED`, `CUSTOMER_BLOCKED/UNBLOCKED`, `conversation:unmatched_escalation`), which reach handlers only through `(event as any)` casts.

## Port Checklist (SignalR)
1. Move auth off query string → `access_token` negotiate + `[Authorize]` hub (P2 fix lands here).
2. Replace global broadcast with per-user groups; enforce brand/channel scoping server-side (deferred P1).
3. Single canonical event names per table above; drop dead listeners (`customer_typing`, `MESSAGE_STATUS`) or implement them deliberately.
4. Preserve `message` sub-object field names exactly (they mirror `MessageResponse` schema fields used by `useCrmStore` dedup/update logic).
5. Remove duplicate `/api/v1/ws` route registration.
