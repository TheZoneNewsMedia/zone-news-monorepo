# 🚀 Zone News Platform - Complete Setup Guide

## 📋 Overview
**Date**: 2025-10-14
**Account**: zonenews@proton.me
**GitHub**: zonenews
**AWS Server**: 67.219.107.230

---

## 🔐 Step 1: GitHub Account Setup

### 1.1 Switch to zonenews GitHub Account

```bash
# Login to GitHub CLI with zonenews account
gh auth login --hostname github.com --web

# Follow the prompts:
# - Select: GitHub.com
# - Protocol: HTTPS
# - Authenticate: Yes
# - Login with browser and use: zonenews@proton.me
```

### 1.2 Verify Authentication

```bash
# Check current account
gh auth status

# Should show: zonenews account
```

---

## 📦 Step 2: Create New Repository

### 2.1 Create zone-news-monorepo Repository

```bash
# Create new repository
gh repo create zonenews/zone-news-monorepo \
  --private \
  --description "Zone News Bot - Complete Microservices Platform" \
  --confirm

# Or create manually at: https://github.com/new
# Repository name: zone-news-monorepo
# Private: Yes
# Initialize: No (we'll push existing code)
```

### 2.2 Update Git Remote

```bash
cd /Users/georgesimbe/telegramNewsBot/zone-news-monorepo

# Remove old remote
git remote remove origin

# Add new remote
git remote add origin https://github.com/zonenews/zone-news-monorepo.git

# Verify
git remote -v
```

---

## 🔒 Step 3: Secure Configuration Files

### 3.1 Verify .gitignore

```bash
# Ensure these are in .gitignore:
cat >> .gitignore << 'EOF'
# Environment files (NEVER COMMIT)
.env
.env.*
.env.production
.env.development
.env.staging

# Secrets
**/secrets/
**/*.key
**/*.pem
terraform/*.pem

# Node modules
node_modules/
**/node_modules/

# Logs
logs/
*.log
npm-debug.log*

# Docker
.dockerignore

# Build outputs
dist/
build/
.next/
EOF
```

### 3.2 Remove Sensitive Files from Git History

```bash
# Check for sensitive files
git ls-files | grep -E '\.env|\.pem|\.key'

# If found, remove them
git rm --cached .env.production
git rm --cached terraform/*.pem

# Commit the removal
git commit -m "🔒 Remove sensitive files from git tracking"
```

---

## 📤 Step 4: Push Code to GitHub

### 4.1 Commit All Changes

```bash
cd /Users/georgesimbe/telegramNewsBot/zone-news-monorepo

# Check status
git status

# Stage all changes
git add .

# Commit
git commit -m "🚀 Complete Docker containerization and CI/CD setup

- Added Dockerfiles for all 9 services
- Configured docker-compose.yml with full orchestration
- Generated secure JWT secrets and MongoDB password
- Created GitHub Actions CI/CD pipeline
- Updated API Gateway with proxy routes
- Removed hardcoded secrets
- Production-ready configuration"

# Push to main branch
git branch -M main
git push -u origin main
```

### 4.2 Verify Push

```bash
# Check repository online
gh repo view zonenews/zone-news-monorepo --web
```

---

## 🔑 Step 5: Configure GitHub Secrets

### 5.1 Required Secrets

```bash
# Set AWS credentials
gh secret set AWS_ACCESS_KEY_ID --repo zonenews/zone-news-monorepo
gh secret set AWS_SECRET_ACCESS_KEY --repo zonenews/zone-news-monorepo

# Or set via web interface:
# https://github.com/zonenews/zone-news-monorepo/settings/secrets/actions
```

**Required Secrets:**
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key

---

## 🖥️ Step 6: Prepare AWS Server

### 6.1 Connect to Server

```bash
# SSH to server
ssh -i ~/telegramNewsBot/terraform/zone_news_private_key root@67.219.107.230

# If connection fails, check:
# 1. AWS security group allows SSH (port 22)
# 2. Instance is running
# 3. Key file permissions: chmod 400 ~/telegramNewsBot/terraform/zone_news_private_key
```

### 6.2 Install Docker and Docker Compose

```bash
# Update system
apt-get update && apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt-get install -y docker-compose-plugin

# Verify installations
docker --version
docker compose version

# Start Docker
systemctl enable docker
systemctl start docker
```

### 6.3 Install Git

```bash
# Install Git
apt-get install -y git

# Configure Git
git config --global user.name "Zone News"
git config --global user.email "zonenews@proton.me"
```

---

## 📥 Step 7: Clone Repository on Server

### 7.1 Clone to Server

```bash
# On AWS server
cd /root

# Clone repository (will prompt for GitHub credentials)
git clone https://github.com/zonenews/zone-news-monorepo.git

# If repository is private, create personal access token:
# 1. Go to: https://github.com/settings/tokens
# 2. Generate new token (classic)
# 3. Select scopes: repo (all)
# 4. Use token as password when cloning

cd zone-news-monorepo
```

---

## ⚙️ Step 8: Configure Production Environment

### 8.1 Create .env.production on Server

```bash
# On AWS server
cd /root/zone-news-monorepo

# Create production environment file
cat > .env.production << 'EOF'
# Zone News Bot - Production Environment Variables
# Generated: 2025-10-14

# ============================================
# CRITICAL SECRETS
# ============================================

# Telegram Bot Token
TELEGRAM_BOT_TOKEN=8132879580:AAFgNLe51T37LyDSl3g0-_jAsN1-k8ABfPk

# JWT Secrets
JWT_SECRET=f73a667706dd1d1474c56a9d6a94b0826b2379d85165bfe027643e8058eec98f
JWT_REFRESH_SECRET=c555f5daa29aac1d72324ce74c663cc7a15002fc2f37c105d2515ca5562c4f8c
ADMIN_TOKEN=b6e2cd130f12d11a0174d4a8edddf87d

# ============================================
# DATABASE CONFIGURATION
# ============================================

# MongoDB Connection (Secure password)
MONGODB_URI=mongodb://admin:yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=@mongodb:27017/zone_news_production?authSource=admin
MONGODB_USERNAME=admin
MONGODB_PASSWORD=yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=

# Redis Connection
REDIS_URL=redis://redis:6379

# ============================================
# SERVICE PORTS
# ============================================

PORT=3001
WEBHOOK_PORT=3002
AUTH_SERVICE_PORT=4001
USER_SERVICE_PORT=4002
WORKFLOW_SERVICE_PORT=4003
CHANNELS_SERVICE_PORT=4004
SETTINGS_SERVICE_PORT=4005
ANALYTICS_SERVICE_PORT=4006
SUBSCRIPTION_SERVICE_PORT=4007

# ============================================
# SERVICE URLs (Docker internal)
# ============================================

API_URL=http://api-gateway:3001
AUTH_SERVICE_URL=http://auth-service:4001
USER_SERVICE_URL=http://user-service:4002
WORKFLOW_SERVICE_URL=http://workflow-service:4003
CHANNELS_SERVICE_URL=http://channels-service:4004
SETTINGS_SERVICE_URL=http://settings-service:4005
ANALYTICS_SERVICE_URL=http://analytics-service:4006
SUBSCRIPTION_SERVICE_URL=http://subscription-service:4007

# ============================================
# WEBHOOK CONFIGURATION
# ============================================

# Update with your domain (or use IP temporarily)
WEBHOOK_URL=http://67.219.107.230:3002/webhook

# ============================================
# ENVIRONMENT
# ============================================

NODE_ENV=production
LOG_LEVEL=info

# ============================================
# CORS ORIGINS
# ============================================

ALLOWED_ORIGINS=http://67.219.107.230,http://67.219.107.230:3001,http://67.219.107.230:3000
EOF

# Secure the file
chmod 600 .env.production
```

---

## 🚀 Step 9: Deploy with Docker Compose

### 9.1 Build and Start Services

```bash
# On AWS server
cd /root/zone-news-monorepo

# Load environment variables
export $(cat .env.production | xargs)

# Build all services
docker compose build

# Start services in detached mode
docker compose up -d

# Check service status
docker compose ps

# View logs
docker compose logs -f
```

### 9.2 Verify Services

```bash
# Check all containers are running
docker compose ps

# Test health endpoints
curl http://localhost:3001/health  # API Gateway
curl http://localhost:3002/health  # Bot Service
curl http://localhost:4004/health  # Channels Service
curl http://localhost:4006/health  # Analytics Service
curl http://localhost:4007/health  # Subscription Service

# Check MongoDB
docker exec -it zone-news-mongodb mongosh \
  -u admin \
  -p 'yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=' \
  --authenticationDatabase admin \
  zone_news_production

# Test from outside
curl http://67.219.107.230:3001/health
```

---

## 🌐 Step 10: Configure Nginx (Optional)

### 10.1 Install Nginx

```bash
# On AWS server
apt-get install -y nginx

# Enable and start
systemctl enable nginx
systemctl start nginx
```

### 10.2 Configure Nginx Reverse Proxy

```bash
# Create configuration
cat > /etc/nginx/sites-available/zone-news << 'EOF'
# API Gateway
server {
    listen 80;
    server_name api.thezonenews.com 67.219.107.230;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Bot Webhook
server {
    listen 80;
    server_name bot.thezonenews.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Web App
server {
    listen 80;
    server_name thezonenews.com www.thezonenews.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable configuration
ln -sf /etc/nginx/sites-available/zone-news /etc/nginx/sites-enabled/

# Remove default
rm -f /etc/nginx/sites-enabled/default

# Test configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

---

## 🔒 Step 11: Configure AWS Security Groups

### 11.1 Required Inbound Rules

```bash
# Open ports in AWS Security Group:
# - Port 22 (SSH) - Your IP only
# - Port 80 (HTTP) - 0.0.0.0/0
# - Port 443 (HTTPS) - 0.0.0.0/0
# - Port 3001 (API) - 0.0.0.0/0 (temporary, remove after Nginx)
# - Port 3002 (Bot) - 0.0.0.0/0 (temporary, remove after Nginx)
```

**AWS Console Steps:**
1. Go to EC2 → Security Groups
2. Find your instance's security group
3. Edit inbound rules
4. Add rules above

---

## 📊 Step 12: Monitoring and Maintenance

### 12.1 Monitor Services

```bash
# View all logs
docker compose logs -f

# View specific service
docker compose logs -f api-gateway

# Check container health
docker ps

# Check resource usage
docker stats

# Check MongoDB status
docker exec zone-news-mongodb mongosh \
  --eval "db.serverStatus()" \
  -u admin \
  -p 'yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=' \
  --authenticationDatabase admin
```

### 12.2 Common Commands

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart api-gateway

# Stop all services
docker compose down

# Stop and remove volumes (WARNING: Deletes data)
docker compose down -v

# Update code and rebuild
git pull origin main
docker compose up -d --build

# View MongoDB data
docker exec -it zone-news-mongodb mongosh \
  -u admin \
  -p 'yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=' \
  --authenticationDatabase admin \
  zone_news_production
```

---

## 🐛 Step 13: Troubleshooting

### 13.1 Service Won't Start

```bash
# Check logs
docker compose logs <service-name>

# Check if port is in use
netstat -tulpn | grep <port>

# Restart service
docker compose restart <service-name>

# Rebuild service
docker compose up -d --build <service-name>
```

### 13.2 MongoDB Connection Issues

```bash
# Check MongoDB is running
docker compose ps mongodb

# Check MongoDB logs
docker compose logs mongodb

# Test connection
docker exec zone-news-mongodb mongosh \
  -u admin \
  -p 'yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=' \
  --authenticationDatabase admin

# Reset MongoDB password if needed
docker compose down
# Update .env.production with new password
docker compose up -d
```

### 13.3 Bot Not Responding

```bash
# Check bot logs
docker compose logs telegram-bot

# Verify bot token
echo $TELEGRAM_BOT_TOKEN

# Test webhook
curl -X POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo

# Reset webhook
curl -X POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook \
  -d "url=http://67.219.107.230:3002/webhook/${TELEGRAM_BOT_TOKEN}"
```

---

## ✅ Step 14: Verification Checklist

### 14.1 Pre-Deployment

- [ ] GitHub account switched to zonenews
- [ ] Repository created: zonenews/zone-news-monorepo
- [ ] Code pushed to GitHub
- [ ] GitHub secrets configured (AWS credentials)
- [ ] .env.production NOT committed to git

### 14.2 Server Setup

- [ ] SSH connection working
- [ ] Docker installed and running
- [ ] Docker Compose installed
- [ ] Git installed and configured
- [ ] Repository cloned to /root/zone-news-monorepo
- [ ] .env.production created on server

### 14.3 Deployment

- [ ] All 11 containers running (docker compose ps)
- [ ] MongoDB accepting connections
- [ ] Redis accepting connections
- [ ] API Gateway health check passing (port 3001)
- [ ] Bot service health check passing (port 3002)
- [ ] All microservices health checks passing (ports 4001-4007)

### 14.4 Functionality

- [ ] Bot responding to /start command in Telegram
- [ ] API endpoints accessible: http://67.219.107.230:3001/health
- [ ] MongoDB contains test data
- [ ] No errors in docker compose logs
- [ ] Webhook receiving updates (if configured)

---

## 🎯 Quick Reference

### Essential URLs

- **GitHub Repository**: https://github.com/zonenews/zone-news-monorepo
- **API Health**: http://67.219.107.230:3001/health
- **Bot Health**: http://67.219.107.230:3002/health
- **Telegram Bot**: https://t.me/YourBotUsername

### Essential Commands

```bash
# SSH to server
ssh -i ~/telegramNewsBot/terraform/zone_news_private_key root@67.219.107.230

# View services
docker compose ps

# View logs
docker compose logs -f

# Restart services
docker compose restart

# Update and rebuild
git pull && docker compose up -d --build
```

### Important Files

- **Environment**: `/root/zone-news-monorepo/.env.production`
- **Docker Compose**: `/root/zone-news-monorepo/docker-compose.yml`
- **Logs**: `docker compose logs`

---

## 🆘 Support

**Documentation:**
- [DEPLOYMENT-READY.md](./DEPLOYMENT-READY.md) - Docker deployment details
- [INTEGRATION-COMPLETE.md](./INTEGRATION-COMPLETE.md) - API integration details
- [.github/workflows/deploy.yml](./.github/workflows/deploy.yml) - CI/CD pipeline

**Common Issues:**
- SSH connection refused → Check AWS security group, instance running
- MongoDB connection failed → Check password in .env.production
- Service not starting → Check docker compose logs for errors
- Bot not responding → Check webhook configuration and bot token

---

**🎉 Platform Setup Complete!**
**📅 Last Updated**: 2025-10-14
**✍️ Created By**: Claude Code Agent
**🏗️ Architecture**: Microservices + Docker + GitHub Actions
