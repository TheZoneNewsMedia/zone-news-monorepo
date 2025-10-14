module.exports = {
  apps: [{
    name: 'zone-telegram-bot',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    
    // Don't restart on exit code 0 (graceful exit)
    stop_exit_codes: [0],
    
    // Restart delay
    restart_delay: 4000,
    
    // Max restart attempts
    max_restarts: 3,
    
    // Time window for max_restarts
    min_uptime: 10000,
    
    env: {
      NODE_ENV: 'development',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      MONGODB_URI: 'mongodb://localhost:27017/zone_news_production'
    },
    
    env_production: {
      NODE_ENV: 'production',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      MONGODB_URI: 'mongodb://localhost:27017/zone_news_production'
    },
    
    error_file: '~/.pm2/logs/zone-telegram-bot-error.log',
    out_file: '~/.pm2/logs/zone-telegram-bot-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};