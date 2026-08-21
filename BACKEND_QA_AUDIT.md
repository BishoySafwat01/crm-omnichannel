# BACKEND_QA_AUDIT.md — Defect & Security Audit Log

## Total Discovered Defects: 35

### Defect AUTH-01 — POST /api/v1/auth/login
- **Notes**: ['Unexpected status code 401: {"detail":"Incorrect email or password."}']

### Defect AUTH-02 — POST /api/v1/auth/logout
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}']

### Defect AUTH-03 — GET /api/v1/auth/me
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}']

### Defect GENERAL-01 — GET /api/v1/admin/automations
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-02 — POST /api/v1/admin/automations
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Invalid payload returned status 401 instead of 400/422', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-03 — PATCH /api/v1/admin/automations/{rule_id}
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Invalid payload returned status 401 instead of 400/422', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-04 — DELETE /api/v1/admin/automations/{rule_id}
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-05 — GET /api/v1/admin/automations/logs
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-06 — GET /api/v1/admin/analytics/overview
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-07 — GET /api/v1/admin/analytics/channels
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-08 — GET /api/v1/admin/analytics/brands
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-09 — GET /api/v1/admin/analytics/peak-hours
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-10 — GET /api/v1/admin/analytics/sla
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-11 — GET /api/v1/admin/customers/
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-12 — GET /api/v1/admin/customers
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-13 — GET /api/v1/admin/customers/export
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect GENERAL-14 — GET /api/v1/admin/customers/stats
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect ADMIN_TEAM-01 — GET /api/v1/admin/team/members
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect ADMIN_TEAM-02 — POST /api/v1/admin/team/members
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Invalid payload returned status 401 instead of 400/422', 'Agent user accessed admin route with status HTTP 401']

### Defect ADMIN_TEAM-03 — PATCH /api/v1/admin/team/members/{user_id}
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Invalid payload returned status 401 instead of 400/422', 'Agent user accessed admin route with status HTTP 401']

### Defect ADMIN_TEAM-04 — DELETE /api/v1/admin/team/members/{user_id}
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect ADMIN_TEAM-05 — GET /api/v1/admin/team/audit-logs
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}', 'Agent user accessed admin route with status HTTP 401']

### Defect CONVERSATIONS-04 — POST /api/v1/conversations/{conversation_id}/auto-assign
- **Notes**: ['Unexpected status code 401: {"detail":"Authentication token required."}']

### Defect CONVERSATIONS-08 — POST /api/v1/conversations/{conversation_id}/messages
- **Notes**: ['Unauthenticated request returned HTTP 400 instead of 401/403']

### Defect CONVERSATIONS-09 — PATCH /api/v1/conversations/{conversation_id}/status
- **Notes**: ['Unexpected status code 500: Internal Server Error', 'Invalid payload returned status 500 instead of 400/422']

### Defect CONVERSATIONS-10 — PATCH /api/v1/conversations/{conversation_id}/assign
- **Notes**: ['Invalid payload returned status 200 instead of 400/422', 'Unauthenticated request returned HTTP 200 instead of 401/403']

### Defect CONVERSATIONS-11 — PATCH /api/v1/conversations/{conversation_id}/priority
- **Notes**: ['Unexpected status code 422: {"detail":[{"type":"missing","loc":["body"],"msg":"Field required","input":null}]}', 'Invalid payload returned status 200 instead of 400/422']

### Defect CONVERSATIONS-12 — POST /api/v1/conversations/sync-now
- **Notes**: ['Exception during positive test: ']

### Defect MEDIA-02 — GET /api/v1/media/proxy
- **Notes**: ['Unexpected status code 403: {"detail":"Forbidden media host"}']

### Defect META_INTEGRATION_INTERNAL-03 — POST /api/v1/meta/import
- **Notes**: ['Exception during positive test: ']

### Defect META_INTEGRATION_INTERNAL-06 — POST /api/v1/meta/posts
- **Notes**: ['Unexpected status code 403: {"detail":"Meta API Error (403): (#200) If posting to a group, requires app being installed in the group, and \\\\\\n      ']

### Defect META_INTEGRATION_INTERNAL-07 — GET /api/v1/meta/webhook
- **Notes**: ['Unexpected status code 403: {"detail":"Invalid verification token."}']

### Defect META_INTEGRATION_INTERNAL-08 — POST /api/v1/meta/webhook
- **Notes**: ['Unexpected status code 401: {"detail":"Invalid X-Hub-Signature-256 signature."}']

### Defect WEBHOOKS-01 — GET /api/webhooks/meta
- **Notes**: ['Unexpected status code 403: {"detail":"Invalid verification token."}']

### Defect WEBHOOKS-02 — POST /api/webhooks/meta
- **Notes**: ['Unexpected status code 401: {"detail":"Invalid X-Hub-Signature-256 signature."}']

