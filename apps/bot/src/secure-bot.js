#!/usr/bin/env node

/**
 * Zone News Bot - Secure Production Version
 * Enhanced with comprehensive security safeguards
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

// Enhanced services
const BotService = require('./services/bot-service');
const CommandService = require('./services/command-service');
const SecureWebhookService = require('./services/secure-webhook-service');
const DatabaseService = require('./services/database-service');
const ScheduleService = require('./services/schedule-service');

// Security utilities
const { TelegramSecurity } = require('@zone/shared');

// Secure configuration
const config = {
    // Telegram configuration
    token: process.env.TELEGRAM_BOT_TOKEN,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'ZoneNewsBot',
    
    // Database
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
    
    // Webhook configuration
    webhookUrl: process.env.WEBHOOK_URL,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    webhookPort: parseInt(process.env.WEBHOOK_PORT) || 8080,
    httpsPort: parseInt(process.env.HTTPS_PORT) || 8443,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    
    // Security
    apiKeys: (process.env.API_KEYS || '').split(',').filter(Boolean),
    adminIds: (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id)).filter(Boolean),
    corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
    
    // Environment
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
};

class SecureZoneNewsBot {
    constructor() {
        this.bot = null;
        this.db = null;
        this.services = {};
        this.startTime = new Date();
        this.securityContext = {
            validatedToken: false,
            webhookConfigured: false,
            rateLimitActive: false
        };
    }

    async validateConfiguration() {
        console.log('🔍 Validating security configuration...');

        // Validate bot token
        if (!config.token || !TelegramSecurity.validateBotToken(config.token)) {
            throw new Error('Invalid or missing Telegram bot token');
        }
        this.securityContext.validatedToken = true;

        // Validate webhook configuration if webhook mode
        if (config.webhookUrl) {
            if (!TelegramSecurity.validateWebhookUrl(config.webhookUrl)) {
                throw new Error('Invalid webhook URL format');
            }

            // Ensure HTTPS in production
            if (config.nodeEnv === 'production' && !config.webhookUrl.startsWith('https://')) {
                throw new Error('HTTPS required for production webhooks');
            }
        }

        // Validate admin IDs
        if (config.adminIds.length === 0) {
            console.warn('⚠️ No admin IDs configured - admin features will be disabled');
        }

        // Validate database URI
        if (!config.mongoUri) {
            throw new Error('MongoDB URI is required');
        }

        console.log('✅ Security configuration validated');
    }

    async initialize() {
        try {
            // Validate configuration first
            await this.validateConfiguration();

            // Connect to database with security options
            this.db = await DatabaseService.connect(config.mongoUri, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            console.log('✅ Connected to MongoDB with security options');

            // Create bot instance with error handling
            this.bot = new Telegraf(config.token);
            
            // Add error handling middleware
            this.bot.catch((error, ctx) => {
                console.error('❌ Bot error:', error);
                TelegramSecurity.logSecurityEvent('bot_error', {
                    error: error.message,
                    updateId: ctx.update?.update_id,
                    userId: ctx.from?.id,
                    chatId: ctx.chat?.id
                });
            });

            // Initialize services with security context
            this.services.bot = new BotService(this.bot, this.db);
            this.services.command = new CommandService(this.bot, this.db);
            this.services.schedule = new ScheduleService(this.bot, this.db);

            // Initialize secure webhook service if webhook mode
            if (config.webhookUrl) {
                this.services.webhook = new SecureWebhookService(this.bot, {
                    ...config,
                    botToken: config.token
                });
                this.securityContext.webhookConfigured = true;
            }
            
            // Attach security context to bot
            this.bot.context = this.bot.context || {};
            this.bot.context.botService = this.services.bot;
            this.bot.context.securityContext = this.securityContext;
            
            // Add comprehensive logging middleware
            this.bot.use(async (ctx, next) => {
                const startTime = Date.now();
                
                // Security logging
                console.log('📨 Update received:', {
                    type: ctx.updateType,
                    updateId: ctx.update?.update_id,
                    userId: ctx.from?.id,
                    chatId: ctx.chat?.id,
                    username: ctx.from?.username
                });

                // Command logging
                if (ctx.message?.text) {
                    const command = ctx.message.text.split(' ')[0];
                    console.log('💬 Message:', {
                        command: command.startsWith('/') ? command : 'text',
                        length: ctx.message.text.length,
                        hasEntities: !!(ctx.message.entities?.length)
                    });
                }

                // Callback query logging
                if (ctx.callbackQuery?.data) {
                    console.log('🔘 Callback:', {
                        data: ctx.callbackQuery.data.substring(0, 50),
                        messageId: ctx.callbackQuery.message?.message_id
                    });
                }

                try {
                    await next();
                    const duration = Date.now() - startTime;
                    console.log(`⚡ Update processed in ${duration}ms`);
                } catch (error) {
                    const duration = Date.now() - startTime;
                    console.error(`❌ Error processing update (${duration}ms):`, error);
                    
                    // Log security event
                    TelegramSecurity.logSecurityEvent('update_error', {
                        updateId: ctx.update?.update_id,
                        error: error.message,
                        duration,
                        userId: ctx.from?.id
                    });

                    // Send user-friendly error message
                    try {
                        await ctx.reply('❌ Sorry, something went wrong. Please try again later.');
                    } catch (replyError) {
                        console.error('❌ Failed to send error message:', replyError);
                    }
                }
            });
            
            // Register commands and handlers
            await this.services.command.registerCommands();
            
            console.log('✅ Secure bot initialized');
            
        } catch (error) {
            console.error('❌ Secure initialization failed:', error);
            throw error;
        }
    }

    async start() {
        try {
            console.log('🚀 Starting Secure Zone News Bot');
            console.log(`🛡️ Security Level: ${config.nodeEnv === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'}`);
            
            // Initialize with security validation
            await this.initialize();
            
            // Start webhook or polling
            if (config.webhookUrl && this.services.webhook) {
                await this.services.webhook.start();
                this.securityContext.rateLimitActive = true;
                console.log('🌐 Secure webhook mode active');
            } else {
                await this.bot.launch({ 
                    dropPendingUpdates: true,
                    webhook: false
                });
                console.log('📡 Polling mode active (webhook URL not configured)');
            }
            
            // Log startup completion
            console.log('✨ Secure Zone News Bot is running!');
            console.log(`📱 Bot: @${config.botUsername}`);
            console.log(`👑 Admins: ${config.adminIds.length}`);
            console.log(`🔒 Security Features:`);
            console.log(`  - Token Validation: ✅`);
            console.log(`  - Webhook Security: ${this.securityContext.webhookConfigured ? '✅' : '❌'}`);
            console.log(`  - Rate Limiting: ${this.securityContext.rateLimitActive ? '✅' : '📡'}`);
            console.log(`  - Input Sanitization: ✅`);
            console.log(`  - Error Handling: ✅`);
            console.log(`  - Security Logging: ✅`);

            // Log security event
            TelegramSecurity.logSecurityEvent('bot_started', {
                mode: config.webhookUrl ? 'webhook' : 'polling',
                securityFeatures: this.securityContext,
                adminCount: config.adminIds.length,
                nodeEnv: config.nodeEnv
            });
            
            // Graceful shutdown handlers
            process.once('SIGINT', () => this.stop('SIGINT'));
            process.once('SIGTERM', () => this.stop('SIGTERM'));
            
        } catch (error) {
            console.error('❌ Failed to start secure bot:', error);
            TelegramSecurity.logSecurityEvent('startup_failed', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    }

    async stop(signal) {
        console.log(`\n👋 Shutting down securely (${signal})...`);
        
        try {
            // Log shutdown event
            TelegramSecurity.logSecurityEvent('bot_shutdown', {
                signal,
                uptime: process.uptime(),
                securityContext: this.securityContext
            });

            // Stop webhook service
            if (this.services.webhook) {
                await this.services.webhook.stop();
            }

            // Stop bot
            this.bot.stop(signal);
            
            // Close database connection
            if (this.db?.client) {
                await this.db.client.close();
                console.log('✅ Database connection closed securely');
            }
            
            console.log('👋 Secure shutdown complete');
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
        }
        
        process.exit(0);
    }

    async getSecurityStatus() {
        try {
            const status = {
                bot: {
                    running: !!this.bot,
                    uptime: process.uptime(),
                    tokenValid: this.securityContext.validatedToken
                },
                webhook: {
                    configured: this.securityContext.webhookConfigured,
                    rateLimitActive: this.securityContext.rateLimitActive,
                    info: null
                },
                database: {
                    connected: !!this.db,
                    uri: config.mongoUri.replace(/\/\/.*@/, '//*****@') // Hide credentials
                },
                security: {
                    environment: config.nodeEnv,
                    adminCount: config.adminIds.length,
                    corsOriginsCount: config.corsOrigins.length,
                    apiKeysCount: config.apiKeys.length
                }
            };

            // Get webhook info if available
            if (this.services.webhook) {
                try {
                    status.webhook.info = await this.services.webhook.getWebhookInfo();
                } catch (error) {
                    status.webhook.error = error.message;
                }
            }

            return status;
        } catch (error) {
            console.error('❌ Error getting security status:', error);
            throw error;
        }
    }
}

// Start the secure application
if (require.main === module) {
    const app = new SecureZoneNewsBot();
    app.start();
}

module.exports = SecureZoneNewsBot;