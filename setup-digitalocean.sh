#!/bin/bash

# Quick DigitalOcean Setup for Trading Scanner
# Run this after creating your $24/month droplet

echo "🚀 Setting up DigitalOcean $24/month droplet for trading scanner..."

DROPLET_IP="$1"

if [ -z "$DROPLET_IP" ]; then
    echo "❌ Usage: bash setup-digitalocean.sh YOUR_DROPLET_IP"
    echo "📝 Example: bash setup-digitalocean.sh 157.245.123.456"
    echo ""
    echo "💡 Get your droplet IP from:"
    echo "   https://cloud.digitalocean.com/droplets"
    exit 1
fi

echo "🌐 Setting up droplet: $DROPLET_IP"
echo "💰 Plan: $24/month (2GB RAM, 2 CPUs)"
echo ""

# Test connection
echo "🔗 Testing SSH connection..."
if ! ssh -o ConnectTimeout=10 root@$DROPLET_IP "echo 'SSH connection successful'" 2>/dev/null; then
    echo "❌ Cannot connect to $DROPLET_IP"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "1. Check IP address is correct"
    echo "2. Wait 2-3 minutes for droplet to fully start"
    echo "3. If using SSH key, make sure it's added to your account"
    echo "4. If using password, check your email for root password"
    exit 1
fi

echo "✅ SSH connection successful!"

# Setup environment
echo "📦 Installing dependencies on droplet..."
ssh root@$DROPLET_IP "
    # Update system
    apt update && apt upgrade -y
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    apt install docker-compose-plugin -y
    
    # Install Node.js (for local development)  
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    
    # Setup firewall for trading app
    ufw allow 22    # SSH
    ufw allow 80    # HTTP (Frontend)
    ufw allow 443   # HTTPS (SSL)
    ufw allow 5000  # Backend API
    ufw --force enable
    
    # Create app directory
    mkdir -p /opt/trading-scanner
    
    # Create logs directory
    mkdir -p /var/log/nginx
    touch /var/log/trading-scanner-deployments.log
    
    echo '✅ Droplet setup complete!'
    echo '💰 Monthly cost: $24 (includes static IP)'
    echo '🌐 Your static IP: $DROPLET_IP'
"

echo ""
echo "🎉 DigitalOcean droplet setup complete!"
echo "💰 Monthly cost: \$24 (excellent value for trading)"
echo "🌐 Your permanent static IP: $DROPLET_IP"
echo ""
echo "🚀 Next step - Deploy your trading scanner:"
echo "   bash deploy-react-trading-scanner.sh $DROPLET_IP"
echo ""
echo "📊 What you get with $24/month:"
echo "   ✅ 2GB RAM - Perfect for Node.js + React"
echo "   ✅ 2 CPUs - Great for real-time data processing"
echo "   ✅ 90GB SSD - Fast storage for your app"
echo "   ✅ 3TB transfer - More than enough for market data"
echo "   ✅ Static IP included - Stable market data access"
echo "   ✅ Unlimited deployments - Update anytime"