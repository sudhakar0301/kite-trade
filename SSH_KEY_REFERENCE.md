# 🔐 SSH Key & DigitalOcean Quick Reference

## 📋 Your SSH Key Information
- **Private Key**: `C:\Users\SGANGARAJ1\.ssh\digitalocean-trading-key`
- **Public Key**: `C:\Users\SGANGARAJ1\.ssh\digitalocean-trading-key.pub`
- **Key Name**: `trading-scanner-20260412`

## 🔑 Public Key to Add to DigitalOcean
```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCyT4KwT8JcOBJY9fmPPi0B86DcqERjvZJmt9pQ+/RE5GWPaatEDN4zudxEtz2wndVK0cs3joeBlLS1MelREYqd90QqHZfe6OAYvn09pBv3k1GYlaEvpMlcmBlKyJA6s6ZAP0oJftImHlBE5oIm/4TcAq5wU8Aa3eYdY9EMLXecXWgQyKs1lyvosIwn0tl8zvoKKRTdVPMZSx7Kr/QKN3xUJqJNNmR5Ayg0aie9qqkM761hEOURnGqmFJ5g3I19VK8sMyi27oCkr4aUJhtv+ocazgQIeVIxJSeMISQdIHzNpGBbw7BfELhC9XlqyeNXpE7igI3k7COsI4XRZ/22fZf24WmK/BrBr2Lape3HTXwXbHOdgrLoxcgKFRUQtMepMoPoJZnlN3i0apzgwkxRGB5RLMrlL+ME2oWVQn0LB5A+ytWL7UG+2IlB9TdSmqdiA1PEdERpzR6Dj23UpNW90upBHJs47I41ZTsIRSC9Ryb4TSPmDGaX8YDufmywayewdTthHuC2huL032Htx6vIQPownNNyvixIoieVWSv4F+eEaCk9k2mA++tBFCQL/cPiu6RyBiMjVBHhgVIswR/TSa+D2K9uFdB3OTALznd4J8zS0RfMyIcqfMvbGYL6VmW6Q/Ps11Seg8CU5ORFHpsPpuGQYaLQ9pcAia0moxeyowSADQ== trading-scanner-20260412
```

## 🚀 Deployment Commands

### Add SSH Key to DigitalOcean
1. Go to: https://cloud.digitalocean.com/account/security
2. Click "Add SSH Key"
3. Name: `Trading Scanner Key`  
4. Paste the public key above
5. Click "Add SSH Key"

### Create $24/month Droplet
1. Go to: https://cloud.digitalocean.com/droplets
2. Click "Create Droplet"
3. Choose:
   - Ubuntu 22.04 LTS
   - $24/month (2GB RAM, 2 CPUs)
   - Select "Trading Scanner Key"
4. Note your STATIC IP

### Deploy Your Trading Scanner
```bash
# Replace YOUR_DROPLET_IP with actual IP
bash deploy-with-ssh-key.sh YOUR_DROPLET_IP
```

### Connect to Your Droplet
```bash
# SSH connection command
ssh -i ~/.ssh/digitalocean-trading-key root@YOUR_DROPLET_IP

# Check deployment logs
ssh -i ~/.ssh/digitalocean-trading-key root@YOUR_DROPLET_IP "tail -f /var/log/trading-scanner-deployments.log"

# Check running containers
ssh -i ~/.ssh/digitalocean-trading-key root@YOUR_DROPLET_IP "docker ps"
```

## 💰 DigitalOcean Pricing Reminder
- **$24/month**: 2GB RAM, 2 CPUs, 90GB SSD, 3TB transfer
- **Static IP included** (no extra cost)
- **Perfect for trading applications**

## 🎯 After Deployment Access
- **Frontend**: http://YOUR_DROPLET_IP/
- **Backend**: http://YOUR_DROPLET_IP:5000/
- **Health**: http://YOUR_DROPLET_IP:5000/api/health