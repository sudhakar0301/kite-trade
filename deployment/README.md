# 🚀 Trading Scanner Deployment Guide

Deploy your order logic and trading dashboard to get a **static IP address** for live market data access.

## 📋 Prerequisites

- AWS Account (recommended) or other cloud provider
- Trading application with order book logic ✅ (You have this!)
- Domain name (optional, for SSL)

## 🏗️ Architecture Overview

```
Internet → Static IP → Nginx → Frontend (React Dashboard)
                            → Backend (Order Logic + WebSocket)
```

## 🚀 Quick Deployment Options

### Option 1: AWS EC2 + Elastic IP (Recommended)

#### Step 1: Launch EC2 Instance
```bash
# 1. Go to AWS Console → EC2
# 2. Launch Instance:
#    - AMI: Ubuntu 22.04 LTS
#    - Instance Type: t3.medium (for trading apps)
#    - Storage: 20GB GP3
#    - Security Group: Allow ports 22, 80, 443, 5000
```

#### Step 2: Allocate Static IP
```bash
# 1. Go to EC2 → Elastic IPs
# 2. Allocate new address
# 3. Associate with your instance
# Save this IP - this is your STATIC IP! 🎯
```

#### Step 3: Deploy Using Script
```bash
# 1. Update deployment/deploy.sh with your details:
EC2_HOST="YOUR_ELASTIC_IP"
KEY_PATH="path/to/your-key.pem"

# 2. Make script executable and run:
chmod +x deployment/deploy.sh
./deployment/deploy.sh
```

### Option 2: DigitalOcean (Simpler Setup)

```bash
# 1. Create Droplet (Ubuntu, $20/month includes static IP)
# 2. Use same deploy.sh script
# 3. Update EC2_HOST with your droplet IP
```

### Option 3: Docker Compose (Any VPS)

```bash
# 1. On your VPS with static IP:
git clone your-repo
cd trading-scanner/deployment

# 2. Update docker-compose.yml with your static IP
# 3. Deploy:
docker-compose up -d
```

## 🔧 Manual Setup (Step by Step)

### Backend Setup (Order Logic)
```bash
# On your server:
cd backend/
npm install --production

# Create PM2 config
pm2 start server.js --name "trading-backend"
pm2 save
pm2 startup
```

### Frontend Setup (Dashboard)
```bash
# Build frontend locally:
cd frontend/
npm install
npm run build

# Copy to server:
scp -r build/ user@your-static-ip:/var/www/trading-scanner/
```

### Nginx Configuration
```nginx
# /etc/nginx/sites-available/trading-scanner
server {
    listen 80;
    server_name your-static-ip;
    
    # Frontend
    location / {
        root /var/www/trading-scanner;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:5000;
    }
    
    # WebSocket for live data
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 🔐 Security Setup

### SSL Certificate (Recommended for Trading)
```bash
# Using Let's Encrypt:
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Firewall Configuration
```bash
# Allow only necessary ports:
sudo ufw allow 22   # SSH
sudo ufw allow 80   # HTTP
sudo ufw allow 443  # HTTPS
sudo ufw allow 5000 # Backend API
sudo ufw enable
```

## 📊 Monitoring & Health Checks

### PM2 Monitoring
```bash
# Check backend status:
pm2 status
pm2 logs trading-backend

# Restart if needed:
pm2 restart trading-backend
```

### Application Health
```bash
# Check if services are running:
curl http://your-static-ip/api/health
curl http://your-static-ip/      # Frontend
```

## 🎯 Post-Deployment Checklist

- [ ] ✅ Static IP allocated and associated
- [ ] ✅ Backend (order logic) running on port 5000
- [ ] ✅ Frontend (dashboard) accessible on port 80
- [ ] ✅ WebSocket connection working for live data
- [ ] ✅ Security groups configured properly
- [ ] ✅ SSL certificate installed (recommended)
- [ ] ✅ Kite API credentials configured
- [ ] ✅ Order book masking functionality tested

## 🌐 Access Your Application

```
Frontend Dashboard: http://YOUR_STATIC_IP
Backend API:       http://YOUR_STATIC_IP:5000/api
WebSocket:         ws://YOUR_STATIC_IP:5000
Order Logic:       Built into backend ✅
```

## 🚨 Common Issues & Solutions

### Issue: Frontend can't connect to backend
```bash
# Solution: Update frontend API URL
# In frontend/.env:
REACT_APP_API_URL=http://YOUR_STATIC_IP:5000
```

### Issue: WebSocket connection fails
```bash
# Check Nginx WebSocket config
# Ensure proxy_set_header Upgrade $http_upgrade; is present
```

### Issue: Order book data not updating
```bash
# Check backend logs:
pm2 logs trading-backend

# Verify Kite API credentials
# Check WebSocket Manager connection
```

## 💰 Cost Estimation

| Provider | Instance Type | Monthly Cost | Static IP |
|----------|--------------|--------------|-----------|
| AWS EC2 | t3.medium | ~$30 | $3.65 |
| DigitalOcean | 4GB Droplet | $24 | Included |
| Vultr | 4GB Instance | $24 | $3 |
| Linode | 4GB Nanode | $24 | Included |

## 🔄 Updates & Maintenance

### Automated Updates
```bash
# Create update script:
#!/bin/bash
cd /home/ubuntu/trading-scanner
git pull origin main
cd backend && npm install --production
pm2 restart trading-backend
cd ../frontend && npm run build
sudo cp -r build/* /var/www/trading-scanner/
```

Your **trading scanner with order logic** will be live with a **static IP** that you can use for:
- ✅ Live market data feeds
- ✅ Order book analysis
- ✅ Real-time tick processing  
- ✅ Chart integration
- ✅ Market impact calculations

🎉 **You're ready to deploy your trading infrastructure!**