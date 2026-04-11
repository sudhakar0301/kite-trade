#!/bin/bash

# Branch-Specific Deployment Script for react-trading-scanner
# Deploys the react-trading-scanner branch to your DigitalOcean droplet

set -e

echo "🚀 Deploying react-trading-scanner branch to production..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BRANCH_NAME="react-trading-scanner"
DROPLET_IP="$1"

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if droplet IP provided
if [ -z "$DROPLET_IP" ]; then
    print_error "Usage: ./deploy-react-trading-scanner.sh YOUR_DROPLET_IP"
    print_status "Example: ./deploy-react-trading-scanner.sh 157.245.xxx.xxx"
    exit 1
fi

# Verify we're on the correct branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
    print_warning "You're on branch '$CURRENT_BRANCH', switching to '$BRANCH_NAME'..."
    git checkout $BRANCH_NAME || {
        print_error "Failed to checkout $BRANCH_NAME branch"
        exit 1
    }
fi

# Get latest changes
print_status "Pulling latest changes from $BRANCH_NAME branch..."
git pull origin $BRANCH_NAME || {
    print_warning "Failed to pull from origin, continuing with local version..."
}

# Show branch info
print_status "Branch Information:"
echo "  📍 Current branch: $(git rev-parse --abbrev-ref HEAD)"
echo "  📝 Latest commit: $(git log -1 --oneline)"
echo "  🌐 Deploying to: $DROPLET_IP"
echo ""

# Test connection
print_status "Testing connection to droplet..."
if ! ssh -o ConnectTimeout=10 root@$DROPLET_IP "echo 'Connection successful'" 2>/dev/null; then
    print_error "Cannot connect to $DROPLET_IP"
    print_status "Make sure:"
    print_status "1. Droplet IP is correct"
    print_status "2. SSH key is set up"
    print_status "3. Firewall allows SSH (port 22)"
    exit 1
fi

# Upload files
print_status "Uploading react-trading-scanner files..."
TEMP_DIR="/tmp/react-trading-scanner-deploy"
mkdir -p $TEMP_DIR

# Copy files (excluding development files)
rsync -av --exclude='node_modules' --exclude='.git' \
          --exclude='*.log' --exclude='.env.local' \
          --exclude='.DS_Store' \
          ./ $TEMP_DIR/

# Update configuration with production IP
sed -i "s/your-static-ip/$DROPLET_IP/g" $TEMP_DIR/deployment/docker-compose.yml

# Upload to droplet
rsync -av --delete $TEMP_DIR/ root@$DROPLET_IP:/opt/trading-scanner/

# Clean up
rm -rf $TEMP_DIR

# Deploy on droplet
print_status "Deploying application on droplet..."
ssh root@$DROPLET_IP "
    cd /opt/trading-scanner
    
    # Log deployment
    echo \"$(date): Deployed react-trading-scanner branch\" >> /var/log/trading-scanner-deployments.log
    
    # Stop existing containers
    docker compose -f deployment/docker-compose.yml down || true
    
    # Build new containers
    print_status() { echo -e \"${GREEN}[INFO]${NC} \$1\"; }
    print_status 'Building Docker containers...'
    docker compose -f deployment/docker-compose.yml build
    
    # Start containers
    print_status 'Starting services...'
    docker compose -f deployment/docker-compose.yml up -d
    
    # Wait for services to start
    sleep 10
    
    # Health checks
    print_status 'Performing health checks...'
    
    # Check backend
    if curl -f -s http://localhost:5000/api/health > /dev/null; then
        print_status '✅ Backend is healthy'
    else
        echo '❌ Backend health check failed'
        echo '📋 Backend logs:'
        docker logs \$(docker ps -q --filter 'name=backend') --tail 20
        exit 1
    fi
    
    # Check frontend
    if curl -f -s http://localhost:80 > /dev/null; then
        print_status '✅ Frontend is healthy'
    else
        echo '❌ Frontend health check failed'
        echo '📋 Frontend logs:'
        docker logs \$(docker ps -q --filter 'name=frontend') --tail 20
        exit 1
    fi
    
    echo ''
    echo '📊 Container Status:'
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
"

print_status "🎉 Deployment of react-trading-scanner branch completed successfully!"
echo ""
echo "🌐 Your Trading Scanner is now live:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🖥️  Frontend Dashboard: http://$DROPLET_IP/"
echo "🔧 Backend API:        http://$DROPLET_IP:5000/"
echo "📊 Health Check:       http://$DROPLET_IP:5000/api/health"
echo "📋 Branch Deployed:    $BRANCH_NAME"
echo "💰 Static IP:          $DROPLET_IP (yours forever!)"
echo ""
echo "🔄 To update in the future:"
echo "   1. Make changes to react-trading-scanner branch"
echo "   2. Run: ./deploy-react-trading-scanner.sh $DROPLET_IP"
echo "   3. Or use GitHub Actions (automatic on git push)"
echo ""
echo "🎯 Start trading with your static IP address! 🚀"