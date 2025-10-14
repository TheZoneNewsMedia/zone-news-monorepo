#!/bin/bash

# Zone News Bot - Production Deployment Script
set -e

echo "🚀 Zone News Bot - Production Deployment"
echo "======================================="

# Configuration
SERVER_IP="67.219.107.230"
SSH_KEY="$HOME/telegramNewsBot/terraform/zone_news_private_key"
REMOTE_DIR="/root/zone-news-monorepo/apps/bot"
LOCAL_DIR="$(pwd)"

# Check if this is running from the correct directory
if [[ ! -f "package.json" ]] || [[ ! -f "index.js" ]]; then
    echo "❌ Error: This script must be run from the bot directory"
    echo "Current directory: $(pwd)"
    exit 1
fi

echo "📦 Preparing deployment..."

# Create deployment package
echo "Creating deployment archive..."
tar -czf bot-deploy.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=__tests__ \
    --exclude=coverage \
    --exclude=*.log \
    --exclude=.env.local \
    .

echo "🔄 Deploying to server..."

# Copy to server
scp -i "$SSH_KEY" bot-deploy.tar.gz root@$SERVER_IP:/tmp/

# Extract and restart on server
ssh -i "$SSH_KEY" root@$SERVER_IP << 'EOF'
set -e

echo "📥 Extracting deployment on server..."
cd /root/zone-news-monorepo/apps/bot

# Backup current deployment
if [[ -d "backup" ]]; then
    rm -rf backup
fi
mkdir -p backup
cp -r . backup/ 2>/dev/null || true

# Extract new deployment
tar -xzf /tmp/bot-deploy.tar.gz -C /tmp/bot-new/
rsync -av /tmp/bot-new/ ./
rm -rf /tmp/bot-new/

echo "📦 Installing dependencies..."
npm install --production

echo "🔄 Restarting bot service..."
pm2 reload zone-telegram-bot || pm2 start ecosystem.config.js

echo "🏥 Health check..."
sleep 5
pm2 show zone-telegram-bot

echo "✅ Deployment complete!"
EOF

# Cleanup
rm -f bot-deploy.tar.gz

echo ""
echo "✅ Deployment to production server complete!"
echo "🔗 Bot should be running on: http://$SERVER_IP:3002"
echo "📊 Monitor with: ssh -i $SSH_KEY root@$SERVER_IP 'pm2 logs zone-telegram-bot'"