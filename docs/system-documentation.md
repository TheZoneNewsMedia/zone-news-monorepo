# Zone News Platform - System Documentation

## 📅 Last Updated: 2025-08-26

## 🏗️ System Architecture

### **Current Infrastructure**
- **Server**: 67.219.107.230 (Vultr Production)
- **Database**: MongoDB (mongodb://localhost:27017/zone_news_production)
- **Process Manager**: PM2 with 14 services
- **Frontend**: Astro-based mini-app
- **Bot Framework**: Telegraf
- **Node Version**: Latest stable

### **Service Architecture**
```
┌─────────────────────────────────────────────────┐
│                  NGINX (Port 80)                │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │     Zone News Microservices (14)         │  │
│  ├──────────────────────────────────────────┤  │
│  │                                          │  │
│  │  zone-api-gateway        :3001  ✅      │  │
│  │  zone-telegram-bot       :3002  ✅      │  │
│  │  zone-auth-service       :3003  ✅      │  │
│  │  zone-user-service       :3004  ✅      │  │
│  │  zone-analytics-service  :3005  ✅      │  │
│  │  zone-channels-service   :3006  ✅      │  │
│  │  zone-settings-service   :3007  ✅      │  │
│  │  zone-subscription-service:3008 ✅      │  │
│  │  zone-workflow-service   :3009  ✅      │  │
│  │  zone-groups-service     :3010  ✅      │  │
│  │  zone-news-api          :3011  ✅      │  │
│  │  zone-monitoring-service :3013  ✅      │  │
│  │  zone-admin-panel       :3014  ✅      │  │
│  │  zone-article-processor  :cluster ✅    │  │
│  │                                          │  │
│  └──────────────────────────────────────────┤  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         MongoDB Database                 │  │
│  │   Collections:                           │  │
│  │   - news_articles                        │  │
│  │   - users                                │  │
│  │   - channels                             │  │
│  │   - scheduled_posts                      │  │
│  │   - admin_permissions                    │  │
│  └──────────────────────────────────────────┤  │
│                                                 │
└─────────────────────────────────────────────────┘
```

## ✅ Completed Work (2025-08-26)

### 1. **Service Standardization**
- Renamed all services to follow `zone-{service-name}` pattern
- Created clean ecosystem configuration
- Implemented health checks on all services
- Set up graceful shutdown handlers
- Configured memory limits per service

### 2. **Bot Stability Fixes**
- Fixed signal handling (SIGINT/SIGTERM)
- Reduced restarts from 258 to stable operation
- Removed unnecessary staging bot
- Fixed environment variable issues

### 3. **Infrastructure Improvements**
- Standardized port allocation (3001-3014)
- Created service stub files for missing services
- Implemented proper error handling
- Set up PM2 process management

## 📊 Current Feature Status

### **Working Features** ✅
1. **Telegram Bot Commands** (20+ commands)
   - User management (`/addadmin`, `/myadmins`)
   - Channel management (`/addchannel`, `/mydestinations`)
   - Post creation (`/post`, `/posttext`, `/tbcpost`)
   - Scheduling (`/schedule`, `/myschedules`)
   - Configuration (`/setup`, `/settings`)

2. **Mini-App Frontend**
   - Modern responsive design
   - Category navigation
   - News cards with engagement metrics
   - Assistant widget
   - Bottom navigation

3. **Microservices**
   - All 14 services running
   - Health endpoints active
   - Clean code naming conventions
   - Proper process management

### **Not Working/Missing** ❌
1. **Data Pipeline**
   - No real news content
   - API returns empty responses
   - No content aggregation

2. **Core Functionality**
   - Authentication not implemented
   - Search not functional
   - No media handling
   - No real-time updates

3. **Advanced Features**
   - No Redis caching
   - No push notifications
   - No personalization
   - No analytics dashboard

## 🎯 Implementation Roadmap

### **Phase 1: Core Functionality** (Current)
**Goal**: Get real data flowing through the system

#### Task 1: Fix News API ⏳
```javascript
// Location: apps/api/src/routes/news.js
// Priority: CRITICAL
// Status: In Progress

Tasks:
- [ ] Connect to MongoDB news_articles collection
- [ ] Implement pagination
- [ ] Add filtering by category
- [ ] Return real article data
- [ ] Add error handling
```

#### Task 2: Authentication System
```javascript
// Location: apps/auth-service/
// Priority: HIGH
// Status: Pending

Tasks:
- [ ] JWT token generation
- [ ] User registration endpoint
- [ ] Login endpoint
- [ ] Session validation
- [ ] Telegram OAuth integration
```

#### Task 3: Search Implementation
```javascript
// Location: apps/api/src/routes/search.js
// Priority: HIGH
// Status: Pending

Tasks:
- [ ] MongoDB text index creation
- [ ] Search endpoint
- [ ] Query parsing
- [ ] Result ranking
- [ ] Filter support
```

### **Phase 2: Content Pipeline**
**Goal**: Aggregate and process news content

- News source integration
- Article scraping
- Content categorization
- Media processing
- Duplicate detection

### **Phase 3: User Experience**
**Goal**: Enhanced features and engagement

- Push notifications
- Personalized feed
- Social features
- Analytics dashboard
- PWA capabilities

## 🔧 Technical Standards

### **Code Standards**
- **Naming**: `zone-{service-name}` for services
- **Files**: kebab-case (`news-api.js`)
- **Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Classes**: PascalCase

### **API Standards**
- RESTful endpoints
- JSON responses
- HTTP status codes
- Error messages
- Rate limiting

### **Database Standards**
- Indexed fields for performance
- Consistent schema
- Proper relationships
- Data validation
- Backup strategy

## 📈 Performance Metrics

### **Current Performance**
- **Memory Usage**: ~750MB total (all services)
- **Response Time**: Unknown (API not returning data)
- **Uptime**: 99%+ (after fixes)
- **Error Rate**: Low (after stability fixes)

### **Target Performance**
- **Memory Usage**: < 1GB total
- **Response Time**: < 200ms average
- **Uptime**: > 99.9%
- **Error Rate**: < 0.1%
- **Cache Hit Rate**: > 80%

## 🚨 Known Issues

1. **API Gateway** - Returns empty responses for news
2. **Authentication** - Not implemented
3. **Search** - UI exists but backend missing
4. **Redis** - Not actually deployed
5. **Content** - No real news data
6. **Location** - Still shows "Sydney" instead of "Adelaide"

## 📝 Environment Variables

### **Variables**
```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/zone_news_production

# Telegram Bot
TELEGRAM_BOT_TOKEN=saved in env
TELEGRAM_WEBHOOK_URL=http://67.219.107.230/webhook

# API Configuration
NODE_ENV=production
PORT=3001

# Redis (when implemented)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT (when implemented)
JWT_SECRET=your_secret_key
JWT_EXPIRY=7d
```

## 🔄 Deployment Commands

### **Service Management**
```bash
# View all services
pm2 list

# Restart specific service
pm2 restart zone-api-gateway

# View logs
pm2 logs zone-telegram-bot

# Monitor resources
pm2 monit

# Save configuration
pm2 save

# Start all services
pm2 start ecosystem.clean.config.js
```

### **Database Operations**
```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/zone_news_production

# Backup database
mongodump --db zone_news_production

# Restore database
mongorestore --db zone_news_production dump/zone_news_production
```

## 📊 Database Schema

### **news_articles Collection**
```javascript
{
  _id: ObjectId,
  title: String,
  content: String,
  category: String,
  author: String,
  source: String,
  published_date: Date,
  url: String,
  image_url: String,
  views: Number,
  likes: Number,
  comments: Number,
  tags: [String],
  location: String,
  created_at: Date,
  updated_at: Date
}
```

### **users Collection**
```javascript
{
  _id: ObjectId,
  telegram_id: Number,
  username: String,
  first_name: String,
  last_name: String,
  tier: String, // 'free', 'premium', 'enterprise'
  preferences: {
    categories: [String],
    notifications: Boolean,
    language: String
  },
  created_at: Date,
  last_active: Date
}
```

## 🎯 Next Immediate Actions

1. **Fix News API** - Make it return real data
2. **Implement Auth** - JWT system for user sessions
3. **Enable Search** - Connect UI to backend
4. **Add Content** - Set up aggregation pipeline
5. **Update Location** - Change Sydney to Adelaide

---

*This documentation is actively maintained. Last updated during service standardization and feature analysis.*
