#!/bin/bash

# Zone News Astro Applications Deployment Script
# Deploys both web and admin Astro applications

set -e

# Configuration
SERVER_IP="67.219.107.230"
SERVER_USER="root"
SSH_KEY="~/telegramNewsBot/terraform/zone_news_private_key"
API_URL="https://api.thezonenews.com"
DOMAIN="thezonenews.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "================================================"
echo -e "${BLUE}🚀 Zone News Astro Apps Deployment${NC}"
echo "================================================"

# Function to build Astro app
build_astro_app() {
    local app_name=$1
    local app_dir=$2
    
    echo -e "${YELLOW}📦 Building ${app_name}...${NC}"
    
    cd ${app_dir}
    
    # Install dependencies
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        pnpm install
    fi
    
    # Create environment file
    cat > .env << EOF
PUBLIC_API_URL=${API_URL}
PUBLIC_API_GATEWAY=http://${SERVER_IP}:3001
PUBLIC_AUTH_SERVICE=http://${SERVER_IP}:3015
PUBLIC_USER_SERVICE=http://${SERVER_IP}:3016
PUBLIC_DOMAIN=${DOMAIN}
PUBLIC_BOT_USERNAME=ZoneNewsBot
EOF
    
    # Build for production
    pnpm build
    
    if [ -d "dist" ]; then
        echo -e "${GREEN}✅ ${app_name} built successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ ${app_name} build failed${NC}"
        return 1
    fi
}

# ==========================================
# 1. BUILD WEB APPLICATION
# ==========================================
echo -e "${BLUE}1. Building Web Application${NC}"
build_astro_app "Web App" "apps/web"

# Package web app
cd apps/web
tar -czf ../../web-dist.tar.gz dist/
cd ../..

# ==========================================
# 2. BUILD ADMIN APPLICATION
# ==========================================
echo -e "${BLUE}2. Building Admin Application${NC}"
build_astro_app "Admin App" "apps/admin"

# Package admin app
cd apps/admin
tar -czf ../../admin-dist.tar.gz dist/
cd ../..

# ==========================================
# 3. DEPLOY TO SERVER
# ==========================================
echo -e "${BLUE}3. Deploying to Server${NC}"

# Upload packages
echo -e "${YELLOW}Uploading packages...${NC}"
scp -i ${SSH_KEY} web-dist.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/
scp -i ${SSH_KEY} admin-dist.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/

# Deploy on server
ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

echo "Setting up Astro applications on server..."

# Create directories
mkdir -p /var/www/web
mkdir -p /var/www/admin

# Deploy web app
echo "Deploying web application..."
cd /var/www/web
tar -xzf /tmp/web-dist.tar.gz
mv dist/* .
rm -rf dist
chown -R www-data:www-data /var/www/web

# Deploy admin app
echo "Deploying admin application..."
cd /var/www/admin
tar -xzf /tmp/admin-dist.tar.gz
mv dist/* .
rm -rf dist
chown -R www-data:www-data /var/www/admin

# Create nginx configuration for Astro apps
cat > /etc/nginx/sites-available/zone-news-astro << 'NGINX'
# Main website - thezonenews.com
server {
    listen 80;
    server_name thezonenews.com www.thezonenews.com;
    
    root /var/www/web;
    index index.html;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Compression
    gzip on;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;
    
    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # Astro pages
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Admin subdomain - admin.thezonenews.com
server {
    listen 80;
    server_name admin.thezonenews.com;
    
    root /var/www/admin;
    index index.html;
    
    # Basic authentication for admin
    # auth_basic "Admin Area";
    # auth_basic_user_file /etc/nginx/.htpasswd;
    
    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Admin API proxy
    location /api/ {
        proxy_pass http://localhost:3001/api/admin/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# API subdomain - api.thezonenews.com
server {
    listen 80;
    server_name api.thezonenews.com;
    
    # CORS headers
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Origin, Content-Type, Accept, Authorization" always;
    
    if ($request_method = 'OPTIONS') {
        return 204;
    }
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Miniapp subdomain - app.thezonenews.com
server {
    listen 80;
    server_name app.thezonenews.com;
    
    root /var/www/miniapp;
    index index.html;
    
    # Telegram iframe settings
    add_header X-Frame-Options "ALLOWALL" always;
    add_header Access-Control-Allow-Origin "*" always;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

# Enable the new configuration
ln -sf /etc/nginx/sites-available/zone-news-astro /etc/nginx/sites-enabled/

# Test nginx configuration
nginx -t

# Reload nginx
systemctl reload nginx

# Clean up
rm /tmp/web-dist.tar.gz
rm /tmp/admin-dist.tar.gz

echo "✅ Astro applications deployed successfully!"
ENDSSH

# Clean up local files
rm web-dist.tar.gz
rm admin-dist.tar.gz

# ==========================================
# 4. SETUP SSL WITH LET'S ENCRYPT
# ==========================================
echo -e "${BLUE}4. Setting up SSL Certificates${NC}"

ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
# Install Certbot if not present
if ! command -v certbot >/dev/null 2>&1; then
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Request SSL certificates
certbot --nginx -d thezonenews.com -d www.thezonenews.com -d admin.thezonenews.com -d api.thezonenews.com -d app.thezonenews.com --non-interactive --agree-tos --email admin@thezonenews.com --redirect

# Setup auto-renewal
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -

echo "✅ SSL certificates configured"
ENDSSH

# ==========================================
# 5. DEPLOYMENT SUMMARY
# ==========================================
echo ""
echo "================================================"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "================================================"
echo ""
echo -e "${BLUE}📋 Access URLs:${NC}"
echo -e "  Main Site: ${YELLOW}https://thezonenews.com${NC}"
echo -e "  Admin Panel: ${YELLOW}https://admin.thezonenews.com${NC}"
echo -e "  API: ${YELLOW}https://api.thezonenews.com${NC}"
echo -e "  Mini App: ${YELLOW}https://app.thezonenews.com${NC}"
echo ""
echo -e "${BLUE}📋 Server Endpoints:${NC}"
echo -e "  Web (HTTP): ${YELLOW}http://${SERVER_IP}${NC}"
echo -e "  Admin (HTTP): ${YELLOW}http://${SERVER_IP}:8081${NC}"
echo -e "  API: ${YELLOW}http://${SERVER_IP}:3001${NC}"
echo -e "  Mini App: ${YELLOW}http://${SERVER_IP}:8080${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "1. Update DNS records to point to ${SERVER_IP}"
echo "2. Test all endpoints"
echo "3. Configure admin authentication"
echo "4. Monitor logs: pm2 logs"
echo ""