module.exports = {
  apps: [
    {
      name: 'zone-api',
      cwd: __dirname + '/../../',
      script: 'apps/api/src/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        JWT_SECRET: process.env.JWT_SECRET || 'zone-news-secret-2025'
      }
    }
    ,
    {
      name: 'groups-service',
      cwd: __dirname + '/../../',
      script: 'apps/groups-service/src/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3012,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      }
    }
    ,
    {
      name: 'mtproto-sidecar',
      cwd: __dirname + '/../../',
      script: 'apps/mtproto-sidecar/src/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3014,
        INTERNAL_TOKEN: process.env.INTERNAL_TOKEN || 'change-me'
      }
    }
    ,
    {
      name: 'news-api',
      cwd: __dirname + '/../../',
      script: 'apps/news-api/src/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3011,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      }
    },
    {
      name: 'auth-service',
      cwd: __dirname + '/../../',
      script: 'apps/auth-service/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3015,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        JWT_SECRET: process.env.JWT_SECRET || 'zone-news-secret-2025'
      }
    },
    {
      name: 'user-service',
      cwd: __dirname + '/../../',
      script: 'apps/user-service/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3016,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        JWT_SECRET: process.env.JWT_SECRET || 'zone-news-secret-2025'
      }
    },
    {
      name: 'channels-service',
      cwd: __dirname + '/../../',
      script: 'apps/channels-service/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3013,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      }
    },
    {
      name: 'workflow-service',
      cwd: __dirname + '/../../',
      script: 'apps/workflow-service/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3017,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      }
    },
    {
      name: 'analytics-service',
      cwd: __dirname + '/../../',
      script: 'apps/analytics-service/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3018,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      }
    },
    {
      name: 'subscription-service',
      cwd: __dirname + '/../../',
      script: 'apps/subscription-service/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3019,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY
      }
    },
    {
      name: 'settings-service',
      cwd: __dirname + '/../../',
      script: 'apps/settings-service/src/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3020,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production'
      }
    },
    {
      name: 'zone-bot',
      cwd: __dirname + '/../../',
      script: 'apps/bot/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        WEBHOOK_URL: process.env.WEBHOOK_URL || 'https://bot.thezonenews.com/webhook',
        WEBHOOK_PORT: 3002,
        MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
        ADMIN_IDS: '7802629063,8123893898'
      }
    },
    {
      name: 'zone-web',
      cwd: __dirname + '/../../',
      script: 'node',
      args: 'apps/web/dist/server/entry.mjs',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        HOST: '0.0.0.0'
      }
    },
    {
      name: 'zone-admin',
      cwd: __dirname + '/../../',
      script: 'node',
      args: 'apps/admin/dist/server/entry.mjs',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
        HOST: '0.0.0.0'
      }
    }
  ]
};
