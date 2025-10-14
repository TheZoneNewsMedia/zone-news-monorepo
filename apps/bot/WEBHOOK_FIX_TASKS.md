# Telegram Bot Webhook Fix - Task Breakdown

## Current Issue
- **Error**: 409: Conflict: terminated by other getUpdates request
- **Root Cause**: Multiple bot instances (34 found) using polling mode simultaneously
- **Goal**: Create centralized webhook hub with max_connections optimization

## Task Breakdown

### Phase 1: Configuration Cleanup (Immediate)
#### Task 1.1: Remove Hardcoded Values ✅ CRITICAL
- [ ] Remove hardcoded bot token from `telegram-connection-manager.js` line 19
- [ ] Ensure all configs come from environment variables only
- [ ] Update `.env.template` with required variables

#### Task 1.2: Create Configuration Service
- [ ] Create `config/telegram-config.js` for centralized configuration
- [ ] Add validation for required environment variables
- [ ] Add max_connections configuration (default: 40, range: 1-100)

### Phase 2: Stop Current Conflicts (Priority)
#### Task 2.1: Identify Running Instances
- [ ] Check PM2 processes: `pm2 list`
- [ ] Check Docker containers: `docker ps`
- [ ] Check system processes: `ps aux | grep node`
- [ ] Check for background services

#### Task 2.2: Stop All Bot Instances
- [ ] Stop PM2 processes: `pm2 stop all`
- [ ] Clear PM2 cache: `pm2 flush`
- [ ] Stop any Docker containers running bots
- [ ] Kill any orphaned Node processes

### Phase 3: Implement Connection Manager (Core)
#### Task 3.1: Integrate Connection Manager
- [ ] Import TelegramConnectionManager in `index.js`
- [ ] Replace current bot initialization with connection manager
- [ ] Remove all direct Telegraf/TelegramBot instantiations
- [ ] Add proper error handling and logging

#### Task 3.2: Configure Webhook Hub
- [ ] Set up single Express server on port 8000
- [ ] Configure webhook endpoint: `/webhook/${botToken}`
- [ ] Implement health check endpoint: `/health`
- [ ] Add webhook verification middleware

### Phase 4: Migrate Bot Instances (Systematic)
#### Task 4.1: Audit All Instances
Files to migrate (34 instances found):
- [ ] `zone-news-monorepo/posting-bot-updated.js` (polling: true) - HIGH PRIORITY
- [ ] `zone-news-monorepo/services/notification-service.js` (polling: false)
- [ ] `zone-news-monorepo/services/bot/BotService.js` (Telegraf)
- [ ] `zone-news-monorepo/apps/bot/src/server.js` (webHook: false)
- [ ] `zone-news-monorepo/apps/bot/src/secure-bot.js` (Telegraf)
- [ ] `zone-news-monorepo/apps/bot/bot.js` (Telegraf)
- [ ] `zone-news-monorepo/apps/bot/src/main-bot.js` (Telegraf)
- [ ] `zone-news-monorepo/apps/bot/src/services/bot-initialization.js` (Telegraf)
- [ ] `zone-news-monorepo/apps/bot/src/commands/tbc-nightnews-standalone.js` (Telegraf)
- [ ] Other instances (25 more files)

#### Task 4.2: Update Each Instance
For each file:
1. Remove direct bot instantiation
2. Import connection manager
3. Register with connection manager
4. Update to use webhook mode only
5. Test individually

### Phase 5: Testing & Validation (Critical)
#### Task 5.1: Clear Existing Webhooks
- [ ] Run `clear-webhook.js` to reset webhook state
- [ ] Verify webhook is cleared: `{ url: '', has_custom_certificate: false }`
- [ ] Check for any remaining polling processes

#### Task 5.2: Test Consolidated System
- [ ] Start connection manager only
- [ ] Verify webhook registration successful
- [ ] Test max_connections parameter (set to 40)
- [ ] Monitor for 409 Conflict errors
- [ ] Test all bot commands work

#### Task 5.3: Performance Testing
- [ ] Test concurrent webhook requests
- [ ] Monitor memory usage
- [ ] Check response times
- [ ] Verify no duplicate message processing

### Phase 6: Deployment (Final)
#### Task 6.1: Update Deployment Scripts
- [ ] Update PM2 ecosystem.config.js
- [ ] Update Docker configurations
- [ ] Update environment variables in production
- [ ] Create rollback plan

#### Task 6.2: Production Deployment
- [ ] Deploy to staging first
- [ ] Monitor for 30 minutes
- [ ] Deploy to production
- [ ] Monitor logs for errors

## Execution Order
1. **Immediate**: Tasks 1.1, 1.2, 2.1, 2.2 (Stop conflicts)
2. **Next**: Tasks 3.1, 3.2 (Implement manager)
3. **Then**: Tasks 4.1, 4.2 (Migrate instances)
4. **Finally**: Tasks 5.1, 5.2, 5.3, 6.1, 6.2 (Test & Deploy)

## Current Status
- ⏳ Starting with Task 1.1: Remove hardcoded bot token

## Success Criteria
- ✅ No 409 Conflict errors
- ✅ Single webhook hub managing all bot instances
- ✅ max_connections optimized (40 concurrent)
- ✅ No hardcoded values in any files
- ✅ All bot commands functioning
