/**
 * Environment Configuration Management
 * Centralizes all environment variables and provides validation
 */

const config = {
  // Core Bot Configuration
  bot: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    webhook: {
      enabled: process.env.WEBHOOK_MODE === 'true',
      url: process.env.WEBHOOK_URL,
      port: parseInt(process.env.WEBHOOK_PORT) || 3000,
      path: process.env.WEBHOOK_PATH || '/webhook',
      secret: process.env.WEBHOOK_SECRET
    },
    adminIds: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [],
    timezone: process.env.TIMEZONE || 'Australia/Adelaide'
  },

  // Database Configuration
  database: {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
    options: {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 2,
      socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT) || 45000,
      serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_TIMEOUT) || 5000
    }
  },

  // TBC Workflow Configuration
  tbc: {
    sourceChannel: process.env.TBC_SOURCE_CHANNEL || '@ZoneNewsAdl',
    sourceChannelId: parseInt(process.env.TBC_SOURCE_CHANNEL_ID) || -1002212113452,
    tbcGroupId: parseInt(process.env.TBC_GROUP_ID) || -2665614394,
    tbcTopicId: parseInt(process.env.TBC_TOPIC_ID) || 9
  },

  // Scheduling Configuration
  scheduling: {
    morningTime: process.env.MORNING_POST_TIME || '07:00',
    eveningTime: process.env.EVENING_POST_TIME || '18:00',
    enabled: process.env.SCHEDULING_ENABLED !== 'false'
  },

  // Security Configuration
  security: {
    sessionSecret: process.env.SESSION_SECRET,
    apiKeyLength: parseInt(process.env.API_KEY_LENGTH) || 32,
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 86400000, // 24 hours
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 900000 // 15 minutes
  },

  // Environment Flags
  isDevelopment: process.env.NODE_ENV === 'development',
  isStaging: process.env.NODE_ENV === 'staging',
  isProduction: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Feature Flags (consolidated)
  features: {
    reactionsEnabled: process.env.ENABLE_REACTION_SYSTEM !== 'false',
    analyticsEnabled: process.env.ANALYTICS_ENABLED !== 'false',
    subscriptionsEnabled: process.env.SUBSCRIPTIONS_ENABLED !== 'false',
    schedulingEnabled: process.env.SCHEDULING_ENABLED !== 'false',
    adminPanelEnabled: process.env.ADMIN_PANEL_ENABLED !== 'false',
    performanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',
    commandLogging: process.env.ENABLE_COMMAND_LOGGING === 'true',
    testCommands: process.env.ENABLE_TEST_COMMANDS === 'true'
  }
};

/**
 * Validates required environment variables
 */
function validateConfig() {
  const required = [
    'TELEGRAM_BOT_TOKEN'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate admin IDs
  if (!config.bot.adminIds || config.bot.adminIds.length === 0) {
    console.warn('⚠️  No admin IDs configured. Set ADMIN_IDS environment variable.');
  }

  // Validate webhook in production and staging
  if ((config.isProduction || config.isStaging) && !config.bot.webhook.url) {
    console.warn('⚠️  No webhook URL configured for production/staging. Set WEBHOOK_URL environment variable.');
  }

  // Log environment mode
  if (config.isStaging) {
    console.log('🧪 Running in STAGING mode with feature flags enabled');
  } else if (config.isProduction) {
    console.log('🚀 Running in PRODUCTION mode');
  } else if (config.isDevelopment) {
    console.log('🔧 Running in DEVELOPMENT mode');
  }

  return config;
}

module.exports = validateConfig();
