#!/bin/bash

# DigitalOcean Trading Scanner Deployment Script
# Simpler than AWS - static IP included, transparent pricing

set -e

echo "🌊 Starting DigitalOcean Trading Scanner Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DROPLET_IP=""           # Set this to your DigitalOcean droplet IP
SSH_KEY_PATH=""         # Optional: SSH key path (if using key auth)
APP_NAME="trading-scanner"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if droplet IP is set
if [ -z "$DROPLET_IP" ]; then
    print_error "DROPLET_IP not set. Please set your DigitalOcean droplet IP address."
    print_status "Get this from: DigitalOcean Dashboard → Your Droplet → Public IP"
    exit 1
fi

print_status "Deploying to DigitalOcean Droplet: $DROPLET_IP"

# SSH command setup
if [ -n "$SSH_KEY_PATH" ]; then
    SSH_CMD="ssh -i $SSH_KEY_PATH root@$DROPLET_IP"
    SCP_CMD="scp -i $SSH_KEY_PATH"
else
    SSH_CMD="ssh root@$DROPLET_IP"
    SCP_CMD="scp"
fi

print_status "Testing connection to droplet..."
$SSH_CMD "echo 'Connection successful!'"

print_status "Setting up Docker environment..."
$SSH_CMD "
    # Update system
    apt update && apt upgrade -y
    
    # Install Docker if not present
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        apt install docker-compose-plugin -y
        echo '✅ Docker installed successfully'
    else
        echo '✅ Docker already installed'
    fi
    
    # Install Node.js for local development (optional)
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
        echo '✅ Node.js installed'
    else
        echo '✅ Node.js already installed'
    fi
    
    # Create app directory
    mkdir -p /opt/$APP_NAME
    cd /opt/$APP_NAME
"

print_status "Uploading application files..."

# Create temporary staging directory
TEMP_DIR="/tmp/${APP_NAME}-upload"
mkdir -p $TEMP_DIR

# Copy application files (excluding node_modules, .git, etc.)
rsync -av --exclude='node_modules' --exclude='.git' --exclude='*.log' \
    ../ $TEMP_DIR/

# Update docker-compose.yml with actual droplet IP
sed -i "s/your-static-ip/$DROPLET_IP/g" $TEMP_DIR/deployment/docker-compose.yml

# Upload to droplet
rsync -av ${SSH_KEY_PATH:+-e "ssh -i $SSH_KEY_PATH"} \
    $TEMP_DIR/ root@$DROPLET_IP:/opt/$APP_NAME/

# Clean up temp directory
rm -rf $TEMP_DIR

print_status "Building and starting containers..."
$SSH_CMD "
    cd /opt/$APP_NAME
    
    # Set up firewall (DigitalOcean droplets need explicit firewall rules)
    ufw allow 22    # SSH
    ufw allow 80    # HTTP
    ufw allow 443   # HTTPS
    ufw allow 5000  # Backend API
    ufw --force enable
    
    # Build and start services
    docker compose -f deployment/docker-compose.yml down || true
    docker compose -f deployment/docker-compose.yml build
    docker compose -f deployment/docker-compose.yml up -d
    
    # Show running containers
    echo ''
    echo '📊 Container Status:'
    docker ps
    
    echo ''
    echo '📋 Application Logs:'
    docker logs \$(docker ps -q --filter 'name=backend') --tail 10
"

print_status "Deployment completed successfully! 🎉"
echo ""
echo "🌊 DigitalOcean Deployment Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Frontend URL:    http://$DROPLET_IP/"
echo "🔧 Backend API:     http://$DROPLET_IP:5000/"
echo "📊 Health Check:    http://$DROPLET_IP:5000/api/health"
echo "💰 Static IP Cost:  FREE (included with droplet)"
echo "💳 Monthly Cost:    $24-48/month (transparent pricing)"
echo ""
echo "🔗 Next Steps:"
echo "1. Open http://$DROPLET_IP/ in your browser"
echo "2. Configure your Kite API token"
echo "3. Start live trading with stable market data access! 🚀"
echo ""
echo "📝 To check logs:"
echo "   ssh root@$DROPLET_IP"
echo "   cd /opt/$APP_NAME"
echo "   docker logs \$(docker ps -q --filter 'name=backend')"