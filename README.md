# 🚀 Zone News Monorepo - Complete System Documentation

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Services Deep Dive](#services-deep-dive)
4. [Bot Integration Guide](#bot-integration-guide)
5. [Deployment](#deployment)
6. [API Documentation](#api-documentation)
7. [Database Schema](#database-schema)
8. [Development Guide](#development-guide)

---

## 🎯 System Overview

**Zone News** is a comprehensive news distribution platform built as a microservices architecture monorepo. The system consists of:

- **16 Microservices** - Each handling specific business logic
- **Telegram Bot** - @ZoneNewsBot for news distribution
- **Mini App** - React-based Telegram Mini App
- **Admin Dashboard** - Content management interface
- **API Gateway** - Central API entry point

### Key Metrics
- **Services**: 16 independent microservices
- **Ports**: 3001-3020 + 8080 (Mini App)
- **Technology**: Node.js, Express, React, MongoDB, Redis
- **Infrastructure**: PM2, Nginx, Docker-ready
- **Bot**: Telegraf with webhook mode
- **Database**: MongoDB with Redis caching

---

## 🏗️ Architecture

### System Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                        ZONE NEWS PLATFORM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────── Frontend Layer ─────────────────────┐  │
│  │                                                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │   Web    │  │  Admin   │  │ Mini App │  │   CMS    │  │  │
│  │  │ (Astro) │  │ (Astro)  │  │ (React)  │  │(Strapi)  │  │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │  │
│  └───────┼──────────────┼──────────────┼──────────────┼──────┘  │
│          │              │              │              │          │
│  ┌───────▼──────────────▼──────────────▼──────────────▼──────┐  │
│  │                    API GATEWAY (3001)                      │  │
│  │         Central routing, authentication, rate limiting      │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼─────────────────────────────────┐  │
│  │                    MICROSERVICES LAYER                     │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │                                                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │Auth Service │  │User Service │  │News Service │       │  │
│  │  │   (3015)    │  │   (3016)    │  │   (3011)    │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │                                                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │  Channels   │  │   Groups    │  │  MTProto    │       │  │
│  │  │   (3013)    │  │   (3012)    │  │   (3014)    │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │                                                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │  Workflow   │  │  Analytics  │  │Subscription │       │  │
│  │  │   (3017)    │  │   (3018)    │  │   (3019)    │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │                                                             │  │
│  │  ┌─────────────┐  ┌─────────────┐                         │  │
│  │  │  Settings   │  │ Bot Service │                         │  │
│  │  │   (3020)    │  │   (3002)    │                         │  │
│  │  └─────────────┘  └─────────────┘                         │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                     SHARED LIBRARIES                        │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │  • Auth (JWT, Telegram)     • Cache (Redis)                │  │
│  │  • Database (MongoDB)       • Logger (Winston)             │  │
│  │  • Queue (Bull)             • Monitoring (Prometheus)      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                      DATA LAYER                             │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ MongoDB  │  │  Redis   │  │   S3     │  │Cloudflare│  │  │
│  │  │          │  │  Cache   │  │ Storage  │  │   CDN    │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### Directory Structure
```
zone-news-monorepo/
├── apps/                    # Applications
│   ├── admin/              # Admin Dashboard (Astro)
│   ├── analytics-service/  # Analytics Microservice
│   ├── api/               # API Gateway
│   ├── auth-service/      # Authentication Service
│   ├── bot/               # Telegram Bot
│   ├── channels-service/  # Channel Management
│   ├── cms/               # Strapi CMS
│   ├── groups-service/    # Group Management
│   ├── miniapp/           # Telegram Mini App
│   ├── monitoring/        # Monitoring Dashboard
│   ├── mtproto-sidecar/   # MTProto Integration
│   ├── news-api/          # News API Service
│   ├── settings-service/  # Settings Management
│   ├── subscription-service/ # Payment/Subscriptions
│   ├── user-service/      # User Management
│   ├── web/               # Public Website
│   └── workflow-service/  # Business Logic
│
├── libs/                   # Shared Libraries
│   ├── auth/              # Authentication Logic
│   ├── cache/             # Redis Caching
│   ├── database/          # MongoDB Models
│   ├── logger/            # Logging Utilities
│   ├── monitoring/        # Metrics Collection
│   └── queue/             # Job Queue System
│
├── config/                # Configuration
│   └── pm2/              # PM2 Ecosystem Files
│
├── scripts/              # Deployment & Utils
├── nginx/                # Nginx Configurations
└── docs/                 # Documentation
```

---

## 🔍 Services Deep Dive

### 1. API Gateway (Port 3001)
**Location**: `apps/api/`
**Purpose**: Central entry point for all API requests

**Key Features**:
- Request routing to microservices
- JWT authentication
- Rate limiting per tier
- CORS management
- Request/Response logging
- Health checks aggregation

**Endpoints**:
```javascript
GET  /health              # Gateway health
GET  /api/news           # News articles
POST /api/auth/login     # User login
GET  /api/user/profile   # User profile
POST /api/admin/post     # Admin posting
```

### 2. Bot Service (Port 3002)
**Location**: `apps/bot/`
**Purpose**: Telegram bot operations

**Key Features**:
- Command processing (/start, /help, /news, /post)
- Webhook handling
- Interactive buttons
- Admin detection
- Message formatting
- Channel posting

**Bot Commands**:
```
Public Commands:
/start      - Welcome message
/help       - Show help
/news       - Latest news
/search     - Search articles
/status     - Bot status

Admin Commands:
/post       - Post to channels
/setup      - Initial setup
/addchannel - Add channel
/addgroup   - Add group
/addtopic   - Add forum topic
```

### 3. Authentication Service (Port 3015)
**Location**: `apps/auth-service/`
**Purpose**: Handle all authentication

**Features**:
- Telegram auth verification
- JWT token generation
- Session management
- Rate limiting
- Password hashing
- Token refresh

**Key Endpoints**:
```javascript
POST /auth/telegram    # Telegram login
POST /auth/register    # Email registration
POST /auth/login       # Email login
POST /auth/refresh     # Refresh token
POST /auth/logout      # Logout
```

### 4. User Service (Port 3016)
**Location**: `apps/user-service/`
**Purpose**: User profile and tier management

**Features**:
- User profiles
- Tier management (Free/Pro/Business/Enterprise)
- Usage tracking
- Preferences
- Bookmarks
- Notification settings

**Tier Limits**:
```javascript
{
  free: {
    apiCalls: 100/day,
    channels: 3,
    posts: 10/day
  },
  pro: {
    apiCalls: 1000/day,
    channels: 10,
    posts: 100/day
  },
  business: {
    apiCalls: 10000/day,
    channels: 50,
    posts: unlimited
  }
}
```

### 5. News Service (Port 3011)
**Location**: `apps/news-api/`
**Purpose**: News aggregation and management

**Features**:
- Article CRUD operations
- RSS feed parsing
- Content scraping
- Category management
- Search functionality
- Trending calculation

### 6. Channels Service (Port 3013)
**Location**: `apps/channels-service/`
**Purpose**: Telegram channel management

**Features**:
- Channel registration
- Permission verification
- Posting queue
- Analytics tracking
- Member management

### 7. Groups Service (Port 3012)
**Location**: `apps/groups-service/`
**Purpose**: Telegram group management

**Features**:
- Group registration
- Forum topic support
- Member tracking
- Auto-moderation
- Broadcast messaging

### 8. MTProto Sidecar (Port 3014)
**Location**: `apps/mtproto-sidecar/`
**Purpose**: Direct Telegram API access

**Features**:
- Channel scraping
- Message history
- User resolution
- Media download
- Real-time updates

**Security**:
- Internal-only access
- Token authentication
- Rate limiting
- Request logging

### 9. Workflow Service (Port 3017)
**Location**: `apps/workflow-service/`
**Purpose**: Business logic orchestration

**Features**:
- Multi-step workflows
- Approval chains
- Scheduled tasks
- Event processing
- State management

### 10. Analytics Service (Port 3018)
**Location**: `apps/analytics-service/`
**Purpose**: Metrics and insights

**Features**:
- Real-time metrics
- User analytics
- Content performance
- Revenue tracking
- Custom reports
- Export functionality

### 11. Subscription Service (Port 3019)
**Location**: `apps/subscription-service/`
**Purpose**: Payment and subscription management

**Features**:
- Telegram Stars integration
- Stripe payments
- Subscription lifecycle
- Invoice generation
- Webhook handling
- Usage billing

### 12. Settings Service (Port 3020)
**Location**: `apps/settings-service/`
**Purpose**: Configuration management

**Features**:
- User preferences
- System settings
- Feature flags
- A/B testing
- Configuration versioning

### 13. Mini App (Port 8080)
**Location**: `apps/miniapp/`
**Purpose**: Telegram Mini App interface

**Tech Stack**:
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Telegram WebApp SDK
- Zustand (state)
- Framer Motion

**Features**:
- News feed
- Article viewer
- Profile management
- Saved articles
- Share functionality
- Reactions

### 14. Monitoring Service
**Location**: `apps/monitoring/`
**Purpose**: System monitoring

**Features**:
- Health checks
- Performance metrics
- Error tracking
- Alert management
- Log aggregation

---

## 🤖 Bot Integration Guide

### Setting Up the Bot

#### 1. Create Telegram Bot
```bash
# Open @BotFather in Telegram
/newbot
# Name: Zone News
# Username: ZoneNewsBot
# Save the token
```

#### 2. Configure Webhook
```bash
# Set webhook URL
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://bot.thezonenews.com/webhook"}'
```

#### 3. Set Menu Button
```bash
# Configure mini app button
curl -X POST https://api.telegram.org/bot<TOKEN>/setChatMenuButton \
  -H "Content-Type: application/json" \
  -d '{
    "menu_button": {
      "type": "web_app",
      "text": "Open Zone News",
      "web_app": {
        "url": "http://67.219.107.230:8080"
      }
    }
  }'
```

### Bot Configuration

#### Environment Variables
```bash
# apps/bot/.env
BOT_TOKEN=8132879580:AAFgNLe51T37LyDSl3g0-_jAsN1-k8ABfPk
WEBHOOK_URL=https://bot.thezonenews.com/webhook
WEBHOOK_SECRET=your-secret-here
MONGODB_URI=mongodb://localhost:27017/zone_news_production
ADMIN_IDS=7802629063,8123893898
```

#### Bot Service Structure
```javascript
// apps/bot/index.js
class ZoneNewsBotApp {
  constructor() {
    this.bot = new Telegraf(process.env.BOT_TOKEN);
    this.db = await MongoClient.connect(process.env.MONGODB_URI);
    this.setupMiddleware();
    this.setupCommands();
    this.setupWebhook();
  }

  setupCommands() {
    this.bot.command('start', this.handleStart);
    this.bot.command('help', this.handleHelp);
    this.bot.command('news', this.handleNews);
    this.bot.command('post', this.handlePost);
  }

  setupWebhook() {
    this.bot.telegram.setWebhook(process.env.WEBHOOK_URL);
    this.app.use(this.bot.webhookCallback('/webhook'));
  }
}
```

### Admin Features

#### Admin Detection
```javascript
const ADMIN_IDS = [
  7802629063,  // Duke Exxotic
  8123893898   // @TheZoneNews
];

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}
```

#### Posting Workflow
```javascript
// Admin posts to channel
bot.command('post', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply('⚠️ Admin access required');
  }
  
  // Show destination selector
  const destinations = await getAdminDestinations(ctx.from.id);
  
  // Display articles
  const articles = await db.collection('news_articles')
    .find()
    .sort({ published_date: -1 })
    .limit(10)
    .toArray();
  
  // Post to selected destination
  await bot.telegram.sendMessage(destinationId, formattedMessage, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard
  });
});
```

---

## 🚀 Deployment

### Quick Deploy
```bash
cd zone-news-monorepo
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh
```

### Manual Deployment

#### 1. Install Dependencies
```bash
pnpm install
```

#### 2. Build Services
```bash
pnpm build
```

#### 3. Start with PM2
```bash
pm2 start config/pm2/ecosystem.monorepo.config.js
pm2 save
pm2 startup
```

#### 4. Configure Nginx
```bash
sudo cp nginx/production.conf /etc/nginx/sites-available/zone-news
sudo ln -s /etc/nginx/sites-available/zone-news /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### PM2 Configuration
```javascript
// config/pm2/ecosystem.monorepo.config.js
module.exports = {
  apps: [
    {
      name: 'zone-api-gateway',
      script: './apps/api/src/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'zone-bot',
      script: './apps/bot/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    // ... other services
  ]
}
```

---

## 📊 API Documentation

### Authentication
All API requests require JWT token in header:
```javascript
Authorization: Bearer <token>
```

### Rate Limiting
Based on user tier:
- **Free**: 100 requests/day
- **Pro**: 1,000 requests/day
- **Business**: 10,000 requests/day
- **Enterprise**: Unlimited

### Core Endpoints

#### News Endpoints
```javascript
GET    /api/news              # List articles
GET    /api/news/:id          # Get article
POST   /api/news              # Create article (admin)
PUT    /api/news/:id          # Update article (admin)
DELETE /api/news/:id          # Delete article (admin)
GET    /api/news/search       # Search articles
GET    /api/news/trending     # Trending articles
```

#### User Endpoints
```javascript
GET    /api/user/profile      # Get profile
PUT    /api/user/profile      # Update profile
GET    /api/user/tier         # Get tier info
POST   /api/user/upgrade      # Upgrade tier
GET    /api/user/bookmarks    # Get bookmarks
POST   /api/user/bookmarks    # Add bookmark
DELETE /api/user/bookmarks/:id # Remove bookmark
```

#### Channel Endpoints
```javascript
GET    /api/channels          # List channels
POST   /api/channels          # Add channel
GET    /api/channels/:id      # Get channel
PUT    /api/channels/:id      # Update channel
DELETE /api/channels/:id      # Remove channel
POST   /api/channels/:id/post # Post to channel
```

---

## 💾 Database Schema

### Collections

#### users
```javascript
{
  _id: ObjectId,
  telegram_id: Number,
  username: String,
  first_name: String,
  last_name: String,
  tier: 'free' | 'pro' | 'business' | 'enterprise',
  usage: {
    api_calls: Number,
    posts_today: Number,
    last_reset: Date
  },
  preferences: {
    language: String,
    timezone: String,
    notifications: Boolean
  },
  created_at: Date,
  updated_at: Date
}
```

#### news_articles
```javascript
{
  _id: ObjectId,
  title: String,
  content: String,
  summary: String,
  category: String,
  tags: [String],
  source: String,
  url: String,
  image_url: String,
  views: Number,
  reactions: {
    like: Number,
    love: Number,
    fire: Number
  },
  published_date: Date,
  zone_news_data: {
    channel: String,
    message_id: Number
  }
}
```

#### admin_destinations
```javascript
{
  _id: ObjectId,
  telegram_id: Number,
  destinations: [{
    id: String,
    name: String,
    type: 'channel' | 'group' | 'topic',
    topic_id: Number,
    added_at: Date
  }]
}
```

#### posted_articles
```javascript
{
  _id: ObjectId,
  article_id: ObjectId,
  destination: String,
  topic_id: Number,
  message_id: Number,
  posted_at: Date,
  posted_by: Number,
  performance: {
    views: Number,
    clicks: Number,
    reactions: Object
  }
}
```

---

## 👨‍💻 Development Guide

### Local Development Setup

#### 1. Clone Repository
```bash
git clone https://github.com/yourusername/zone-news-monorepo.git
cd zone-news-monorepo
```

#### 2. Install Dependencies
```bash
npm install -g pnpm
pnpm install
```

#### 3. Setup Environment
```bash
cp .env.example .env
# Edit .env with your values
```

#### 4. Start Services
```bash
# Start all services
pnpm dev

# Start specific service
pnpm --filter @zone/bot dev
pnpm --filter @zone/api dev
```

### Testing

#### Unit Tests
```bash
pnpm test
```

#### Integration Tests
```bash
pnpm test:integration
```

#### E2E Tests
```bash
pnpm test:e2e
```

### Code Standards

#### TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

#### ESLint Configuration
```javascript
module.exports = {
  extends: ['eslint:recommended'],
  rules: {
    'no-console': 'warn',
    'no-unused-vars': 'error'
  }
}
```

---

## 🔒 Security

### Authentication Flow
1. User sends Telegram init data
2. Server verifies with bot token
3. JWT token generated
4. Token used for API requests
5. Refresh token for renewal

### Environment Variables
```bash
# Never commit these
BOT_TOKEN=<secret>
JWT_SECRET=<secret>
WEBHOOK_SECRET=<secret>
STRIPE_SECRET_KEY=<secret>
MONGODB_URI=<connection-string>
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP
  message: 'Too many requests'
});

app.use('/api/', limiter);
```

---

## 📈 Monitoring

### Health Checks
```bash
# Check all services
curl http://localhost:3001/health

# Individual service
curl http://localhost:3015/health
```

### PM2 Monitoring
```bash
pm2 status      # Service status
pm2 logs        # View logs
pm2 monit       # Real-time monitoring
pm2 web         # Web dashboard
```

### Custom Health Script
```bash
zone-news-health  # Run health check
```

---

## 🆘 Troubleshooting

### Common Issues

#### Bot Not Responding
```bash
# Check webhook
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Check logs
pm2 logs zone-bot

# Restart bot
pm2 restart zone-bot
```

#### Database Connection Failed
```bash
# Check MongoDB
mongosh
> db.adminCommand('ping')

# Check connection string
echo $MONGODB_URI
```

#### Service Crashes
```bash
# Check specific service
pm2 describe <service-name>

# View error logs
pm2 logs <service-name> --err

# Restart with more memory
pm2 delete <service-name>
pm2 start <script> --max-memory-restart 1G
```

---

## 📞 Support

**Admin**: @TheZoneNews
**Bot**: @ZoneNewsBot
**Server**: 67.219.107.230
**Repository**: zone-news-monorepo

---

*Last Updated: 2025-08-14*
*Version: 2.0.0*
*Status: Production Ready*