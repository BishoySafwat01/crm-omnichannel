#!/usr/bin/env bash
# ==============================================================================
# LUXIRA CRM OMNICHANNEL - LOCAL SHIPPER TO AWS EC2
# ==============================================================================
set -euo pipefail

EC2_IP="${1:-}"
PEM_KEY="${2:-}"

if [ -z "$EC2_IP" ] || [ -z "$PEM_KEY" ]; then
    echo "Usage: $0 <EC2_PUBLIC_IP> <PEM_KEY_PATH>"
    echo "Example: $0 54.210.120.45 ~/.ssh/luxira-key.pem"
    exit 1
fi

PEM_KEY="${PEM_KEY/#\~/$HOME}"

if [ ! -f "$PEM_KEY" ]; then
    echo "❌ Error: PEM key not found at '$PEM_KEY'"
    exit 1
fi

# Ensure correct PEM permissions
chmod 400 "$PEM_KEY" || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# Verify required bundle files exist
if [ ! -f "crm_deploy.tar.gz" ]; then
    echo "❌ Error: crm_deploy.tar.gz not found in $ROOT_DIR. Please run packaging first."
    exit 1
fi

if [ ! -f "crm_backup.sql" ]; then
    echo "❌ Error: crm_backup.sql not found in $ROOT_DIR. Please export database first."
    exit 1
fi

echo "===================================================================="
echo "🚀 Shipping Luxira CRM to Amazon EC2 ($EC2_IP)..."
echo "===================================================================="

# 1. Transfer archive, SQL dump, and bootstrap script
echo "📤 Transferring files to remote host (ubuntu@$EC2_IP)..."
scp -i "$PEM_KEY" -o StrictHostKeyChecking=no \
    crm_deploy.tar.gz \
    crm_backup.sql \
    scripts/ec2_bootstrap.sh \
    ubuntu@"$EC2_IP":~/

echo "✅ File transfer complete."

# 2. Trigger remote bootstrap script via SSH
echo "⚡ Initiating remote EC2 bootstrap process via SSH..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no -t ubuntu@"$EC2_IP" \
    "chmod +x ~/ec2_bootstrap.sh && ~/ec2_bootstrap.sh"

echo "===================================================================="
echo "🎯 Remote deployment process finished!"
echo "===================================================================="
