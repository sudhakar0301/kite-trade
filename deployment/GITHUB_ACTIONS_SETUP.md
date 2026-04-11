# 🚀 GitHub Actions Automated Deployment Setup

Set up **automated deployment** for your trading scanner with **zero downtime** using GitHub Actions.

## 📋 Prerequisites

1. ✅ **GitHub Repository** (push your code to GitHub)
2. ✅ **DigitalOcean Droplet** with static IP
3. ✅ **SSH Key** for droplet access

## 🔧 Step-by-Step Setup

### Step 1: Generate SSH Key for GitHub Actions

```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -f ~/.ssh/github-actions-key

# Copy public key to your droplet
ssh-copy-id -i ~/.ssh/github-actions-key.pub root@YOUR_DROPLET_IP

# Test connection
ssh -i ~/.ssh/github-actions-key root@YOUR_DROPLET_IP "echo 'SSH connection successful'"
```

### Step 2: Add GitHub Secrets

Go to **GitHub Repository → Settings → Secrets and variables → Actions**

Add these secrets:

```
DROPLET_IP=YOUR_DROPLET_IP
DROPLET_SSH_KEY=<contents of ~/.ssh/github-actions-key>
STAGING_SSH_KEY=<optional: staging server key>
```

**How to get SSH key contents:**
```bash
# Copy entire private key (including headers)
cat ~/.ssh/github-actions-key
```

### Step 3: Initial Droplet Setup

```bash
# SSH to your droplet
ssh root@YOUR_DROPLET_IP

# Create app directory
mkdir -p /opt/trading-scanner
cd /opt/trading-scanner

# Install dependencies
apt update && apt upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install docker-compose-plugin -y

# Set up firewall
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw allow 5000  # Backend API
ufw --force enable

# Create log directory
mkdir -p /var/log/nginx
touch /var/log/trading-scanner-deployments.log
```

### Step 4: Test Manual Deployment

```bash
# Push your code to GitHub main branch
git add .
git commit -m "Setup automated deployment"
git push origin main

# This will trigger automatic deployment! 🚀
# Watch the progress in GitHub → Actions tab
```

## 🎯 How It Works

### **Automatic Triggers**
- ✅ **Push to main branch** → Automatic deployment
- ✅ **Manual dispatch** → Deploy on-demand with options
- ✅ **Zero downtime** → Blue-green deployment strategy

### **Deployment Process**
1. **Build & Test** - Compiles and tests your code
2. **Upload** - Syncs files to your droplet
3. **Deploy** - Zero-downtime deployment with health checks
4. **Verify** - Confirms everything is working
5. **Notify** - Shows deployment summary

### **Zero-Downtime Strategy**
```
┌─────────────────┐    ┌─────────────────┐
│   Blue Backend  │    │  Green Backend  │
│   (Current)     │ → │   (New Version) │
└─────────────────┘    └─────────────────┘
         ↑                       ↑
    Load Balancer switches traffic seamlessly
    Old version stops only after new version is healthy
```

## 🔄 Usage Examples

### **Daily Development**
```bash
# Make changes to your trading logic
vim backend/routes/scanner-routes.js

# Commit and push - automatic deployment!
git add .
git commit -m "Update MACD filter conditions"
git push origin main

# GitHub Actions automatically:
# 1. Tests your changes
# 2. Deploys with zero downtime
# 3. Verifies health
# 4. Notifies you of success/failure
```

### **Manual Deployment with Options**
1. Go to **GitHub → Actions → Auto Deploy Trading Scanner**
2. Click **"Run workflow"**
3. Choose options:
   - Environment: Production/Staging
   - Zero downtime: Yes/No
4. Click **"Run workflow"**

### **Emergency Rollback**
```bash
# SSH to droplet for manual intervention
ssh root@YOUR_DROPLET_IP
cd /opt/trading-scanner

# Quick rollback to previous version
docker compose -f deployment/docker-compose.yml down
git checkout HEAD~1  # Go back one commit
./deployment/digitalocean-deploy.sh
```

## 📊 Monitoring & Logs

### **GitHub Actions Logs**
- **Real-time**: GitHub → Actions → Latest workflow
- **Build logs**: See compilation and test results  
- **Deployment logs**: See upload and deployment progress
- **Health checks**: Verify services are running

### **Droplet Logs**
```bash
# SSH to droplet
ssh root@YOUR_DROPLET_IP

# View deployment history
tail -f /var/log/trading-scanner-deployments.log

# View application logs
cd /opt/trading-scanner
docker logs $(docker ps -q --filter 'name=backend') --tail 50

# View nginx logs
docker logs $(docker ps -q --filter 'name=nginx') --tail 50
```

## 🛡️ Security Features

- ✅ **Rate limiting** on order endpoints
- ✅ **SSH key authentication** (no passwords)
- ✅ **Firewall protection**
- ✅ **Security headers** in nginx
- ✅ **Secrets management** through GitHub

## 🚨 Troubleshooting

### **Deployment Failed**
1. Check **GitHub Actions logs** for error details
2. SSH to droplet: `ssh root@YOUR_DROPLET_IP`
3. Check container status: `docker ps`
4. Check logs: `docker logs CONTAINER_NAME`
5. Manual rollback if needed

### **Health Check Failed**
```bash
# Test backend health
curl http://localhost:5000/api/health

# Test through load balancer
curl http://localhost/api/health

# Check nginx config
nginx -t
```

### **Zero Downtime Failed**
```bash
# Fallback to standard deployment
./deployment/digitalocean-deploy.sh YOUR_DROPLET_IP
```

## 🎯 Expected Results

✅ **Push code → Automatic deployment in ~3 minutes**  
✅ **Zero downtime** during trading hours  
✅ **Health verification** before traffic switch  
✅ **Rollback capability** if issues detected  
✅ **Deployment notifications** and summaries  

## 🔗 What's Next?

1. **Push your code** to trigger first automated deployment
2. **Monitor GitHub Actions** tab for deployment progress  
3. **Access your app** at `http://YOUR_DROPLET_IP/`
4. **Make changes** and watch automatic deployments! 🚀

Your trading scanner now has **enterprise-level deployment automation**! 🎉