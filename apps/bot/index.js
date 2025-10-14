/**
 * Zone News Bot - Main Entry Point
 * 
 * This is the new main entry point that uses the initialization service
 * for proper startup sequence and error handling.
 */

// Load environment variables first
require('dotenv').config();

const express = require('express');
const BotInitialization = require('./src/services/bot-initialization');
const healthRouter = require('./src/api/health-fixed');
const config = require('./src/config/environment');

// Create bot initialization instance
const botInit = new BotInitialization();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoints
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

// Basic status endpoint
app.get('/', (req, res) => {
    try {
        const status = botInit.getHealthStatus ? botInit.getHealthStatus() : { status: 'healthy', services: {} };
        res.json({
            service: 'Zone News Bot',
            status: status.status || 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            services: status.services || {},
            uptime: Math.floor(process.uptime()) + 's'
        });
    } catch (error) {
        res.json({
            service: 'Zone News Bot',
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            uptime: Math.floor(process.uptime()) + 's'
        });
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Initialize and start the bot
async function startBot() {
    try {
        console.log('Starting Zone News Bot...');
        
        // Initialize bot with all services
        const botInstance = await botInit.initialize();
        
        if (!botInstance) {
            throw new Error('Failed to initialize bot');
        }

        // Start Express server for health checks and webhooks
        const port = (config.bot.webhook && config.bot.webhook.port) || process.env.PORT || 3000;
        const server = app.listen(port, () => {
            console.log(`✅ Bot server running on port ${port}`);
            console.log(`✅ Health check available at: http://localhost:${port}/health`);
        });

        // Setup webhook if enabled
        if (config.bot.webhook && config.bot.webhook.enabled && config.bot.webhook.url) {
            try {
                const botToken = process.env.TELEGRAM_BOT_TOKEN;
                console.log(`🔧 Debug config.bot.webhook.url: ${config.bot.webhook.url}`);
                
                // Ensure URL doesn't already end with /webhook
                const baseUrl = config.bot.webhook.url.replace(/\/webhook$/, '');
                const fullWebhookUrl = `${baseUrl}/webhook/${botToken}`;
                
                await botInstance.telegram.setWebhook(fullWebhookUrl);
                
                // Add webhook endpoint
                app.use(`/webhook/${botToken}`, botInstance.webhookCallback());
                console.log(`✅ Webhook set up at: ${fullWebhookUrl}`);
            } catch (webhookError) {
                console.error('❌ Webhook setup failed:', webhookError.message);
                // NO FALLBACK - Fail completely if webhook setup fails
                throw new Error(`Failed to setup webhook: ${webhookError.message}`);
            }
        } else {
            // Webhook not enabled or no URL - use polling mode
            console.log('🔄 Webhook disabled or URL not configured, using polling mode');
            
            // First, delete any existing webhook
            try {
                await botInstance.telegram.deleteWebhook();
                console.log('🧹 Cleared existing webhook');
            } catch (error) {
                console.log('🧹 No existing webhook to clear');
            }
            
            // Start polling
            await botInstance.launch();
            console.log('✅ Bot started in polling mode');
        }

        console.log('🚀 Zone News Bot fully initialized and running!');
        
        return { bot: botInstance, server };

    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
}

// Start the bot
if (require.main === module) {
    startBot().catch(error => {
        console.error('❌ Fatal error starting bot:', error);
        process.exit(1);
    });
}

module.exports = { app, startBot };
