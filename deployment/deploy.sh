#!/bin/bash

# Trading Scanner Deployment Script for AWS EC2
# This script deploys your order logic and trading dashboard to EC2 with static IP

set -e

echo "🚀 Starting Trading Scanner Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EC2_USER="ubuntu"
EC2_HOST=""  # Set this to your EC2 instance IP
KEY_PATH=""  # Set this to your EC2 key pair path
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

# Check if EC2 host is set
if [ -z "$EC2_HOST" ]; then
    print_error "EC2_HOST not set. Please set your EC2 instance IP address."
    exit 1
fi

# Check if key path is set
if [ -z "$KEY_PATH" ]; then
    print_error "KEY_PATH not set. Please set the path to your EC2 key pair."
    exit 1
fi

print_status "Deploying to EC2 instance: $EC2_HOST"

# Build the application locally first
print_status "Building frontend..."
cd frontend
npm install
npm run build
cd ..

print_status "Installing backend dependencies..."
cd backend
npm install --production
cd ..

# Create deployment package
print_status "Creating deployment package..."
tar -czf ${APP_NAME}.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    backend/ frontend/build/ deployment/

# Copy to EC2
print_status "Copying files to EC2..."
scp -i "$KEY_PATH" ${APP_NAME}.tar.gz ${EC2_USER}@${EC2_HOST}:~/

# SSH into EC2 and setup
print_status "Setting up application on EC2..."
ssh -i "$KEY_PATH" ${EC2_USER}@${EC2_HOST} << 'ENDSSH'
    # Update system
    sudo apt update
    
    # Install Node.js if not installed
    if ! command -v node &> /dev/null; then
        echo "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    # Install Docker if not installed
    if ! command -v docker &> /dev/null; then
        echo "Installing Docker..."
        sudo apt-get install -y docker.io docker-compose
        sudo systemctl start docker
        sudo systemctl enable docker
        sudo usermod -aG docker $USER
    fi
    
    # Install Nginx if not installed
    if ! command -v nginx &> /dev/null; then
        echo "Installing Nginx..."
        sudo apt-get install -y nginx
    fi
    
    # Install PM2 for process management
    if ! command -v pm2 &> /dev/null; then
        echo "Installing PM2..."
        sudo npm install -g pm2
    fi
    
    # Extract application
    rm -rf trading-scanner/
    mkdir -p trading-scanner
    tar -xzf trading-scanner.tar.gz -C trading-scanner/
    cd trading-scanner/
    
    # Install backend dependencies
    cd backend/
    npm install --production
    
    # Create PM2 ecosystem file
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'trading-scanner-backend',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};
EOF
    
    # Start backend with PM2
    pm2 delete trading-scanner-backend 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup
    
    cd ..
    
    # Setup Nginx for frontend
    sudo cp frontend/nginx.conf /etc/nginx/sites-available/trading-scanner
    sudo ln -sf /etc/nginx/sites-available/trading-scanner /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Copy frontend build files
    sudo rm -rf /var/www/trading-scanner
    sudo mkdir -p /var/www/trading-scanner
    sudo cp -r frontend/build/* /var/www/trading-scanner/
    sudo chown -R www-data:www-data /var/www/trading-scanner
    
    # Update Nginx config with correct paths
    sudo sed -i 's|/usr/share/nginx/html|/var/www/trading-scanner|g' /etc/nginx/sites-available/trading-scanner
    
    # Test and reload Nginx
    sudo nginx -t && sudo systemctl reload nginx
    
    echo "✅ Deployment complete!"
    echo "🌐 Frontend: http://$(curl -s http://checkip.amazonaws.com/)"
    echo "⚡ Backend API: http://$(curl -s http://checkip.amazonaws.com/):5000"
    echo "📊 Order Book & Market Data: Live and running!"
ENDSSH

# Cleanup
rm -f ${APP_NAME}.tar.gz

print_status "🎉 Deployment completed successfully!"
print_status "Your trading scanner with order logic is now live on EC2 with static IP"
print_warning "Don't forget to:"
print_warning "1. Configure your security groups to allow ports 80, 443, and 5000"
print_warning "2. Set up SSL certificate for HTTPS (recommended for trading apps)"
print_warning "3. Configure your Kite API credentials in the backend"
print_warning "4. Test the WebSocket connections for live market data"

echo -e "${BLUE}📱 Access your application at: http://${EC2_HOST}${NC}"