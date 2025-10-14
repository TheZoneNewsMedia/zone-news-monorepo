#!/bin/bash

# Zone News Complete Production Deployment
# Deploys all services, miniapp, and configures nginx

set -e

echo "🚀 Zone News Production Deployment Starting..."

# Configuration
SERVER_IP="67.219.107.230"
SERVER_USER="root"
SSH_KEY="~/telegramNewsBot/terraform/zone_news_private_key"
REMOTE_DIR="/root/zone-news-monorepo"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo -e "${YELLOW}📋 Pre-deployment checks...${NC}"

# Check for required tools
if ! command_exists pnpm; then
    echo -e "${RED}❌ pnpm not found. Installing...${NC}"
    npm install -g pnpm
fi

if ! command_exists pm2; then
    echo -e "${RED}❌ pm2 not found. Installing...${NC}"
    npm install -g pm2
fi

echo -e "${GREEN}✅ Pre-checks complete${NC}"

# Build miniapp locally
echo -e "${YELLOW}📦 Building miniapp...${NC}"
cd apps/miniapp
pnpm install
pnpm build
cd ../..

# Create deployment package
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
tar -czf deployment.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='uploads' \
    --exclude='dist' \
    apps/ \
    libs/ \
    config/ \
    scripts/ \
    package.json \
    pnpm-workspace.yaml \
    nginx/

# Also package miniapp build separately
cd apps/miniapp
tar -czf ../../miniapp-dist.tar.gz dist/
cd ../..

echo -e "${GREEN}✅ Package created${NC}"

# Upload to server
echo -e "${YELLOW}📤 Uploading to server...${NC}"
scp -i ${SSH_KEY} deployment.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/
scp -i ${SSH_KEY} miniapp-dist.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/

# Deploy on server
echo -e "${YELLOW}🔧 Deploying on server...${NC}"
ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

echo "📋 Starting server deployment..."

# Install Node.js if not present
if ! command -v node >/dev/null 2>&1; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Install pnpm if not present
if ! command -v pnpm >/dev/null 2>&1; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi

# Install PM2 if not present
if ! command -v pm2 >/dev/null 2>&1; then
    echo "Installing PM2..."
    npm install -g pm2
    pm2 startup systemd -u root --hp /root
fi

# Install Redis if not present
if ! command -v redis-server >/dev/null 2>&1; then
    echo "Installing Redis..."
    apt-get update
    apt-get install -y redis-server
    systemctl enable redis-server
    systemctl start redis-server
fi

# Create directories
mkdir -p /root/zone-news-monorepo
mkdir -p /var/www/miniapp
mkdir -p /var/www/html
mkdir -p /var/log/zone-news

# Extract deployment package
cd /root/zone-news-monorepo
tar -xzf /tmp/deployment.tar.gz

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Setup environment variables
cat > .env << 'EOF'
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/zone_news_production
JWT_SECRET=zone-news-jwt-secret-2025
REDIS_HOST=localhost
REDIS_PORT=6379
BOT_TOKEN=YOUR_BOT_TOKEN_HERE
WEBHOOK_SECRET=your-webhook-secret-here
STRIPE_SECRET_KEY=your-stripe-key-here
EOF

# Deploy miniapp
echo "Deploying miniapp..."
cd /var/www/miniapp
tar -xzf /tmp/miniapp-dist.tar.gz
mv dist/* .
rm -rf dist
chown -R www-data:www-data /var/www/miniapp

# Setup nginx
echo "Configuring nginx..."
cp /root/zone-news-monorepo/nginx/production.conf /etc/nginx/sites-available/zone-news
ln -sf /etc/nginx/sites-available/zone-news /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# Reload nginx
systemctl reload nginx

# Stop old services if running
pm2 delete all || true

# Start all services with PM2
cd /root/zone-news-monorepo
pm2 start config/pm2/ecosystem.monorepo.config.js

# Save PM2 configuration
pm2 save

# Setup log rotation
cat > /etc/logrotate.d/zone-news << 'LOGROTATE'
/var/log/zone-news/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
LOGROTATE

# Create health check script
cat > /usr/local/bin/zone-news-health << 'HEALTH'
#!/bin/bash
echo "Zone News Health Check"
echo "====================="
echo ""
echo "Services Status:"
pm2 list
echo ""
echo "API Health:"
curl -s http://localhost:3001/health | jq '.' || echo "API Gateway: DOWN"
curl -s http://localhost:3015/health | jq '.' || echo "Auth Service: DOWN"
curl -s http://localhost:3016/health | jq '.' || echo "User Service: DOWN"
echo ""
echo "Redis Status:"
redis-cli ping
echo ""
echo "MongoDB Status:"
mongo --eval "db.adminCommand('ping')" || echo "MongoDB: Not configured"
echo ""
echo "Nginx Status:"
systemctl status nginx --no-pager | head -5
echo ""
echo "Miniapp:"
curl -sI http://localhost:8080 | head -1
HEALTH

chmod +x /usr/local/bin/zone-news-health

# Clean up
rm /tmp/deployment.tar.gz
rm /tmp/miniapp-dist.tar.gz

echo "✅ Server deployment complete!"
echo ""
echo "📊 Running health check..."
/usr/local/bin/zone-news-health

ENDSSH

# Clean up local files
rm deployment.tar.gz
rm miniapp-dist.tar.gz

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${GREEN}🎯 Access Points:${NC}"
echo -e "  Miniapp: ${YELLOW}http://${SERVER_IP}:8080${NC}"
echo -e "  API: ${YELLOW}http://${SERVER_IP}:3000/api${NC}"
echo -e "  Health: ${YELLOW}http://${SERVER_IP}:3001/health${NC}"
echo ""
echo -e "${GREEN}📱 Telegram Bot Setup:${NC}"
echo -e "  1. Open @BotFather"
echo -e "  2. Select your bot"
echo -e "  3. Set webhook: ${YELLOW}http://${SERVER_IP}:3000/webhook${NC}"
echo -e "  4. Set menu button URL: ${YELLOW}http://${SERVER_IP}:8080${NC}"
echo ""
echo -e "${GREEN}🔧 Management Commands:${NC}"
echo -e "  SSH: ${YELLOW}ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP}${NC}"
echo -e "  Logs: ${YELLOW}pm2 logs${NC}"
echo -e "  Status: ${YELLOW}pm2 status${NC}"
echo -e "  Health: ${YELLOW}zone-news-health${NC}"