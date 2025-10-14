# 🤖 Zone News Bot - Complete Integration Guide

## 📋 Table of Contents
1. [Bot Overview](#bot-overview)
2. [Architecture](#architecture)
3. [Command System](#command-system)
4. [Service Integration](#service-integration)
5. [Database Operations](#database-operations)
6. [Webhook Configuration](#webhook-configuration)
7. [Admin Features](#admin-features)
8. [Posting System](#posting-system)
9. [State Management](#state-management)
10. [Error Handling](#error-handling)

---

## 🎯 Bot Overview

The Zone News Bot (@ZoneNewsBot) is the core interaction point for the Zone News platform, providing news distribution, channel management, and admin capabilities through Telegram.

### Key Information
- **Bot Username**: @ZoneNewsBot
- **Bot Token**: 8132879580:AAFgNLe51T37LyDSl3g0-_jAsN1-k8ABfPk
- **Admin Users**: 
  - Duke Exxotic (ID: 7802629063)
  - @TheZoneNews (ID: 8123893898)
- **Port**: 3002
- **Mode**: Webhook (production) / Polling (development)

---

## 🏗️ Architecture

### Bot Service Structure
```
apps/bot/
├── index.js                          # Main bot entry
├── package.json                      # Dependencies
├── ecosystem.config.js               # PM2 config
├── src/
│   ├── services/
│   │   ├── posting-service-complete.js    # Full posting logic
│   │   ├── onboarding-service.js          # User onboarding
│   │   └── posting-service-improved.js    # Enhanced posting
│   ├── commands/
│   │   ├── public.js                      # Public commands
│   │   └── admin.js                       # Admin commands
│   ├── middleware/
│   │   ├── auth.js                        # Authentication
│   │   └── logging.js                     # Request logging
│   └── utils/
│       ├── formatter.js                   # Message formatting
│       └── validator.js                   # Input validation
└── .env                              # Environment variables
```

### Service Dependencies
```javascript
// Core dependencies
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const express = require('express');
const Redis = require('ioredis');

// Internal services
const PostingService = require('./services/posting-service-complete');
const OnboardingService = require('./services/onboarding-service');
const CommandService = require('../services/commands/CommandService');
```

---

## 📝 Command System

### Public Commands

#### /start
```javascript
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const isAdmin = ADMIN_IDS.includes(userId);
  
  const welcomeMessage = `
Welcome to Zone News Adelaide! 📰

Your trusted source for local news and updates.

${isAdmin ? '👑 Admin access granted!' : ''}
  `;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📰 Latest News', callback_data: 'latest_news' }],
      [{ text: '🔍 Search', switch_inline_query_current_chat: '' }],
      isAdmin ? [{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }] : [],
    ].filter(row => row.length > 0)
  };
  
  await ctx.reply(welcomeMessage, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
});
```

#### /news
```javascript
bot.command('news', async (ctx) => {
  const articles = await db.collection('news_articles')
    .find({ status: 'published' })
    .sort({ published_date: -1 })
    .limit(5)
    .toArray();
  
  for (const article of articles) {
    const message = formatArticle(article);
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '👍', callback_data: `like_${article._id}` },
          { text: '❤️', callback_data: `love_${article._id}` },
          { text: '🔗 Read More', url: article.url }
        ]]
      }
    });
  }
});
```

#### /search
```javascript
bot.command('search', async (ctx) => {
  const query = ctx.message.text.split(' ').slice(1).join(' ');
  
  if (!query) {
    return ctx.reply('Usage: /search <keyword>');
  }
  
  const results = await db.collection('news_articles')
    .find({ 
      $text: { $search: query },
      status: 'published' 
    })
    .limit(10)
    .toArray();
  
  if (results.length === 0) {
    return ctx.reply('No articles found matching your search.');
  }
  
  // Send results
  for (const article of results) {
    await sendArticle(ctx, article);
  }
});
```

### Admin Commands

#### /post
```javascript
bot.command('post', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply('⚠️ This command requires admin access.');
  }
  
  // Check destinations
  const destinations = await getAdminDestinations(ctx.from.id);
  
  if (destinations.length === 0) {
    return ctx.reply('No destinations configured. Use /addchannel first.');
  }
  
  // Start posting wizard
  const state = {
    step: 'select_destination',
    destinations,
    articleIndex: 0
  };
  
  userStates.set(ctx.from.id, state);
  
  await showDestinationSelector(ctx, destinations);
});
```

#### /addchannel
```javascript
bot.command('addchannel', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply('⚠️ Admin access required.');
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length === 0) {
    // Interactive mode
    userStates.set(ctx.from.id, {
      action: 'adding_channel',
      step: 'waiting_channel'
    });
    
    return ctx.reply(
      'Please provide the channel username (e.g., @ZoneNewsAdl):',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Cancel', callback_data: 'cancel_add' }
          ]]
        }
      }
    );
  }
  
  // Direct mode
  const channelId = args[0];
  const customName = args[1] || generateChannelName(channelId);
  
  await addDestination(ctx.from.id, {
    id: channelId,
    name: customName,
    type: 'channel'
  });
  
  ctx.reply(`✅ Channel ${channelId} added successfully!`);
});
```

#### /mydestinations
```javascript
bot.command('mydestinations', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply('⚠️ Admin access required.');
  }
  
  const destinations = await getAdminDestinations(ctx.from.id);
  
  if (destinations.length === 0) {
    return ctx.reply('No destinations configured yet.');
  }
  
  const list = destinations.map((dest, index) => {
    const icon = dest.type === 'channel' ? '📢' : 
                 dest.type === 'group' ? '👥' : '💬';
    return `${index + 1}. ${icon} ${dest.name} (${dest.id})`;
  }).join('\n');
  
  ctx.reply(`📋 Your Destinations:\n\n${list}`);
});
```

---

## 🔄 Service Integration

### Connecting to Other Services

#### API Gateway Integration
```javascript
class BotService {
  constructor() {
    this.apiGateway = axios.create({
      baseURL: 'http://localhost:3001',
      headers: {
        'X-Service-Token': process.env.INTERNAL_SERVICE_TOKEN
      }
    });
  }
  
  async fetchNews() {
    const response = await this.apiGateway.get('/api/news');
    return response.data;
  }
  
  async postArticle(article, destination) {
    return await this.apiGateway.post('/api/posts', {
      article,
      destination,
      posted_by: 'bot'
    });
  }
}
```

#### MTProto Sidecar Integration
```javascript
class MTProtoIntegration {
  constructor() {
    this.mtproto = axios.create({
      baseURL: 'http://localhost:3014',
      headers: {
        'X-Internal-Auth': process.env.MTPROTO_TOKEN
      }
    });
  }
  
  async scrapeChannel(channelId) {
    const response = await this.mtproto.post('/scrape', {
      channel: channelId,
      limit: 100
    });
    return response.data.messages;
  }
  
  async getChannelInfo(channelId) {
    const response = await this.mtproto.get(`/channel/${channelId}`);
    return response.data;
  }
}
```

#### Redis Cache Integration
```javascript
const redis = new Redis({
  host: 'localhost',
  port: 6379
});

class CacheService {
  async getCachedNews(key) {
    const cached = await redis.get(`news:${key}`);
    return cached ? JSON.parse(cached) : null;
  }
  
  async setCachedNews(key, data, ttl = 300) {
    await redis.set(
      `news:${key}`,
      JSON.stringify(data),
      'EX',
      ttl
    );
  }
  
  async invalidateCache(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

---

## 💾 Database Operations

### MongoDB Connection
```javascript
class DatabaseService {
  constructor() {
    this.client = new MongoClient(process.env.MONGODB_URI);
    this.db = null;
  }
  
  async connect() {
    await this.client.connect();
    this.db = this.client.db('zone_news_production');
    
    // Create indexes
    await this.createIndexes();
  }
  
  async createIndexes() {
    // Text search index
    await this.db.collection('news_articles').createIndex({
      title: 'text',
      content: 'text',
      summary: 'text'
    });
    
    // Performance indexes
    await this.db.collection('news_articles').createIndex({
      published_date: -1
    });
    
    await this.db.collection('posted_articles').createIndex({
      posted_at: -1,
      destination: 1
    });
  }
}
```

### Core Database Operations
```javascript
// Get latest articles
async function getLatestArticles(limit = 10) {
  return await db.collection('news_articles')
    .find({ status: 'published' })
    .sort({ published_date: -1 })
    .limit(limit)
    .toArray();
}

// Track posted article
async function trackPostedArticle(articleId, destination, messageId) {
  return await db.collection('posted_articles').insertOne({
    article_id: articleId,
    destination,
    message_id: messageId,
    posted_at: new Date(),
    posted_by: 'bot'
  });
}

// Get admin destinations
async function getAdminDestinations(userId) {
  const admin = await db.collection('admin_destinations')
    .findOne({ telegram_id: userId });
  return admin?.destinations || [];
}

// Add destination
async function addDestination(userId, destination) {
  return await db.collection('admin_destinations').updateOne(
    { telegram_id: userId },
    { 
      $push: { 
        destinations: {
          ...destination,
          added_at: new Date()
        }
      }
    },
    { upsert: true }
  );
}
```

---

## 🔗 Webhook Configuration

### Setting Up Webhook
```javascript
class WebhookManager {
  constructor(bot, app) {
    this.bot = bot;
    this.app = app;
    this.webhookPath = '/webhook';
  }
  
  async setup() {
    // Set webhook on Telegram
    await this.bot.telegram.setWebhook(
      `${process.env.WEBHOOK_URL}${this.webhookPath}`,
      {
        secret_token: process.env.WEBHOOK_SECRET
      }
    );
    
    // Setup Express route
    this.app.use(
      this.bot.webhookCallback(this.webhookPath)
    );
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy',
        webhook: 'active',
        uptime: process.uptime()
      });
    });
  }
  
  async verify(req, res, next) {
    const token = req.headers['x-telegram-bot-api-secret-token'];
    
    if (token !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
  }
}
```

### Webhook vs Polling
```javascript
// Production: Use Webhook
if (process.env.NODE_ENV === 'production') {
  const app = express();
  const webhookManager = new WebhookManager(bot, app);
  await webhookManager.setup();
  
  app.listen(3002, () => {
    console.log('Bot webhook server running on port 3002');
  });
} else {
  // Development: Use Polling
  bot.launch({
    webhook: {
      domain: 'http://localhost:3002',
      port: 3002
    }
  });
}
```

---

## 👑 Admin Features

### Admin Detection
```javascript
const ADMIN_IDS = [
  7802629063,  // Duke Exxotic
  8123893898   // @TheZoneNews
];

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

// Middleware for admin commands
bot.use(async (ctx, next) => {
  ctx.isAdmin = isAdmin(ctx.from?.id);
  await next();
});
```

### Admin Panel
```javascript
bot.action('admin_panel', async (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.answerCbQuery('⚠️ Admin access required');
  }
  
  const stats = await getSystemStats();
  
  const message = `
📊 <b>Admin Dashboard</b>

Total Articles: ${stats.totalArticles}
Posted Today: ${stats.postedToday}
Active Channels: ${stats.activeChannels}
Total Views: ${stats.totalViews}

Select an action:
  `;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📝 Post Article', callback_data: 'admin_post' }],
      [{ text: '📢 Manage Channels', callback_data: 'admin_channels' }],
      [{ text: '📊 Analytics', callback_data: 'admin_analytics' }],
      [{ text: '⚙️ Settings', callback_data: 'admin_settings' }],
      [{ text: '🔙 Back', callback_data: 'start' }]
    ]
  };
  
  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
});
```

---

## 📮 Posting System

### Posting Workflow
```javascript
class PostingService {
  constructor(bot, db) {
    this.bot = bot;
    this.db = db;
    this.queue = [];
  }
  
  async postToDestination(article, destination) {
    try {
      // Format message
      const message = this.formatArticle(article);
      
      // Create inline keyboard
      const keyboard = {
        inline_keyboard: [
          [
            { text: '👍', callback_data: `react_like_${article._id}` },
            { text: '❤️', callback_data: `react_love_${article._id}` },
            { text: '🔥', callback_data: `react_fire_${article._id}` }
          ],
          [
            { text: '📖 Read Full Article', url: article.url }
          ]
        ]
      };
      
      // Send to destination
      let result;
      if (destination.type === 'channel') {
        result = await this.bot.telegram.sendMessage(
          destination.id,
          message,
          {
            parse_mode: 'HTML',
            reply_markup: keyboard
          }
        );
      } else if (destination.type === 'topic') {
        result = await this.bot.telegram.sendMessage(
          destination.groupId,
          message,
          {
            message_thread_id: destination.topicId,
            parse_mode: 'HTML',
            reply_markup: keyboard
          }
        );
      }
      
      // Track posting
      await this.trackPosting(article._id, destination, result.message_id);
      
      return { success: true, messageId: result.message_id };
    } catch (error) {
      console.error('Posting failed:', error);
      return { success: false, error: error.message };
    }
  }
  
  formatArticle(article) {
    return `
<b>${article.title}</b>

${article.summary}

📰 <i>${article.category}</i>
📅 ${new Date(article.published_date).toLocaleDateString()}
👁 ${article.views || 0} views

#ZoneNews #Adelaide #${article.category.replace(/\s+/g, '')}
    `.trim();
  }
  
  async trackPosting(articleId, destination, messageId) {
    await this.db.collection('posted_articles').insertOne({
      article_id: articleId,
      destination: destination.id,
      destination_type: destination.type,
      message_id: messageId,
      posted_at: new Date(),
      posted_by: 'bot'
    });
  }
}
```

### Bulk Posting
```javascript
async function bulkPost(articles, destinations) {
  const results = [];
  
  for (const article of articles) {
    for (const destination of destinations) {
      const result = await postingService.postToDestination(
        article,
        destination
      );
      
      results.push({
        article: article.title,
        destination: destination.name,
        ...result
      });
      
      // Rate limiting
      await sleep(1000);
    }
  }
  
  return results;
}
```

---

## 🎛️ State Management

### User State System
```javascript
class StateManager {
  constructor() {
    this.states = new Map();
    this.TTL = 5 * 60 * 1000; // 5 minutes
  }
  
  set(userId, state) {
    this.states.set(userId, {
      ...state,
      timestamp: Date.now()
    });
    
    // Auto-cleanup after TTL
    setTimeout(() => {
      this.clear(userId);
    }, this.TTL);
  }
  
  get(userId) {
    const state = this.states.get(userId);
    
    if (!state) return null;
    
    // Check if expired
    if (Date.now() - state.timestamp > this.TTL) {
      this.clear(userId);
      return null;
    }
    
    return state;
  }
  
  update(userId, updates) {
    const current = this.get(userId);
    if (current) {
      this.set(userId, { ...current, ...updates });
    }
  }
  
  clear(userId) {
    this.states.delete(userId);
  }
}

const stateManager = new StateManager();
```

### Interactive Flow States
```javascript
// Posting flow states
const POSTING_STATES = {
  SELECT_DESTINATION: 'select_destination',
  SELECT_ARTICLE: 'select_article',
  PREVIEW: 'preview',
  CONFIRM: 'confirm'
};

// Handle state transitions
bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const state = stateManager.get(userId);
  
  if (!state) {
    return ctx.answerCbQuery('Session expired. Please start again.');
  }
  
  const action = ctx.callbackQuery.data;
  
  switch (state.step) {
    case POSTING_STATES.SELECT_DESTINATION:
      await handleDestinationSelection(ctx, state, action);
      break;
    
    case POSTING_STATES.SELECT_ARTICLE:
      await handleArticleSelection(ctx, state, action);
      break;
    
    case POSTING_STATES.PREVIEW:
      await handlePreviewAction(ctx, state, action);
      break;
    
    case POSTING_STATES.CONFIRM:
      await handleConfirmation(ctx, state, action);
      break;
  }
});
```

---

## ❌ Error Handling

### Error Types and Handlers
```javascript
class ErrorHandler {
  static async handle(ctx, error) {
    console.error('Bot error:', error);
    
    // Telegram API errors
    if (error.response?.error_code) {
      return this.handleTelegramError(ctx, error);
    }
    
    // Database errors
    if (error.name === 'MongoError') {
      return this.handleDatabaseError(ctx, error);
    }
    
    // Network errors
    if (error.code === 'ECONNREFUSED') {
      return this.handleNetworkError(ctx, error);
    }
    
    // Generic error
    await ctx.reply('❌ An error occurred. Please try again later.');
  }
  
  static async handleTelegramError(ctx, error) {
    const code = error.response.error_code;
    const description = error.response.description;
    
    switch (code) {
      case 400:
        if (description.includes('not enough rights')) {
          await ctx.reply('❌ Bot needs admin rights in the destination.');
        } else if (description.includes('TOPIC_CLOSED')) {
          await ctx.reply('❌ This topic is closed for posting.');
        } else {
          await ctx.reply('❌ Invalid request. Please check your input.');
        }
        break;
      
      case 403:
        await ctx.reply('❌ Bot was blocked or kicked from the destination.');
        break;
      
      case 429:
        await ctx.reply('⚠️ Too many requests. Please wait a moment.');
        break;
      
      default:
        await ctx.reply(`❌ Telegram error: ${description}`);
    }
  }
  
  static async handleDatabaseError(ctx, error) {
    console.error('Database error:', error);
    await ctx.reply('❌ Database error. Please contact support.');
  }
  
  static async handleNetworkError(ctx, error) {
    console.error('Network error:', error);
    await ctx.reply('❌ Network error. Please check your connection.');
  }
}

// Global error handler
bot.catch(async (err, ctx) => {
  await ErrorHandler.handle(ctx, err);
});
```

### Graceful Shutdown
```javascript
process.once('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  bot.stop('SIGTERM');
  process.exit(0);
});
```

---

## 🔧 Configuration Examples

### Development Configuration
```bash
# .env.development
NODE_ENV=development
BOT_TOKEN=your-dev-bot-token
MONGODB_URI=mongodb://localhost:27017/zone_news_dev
REDIS_HOST=localhost
REDIS_PORT=6379
LOG_LEVEL=debug
```

### Production Configuration
```bash
# .env.production
NODE_ENV=production
BOT_TOKEN=8132879580:AAFgNLe51T37LyDSl3g0-_jAsN1-k8ABfPk
WEBHOOK_URL=https://bot.thezonenews.com
WEBHOOK_SECRET=secure-webhook-secret-2025
MONGODB_URI=mongodb://localhost:27017/zone_news_production
REDIS_HOST=localhost
REDIS_PORT=6379
LOG_LEVEL=info
```

### PM2 Configuration
```javascript
module.exports = {
  apps: [{
    name: 'zone-bot',
    script: './index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    error_file: '/var/log/zone-news/bot-error.log',
    out_file: '/var/log/zone-news/bot-out.log',
    log_file: '/var/log/zone-news/bot-combined.log',
    time: true
  }]
};
```

---

## 📊 Monitoring & Logging

### Logging Setup
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'combined.log' 
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

### Performance Monitoring
```javascript
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      commands: new Map(),
      responseTime: [],
      errors: []
    };
  }
  
  trackCommand(command, duration) {
    const current = this.metrics.commands.get(command) || 0;
    this.metrics.commands.set(command, current + 1);
    this.metrics.responseTime.push(duration);
  }
  
  trackError(error) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack
    });
  }
  
  getReport() {
    const avgResponseTime = 
      this.metrics.responseTime.reduce((a, b) => a + b, 0) / 
      this.metrics.responseTime.length;
    
    return {
      totalCommands: Array.from(this.metrics.commands.values())
        .reduce((a, b) => a + b, 0),
      commandBreakdown: Object.fromEntries(this.metrics.commands),
      avgResponseTime: avgResponseTime || 0,
      errorCount: this.metrics.errors.length,
      uptime: process.uptime()
    };
  }
}
```

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] Update bot token in .env
- [ ] Configure webhook URL
- [ ] Set admin IDs
- [ ] Test database connection
- [ ] Verify Redis is running
- [ ] Check all service dependencies

### Deployment Steps
1. Build and test locally
2. Deploy to server
3. Set webhook with BotFather
4. Configure nginx routing
5. Start with PM2
6. Monitor logs
7. Test all commands

### Post-Deployment
- [ ] Verify webhook is active
- [ ] Test public commands
- [ ] Test admin commands
- [ ] Check error logs
- [ ] Monitor performance
- [ ] Set up alerts

---

*Last Updated: 2025-08-14*
*Version: 2.0.0*
*Status: Production Ready*