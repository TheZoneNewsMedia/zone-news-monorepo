/**
 * PM2 Ecosystem Configuration - Staging Environment
 * Safe testing environment for Zone News Bot development
 */

module.exports = {
  apps: [
    {
      name: 'zone-telegram-bot-staging',
      script: 'index.js',
      cwd: '/root/zone-news-monorepo/apps/bot',
      
      // Environment - explicit staging configuration
      env: {
        NODE_ENV: 'staging',
        PORT: '3002',
        LOG_LEVEL: 'debug',
        TELEGRAM_BOT_TOKEN: '8131586376:AAH-mW2wn414lbWF0h-vOaGPqIlpQGK_ojA',
        ADMIN_IDS: '7802629063',
        MONGODB_URI: 'mongodb://localhost:27017/zone_news_staging',
        REDIS_URL: 'redis://localhost:6379/1',
        WEBHOOK_MODE: 'true',
        WEBHOOK_URL: 'https://bot.thezonenews.com/staging',
        WEBHOOK_PORT: '3002',
        ENABLE_REACTION_SYSTEM: 'true',
        ENABLE_COMMAND_LOGGING: 'true',
        ENABLE_PERFORMANCE_MONITORING: 'true',
        ENABLE_TEST_COMMANDS: 'true',
        JWT_SECRET: 'staging_7f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e',
        ENCRYPTION_KEY: 'staging_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
        API_KEY: 'zn_staging_api_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c'
      },
      
      // Process Management
      instances: 1,
      exec_mode: 'fork',
      
      // Auto-restart Configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '150M', // Higher limit for staging debugging
      restart_delay: 2000,
      
      // Logging
      log_file: '/root/.pm2/logs/zone-telegram-bot-staging.log',
      out_file: '/root/.pm2/logs/zone-telegram-bot-staging-out.log',
      error_file: '/root/.pm2/logs/zone-telegram-bot-staging-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Health Monitoring
      health_check: {
        url: 'http://localhost:3002/health',
        interval: 30000,
        timeout: 5000
      },
      
      // Staging-specific settings
      ignore_watch: ['node_modules', 'logs', '.git'],
      max_restarts: 10,
      min_uptime: '10s',
      
      // Environment variables
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3002,
        LOG_LEVEL: 'debug',
        ENABLE_PERFORMANCE_MONITORING: 'true',
        ENABLE_COMMAND_LOGGING: 'true',
        ENABLE_TEST_COMMANDS: 'true'
      }
    }
  ]
};