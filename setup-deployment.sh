#!/bin/bash

# Setup script to make deployment scripts executable and prepare environment

echo "🔧 Setting up deployment scripts..."

# Make scripts executable
chmod +x deployment/digitalocean-deploy.sh
chmod +x deployment/zero-downtime-deploy.sh  
chmod +x deployment/quick-deploy.sh

echo "✅ Made deployment scripts executable"

# Create .gitignore entries
cat >> .gitignore << EOF

# Deployment logs
*.log

# Environment files
.env.local
.env.production

# Docker volumes
node_modules/

# Temporary files
/tmp/
.DS_Store
EOF

echo "✅ Updated .gitignore for deployment files"

# Create example environment file
cat > .env.example << EOF
# Trading Scanner Environment Variables

# Kite Connect API
KITE_API_KEY=your_api_key_here
KITE_ACCESS_TOKEN=your_access_token_here

# Server Configuration
NODE_ENV=production
PORT=5000

# Frontend Configuration  
REACT_APP_API_URL=http://your-static-ip:5000

# Deployment
DROPLET_IP=your.droplet.ip.address
EOF

echo "✅ Created .env.example file"

echo ""
echo "🚀 Setup Complete! Next steps:"
echo "1. Copy .env.example to .env and fill in your details"
echo "2. Follow deployment/GITHUB_ACTIONS_SETUP.md for automated deployment"
echo "3. Or run ./deployment/digitalocean-deploy.sh for manual deployment"
echo ""
echo "📚 Available deployment options:"
echo "   - ./deployment/digitalocean-deploy.sh       # Standard deployment"
echo "   - ./deployment/zero-downtime-deploy.sh      # Zero-downtime deployment" 
echo "   - ./deployment/quick-deploy.sh YOUR_IP      # Quick updates"
echo "   - GitHub Actions                            # Automated on git push"