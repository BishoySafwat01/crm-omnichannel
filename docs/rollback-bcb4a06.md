# Production Disaster Recovery & Operational Rollback Runbook

- **Target System:** Luxira Omnichannel CRM (`https://webluxira.com`)
- **Host:** AWS EC2 (`ubuntu@56.228.61.46`, Region: `eu-north-1`)
- **Target Baseline Commit (Revert Target):** `ec8f4de3ae12f7f581f3c40eaf2e83dce3867f41` (`ec8f4de`)
- **Release Commits Under Scope:** `bcb4a06` through `HEAD` (`8f09594`)
- **Document Date:** 2026-09-10
- **Author:** Principal DevOps Engineer & Site Reliability Lead
- **Operational Status:** RUNBOOK ONLY — The production environment is currently healthy and operational.

---

## 1. Executive Summary

This runbook defines the authoritative operational procedure to roll back the production deployment at `https://webluxira.com` from the recent refactoring release train back to the verified pre-refactor baseline commit `ec8f4de`.

### Release Train Scope Under Reversion
The release train under review comprises the following sequence of commits:
1. `bcb4a06` — `refactor(architecture): isolate LLMProviderPort and decompose ChatCanvas component`
2. `db4094a` — `fix(chat): restore textareaRef autofocus on smart reply sync and message edit`
3. `fd6c522` — `fix(backend): add STICKER to MessageTypeEnum to prevent LookupError on sticker messages`
4. `0c87349` — `fix(backend): use SafeMessageType TypeDecorator to handle case-insensitive message types and fallback`
5. `e9a0ce1` — `feat(realtime): enhance room re-subscription on websocket open/reconnect and expose store`
6. `33d8b54` — `fix(chat): support direct audio/image URLs in text field with .aac and clean presentation`
7. `30f40fc` — `fix(frontend): strip /uploads/ prefix from absolute http(s) URLs in mediaResolver`
8. `325073b` — `docs(architecture): document full frontend decomposition diff for bcb4a06`
9. `8f09594` — `refactor(backend): clean up stateless DI pattern for AIService and LLMProviderPort`

---

## 2. Target Baseline Reversion Point

| Attribute | Specification |
| :--- | :--- |
| **Commit SHA (Full)** | `ec8f4de3ae12f7f581f3c40eaf2e83dce3867f41` |
| **Commit SHA (Short)** | `ec8f4de` |
| **Commit Date** | `Wed Sep 9 09:53:37 2026 +0300` |
| **Commit Subject** | `refactor(architecture): isolate media storage gateway and decompose crm store into domain slices` |
| **Branch** | `feature/crm-omnichannel-V1.6` |
| **Pre-Release Architectural State** | Monolithic `ChatCanvas.tsx` (~1,943 lines), legacy `AIService` implementation, pre-refactor composer and header components. |

---

## 3. Database Migration & Schema Audit

An exhaustive forensic audit was conducted on Alembic database migration scripts across the entire commit span between `ec8f4de` and `HEAD`:

```bash
git diff ec8f4de HEAD -- backend/alembic/versions/
```

### Audit Findings:
- **Output:** `0 files changed, 0 insertions, 0 deletions`.
- **Active Schema Revision:** `2026_09_09_0459-7c741bfb4b41_add_performance_composite_indexes.py` (Revision: `7c741bfb4b41`).
- **Schema Changes Between Revisions:** Zero database tables, columns, indexes, or constraints were created, modified, or dropped between `ec8f4de` and `HEAD`.
- **Application-Level Enums:** The addition of `STICKER = "sticker"` and `SafeMessageType` in `backend/app/models/` operates entirely at the SQLAlchemy Python application layer via a `TypeDecorator`, with no underlying PostgreSQL schema alterations.

### Database Downgrade Verdict:
> [!IMPORTANT]
> **NO `alembic downgrade` STEP IS REQUIRED.**  
> The PostgreSQL database schema is 100% binary- and schema-compatible between `ec8f4de` and `HEAD`. Under no circumstances should `alembic downgrade` or database volume resets be executed.

---

## 4. Rollback Execution Runbooks

### Method A: Automated Deployment Rollback via Script (Recommended)

This method utilizes the existing zero-downtime deployment script `./scripts/update_ec2.sh` to package and deploy code at the `ec8f4de` baseline:

```bash
# Step 1: Ensure current working directory is clean
cd /home/bishoy/crm-omnichannel-V1.6
git status

# Step 2: Create a detached branch at the baseline commit
git checkout -b emergency-rollback-ec8f4de ec8f4de

# Step 3: Verify local build gates pass on the baseline code
python3 -m py_compile backend/app/**/*.py
cd frontend && npm ci && npm run build && cd ..

# Step 4: Execute the production deployment pipeline
SSH_KEY_PATH="/home/bishoy/Downloads/luxira-key.pem" ./scripts/update_ec2.sh 56.228.61.46 webluxira.com

# Step 5: Switch back to working branch after deployment
git checkout feature/crm-omnichannel-V1.6
```

---

### Method B: Git Revert Commit Train (Preserves Linear History)

If the team prefers to maintain a continuous, auditable Git history on `feature/crm-omnichannel-V1.6`:

```bash
cd /home/bishoy/crm-omnichannel-V1.6

# Step 1: Create a single revert commit reversing all changes from ec8f4de to HEAD
git revert --no-commit ec8f4de..HEAD

# Step 2: Commit the revert
git commit -m "revert(release): emergency rollback of release train to baseline ec8f4de"

# Step 3: Push revert to remote repository
git push origin feature/crm-omnichannel-V1.6

# Step 4: Deploy reverted state to EC2
SSH_KEY_PATH="/home/bishoy/Downloads/luxira-key.pem" ./scripts/update_ec2.sh 56.228.61.46 webluxira.com
```

---

### Method C: Emergency In-Place Container Rebuild via Remote SSH

If local network connectivity is restricted and rollback must be performed directly on the EC2 host:

```bash
# Step 1: SSH into the production EC2 host
ssh -i /home/bishoy/Downloads/luxira-key.pem ubuntu@56.228.61.46

# Step 2: Navigate to the remote deployment directory
cd ~/crm-omnichannel

# Step 3: Confirm container status
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Step 4: Rebuild containers with cached base images if previous images exist
# List previous image tags:
sudo docker images | grep crm-omnichannel

# Step 5: Force recreation of application containers (preserving postgres & redis volumes)
sudo docker compose -f docker-compose.prod.yml up -d --build backend_api frontend_build nginx_proxy

# Step 6: Verify health
curl -s http://localhost:8000/api/v1/health
```

---

## 5. Post-Rollback Verification & Smoke Testing Protocol

After executing any of the rollback methods above, run the following verification steps:

### 1. API Health & Database Connectivity Probe
```bash
curl -s -f https://webluxira.com/api/v1/health | jq .
```
**Expected Output:**
```json
{
  "status": "ok",
  "postgres": "healthy",
  "redis": "healthy"
}
```

### 2. Container Status Inspection
```bash
ssh -i /home/bishoy/Downloads/luxira-key.pem ubuntu@56.228.61.46 \
  "sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```
**Expected Status:**
- `crm_prod_nginx` — Up (ports `0.0.0.0:80->80/tcp`, `0.0.0.0:443->443/tcp`)
- `crm_prod_frontend` — Up (port `80/tcp`)
- `crm_prod_backend` — Up (ports `8000/tcp`, `8080/tcp`)
- `crm_prod_postgres` — Up (healthy) (port `5432/tcp`)
- `crm_prod_redis` — Up (healthy) (port `6379/tcp`)

### 3. Database Data Integrity Check (Zero Data Loss)
```bash
ssh -i /home/bishoy/Downloads/luxira-key.pem ubuntu@56.228.61.46 \
  "sudo docker exec crm_prod_postgres psql -U crm_admin -d crm_omnichannel_v16 -c 'SELECT count(*) as total_conversations FROM conversations; SELECT count(*) as total_messages FROM messages;'"
```
**Expected Outcome:** Total counts match pre-rollback levels with zero data loss.

### 4. WebSocket Connectivity Check
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: webluxira.com" \
  -H "Origin: https://webluxira.com" \
  https://webluxira.com/ws
```
**Expected Response:** HTTP 101 Switching Protocols or WebSocket handshake negotiation.

### 5. Frontend End-to-End Visual Check
1. Open `https://webluxira.com` in a clean browser profile or Incognito window.
2. Log in using `admin@luxira.com`.
3. Open conversation `15ac3ad3-4f24-4c4c-9f7b-91b8f38a20e3`.
4. Verify conversation thread renders, outbound messages can be typed and sent, and no React runtime boundary error toasts appear.

---

## 6. Escalation & Contact Matrix

| Role | Contact | Responsibility |
| :--- | :--- | :--- |
| **Site Reliability Engineer** | Bishoy Safwat | Rollback Execution & Verification |
| **Lead Architect** | Bishoy Safwat | Architectural Incident Evaluation |
| **Cloud Infrastructure Provider** | AWS Support (eu-north-1) | Host & Networking Liveness |
