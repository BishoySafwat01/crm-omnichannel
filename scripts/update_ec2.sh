#!/usr/bin/env bash
# ==============================================================================
# LUXIRA CRM OMNICHANNEL - PRODUCTION ZERO-DOWNTIME UPDATE ENGINE
# Target Host: ubuntu@56.228.61.46 (AWS EC2 eu-north-1)
# Production Domain: https://webluxira.com
# ==============================================================================
set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration Defaults
# ------------------------------------------------------------------------------
EC2_IP="${1:-56.228.61.46}"
DOMAIN="${2:-webluxira.com}"
REMOTE_USER="ubuntu"
REMOTE_DIR="~/crm-omnichannel"
ARCHIVE_NAME="crm_update.tar.gz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "===================================================================="
echo "LUXIRA CRM OMNICHANNEL - PRODUCTION DEPLOYMENT PIPELINE"
echo "Target Host   : ${REMOTE_USER}@${EC2_IP}"
echo "Target Domain : https://${DOMAIN}"
echo "Local Root    : ${ROOT_DIR}"
echo "===================================================================="

# ------------------------------------------------------------------------------
# Stage 1: Keypair Resolution & Permission Enforcement
# ------------------------------------------------------------------------------
echo "[Stage 1/6] Resolving SSH Private Key..."

KEY_PATH="${SSH_KEY_PATH:-}"
if [ -z "$KEY_PATH" ]; then
    if [ -f "${ROOT_DIR}/luxira-key.pem" ]; then
        KEY_PATH="${ROOT_DIR}/luxira-key.pem"
    elif [ -f "${HOME}/Downloads/luxira-key.pem" ]; then
        KEY_PATH="${HOME}/Downloads/luxira-key.pem"
    elif [ -f "${HOME}/.ssh/luxira-key.pem" ]; then
        KEY_PATH="${HOME}/.ssh/luxira-key.pem"
    fi
fi

if [ -z "$KEY_PATH" ] || [ ! -f "$KEY_PATH" ]; then
    echo "[-] Error: Private key 'luxira-key.pem' not found in root or ~/Downloads."
    echo "    Please provide key via SSH_KEY_PATH environment variable."
    exit 1
fi

echo "[+] Resolved SSH Key: ${KEY_PATH}"
chmod 400 "$KEY_PATH" || true

# ------------------------------------------------------------------------------
# Stage 2: Local Pre-Flight Verification Gates
# ------------------------------------------------------------------------------
echo "[Stage 2/6] Executing Local Pre-Flight Verification Gates..."

cd "$ROOT_DIR"

# 2a. Python Syntax & Compilation Gate
echo " -> Validating Python backend syntax..."
PYTHON_BIN="${ROOT_DIR}/backend/.venv/bin/python3"
if [ ! -x "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

"$PYTHON_BIN" -m py_compile \
    "${ROOT_DIR}/backend/app/main.py" \
    $(find "${ROOT_DIR}/backend/app/api" "${ROOT_DIR}/backend/app/services" "${ROOT_DIR}/backend/app/models" "${ROOT_DIR}/backend/app/repositories" -name "*.py")
echo "[+] Python backend syntax verified successfully."

# 2b. Vite Production Build Gate
echo " -> Validating React/TypeScript frontend production build..."
cd "${ROOT_DIR}/frontend"
npm run build
cd "$ROOT_DIR"
echo "[+] Frontend build verified successfully."

# ------------------------------------------------------------------------------
# Stage 3: Clean Tarball Packaging (Artifact Sanitation)
# ------------------------------------------------------------------------------
echo "[Stage 3/6] Packaging deployment artifact..."

cd "$ROOT_DIR"
rm -f "$ARCHIVE_NAME"

tar --warning=no-file-changed \
    --exclude='frontend/node_modules' \
    --exclude='frontend/dist' \
    --exclude='backend/.venv' \
    --exclude='backend/__pycache__' \
    --exclude='*__pycache__*' \
    --exclude='.pytest_cache' \
    --exclude='.gemini' \
    --exclude='.git' \
    --exclude='*.sql' \
    --exclude='*.pem' \
    --exclude='uploads' \
    --exclude='uploads/*' \
    --exclude='crm_backup.sql' \
    --exclude='crm_deploy.tar.gz' \
    --exclude="${ARCHIVE_NAME}" \
    -czf "${ARCHIVE_NAME}" . || [ $? -le 1 ]

ARCHIVE_SIZE=$(du -h "${ARCHIVE_NAME}" | cut -f1)
echo "[+] Created clean artifact: ${ARCHIVE_NAME} (${ARCHIVE_SIZE})"

# ------------------------------------------------------------------------------
# Stage 4: Secure Transfer to Remote Host
# ------------------------------------------------------------------------------
echo "[Stage 4/6] Transferring artifact to ${REMOTE_USER}@${EC2_IP}..."

scp -i "$KEY_PATH" -o StrictHostKeyChecking=no "${ARCHIVE_NAME}" "${REMOTE_USER}@${EC2_IP}:~/"
rm -f "${ARCHIVE_NAME}"
echo "[+] Artifact transferred successfully."

# ------------------------------------------------------------------------------
# Stage 5: Remote In-Place Update & Targeted Container Rebuild
# ------------------------------------------------------------------------------
echo "[Stage 5/6] Executing remote in-place container rebuild..."

ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "${REMOTE_USER}@${EC2_IP}" "bash -s" << REMOTE_SSH_EOF
set -euo pipefail

echo " -> Unpacking deployment archive into ${REMOTE_DIR}..."
mkdir -p ${REMOTE_DIR}
tar -xzf ~/${ARCHIVE_NAME} -C ${REMOTE_DIR}/
rm -f ~/${ARCHIVE_NAME}

cd ${REMOTE_DIR}

echo " -> Rebuilding and updating application containers (preserving database volumes)..."
sudo docker compose -f docker-compose.prod.yml up -d --build backend_api frontend_build nginx_proxy

echo "[+] Application containers rebuilt and reloaded."
REMOTE_SSH_EOF

# ------------------------------------------------------------------------------
# Stage 6: Health Check & Verification
# ------------------------------------------------------------------------------
echo "[Stage 6/6] Verifying remote deployment health..."

echo " -> Remote Docker Container Status:"
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "${REMOTE_USER}@${EC2_IP}" \
    "sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

echo " -> Probing HTTPS Production Endpoint (https://${DOMAIN})..."
HTTP_STATUS=$(curl -Is "https://${DOMAIN}" | head -n 1 || echo "Curl probe failed")
echo "[+] Health Probe Result: ${HTTP_STATUS}"

echo "===================================================================="
echo "DEPLOYMENT COMPLETE: https://${DOMAIN}"
echo "===================================================================="
