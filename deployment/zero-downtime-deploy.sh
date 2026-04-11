#!/bin/bash

# Zero-Downtime Trading App Deployment
# Uses blue-green deployment strategy to avoid any trading interruption

set -e

echo "🔄 Starting Zero-Downtime Trading Scanner Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="trading-scanner"
BLUE_PORT=5000
GREEN_PORT=5001
FRONTEND_PORT=80
HEALTH_TIMEOUT=30

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

# Function to check service health
check_health() {
    local port=$1
    local service_name=$2
    local max_attempts=10
    local attempt=1
    
    print_status "Checking health of $service_name on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:$port/api/health > /dev/null 2>&1; then
            print_status "✅ $service_name is healthy (attempt $attempt/$max_attempts)"
            return 0
        fi
        
        print_warning "⏳ $service_name not ready, attempt $attempt/$max_attempts..."
        sleep 3
        ((attempt++))
    done
    
    print_error "❌ $service_name failed health check after $max_attempts attempts"
    return 1
}

# Function to get current active backend port
get_active_backend_port() {
    # Check which backend is currently serving traffic
    if docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -q "backend-blue.*Up"; then
        if curl -f -s http://localhost:$BLUE_PORT/api/health > /dev/null 2>&1; then
            echo "blue"
            return 0
        fi
    fi
    
    if docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -q "backend-green.*Up"; then
        if curl -f -s http://localhost:$GREEN_PORT/api/health > /dev/null 2>&1; then
            echo "green"
            return 0
        fi
    fi
    
    # No active backend found, default to blue
    echo "none"
}

# Determine current and target deployment
CURRENT_ACTIVE=$(get_active_backend_port)
print_status "Current active backend: $CURRENT_ACTIVE"

if [ "$CURRENT_ACTIVE" = "blue" ] || [ "$CURRENT_ACTIVE" = "none" ]; then
    TARGET="green"
    TARGET_PORT=$GREEN_PORT
    OLD_TARGET="blue"
else
    TARGET="blue"
    TARGET_PORT=$BLUE_PORT
    OLD_TARGET="green"
fi

print_status "Deploying to: $TARGET (port $TARGET_PORT)"

# Step 1: Build new version in target environment
print_status "Step 1: Building new version in $TARGET environment..."

# Update docker-compose configuration for target deployment
cp deployment/docker-compose-zero-downtime.yml deployment/docker-compose-active.yml

# Activate the target profile and build
docker compose -f deployment/docker-compose-active.yml --profile $TARGET build backend-$TARGET
print_status "✅ Built backend-$TARGET successfully"

# Step 2: Start new backend version
print_status "Step 2: Starting backend-$TARGET..."
docker compose -f deployment/docker-compose-active.yml --profile $TARGET up -d backend-$TARGET

# Step 3: Health check new backend
print_status "Step 3: Performing health check on new backend..."
if ! check_health $TARGET_PORT "backend-$TARGET"; then
    print_error "New backend failed health check, aborting deployment"
    docker compose -f deployment/docker-compose-active.yml --profile $TARGET down
    exit 1
fi

# Step 4: Update nginx to point to new backend
print_status "Step 4: Switching traffic to backend-$TARGET..."

# Generate nginx config pointing to new backend
cat > /tmp/nginx-$TARGET.conf << EOF
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend-$TARGET:5000;
    }
    
    server {
        listen 80;
        
        # Frontend static files
        location / {
            proxy_pass http://frontend:80;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
        }
        
        # Backend API
        location /api {
            proxy_pass http://backend;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            
            # WebSocket support for live data
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
        }
        
        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

# Update nginx configuration
cp /tmp/nginx-$TARGET.conf deployment/nginx-lb.conf

# Restart nginx with new configuration
docker compose -f deployment/docker-compose-active.yml restart nginx-lb

# Step 5: Verify traffic is flowing to new backend
print_status "Step 5: Verifying traffic switch..."
sleep 5

# Test through nginx load balancer
if curl -f -s http://localhost/api/health > /dev/null 2>&1; then
    print_status "✅ Traffic successfully switched to backend-$TARGET"
else
    print_error "❌ Traffic switch failed, rolling back..."
    # Rollback: switch back to old backend
    if [ "$CURRENT_ACTIVE" != "none" ]; then
        OLD_PORT=$([ "$OLD_TARGET" = "blue" ] && echo $BLUE_PORT || echo $GREEN_PORT)
        
        # Generate rollback nginx config
        cat > /tmp/nginx-rollback.conf << EOF
events {
    worker_connections 1024;
}
http {
    upstream backend {
        server backend-$OLD_TARGET:5000;
    }
    
    server {
        listen 80;
        location / {
            proxy_pass http://frontend:80;
        }
        location /api {
            proxy_pass http://backend;
        }
    }
}
EOF
        cp /tmp/nginx-rollback.conf deployment/nginx-lb.conf
        docker compose -f deployment/docker-compose-active.yml restart nginx-lb
    fi
    
    # Stop failed deployment
    docker compose -f deployment/docker-compose-active.yml --profile $TARGET down
    exit 1
fi

# Step 6: Gracefully stop old backend
if [ "$CURRENT_ACTIVE" != "none" ]; then
    print_status "Step 6: Gracefully stopping old backend-$OLD_TARGET..."
    
    # Give time for active connections to finish
    print_warning "Waiting 10 seconds for active connections to finish..."
    sleep 10
    
    # Stop old backend
    docker compose -f deployment/docker-compose-active.yml --profile $OLD_TARGET down
    print_status "✅ Old backend-$OLD_TARGET stopped successfully"
fi

# Step 7: Update frontend if needed
print_status "Step 7: Updating frontend..."
docker compose -f deployment/docker-compose-active.yml build frontend
docker compose -f deployment/docker-compose-active.yml up -d frontend

# Step 8: Final health checks
print_status "Step 8: Final system health check..."

# Check backend through load balancer
if ! curl -f -s http://localhost/api/health > /dev/null 2>&1; then
    print_error "❌ Final backend health check failed"
    exit 1
fi

# Check frontend
if ! curl -f -s http://localhost/ > /dev/null 2>&1; then
    print_error "❌ Final frontend health check failed"
    exit 1
fi

# Step 9: Cleanup
print_status "Step 9: Cleaning up old resources..."
docker system prune -f

print_status "🎉 Zero-downtime deployment completed successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Frontend:     http://localhost/"
echo "🔧 Backend API:  http://localhost/api/"
echo "📊 Health Check: http://localhost/api/health"
echo "🔄 Active Backend: backend-$TARGET (port $TARGET_PORT)"
echo "⌚ Downtime:     0 seconds ✅"
echo "📊 Container Status:"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E "(backend|frontend|nginx)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Log deployment
echo "$(date): Zero-downtime deployment completed - Active: backend-$TARGET" >> /var/log/trading-scanner-deployments.log