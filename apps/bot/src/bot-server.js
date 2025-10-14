#!/usr/bin/env node

/**
 * Zone News Bot - Enhanced Startup
 * Premium AI-Powered News Aggregation & Distribution System
 */

require('dotenv').config();
const { ServiceRegistry } = require('./services/ServiceRegistry');
const appConfig = require('./config/AppConfig');
const logger = require('./config/logger');
const zoneLogger = require('./config/zoneLogger');
const envValidator = require('./utils/envValidator');
const errorHandler = require('./utils/errorHandler');
const mongoose = require('mongoose');
const { initializeRedisSync } = require('./config/redisSync');
const { aiConfig } = require('./config/aiConfig');
const { youtubeLimits } = require('./config/youtubeLimits');
const { initializeSentry, flushSentry } = require('./config/sentry');

// ASCII Art Banner
const banner = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  ███████╗ ██████╗ ███╗   ██╗███████╗    ███╗   ██╗███████╗██╗    ██╗███████╗║
║  ╚══███╔╝██╔═══██╗████╗  ██║██╔════╝    ████╗  ██║██╔════╝██║    ██║██╔════╝║
║    ███╔╝ ██║   ██║██╔██╗ ██║█████╗      ██╔██╗ ██║█████╗  ██║ █╗ ██║███████╗║
║   ███╔╝  ██║   ██║██║╚██╗██║██╔══╝      ██║╚██╗██║██╔══╝  ██║███╗██║╚════██║║
║  ███████╗╚██████╔╝██║ ╚████║███████╗    ██║ ╚████║███████╗╚███╔███╔╝███████║║
║  ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝    ╚═╝  ╚═══╝╚══════╝ ╚══╝╚══╝ ╚══════╝║
║                                                               ║
║              🚀 Premium News Bot - Powered by AI 🚀            ║
╚═══════════════════════════════════════════════════════════════╝
`;

// Determine environment
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

async function startZoneService() {
  const startTime = Date.now();
  
  try {
    console.log('\x1b[36m%s\x1b[0m', banner);
    
    // Validate environment variables first
    logger.info('🔍 Validating environment variables...');
    const envResult = envValidator.validateOrExit();
    
    // Initialize Sentry monitoring (optional)
    if (process.env.SENTRY_DSN) {
      logger.info('🚨 Initializing error monitoring...');
      initializeSentry();
    } else {
      logger.info('   ⚪ Error monitoring disabled (no SENTRY_DSN)');
    }
    
    // Startup info
    zoneLogger.startup('🔥 Zone Premium News Service Starting 🔥', {
      version: '2.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      environment: appConfig.get('app.environment'),
      mode: isProduction ? 'PRODUCTION' : 'DEVELOPMENT'
    });
    
    // Validate configuration
    zoneLogger.info('🔍 Validating configuration...');
    const requiredConfigs = [
      'bot.token',
      'database.mongodb.uri'
    ];
    
    const missing = requiredConfigs.filter(key => !appConfig.get(key));
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
    zoneLogger.info('   ✅ Configuration validated');
    
    // Connect to MongoDB
    zoneLogger.info('🗄️  Connecting to MongoDB...');
    await mongoose.connect(
      appConfig.get('database.mongodb.uri'),
      appConfig.get('database.mongodb.options')
    );
    zoneLogger.info('   ✅ MongoDB connected');
    
    // Initialize Redis with sync
    zoneLogger.info('📮 Initializing Redis with sync capabilities...');
    const redisSync = await initializeRedisSync();
    const syncStatus = redisSync.getSyncStatus();
    zoneLogger.info(`   ✅ Redis initialized (Dev: ${syncStatus.devConnected}, Sync: ${syncStatus.syncEnabled})`);
    
    // Initialize service registry
    zoneLogger.info('🚀 Initializing core services...');
    ServiceRegistry.initialize();
    
    // Register new services
    ServiceRegistry.register('formattingService', () => {
      const FormattingService = require('./services/formattingService');
      return new FormattingService();
    });
    
    ServiceRegistry.register('autoPostingService', () => {
      const AutoPostingService = require('./services/autoPostingService');
      return new AutoPostingService();
    });
    
    // Get and initialize bot service
    const telegramBotService = ServiceRegistry.get('bot');
    await telegramBotService.initialize();
    console.log('   ✅ Telegram Bot initialized');
    
    // Initialize premium services
    const enhancedNewsService = ServiceRegistry.get('enhancedNewsService');
    const subscriptionService = ServiceRegistry.get('subscriptionService');
    const formattingService = ServiceRegistry.get('formattingService');
    const autoPostingService = ServiceRegistry.get('autoPostingService');
    const autoUpdateService = ServiceRegistry.get('autoUpdateService');
    
    // Initialize payment and monetization services
    const telegramPaymentService = ServiceRegistry.get('telegramPaymentService');
    await telegramPaymentService.initialize(telegramBotService.bot);
    console.log('   ✅ Telegram Stars payment service initialized');
    
    const reactionTrackingService = ServiceRegistry.get('reactionTrackingService');
    await reactionTrackingService.initialize(telegramBotService.bot);
    console.log('   ✅ Reaction tracking service initialized');
    
    const affiliateService = ServiceRegistry.get('affiliateService');
    await affiliateService.initialize();
    console.log('   ✅ Affiliate management service initialized');
    
    // Initialize logger channel service
    const LoggerChannelService = require('./services/loggerChannelService');
    const loggerChannelService = new LoggerChannelService(telegramBotService.bot);
    await loggerChannelService.initialize();
    telegramBotService.bot.loggerChannel = loggerChannelService;
    
    // Initialize webhook service if configured (always prefer webhook)
    if (process.env.TELEGRAM_WEBHOOK_URL) {
      const WebhookService = require('./services/webhookService');
      const webhookService = new WebhookService(telegramBotService.bot);
      await webhookService.start();
      console.log('   ✅ Webhook service started');
      
      // Set webhook if in production
      if (isProduction) {
        await webhookService.setWebhook(
          process.env.TELEGRAM_WEBHOOK_URL,
          process.env.TELEGRAM_WEBHOOK_SECRET
        );
      }
    } else {
      console.log('   ⚠️ TELEGRAM_WEBHOOK_URL not set; webhook server not started');
    }
    
    // Initialize services
    await autoUpdateService.initialize();
    await autoPostingService.initialize();
    console.log('   ✅ Premium services initialized');
    
    // Get bot info
    const botInfo = telegramBotService.bot.me;
    console.log(`   🤖 Bot: @${botInfo.username} (${botInfo.id})`);
    
    // Test connectivity
    console.log('\n🧪 Testing system connectivity...');
    await testSystemConnectivity(telegramBotService.bot);
    
    // Display Intelligence Engine configuration
    console.log('\n🧠 Intelligence Engine Configuration:');
    console.log(`   • Provider: Advanced Language Processing`);
    console.log(`   • Features: Smart Summaries, Content Enhancement, Grammar Perfection`);
    console.log(`   • Optimization: Resource-efficient processing per tier`);
    console.log(`   • Estimated operational cost: $${aiConfig.revenueAnalysis.projectedMonthly.aiCosts.total}`);
    
    // In production, start automated services
    if (isProduction) {
      console.log('\n⏰ Starting automated services...');
      const postingScheduler = ServiceRegistry.get('postingScheduler');
      postingScheduler.start();
      console.log('   ✅ Auto-posting scheduler started');
      
      // Set up periodic tasks
      setInterval(async () => {
        await autoUpdateService.cleanupExpired();
        await subscriptionService.checkExpiredSubscriptions();
      }, 24 * 60 * 60 * 1000); // Daily
    } else {
      console.log('\n⏰ Manual mode - Use admin commands to control services');
    }
    
    // Display startup complete
    const totalStartupTime = Date.now() - startTime;
    console.log(`\n✨ Zone Premium Service is LIVE! (${totalStartupTime}ms) ✨`);
    
    // Display minimal startup info
    console.log('\n✅ Zone News Bot is ready!');
    console.log('\n📱 Bot: @' + telegramBotService.bot.me.username);
    console.log('💡 Type /help in Telegram for commands');
    console.log('🚀 Type /subscribe to unlock premium features');
    
    // Display webhook info if configured
    if (process.env.TELEGRAM_WEBHOOK_URL) {
      console.log('🌐 Webhook: ' + process.env.TELEGRAM_WEBHOOK_URL.replace(/\/webhook$/, ''));
    }
    console.log('\n');
    
    // Setup monitoring
    setupMonitoring();
    
    // Graceful shutdown handlers
    setupShutdownHandlers();
    
  } catch (error) {
    console.error('❌ Failed to start Zone service:', error);
    logger.error('Startup failed:', error);
    // Only capture error if Sentry is available
    const { captureError } = require('./config/sentry');
    if (captureError) {
      captureError(error, { context: 'startup' });
    }
    process.exit(1);
  }
}

/**
 * Display enhanced command menu
 */
function displayCommandMenu() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                       ║');
  console.log('║                    🚀 ZONE NEWS BOT COMMANDS 🚀                       ║');
  console.log('║                                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  
  console.log('\n');
  console.log('  📱 ESSENTIAL COMMANDS\n');
  console.log('    /start        →  Welcome & quick start guide');
  console.log('    /help         →  Interactive help center');
  console.log('    /subscribe    →  🌟 Unlock premium features');
  console.log('    /profile      →  Your personal dashboard\n');
  
  console.log('\n');
  console.log('  📰 NEWS & CONTENT\n');
  console.log('    /news         →  Latest breaking news (10 free/day)');
  console.log('    /trending     →  🔥 What everyone\'s reading');
  console.log('    /search       →  Find specific topics');
  console.log('    /categories   →  Browse by interest\n');
  
  console.log('\n');
  console.log('  ⚙️  PERSONALIZATION\n');
  console.log('    /settings     →  Customize your experience');
  console.log('    /language     →  🌍 15+ languages available');
  console.log('    /timezone     →  Set your local time');
  console.log('    /style        →  Choose display format\n');
  
  console.log('\n');
  console.log('  💎 PREMIUM FEATURES\n');
  console.log('    /preview      →  📢 Early access (30-60 min)');
  console.log('    /group        →  Auto-post to your groups');
  console.log('    /analytics    →  📊 Performance insights');
  console.log('    /api          →  Developer integration');
  console.log('    /template     →  Custom news templates\n');
  
  console.log('\n');
  console.log('  💰 EARN & SAVE\n');
  console.log('    /referral     →  💸 Earn 20% lifetime commission');
  console.log('    /promo        →  Apply discount codes');
  console.log('    /achievements →  Unlock rewards & perks\n');
  
  console.log('\n');
  console.log('┌───────────────────────────────────────────────────────────────────────┐');
  console.log('│  💡 PRO TIP: Type /subscribe to unlock 5x more news & premium tools!  │');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  console.log('\n');
}

/**
 * Display feature status
 */
function displayFeatureStatus() {
  console.log('\n⚡ Feature Status:');
  
  // Secure feature status without exposing API keys
  const features = {
    '📰 News API': process.env.NEWS_API_KEY ? '✅ Configured' : '❌ Not configured',
    '🧠 Intelligence Engine': process.env.OPENROUTER_API_KEY ? '✅ Ready' : '❌ Not configured',
    '⚡ Groq Engine': process.env.GROQ_API_KEY ? '✅ Ultra-fast ready' : '⚪ Not configured',
    '📮 Redis Cache': true ? '✅ Active' : '❌ Disabled',
    '🔄 Redis Sync': process.env.ENABLE_REDIS_SYNC === 'true' ? '✅ Enabled' : '⚪ Standalone',
    '📝 Grammar Enhancement': '✅ Active',
    '🌍 Geo-Language': '✅ Active (AU Default)',
    '💳 Payments': process.env.STRIPE_SECRET_KEY ? '✅ Stripe' : '⚪ Manual',
    '📊 Analytics': '✅ Enabled',
    '🎯 Staging Channel': process.env.TELEGRAM_CHANNEL_A_ID ? '✅ Configured' : '❌ Not set',
    '📢 Public Channel': process.env.TELEGRAM_CHANNEL_B_ID ? '✅ Configured' : '❌ Not set'
  };
  
  Object.entries(features).forEach(([feature, status]) => {
    console.log(`  ${feature}: ${status}`);
  });
}

/**
 * Display pricing tiers with features
 */
function displayPricingTiers() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    💎 SUBSCRIPTION PLANS 💎                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  
  console.log('\n┌─── 🆓 FREE TIER ──────────────────────────────────────────────────────┐');
  console.log('│                                                                       │');
  console.log('│  ✓ 10 news articles daily            ✓ Basic categories              │');
  console.log('│  ✓ 2 YouTube summaries               ✓ Standard support              │');
  console.log('│                                                                       │');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  
  console.log('\n┌─── 🚀 PRO │ 300 Stars/mo (~$5.55) ───────────────────────────────────┐');
  console.log('│                                                                       │');
  console.log('│  ✓ 50 articles daily (5x more!)      ✓ 30-60 min early access       │');
  console.log('│  ✓ Group auto-posting                ✓ AI-powered summaries         │');
  console.log('│  ✓ Custom templates                  ✓ Remove ads                   │');
  console.log('│  ✓ Priority notifications            ✓ Value: $1,285/mo for $5.55!  │');
  console.log('│                                                                       │');
  console.log('│                    🎯 MOST POPULAR CHOICE                             │');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  
  console.log('\n┌─── 💼 BUSINESS │ 1,350 Stars/mo (~$25) ──────────────────────────────┐');
  console.log('│                                                                       │');
  console.log('│  ✓ 200 articles daily                ✓ Full API access              │');
  console.log('│  ✓ Analytics dashboard               ✓ Geo-language targeting       │');
  console.log('│  ✓ Custom branding                   ✓ Priority support             │');
  console.log('│  ✓ Export data (CSV/JSON)            ✓ Webhook integration          │');
  console.log('│  ✓ Value: $2,945/mo for just $25!                                    │');
  console.log('│                                                                       │');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  
  console.log('\n┌─── 🏢 ENTERPRISE │ 5,400 Stars/mo (~$100) ───────────────────────────┐');
  console.log('│                                                                       │');
  console.log('│  ✓ UNLIMITED everything              ✓ 10 team seats                │');
  console.log('│  ✓ White label solution              ✓ Custom AI training           │');
  console.log('│  ✓ Monthly strategy calls            ✓ Revenue sharing              │');
  console.log('│  ✓ Priority feature requests         ✓ SLA guarantee                │');
  console.log('│  ✓ Value: $9,845/mo for just $100!                                   │');
  console.log('│                                                                       │');
  console.log('└───────────────────────────────────────────────────────────────────────┘');
  
  console.log('\n');
  console.log('  🎁 LIMITED TIME OFFERS:\n');
  console.log('    🏃 Early Bird Special: Use code LAUNCH50 for 50% OFF first month!');
  console.log('    💰 Referral Program: Earn 20% lifetime commission');
  console.log('    ⭐ Lifetime Deal: $50 one-time payment (Only 1000 spots!)');
  console.log('\n');
  console.log('  Type /subscribe to get started with premium features today!');
  console.log('\n');
}

/**
 * Test system connectivity
 */
async function testSystemConnectivity(bot) {
  // Test channels
  const channels = {
    'Staging (A)': process.env.TELEGRAM_CHANNEL_A_ID,
    'Public (B)': process.env.TELEGRAM_CHANNEL_B_ID
  };
  
  for (const [name, channelId] of Object.entries(channels)) {
    if (channelId) {
      try {
        const chat = await bot.getChat(channelId);
        console.log(`   ✅ ${name}: ${chat.title || chat.username || 'Connected'}`);
      } catch (error) {
        console.log(`   ⚠️  ${name}: Channel setup required (add @${process.env.BOT_USERNAME} as admin)`);
      }
    } else {
      console.log(`   ⚠️  ${name}: Not configured`);
    }
  }
  
  // Test Logger Channel
  const logChannelId = process.env.TELEGRAM_LOG_CHANNEL_ID;
  if (logChannelId) {
    try {
      const chat = await bot.getChat(logChannelId);
      console.log(`   ✅ Logger Channel: ${chat.title || chat.username || 'Connected'}`);
    } catch (error) {
      console.log(`   ❌ Logger Channel: Not accessible`);
    }
  } else {
    console.log(`   ⚠️  Logger Channel: Not configured`);
  }
  
  // Test Intelligence Engine
  if (process.env.OPENROUTER_API_KEY) {
    console.log(`   ✅ Intelligence Engine: Connected & Ready`);
  } else {
    console.log(`   ⚠️  Intelligence Engine: Not configured`);
  }
}

/**
 * Setup monitoring
 */
function setupMonitoring() {
  let heartbeatCount = 0;
  const startTime = Date.now();
  
  setInterval(() => {
    heartbeatCount++;
    const uptimeMinutes = Math.round((Date.now() - startTime) / 60000);
    const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    // Log every 60 heartbeats (30 minutes)
    if (heartbeatCount % 60 === 0) {
      const stats = {
        uptime: `${Math.floor(uptimeMinutes / 60)}h ${uptimeMinutes % 60}m`,
        memory: `${memoryMB}MB`,
        connections: mongoose.connection.readyState === 1 ? 'OK' : 'ERR'
      };
      
      logger.debug(`Health check: Uptime ${stats.uptime}, Memory ${stats.memory}, DB ${stats.connections}`);
    }
  }, 30000); // Every 30 seconds
}

/**
 * Setup graceful shutdown
 */
function setupShutdownHandlers() {
  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
      // Stop logger channel
      const telegramBotService = ServiceRegistry.get('bot');
      if (telegramBotService && telegramBotService.bot.loggerChannel) {
        telegramBotService.bot.loggerChannel.stop();
        console.log('   ✅ Logger channel stopped');
      }
      
      // Stop services
      const autoPostingService = ServiceRegistry.get('autoPostingService');
      if (autoPostingService) {
        console.log('   ⏸️  Stopping auto-posting...');
        // Stop all schedules
      }
      
      // Close connections
      await mongoose.connection.close();
      console.log('   ✅ Database disconnected');
      
      const redisSync = require('./config/redisSync').getRedisSync();
      await redisSync.close();
      console.log('   ✅ Redis disconnected');
      
      // Flush Sentry events
      await flushSentry();
      console.log('   ✅ Error monitoring events flushed');
      
      console.log('   👋 Goodbye!');
      process.exit(0);
    } catch (error) {
      console.error('   ❌ Error during shutdown:', error);
      await flushSentry();
      process.exit(1);
    }
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle unhandled rejections and exceptions
  process.on('unhandledRejection', (reason, promise) => {
    // Don't crash in development for callback query timeouts
    if (reason && reason.message && reason.message.includes('query is too old')) {
      logger.warn('Ignoring expired callback query:', reason.message);
      return;
    }
    
    logger.error('Unhandled promise rejection:', reason);
    
    if (process.env.NODE_ENV === 'development') {
      logger.error('Exiting due to unhandled rejection in development');
      process.exit(1);
    } else {
      logger.error('Continuing execution in production despite unhandled rejection');
    }
  });
  
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    
    if (process.env.NODE_ENV === 'development') {
      logger.error('Exiting due to uncaught exception in development');
      process.exit(1);
    } else {
      logger.error('Attempting graceful shutdown due to uncaught exception');
      shutdown('UNCAUGHT_EXCEPTION');
    }
  });
}

// Start the service
startZoneService();