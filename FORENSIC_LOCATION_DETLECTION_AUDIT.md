# FORENSIC_LOCATION_DETLECTION_AUDIT.md — Customer Location Diagnostics Report

## 1. Executive Summary

This diagnostic investigation examined why typing `"اهلا بيك في فرع الصين"` in the chat canvas did not update the customer details ("بيانات العميل") for `Bishoy Safwat` in `CustomerProfileSidebar.tsx`.

---

## 2. Direct Database & System State Findings

### A. Current PostgreSQL Database State (`customers` table)
```text
ID: 2c744297-e394-4eb1-8c92-56588e65f5d9
Name: Bishoy Safwat
Location: السعودية 🇸🇦
Country: None
City: None
```

### B. Recent Chat Window Messages
```text
- Agent: "اهلا بيك في فرع مصر"
- Agent: "فرع السعودية"
- Agent: "اهلا بيك في فرع الصين"
- Agent: "اهلا بك في فرع تركيا"
- Agent: "عميل من مصر"
```

---

## 3. Root-Cause Analysis & Technical Findings

### 1. Absence of Auto-Location Extraction Engine
- **Finding**: Typing a message in the chat box (e.g., `"اهلا بيك في فرع الصين"`) sends an HTTP `POST /api/v1/conversations/{id}/messages` request.
- Currently, `message_service.py` persists the text message to PostgreSQL, but **there is NO message listener, regex parser, or AI hook that extracts country names from chat text and mutates `customer.country`**.

### 2. Groq AI Copilot Scope
- `backend/app/services/llm/prompts.py` (`COPILOT_SYSTEM_PROMPT`) currently extracts `summary`, `intent`, `sentiment`, `suggested_replies`, and `is_urgent`.
- It **does not currently extract a `detected_country` field** or trigger a database update on the `Customer` ORM instance.

### 3. Manual Profile Edit Behavior
- Manual editing in `CustomerProfileSidebar.tsx` works 100% via `PATCH /api/v1/customers/{id}`.
- Because `"الصين"` was typed as a chat message rather than submitted via the sidebar edit form, `customer.location` remained as its existing database value `"السعودية 🇸🇦"`.

---

## 4. Recommended Fix Strategy (For Phase 2 Auto-Extraction Engine)

1. **AI Copilot Location Extraction (`prompts.py` & `groq_client.py`)**:
   - Add `"detected_location": "Optional extracted country/city name from transcript"` to the Groq System Prompt schema.
2. **Auto-Update Customer Record (`ai_service.py`)**:
   - In `AIService.analyze_conversation`: if `ai_res.get("detected_location")` is extracted and non-empty, auto-update `conversation.customer.country` and `conversation.customer.location` in PostgreSQL.
3. **Real-Time NLP Message Parser (`message_service.py`)**:
   - Add a lightweight location keyword extractor (e.g. matching `"فرع [الدولة]"`, `"من [الدولة]"`, `"في [الدولة]"`) on outbound/inbound messages to auto-set customer country.
