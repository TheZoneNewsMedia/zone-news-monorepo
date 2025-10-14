# 🚀 AWS Deployment - Ready to Deploy!

## ✅ Completed Setup

### 1. GitHub Configuration ✅
- **Account**: TheZoneNewsMedia
- **Repository**: https://github.com/TheZoneNewsMedia/zone-news-monorepo
- **SSH Key**: Configured and working
- **Code**: Successfully pushed to main branch

### 2. Secure Configuration ✅
- **MongoDB Password**: `yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=`
- **JWT Secret**: `f73a667706dd1d1474c56a9d6a94b0826b2379d85165bfe027643e8058eec98f`
- **JWT Refresh Secret**: `c555f5daa29aac1d72324ce74c663cc7a15002fc2f37c105d2515ca5562c4f8c`
- **Admin Token**: `b6e2cd130f12d11a0174d4a8edddf87d`
- **Telegram Bot Token**: `8132879580:AAFgNLe51T37LyDSl3g0-_jAsN1-k8ABfPk`

---

## 🖥️ AWS Server Deployment Steps

### Step 1: Connect to AWS Server

```bash
# SSH to your server
ssh -i ~/telegramNewsBot/terraform/zone_news_private_key root@67.219.107.230

# If connection fails, check:
# 1. AWS Security Group allows SSH (port 22)
# 2. EC2 instance is running
# 3. Key permissions: chmod 400 ~/telegramNewsBot/terraform/zone_news_private_key
```

### Step 2: Install Docker & Docker Compose

```bash
# Update system
apt-get update && apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# Install Docker Compose
apt-get install -y docker-compose-plugin

# Verify installations
docker --version
docker compose version

# Start Docker service
systemctl enable docker
systemctl start docker
```

### Step 3: Install Git & Clone Repository

```bash
# Install Git
apt-get install -y git

# Configure Git
git config --global user.name "Zone News Media"
git config --global user.email "zonenews@proton.me"

# Clone repository
cd /root
git clone https://github.com/TheZoneNewsMedia/zone-news-monorepo.git

# If private repository, you'll need to authenticate:
# Option A: Use personal access token as password
# Option B: Add SSH key to server (recommended for production)
```

### Step 4: Create Production Environment File

```bash
cd /root/zone-news-monorepo

# Create .env.production with secure credentials
cat > .env.production << 'EOF'
# Zone News Bot - Production Environment
# Generated: 2025-10-14

# CRITICAL SECRETS
TELEGRAM_BOT_TOKEN=8132879580:AAFgNLe51T37LyDSl3g0-_jAsN1-k8ABfPk
JWT_SECRET=f73a667706dd1d1474c56a9d6a94b0826b2379d85165bfe027643e8058eec98f
JWT_REFRESH_SECRET=c555f5daa29aac1d72324ce74c663cc7a15002fc2f37c105d2515ca5562c4f8c
ADMIN_TOKEN=b6e2cd130f12d11a0174d4a8edddf87d

# DATABASE CONFIGURATION
MONGODB_URI=mongodb://admin:yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=@mongodb:27017/zone_news_production?authSource=admin
MONGODB_USERNAME=admin
MONGODB_PASSWORD=yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=
REDIS_URL=redis://redis:6379

# SERVICE PORTS
PORT=3001
WEBHOOK_PORT=3002
AUTH_SERVICE_PORT=4001
USER_SERVICE_PORT=4002
WORKFLOW_SERVICE_PORT=4003
CHANNELS_SERVICE_PORT=4004
SETTINGS_SERVICE_PORT=4005
ANALYTICS_SERVICE_PORT=4006
SUBSCRIPTION_SERVICE_PORT=4007

# SERVICE URLS (Docker internal)
API_URL=http://api-gateway:3001
AUTH_SERVICE_URL=http://auth-service:4001
USER_SERVICE_URL=http://user-service:4002
WORKFLOW_SERVICE_URL=http://workflow-service:4003
CHANNELS_SERVICE_URL=http://channels-service:4004
SETTINGS_SERVICE_URL=http://settings-service:4005
ANALYTICS_SERVICE_URL=http://analytics-service:4006
SUBSCRIPTION_SERVICE_URL=http://subscription-service:4007

# WEBHOOK CONFIGURATION
WEBHOOK_URL=http://67.219.107.230:3002/webhook

# ENVIRONMENT
NODE_ENV=production
LOG_LEVEL=info

# CORS ORIGINS
ALLOWED_ORIGINS=http://67.219.107.230,http://67.219.107.230:3001,http://67.219.107.230:3000
EOF

# Secure the file
chmod 600 .env.production
```

### Step 5: Start Services with Docker Compose

```bash
cd /root/zone-news-monorepo

# Load environment variables
export $(cat .env.production | xargs)

# Build all services (this may take 5-10 minutes)
docker compose build

# Start all services in detached mode
docker compose up -d

# Check service status
docker compose ps

# View logs
docker compose logs -f

# To exit logs view, press Ctrl+C
```

### Step 6: Verify All Services

```bash
# Check all containers are running
docker compose ps

# Should show 11 containers:
# - zone-news-mongodb (MongoDB)
# - zone-news-redis (Redis)
# - zone-news-auth (Auth Service)
# - zone-news-user (User Service)
# - zone-news-workflow (Workflow Service)
# - zone-news-channels (Channels Service)
# - zone-news-settings (Settings Service)
# - zone-news-analytics (Analytics Service)
# - zone-news-subscription (Subscription Service)
# - zone-news-api (API Gateway)
# - zone-news-bot (Telegram Bot)

# Test health endpoints
curl http://localhost:3001/health  # API Gateway
curl http://localhost:3002/health  # Bot Service
curl http://localhost:4001/health  # Auth Service
curl http://localhost:4004/health  # Channels Service
curl http://localhost:4006/health  # Analytics Service
curl http://localhost:4007/health  # Subscription Service

# Test from external (from your local machine)
curl http://67.219.107.230:3001/health
curl http://67.219.107.230:3002/health
```

### Step 7: Test Telegram Bot

```bash
# On your phone or computer, open Telegram and send:
/start

# Bot should respond with the welcome message

# Test webhook (if configured)
curl -X POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo

# If webhook is not set correctly, set it manually:
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=http://67.219.107.230:3002/webhook/${TELEGRAM_BOT_TOKEN}"
```

---

## 🔒 AWS Security Group Configuration

### Required Inbound Rules

Open these ports in your EC2 Security Group:

| Type | Protocol | Port Range | Source | Description |
|------|----------|------------|--------|-------------|
| SSH | TCP | 22 | Your IP/32 | SSH access |
| HTTP | TCP | 80 | 0.0.0.0/0 | HTTP traffic |
| HTTPS | TCP | 443 | 0.0.0.0/0 | HTTPS traffic |
| Custom TCP | TCP | 3001 | 0.0.0.0/0 | API Gateway (temp) |
| Custom TCP | TCP | 3002 | 0.0.0.0/0 | Bot Service (temp) |

**Note**: Ports 3001 and 3002 are temporary for testing. Once Nginx is configured, you can remove them.

---

## 🌐 Optional: Configure Nginx Reverse Proxy

### Install Nginx

```bash
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx
```

### Configure Nginx

```bash
cat > /etc/nginx/sites-available/zone-news << 'EOF'
# API Gateway
server {
    listen 80;
    server_name 67.219.107.230;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /bot {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF

# Enable configuration
ln -sf /etc/nginx/sites-available/zone-news /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t
systemctl reload nginx
```

---

## 📊 Monitoring & Maintenance

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api-gateway
docker compose logs -f telegram-bot
docker compose logs -f mongodb

# Last 100 lines
docker compose logs --tail=100

# Errors only
docker compose logs | grep -i error
```

### Check Container Health

```bash
# View container status
docker ps

# Check specific container health
docker inspect zone-news-api --format='{{.State.Health.Status}}'

# Monitor resource usage
docker stats
```

### Restart Services

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart api-gateway

# Stop all services
docker compose down

# Start all services
docker compose up -d

# Rebuild and restart specific service
docker compose up -d --build api-gateway
```

---

## 🆘 Troubleshooting

### Services Not Starting

```bash
# Check logs for errors
docker compose logs <service-name>

# Common issues:
# 1. MongoDB not ready - wait for health check
# 2. Port conflicts - check if ports are in use
# 3. Missing environment variables

# Check if port is in use
netstat -tulpn | grep <port>

# Restart specific service
docker compose restart <service-name>
```

### MongoDB Connection Issues

```bash
# Check MongoDB is running
docker compose ps mongodb

# Test MongoDB connection
docker exec -it zone-news-mongodb mongosh \
  -u admin \
  -p 'yEUHtPxmC8R+u91WIWuSFma7FMgc0DHaPaoW5fkkEiA=' \
  --authenticationDatabase admin \
  zone_news_production

# Check MongoDB logs
docker compose logs mongodb
```

### Bot Not Responding

```bash
# Check bot logs
docker compose logs telegram-bot

# Check webhook status
curl https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo

# Reset webhook
curl -X POST https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=http://67.219.107.230:3002/webhook/${TELEGRAM_BOT_TOKEN}"
```

---

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] AWS EC2 instance is running
- [ ] Security group allows required ports
- [ ] SSH key permissions are correct (chmod 400)
- [ ] Can connect to server via SSH

### Deployment
- [ ] Docker installed and running
- [ ] Docker Compose installed
- [ ] Git installed
- [ ] Repository cloned to /root/zone-news-monorepo
- [ ] .env.production created with correct credentials
- [ ] Environment variables loaded

### Verification
- [ ] All 11 containers running
- [ ] MongoDB accessible
- [ ] Redis accessible
- [ ] All health endpoints returning 200
- [ ] No errors in logs
- [ ] Bot responding in Telegram
- [ ] API endpoints accessible from outside

---

## 🎯 Quick Commands Reference

```bash
# SSH to server
ssh -i ~/telegramNewsBot/terraform/zone_news_private_key root@67.219.107.230

# Navigate to project
cd /root/zone-news-monorepo

# View services
docker compose ps

# View logs
docker compose logs -f

# Restart services
docker compose restart

# Stop services
docker compose down

# Start services
docker compose up -d

# Update code
git pull origin main
docker compose up -d --build
```

---

## 📞 Support Resources

- **GitHub Repository**: https://github.com/TheZoneNewsMedia/zone-news-monorepo
- **Deployment Guide**: PLATFORM-SETUP-GUIDE.md
- **Docker Details**: DEPLOYMENT-READY.md
- **API Integration**: INTEGRATION-COMPLETE.md

---

**🎉 Ready to Deploy!**
**📅 Created**: 2025-10-14
**✍️ By**: Claude Code Agent
**🏗️ Architecture**: Docker Compose + 9 Microservices
