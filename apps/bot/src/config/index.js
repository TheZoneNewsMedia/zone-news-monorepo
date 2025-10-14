/**
 * Bot Configuration
 */

module.exports = {
    // Bot
    token: process.env.TELEGRAM_BOT_TOKEN,
    botUsername: process.env.BOT_USERNAME || 'ZoneNewsBot',
    
    // Database
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
    
    // Webhook
    webhookUrl: process.env.WEBHOOK_URL ? process.env.WEBHOOK_URL.replace(/\/webhook$/, '') : null,
    webhookPort: parseInt(process.env.WEBHOOK_PORT) || 3002,
    webhookPath: '/webhook',
    
    // Admin
    adminIds: (process.env.ADMIN_IDS || '7802629063,8123893898')
        .split(',')
        .map(id => parseInt(id)),
    
    // Settings
    timezone: process.env.TIMEZONE || 'Australia/Adelaide',
    environment: process.env.NODE_ENV || 'development',
    
    // Features
    stateTimeout: 5 * 60 * 1000, // 5 minutes
    maxArticles: 10,
    searchLimit: 5
};