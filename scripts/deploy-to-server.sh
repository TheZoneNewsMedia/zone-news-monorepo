#!/bin/bash

# Zone News Monorepo - Deploy to Production Server
# This script syncs the monorepo to server 67.219.107.230

set -e

echo "🚀 Zone News Monorepo - Deploy to Server"
echo "========================================"

SERVER_IP="67.219.107.230"
SSH_KEY="~/telegramNewsBot/terraform/zone_news_private_key"
REMOTE_DIR="/root/zone-news-monorepo"
LOCAL_DIR="/Users/georgesimbe/telegramNewsBot/zone-news-monorepo"

echo "📦 Preparing deployment package..."

# Create deployment package with essential files only
echo "Creating clean deployment archive..."
cd $LOCAL_DIR

# Create a temporary deployment directory
rm -rf .deploy-temp
mkdir -p .deploy-temp

# Copy essential directories and files
echo "Copying monorepo structure..."
cp -r apps .deploy-temp/
cp -r libs .deploy-temp/
cp -r services .deploy-temp/
cp -r scripts .deploy-temp/
cp package.json .deploy-temp/
cp pnpm-workspace.yaml .deploy-temp/
cp turbo.json .deploy-temp/
cp tsconfig.base.json .deploy-temp/
cp .gitignore .deploy-temp/ 2>/dev/null || true

# Create deployment info
echo "Creating deployment info..."
cat > .deploy-temp/DEPLOYMENT.md << EOF
# Zone News Monorepo - Production Deployment
Deployed: $(date)
From: Local development
To: $SERVER_IP

## Quick Start
\`\`\`bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start services
pm2 start ecosystem.config.js
\`\`\`

## Services
- Bot: Port 3002
- API: Port 3001
- Mini App: Port 3003
- Web: Port 3000
EOF

echo "🔄 Syncing to server..."
echo "Server: $SERVER_IP"
echo "Remote directory: $REMOTE_DIR"

# Create remote directory if it doesn't exist
ssh -i $SSH_KEY root@$SERVER_IP "mkdir -p $REMOTE_DIR"

# Sync files using rsync (much faster than scp for large directories)
rsync -avz --delete \
  -e "ssh -i $SSH_KEY" \
  .deploy-temp/ \
  root@$SERVER_IP:$REMOTE_DIR/

echo "✅ Files synced to server"

# Clean up temp directory
rm -rf .deploy-temp

echo ""
echo "📝 Server Setup Commands:"
echo "========================="
echo "ssh -i $SSH_KEY root@$SERVER_IP"
echo "cd $REMOTE_DIR"
echo "pnpm install"
echo "pnpm build"
echo ""
echo "🚀 To start services on server:"
echo "================================"
cat << 'SCRIPT'
# Create ecosystem config for PM2
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'zone-bot',
      cwd: '/root/zone-news-monorepo/apps/bot',
      script: 'dist/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        MONGODB_URI: 'mongodb://localhost:27017/zone_news_production'
      }
    },
    {
      name: 'zone-api',
      cwd: '/root/zone-news-monorepo/apps/api',
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        MONGODB_URI: 'mongodb://localhost:27017/zone_news_production'
      }
    },
    {
      name: 'zone-miniapp',
      cwd: '/root/zone-news-monorepo/apps/miniapp',
      script: 'npx serve dist -l 3003',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

# Start with PM2
pm2 delete all || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Configure nginx for mini app
cat > /etc/nginx/sites-available/miniapp << 'EOF'
server {
    listen 80;
    server_name miniapp.thezonenews.com;
    
    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/miniapp /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
SCRIPT

echo ""
echo "✅ Deployment script complete!"
echo "Next: SSH to server and run the setup commands above"