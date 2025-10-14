module.exports = {
  apps: [
    // Auth Service
    {
      name: 'zone-auth-service',
      script: './apps/auth-service/src/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        AUTH_SERVICE_PORT: 4001,
        JWT_SECRET: process.env.JWT_SECRET || 'development-secret-changeme',
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-changeme',
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      },
      error_file: './logs/auth-service-error.log',
      out_file: './logs/auth-service-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // User Service
    {
      name: 'zone-user-service',
      script: './apps/user-service/src/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        USER_SERVICE_PORT: 4002,
        AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      },
      error_file: './logs/user-service-error.log',
      out_file: './logs/user-service-out.log'
    },

    // Workflow Service
    {
      name: 'zone-workflow-service',
      script: './apps/workflow-service/src/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        WORKFLOW_SERVICE_PORT: 4003,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
      },
      error_file: './logs/workflow-service-error.log',
      out_file: './logs/workflow-service-out.log'
    },

    // Channels Service
    {
      name: 'zone-channels-service',
      script: './apps/channels-service/src/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        CHANNELS_SERVICE_PORT: 4004,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      },
      error_file: './logs/channels-service-error.log',
      out_file: './logs/channels-service-out.log'
    },

    // Settings Service
    {
      name: 'zone-settings-service',
      script: './apps/settings-service/src/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        SETTINGS_SERVICE_PORT: 4005,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      },
      error_file: './logs/settings-service-error.log',
      out_file: './logs/settings-service-out.log'
    },

    // Analytics Service
    {
      name: 'zone-analytics-service',
      script: './apps/analytics-service/src/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        ANALYTICS_SERVICE_PORT: 4006,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      },
      error_file: './logs/analytics-service-error.log',
      out_file: './logs/analytics-service-out.log'
    },

    // Subscription Service (Telegram Stars)
    {
      name: 'zone-subscription-service',
      script: './apps/subscription-service/src/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        SUBSCRIPTION_SERVICE_PORT: 4007,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'development-admin-token-changeme'
      },
      error_file: './logs/subscription-service-error.log',
      out_file: './logs/subscription-service-out.log'
    },

    // Main Bot Service
    {
      name: 'zone-telegram-bot',
      script: './apps/bot/index.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: 3002,
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        WEBHOOK_URL: process.env.WEBHOOK_URL || 'https://bot.thezonenews.com/webhook',
        API_URL: process.env.API_URL || 'http://localhost:3001'
      },
      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log'
    },

    // API Gateway
    {
      name: 'zone-api-gateway',
      script: './apps/api/src/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
        USER_SERVICE_URL: process.env.USER_SERVICE_URL || 'http://localhost:4002',
        WORKFLOW_SERVICE_URL: process.env.WORKFLOW_SERVICE_URL || 'http://localhost:4003',
        CHANNELS_SERVICE_URL: process.env.CHANNELS_SERVICE_URL || 'http://localhost:4004',
        SETTINGS_SERVICE_URL: process.env.SETTINGS_SERVICE_URL || 'http://localhost:4005',
        ANALYTICS_SERVICE_URL: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4006',
        SUBSCRIPTION_SERVICE_URL: process.env.SUBSCRIPTION_SERVICE_URL || 'http://localhost:4007'
      },
      error_file: './logs/api-gateway-error.log',
      out_file: './logs/api-gateway-out.log'
    }
  ]
};