# Zone News Bot - Complete Architecture Documentation

## 🏗️ System Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Zone News Bot System                      │
├───────────────────────────┬─────────────────────────────────┤
│     Command Layer         │         Service Layer            │
├───────────────────────────┼─────────────────────────────────┤
│ • /start                  │ • TierManager                   │
│ • /help                   │ • PostManager                   │
│ • /post                   │ • MediaHandler                  │
│ • /schedule               │ • ScheduledPosting              │
│ • /templates              │ • TemplateSystem                │
│ • /bulk                   │ • BulkEditSystem                │
│ • /about                  │ • OnboardingFlow                │
│ • /groups                 │ • PaymentSystem                 │
│ • /channels               │ • LocalReactionSync             │
│ • /subscribe              │ • MessageHandlers               │
│ • /affiliate              │ • StateService                  │
│ • /usage                  │ • AdminService                  │
│ • /limits                 │                                 │
└───────────────────────────┴─────────────────────────────────┘
                                    │
                         ┌──────────┴──────────┐
                         │    Data Layer       │
                         ├────────────────────┤
                         │ • MongoDB           │
                         │ • Collections:      │
                         │   - users           │
                         │   - subscriptions   │
                         │   - post_history    │
                         │   - scheduled_posts │
                         │   - post_templates  │
                         │   - user_media      │
                         │   - bot_destinations│
                         │   - affiliate_links │
                         │   - payments        │
                         └────────────────────┘
```

## 📦 Module Architecture

### 1. Command Service (Main Orchestrator)
**File:** `src/services/command-service.js`

The central hub that initializes and coordinates all bot modules:

```javascript
class CommandService {
    // Core Services
    - tierManager: TierManager
    - postManager: PostManager
    - reactionSync: LocalReactionSync
    - messageHandlers: MessageHandlers
    
    // Premium Services
    - paymentSystem: PaymentSystem
    - mediaHandler: MediaHandler
    - scheduledPosting: ScheduledPosting
    - onboardingFlow: OnboardingFlow
    - templateSystem: TemplateSystem
    - bulkEditSystem: BulkEditSystem
    
    // Command Modules
    - adminCommands: AdminCommands
    - infoCommands: InfoCommands
    - newsCommands: NewsCommands
    - userCommands: UserCommands
    - subscriptionCommands: SubscriptionCommands
    - postingCommands: PostingCommands
    - tieredHelp: TieredHelp
    - usageCommands: UsageCommands
    
    // Callback Handlers
    - newsCallbacks: NewsCallbacks
    - settingsCallbacks: SettingsCallbacks
    - generalCallbacks: GeneralCallbacks
}
```

### 2. Tier Management System
**File:** `src/services/tier-manager.js`

Manages subscription tiers and feature access:

```javascript
Tiers:
├── Free (Default)
│   ├── 10 posts/day
│   ├── 1 destination
│   └── Basic commands only
│
├── Basic ($9.99/mo)
│   ├── 50 posts/day
│   ├── 3 scheduled posts
│   ├── 5 destinations
│   ├── 5 templates
│   └── Media support
│
├── Pro ($19.99/mo)
│   ├── 200 posts/day
│   ├── 20 scheduled posts
│   ├── 10 destinations
│   ├── 20 templates
│   ├── Bulk operations
│   └── Analytics
│
└── Enterprise ($49.99/mo)
    ├── Unlimited everything
    ├── API access
    ├── White label
    └── Priority support
```

### 3. Posting System
**Files:** 
- `src/services/post-manager.js`
- `src/services/commands/posting-commands.js`

Features:
- Text posting
- Media posting (photos, videos, documents, GIFs)
- Remote posting to groups/channels
- Post text editor (/posttext)
- Quick post (/quickpost)
- Auto-detection of bot destinations

### 4. Scheduling System
**File:** `src/services/scheduled-posting.js`

Features:
- Quick scheduling (30min, 1hr, 3hrs, tomorrow)
- Custom date/time scheduling
- Recurring posts (Pro+)
- View scheduled posts
- Cancel scheduled posts
- Bulk reschedule

### 5. Template System
**File:** `src/services/template-system.js`

Features:
- Save post templates
- Reuse templates
- Template categories (text, media, news, announcement, promotion, report)
- Tier-based limits
- Template management

### 6. Bulk Operations
**File:** `src/services/bulk-edit-system.js`

Features (Pro+ only):
- Bulk post to multiple destinations
- Bulk edit scheduled posts
- Bulk delete posts
- Bulk schedule content
- Bulk template conversion

### 7. Media Handler
**File:** `src/services/media-handler.js`

Supported media types:
- Photos (up to 10MB/50MB based on tier)
- Videos (up to 10MB/50MB based on tier)
- Documents
- Audio files
- Voice messages
- Animations (GIFs)

### 8. Payment System
**File:** `src/services/payment-system.js`

Features:
- Stripe/PayPal integration
- 20.5% affiliate commission system
- Subscription management
- Auto-renewal
- Payment history
- Earnings tracking
- Withdrawal system

### 9. Onboarding Flow
**File:** `src/services/onboarding-flow.js`

User journey:
```
/start
├── 📰 Latest News (Coming soon)
├── 🌐 Mini App
├── 📱 Groups
│   ├── How to add bot
│   ├── Discover groups
│   └── Group stats
├── 📢 Channels
│   ├── How to add bot
│   ├── Growth tips
│   └── Analytics
└── ℹ️ About
    ├── Mission & features
    ├── Quick start guide
    ├── Watch demo
    ├── View plans
    └── Documentation
```

## 🔄 User Flow Diagrams

### New User Onboarding
```
1. User starts bot → /start
2. Welcome message with main menu
3. User explores:
   - About → Learn about features
   - Groups → Add bot to groups
   - Channels → Add bot to channels
   - Latest News → Coming soon
   - Mini App → Web interface
4. User creates first post:
   - /post → Create content
   - Select destination
   - Send or schedule
5. User upgrades (optional):
   - /subscribe → View plans
   - Select tier
   - Complete payment
   - Access premium features
```

### Posting Flow
```
1. Create content:
   - /posttext → Set text
   - Send media → Attach files
   - /post → Review & send
2. Select destinations:
   - Auto-detect available
   - Choose groups/channels
   - Or post remotely
3. Schedule (optional):
   - /schedule → Set time
   - Quick options or custom
4. Confirm & send
```

### Template Flow
```
1. Create template:
   - Make a post
   - /savetemplate
   - Name template
2. Use template:
   - /templates → View all
   - Select template
   - Load content
   - /post → Send
```

## 📊 Database Schema

### Collections

#### users
```javascript
{
  _id: ObjectId,
  user_id: Number,
  username: String,
  first_name: String,
  last_name: String,
  tier: String, // 'free', 'basic', 'pro', 'enterprise'
  subscription_id: String,
  subscription_status: String,
  subscription_end: Date,
  affiliate_code: String,
  referred_by: String,
  total_earnings: Number,
  created_at: Date,
  updated_at: Date
}
```

#### post_history
```javascript
{
  _id: ObjectId,
  user_id: Number,
  type: String, // 'text', 'media', 'bulk'
  content: {
    text: String,
    media: Array
  },
  destinations: Array,
  success_count: Number,
  failed_count: Number,
  created_at: Date
}
```

#### scheduled_posts
```javascript
{
  _id: ObjectId,
  user_id: Number,
  content: {
    text: String,
    media: Array
  },
  destinations: Array,
  scheduled_time: Date,
  recurring: {
    enabled: Boolean,
    frequency: String, // 'daily', 'weekly', 'monthly'
    end_date: Date
  },
  status: String, // 'scheduled', 'sent', 'cancelled'
  created_at: Date
}
```

#### post_templates
```javascript
{
  _id: ObjectId,
  user_id: Number,
  name: String,
  type: String, // 'text', 'media', 'news', etc.
  content: {
    text: String,
    media: Array
  },
  settings: {
    destinations: Array,
    schedule_time: String
  },
  use_count: Number,
  created_at: Date
}
```

#### bot_destinations
```javascript
{
  _id: ObjectId,
  chat_id: Number,
  type: String, // 'group', 'supergroup', 'channel'
  title: String,
  username: String,
  bot_is_member: Boolean,
  bot_is_admin: Boolean,
  added_by: Number,
  added_at: Date,
  last_post: Date,
  post_count: Number
}
```

## 🔐 Security & Permissions

### Admin Commands
- Restricted to ADMIN_IDS environment variable
- Commands: /broadcast, /stats, /users, /clearcache

### Tier-Based Access Control
- Commands filtered by subscription tier
- API rate limiting based on tier
- Media size limits enforced
- Destination limits checked

### Payment Security
- Stripe/PayPal webhook validation
- Secure payment token handling
- SSL/TLS for all transactions
- PCI compliance

## 🚀 Deployment Architecture

### Production Setup (Vultr VPS)
```
Server: 67.219.107.230
├── Bot Service (PM2)
│   ├── zone-telegram-bot
│   └── Auto-restart on failure
├── MongoDB
│   ├── Local instance
│   └── Daily backups
├── Nginx
│   ├── Reverse proxy
│   └── SSL termination
└── Mini App
    └── Static files served
```

### Environment Variables
```bash
# Bot Configuration
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_BOT_USERNAME=ZoneNewsBot

# Database
MONGODB_URI=mongodb://localhost:27017/zone_news_production

# Payment
STRIPE_SECRET_KEY=xxx
PAYPAL_CLIENT_ID=xxx
PAYPAL_CLIENT_SECRET=xxx

# Admin
ADMIN_IDS=123456789,987654321

# Affiliate
AFFILIATE_COMMISSION=0.205

# Server
NODE_ENV=production
PORT=3000
```

## 📈 Monitoring & Analytics

### Metrics Tracked
- User growth
- Posts per day
- Active subscriptions
- Revenue metrics
- Error rates
- Response times

### Health Checks
- `/health` endpoint
- PM2 monitoring
- MongoDB connection check
- Telegram API status

## 🔧 Maintenance Tasks

### Daily
- Check bot status
- Monitor error logs
- Review user feedback

### Weekly
- Database backup
- Clear old media files
- Update analytics

### Monthly
- Review subscription renewals
- Process affiliate payouts
- Security updates

## 🎯 Future Enhancements

### Phase 2 - News Aggregation
- RSS feed integration
- AI-powered summarization
- Trending topic detection
- Multi-source aggregation

### Phase 3 - Advanced Analytics
- Engagement metrics
- Best posting times
- Content performance
- Growth predictions

### Phase 4 - AI Integration
- Content generation
- Auto-scheduling
- Sentiment analysis
- Smart recommendations

## 📝 Testing Checklist

### Core Features
- [ ] /start command works
- [ ] About page displays correctly
- [ ] Groups page functions
- [ ] Channels page loads
- [ ] Post creation works
- [ ] Media upload functions
- [ ] Scheduling works
- [ ] Templates save/load
- [ ] Bulk operations (Pro+)
- [ ] Payment processing
- [ ] Affiliate tracking
- [ ] Usage limits enforced

### User Flows
- [ ] New user onboarding
- [ ] First post creation
- [ ] Subscription upgrade
- [ ] Template workflow
- [ ] Scheduled post management
- [ ] Media handling
- [ ] Group/channel detection

### Edge Cases
- [ ] Rate limiting works
- [ ] Error messages display
- [ ] Tier restrictions enforced
- [ ] Payment failures handled
- [ ] Network errors recovered

## 🆘 Troubleshooting Guide

### Common Issues

#### Bot Not Responding
1. Check PM2 status: `pm2 list`
2. Restart bot: `pm2 restart zone-telegram-bot`
3. Check logs: `pm2 logs zone-telegram-bot`

#### Database Connection Failed
1. Check MongoDB: `systemctl status mongod`
2. Restart MongoDB: `sudo systemctl restart mongod`
3. Check connection string in .env

#### Payment Issues
1. Verify Stripe/PayPal keys
2. Check webhook configuration
3. Review payment logs

#### Media Upload Fails
1. Check file size limits
2. Verify user tier
3. Check storage space

---

*Last Updated: 2025-08-15*
*Version: 1.0.0*
*Status: Production Ready*