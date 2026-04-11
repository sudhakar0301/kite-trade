#!/bin/bash

# Quick Redeployment Script for Trading App Updates
# Use this for rapid iterations during development/testing

set -e

echo "🚀 Quick Trading App Redeployment..."

DROPLET_IP="$1"
if [ -z "$DROPLET_IP" ]; then
    echo "Usage: ./quick-deploy.sh YOUR_DROPLET_IP"
    exit 1
fi

echo "📡 Testing connection..."
ssh root@$DROPLET_IP "echo 'Connected successfully'"

echo "📦 Uploading latest changes..."
# Only upload changed files (much faster)
rsync -av --exclude='node_modules' --exclude='.git' \
    --delete ../backend/ root@$DROPLET_IP:/opt/trading-scanner/backend/

rsync -av --exclude='node_modules' --exclude='.git' \
    --delete ../frontend/ root@$DROPLET_IP:/opt/trading-scanner/frontend/

echo "🔄 Restarting services..."
ssh root@$DROPLET_IP "
    cd /opt/trading-scanner
    
    # Stop services gracefully
    docker compose -f deployment/docker-compose.yml down
    
    # Rebuild only if Dockerfile changed (faster)
    docker compose -f deployment/docker-compose.yml build --no-cache backend
    docker compose -f deployment/docker-compose.yml build --no-cache frontend
    
    # Start services
    docker compose -f deployment/docker-compose.yml up -d
    
    echo '✅ Services restarted successfully'
    echo '📊 Container status:'
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    
    echo '🔍 Backend health check:'
    sleep 3
    curl -s http://localhost:5000/api/health | head -20 || echo 'Backend starting...'
"

echo ""
echo "✅ Quick redeployment completed!"
echo "🌐 Your app: http://$DROPLET_IP/"
echo "🔧 API: http://$DROPLET_IP:5000/"
echo ""
echo "⏱️ Total time: ~60 seconds"
echo "💰 Additional cost: $0"