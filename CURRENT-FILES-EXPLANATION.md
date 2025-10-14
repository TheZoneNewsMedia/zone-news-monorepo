# Current Files Explanation & Proper Names

## Files We Kept (Only 4 Essential Files)

### 1. `api-news.js` → Should be `news-api-service.js`
**Purpose**: Simple API server that serves news articles from MongoDB
- Connects to MongoDB
- Provides `/api/news` endpoint
- Returns Adelaide news articles
- **Status**: WORKING ✅
- **Used by**: Mini app to fetch news

### 2. `api-server.js` → Should be `main-api-gateway.js`
**Purpose**: Main API server with authentication and multiple endpoints
- Full API with auth (JWT)
- User management endpoints
- Article CRUD operations
- Admin endpoints
- Webhook for Telegram bot
- **Status**: WORKING ✅
- **Size**: 94KB (largest file - has everything)

### 3. `ecosystem.config.js` → Keep as is
**Purpose**: PM2 configuration file
- Defines how to run services
- Sets environment variables
- Manages bot and API services
- **Status**: CONFIGURATION FILE ✅

### 4. `start.js` → Should be `telegram-bot-main.js`
**Purpose**: Main Telegram bot file
- Handles bot commands (/start, /news, etc.)
- Manages user interactions
- Posts to channels
- **Status**: UNKNOWN (need to test)

## Files We Archived (124 files moved)

### Why So Many Files?
- **Duplicates**: Multiple versions of same functionality
  - `enhanced-bot-*.js` - Different bot versions
  - `admin-*.js` - Multiple admin panels
  - `zone-news-*.js` - Various scrapers
  
### What They Did:
- **Bot variants** (10+ files): Different attempts at bot functionality
- **API variants** (20+ files): Multiple API implementations
- **Scrapers** (15+ files): Different ways to fetch news
- **Admin panels** (10+ files): Various admin interfaces
- **Test files** (20+ files): Testing and debugging scripts
- **Utilities** (30+ files): Helper functions and tools

## Proper Structure Moving Forward

```
zone-news-monorepo/
├── apps/
│   ├── api/
│   │   └── src/
│   │       └── server.js (Main API - from api-server.js)
│   ├── bot/
│   │   └── src/
│   │       └── server.js (Telegram bot - from start.js)
│   └── miniapp/
│       └── index.html (Mini app interface)
├── services/
│   └── news/
│       └── news-service.js (News fetching - from api-news.js)
└── config/
    └── ecosystem.config.js (PM2 config)
```

## What Each Service Does

### 1. **API Service** (Port 3001)
- Serves news to mini app
- Handles user authentication
- Manages article database
- Provides admin endpoints

### 2. **Bot Service** (Port 3002)
- Responds to Telegram commands
- Posts news to channels
- Manages user subscriptions
- Handles tier system

### 3. **Mini App** (Static HTML)
- Shows news in Telegram
- Tier-based access (Free/Pro/Business)
- Served via Nginx

### 4. **CMS** (Port 1337)
- Strapi for content management
- Create/edit articles
- Manage channels

## Why Consolidation Was Needed

**Before**: 128 JS files
- Many duplicates doing same thing
- Confusing which file was active
- Hard to maintain
- Unclear dependencies

**After**: 4 essential files
- Clear purpose for each
- Easy to understand
- Properly organized in monorepo
- All duplicates archived

## Next Steps

1. **Rename files properly**:
   ```bash
   mv api-news.js news-api-service.js
   mv api-server.js main-api-gateway.js
   mv start.js telegram-bot-main.js
   ```

2. **Move to monorepo structure**:
   ```bash
   cp main-api-gateway.js zone-news-monorepo/apps/api/src/server.js
   cp telegram-bot-main.js zone-news-monorepo/apps/bot/src/server.js
   cp news-api-service.js zone-news-monorepo/services/news/
   ```

3. **Update PM2 config** to use new paths

4. **Test everything** still works