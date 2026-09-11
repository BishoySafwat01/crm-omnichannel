#!/usr/bin/env bash
# ==============================================================================
# LUXIRA CRM OMNICHANNEL - EC2 ONE-CLICK BOOTSTRAP & CLOUDFLARE TUNNEL SCRIPT
# ==============================================================================
set -euo pipefail

echo "===================================================================="
echo "🚀 Starting Automated EC2 Bootstrap for Luxira CRM Omnichannel"
echo "===================================================================="

# 1. Update system packages & install prerequisites
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Configure 2GB swap space if not present (prevents OOM on 1GB RAM instances)
if [ $(swapon --show | wc -l) -le 1 ]; then
    echo "🧠 Configuring 2GB swap space for Docker build stability..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab || true
fi

# 2. Install Docker & Docker Compose V2 if not present
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker Engine & Docker Compose V2..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Add current user to docker group
sudo usermod -aG docker "$USER" || true

# 3. Extract deployment archive
echo "📂 Extracting crm_deploy.tar.gz into ~/crm-omnichannel..."
mkdir -p ~/crm-omnichannel
tar -xzf ~/crm_deploy.tar.gz -C ~/crm-omnichannel

cd ~/crm-omnichannel

# 4. Generate production .env if not present
if [ ! -f .env ]; then
    echo "⚙️ Creating production .env file..."
    cat << 'EOF' > .env
PROJECT_NAME="LUXIRA CRM"
ENVIRONMENT="production"
LOG_LEVEL="INFO"
SECRET_KEY="4d71c9b69a027039bb284cdb829124970205d60a4eb031a566285cbbab984925"

CORS_ORIGINS="*"

POSTGRES_HOST="postgres_db"
POSTGRES_PORT=5432
POSTGRES_DB="crm_omnichannel"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres_password"

REDIS_HOST="redis_prod"
REDIS_PORT=6379
REDIS_URL="redis://redis_prod:6379/0"

DEFAULT_PROVIDER="BEON"
ENABLE_DIRECT_META="false"
BEON_API_KEY="ZUiczQBL4Ymh7E6qjkNS"
BEON_API_BASE_URL="https://v3.api.beon.chat/api"
BEON_WEBHOOK_SECRET=""

META_GRAPH_API_VERSION="v23.0"
META_APP_ID="1756934315414469"
META_APP_SECRET="53ce1189e9d3883ce77aea38a9ceabf4"
META_WEBHOOK_VERIFY_TOKEN="meta_crm_webhook_verify_token_2026"
EOF
fi

# 5. Build and launch production Docker containers
echo "🐳 Building and starting production containers via Docker Compose..."
sudo docker compose -f docker-compose.prod.yml up -d --build

# 6. Wait for PostgreSQL container health check
echo "⏳ Waiting for PostgreSQL container (crm_prod_postgres) to become healthy..."
MAX_TRIES=30
COUNT=0
until sudo docker exec crm_prod_postgres pg_isready -U postgres -d crm_omnichannel &> /dev/null; do
    sleep 2
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_TRIES ]; then
        echo "❌ PostgreSQL did not become ready in time."
        sudo docker logs crm_prod_postgres --tail 50
        exit 1
    fi
done
echo "✅ PostgreSQL is ready and accepting connections!"

# 7. Restore Database from backup
if [ -f ~/crm_backup.sql ]; then
    echo "📥 Restoring verified database dump (crm_backup.sql)..."
    sudo docker exec -i crm_prod_postgres psql -U postgres -d crm_omnichannel -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"
    sudo docker exec -i crm_prod_postgres psql -U postgres -d crm_omnichannel < ~/crm_backup.sql
    echo "🔄 Restarting backend container to bind with restored database..."
    sudo docker restart crm_prod_backend
    echo "✅ Database restore completed successfully!"
else
    echo "⚠️ ~/crm_backup.sql not found! Skipping database restore."
fi

# 8. Install and run Cloudflare Tunnel
echo "🌐 Installing Cloudflare Tunnel (cloudflared)..."
curl -sL --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -f -y

# Kill existing tunnel if running
pkill -f "cloudflared tunnel" || true

echo "🚇 Launching Cloudflare Tunnel on port 80..."
nohup cloudflared tunnel --url http://localhost:80 > ~/tunnel.log 2>&1 &

echo "🔍 Waiting for Cloudflare Tunnel URL..."
TUNNEL_URL=""
for i in $(seq 1 30); do
    sleep 2
    if [ -f ~/tunnel.log ]; then
        TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' ~/tunnel.log | head -n 1 || true)
        if [ -n "$TUNNEL_URL" ]; then
            break
        fi
    fi
done

echo ""
echo "===================================================================="
echo "🎉 DEPLOYMENT SUCCESSFUL!"
echo "===================================================================="
if [ -n "$TUNNEL_URL" ]; then
    echo "🔗 Public HTTPS Access URL:  $TUNNEL_URL"
else
    echo "⚠️ Tunnel URL not detected automatically. Check ~/tunnel.log on EC2."
fi
echo "👤 Default Admin Login:     admin@luxira.com / admin123456"
echo "📊 Containers Running:"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo "===================================================================="
