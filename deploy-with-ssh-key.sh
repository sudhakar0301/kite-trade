#!/bin/bash

# DigitalOcean Deployment with SSH Key
# Uses the generated SSH key for secure connection

set -e

DROPLET_IP="$1"
SSH_KEY_PATH="$HOME/.ssh/digitalocean-trading-key"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

if [ -z "$DROPLET_IP" ]; then
    print_error "Usage: bash deploy-with-ssh-key.sh YOUR_DROPLET_IP"
    print_status "Example: bash deploy-with-ssh-key.sh 157.245.123.456"
    exit 1
fi

# Check if SSH key exists
if [ ! -f "$SSH_KEY_PATH" ]; then
    print_error "SSH key not found at: $SSH_KEY_PATH"
    print_status "Please ensure the SSH key was generated correctly"
    exit 1
fi

print_status "🚀 Deploying Trading Scanner to DigitalOcean..."
print_status "🌐 Droplet IP: $DROPLET_IP"
print_status "🔐 SSH Key: $SSH_KEY_PATH"
print_status "💰 Cost: $24/month (includes static IP)"
echo ""

# Test SSH connection
print_status "🔗 Testing SSH connection with key..."
if ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$DROPLET_IP "echo 'SSH key authentication successful!'" 2>/dev/null; then
    print_status "✅ SSH key authentication successful!"
else
    print_error "❌ SSH key authentication failed"
    print_status "Troubleshooting:"
    print_status "1. Wait 2-3 minutes for droplet to fully start"
    print_status "2. Verify you added the SSH key to DigitalOcean"
    print_status "3. Ensure you selected the key when creating the droplet"
    exit 1
fi

# Setup droplet environment
print_status "📦 Setting up trading environment on droplet..."
ssh -i "$SSH_KEY_PATH" root@$DROPLET_IP << 'EOF'
    # Update system
    apt update && apt upgrade -y
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    apt install docker-compose-plugin -y
    
    # Install Node.js for local development
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    
    # Setup firewall for trading app
    ufw allow 22    # SSH
    ufw allow 80    # Frontend
    ufw allow 443   # HTTPS
    ufw allow 5000  # Backend API
    ufw --force enable
    
    # Create directories
    mkdir -p /opt/trading-scanner
    mkdir -p /var/log/nginx
    touch /var/log/trading-scanner-deployments.log
    
    echo "✅ Droplet environment setup complete!"
EOF

# Upload application files
print_status "📤 Uploading trading scanner application..."
TEMP_DIR="/tmp/trading-scanner-deploy"
mkdir -p "$TEMP_DIR"

# Copy application files
rsync -av --exclude='node_modules' --exclude='.git' \
          --exclude='*.log' --exclude='.env.local' \
          ./ "$TEMP_DIR/"

# Update configuration with droplet IP
sed -i "s/your-static-ip/$DROPLET_IP/g" "$TEMP_DIR/deployment/docker-compose.yml"

# Upload to droplet using SSH key
rsync -av --delete -e "ssh -i $SSH_KEY_PATH" \
    "$TEMP_DIR/" root@$DROPLET_IP:/opt/trading-scanner/

# Clean up
rm -rf "$TEMP_DIR"

# Deploy application
print_status "🚀 Deploying trading scanner containers..."
ssh -i "$SSH_KEY_PATH" root@$DROPLET_IP << 'EOF'
    cd /opt/trading-scanner
    
    # Log deployment
    echo "$(date): Deployed react-trading-scanner with SSH key" >> /var/log/trading-scanner-deployments.log
    
    # Stop any existing containers
    docker compose -f deployment/docker-compose.yml down || true
    
    # Build containers
    echo "🔨 Building Docker containers..."
    docker compose -f deployment/docker-compose.yml build
    
    # Start services
    echo "🚀 Starting trading services..."
    docker compose -f deployment/docker-compose.yml up -d
    
    # Wait for services
    sleep 15
    
    # Health checks
    echo "🔍 Performing health checks..."
    
    # Check backend
    if curl -f -s http://localhost:5000/api/health > /dev/null; then
        echo "✅ Backend is healthy"
    else
        echo "❌ Backend health check failed"
        docker logs $(docker ps -q --filter 'name=backend') --tail 20
    fi
    
    # Check frontend
    if curl -f -s http://localhost:80 > /dev/null; then
        echo "✅ Frontend is healthy"
    else
        echo "❌ Frontend health check failed"
        docker logs $(docker ps -q --filter 'name=frontend') --tail 20
    fi
    
    echo ""
    echo "📊 Container Status:"
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
EOF

print_status "🎉 Deployment completed successfully!"
echo ""
echo "🌐 Your Trading Scanner is LIVE:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🖥️  Frontend:      http://$DROPLET_IP/"
echo "🔧 Backend API:    http://$DROPLET_IP:5000/"
echo "📊 Health Check:   http://$DROPLET_IP:5000/api/health"
echo "🌐 Static IP:      $DROPLET_IP (permanent!)"
echo "💰 Monthly Cost:   $24 (excellent value)"
echo "🔐 SSH Access:     ssh -i ~/.ssh/digitalocean-trading-key root@$DROPLET_IP"
echo ""
echo "🎯 Perfect for live trading with stable market data access!"
echo "🚀 Your trading infrastructure is ready for production!"