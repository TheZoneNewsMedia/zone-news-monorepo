/**
 * Centralized Telegram Connection Manager
 * Manages all Telegram bot instances across the monorepo
 * Implements single webhook hub architecture with max_connections optimization
 */

const { Telegraf } = require('telegraf');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const EventEmitter = require('events');

class TelegramConnectionManager extends EventEmitter {
    constructor() {
        super();
        this.instances = new Map();
        this.webhookRouter = express.Router();
        this.config = {
            maxConnections: 40, // Default for regular bots (1-100 range)
            webhookDomain: process.env.WEBHOOK_URL || `http://67.219.107.230:8000`,
            webhookPort: process.env.WEBHOOK_PORT || 8000,
            botToken: process.env.TELEGRAM_BOT_TOKEN
        };
        
        if (!this.config.botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
        }
        this.stats = {
            totalInstances: 0,
            activeConnections: 0,
            requestsProcessed: 0,
            errors: 0,
            lastError: null,
            uptime: Date.now()
        };
        this.initialized = false;
    }

    /**
     * Initialize the connection manager
     */
    async initialize() {
        if (this.initialized) {
            console.log('⚠️ Connection manager already initialized');
            return;
        }

        console.log('🚀 Initializing Telegram Connection Manager...');
        console.log(`📊 Max connections: ${this.config.maxConnections}`);
        console.log(`🔗 Webhook domain: ${this.config.webhookDomain}`);

        // Set up webhook routes
        this.setupWebhookRoutes();

        // Audit existing instances
        await this.auditExistingInstances();

        // Configure main bot with optimized settings
        await this.configureMainBot();

        this.initialized = true;
        console.log('✅ Telegram Connection Manager initialized successfully');
        
        return this;
    }

    /**
     * Audit all existing Telegram instances in the monorepo
     */
    async auditExistingInstances() {
        console.log('🔍 Auditing existing Telegram instances...');
        
        const instances = [
            // Identified bot instances from search
            { path: 'zone-news-monorepo/posting-bot-updated.js', type: 'TelegramBot', mode: 'polling' },
            { path: 'zone-news-monorepo/services/notification-service.js', type: 'TelegramBot', mode: 'webhook' },
            { path: 'zone-news-monorepo/services/bot/BotService.js', type: 'Telegraf', mode: 'unknown' },
            { path: 'zone-news-monorepo/apps/bot/src/server.js', type: 'TelegramBot', mode: 'webhook' },
            { path: 'zone-news-monorepo/apps/bot/src/secure-bot.js', type: 'Telegraf', mode: 'unknown' },
            { path: 'zone-news-monorepo/apps/bot/bot.js', type: 'Telegraf', mode: 'unknown' },
            { path: 'zone-news-monorepo/apps/bot/src/main-bot.js', type: 'Telegraf', mode: 'unknown' },
            { path: 'zone-news-monorepo/apps/bot/src/services/bot-initialization.js', type: 'Telegraf', mode: 'webhook' },
            { path: 'zone-news-monorepo/apps/bot/src/commands/tbc-nightnews-standalone.js', type: 'Telegraf', mode: 'unknown' }
        ];

        console.log(`📊 Found ${instances.length} Telegram bot instances:`);
        
        let pollingCount = 0;
        let webhookCount = 0;
        let unknownCount = 0;

        instances.forEach(instance => {
            if (instance.mode === 'polling') {
                pollingCount++;
                console.log(`  ⚠️ POLLING: ${instance.path}`);
            } else if (instance.mode === 'webhook') {
                webhookCount++;
                console.log(`  ✅ WEBHOOK: ${instance.path}`);
            } else {
                unknownCount++;
                console.log(`  ❓ UNKNOWN: ${instance.path}`);
            }
        });

        console.log('\n📈 Audit Summary:');
        console.log(`  - Polling mode: ${pollingCount} instances (MUST BE FIXED)`);
        console.log(`  - Webhook mode: ${webhookCount} instances`);
        console.log(`  - Unknown mode: ${unknownCount} instances (NEED REVIEW)`);
        
        this.stats.totalInstances = instances.length;
        
        return instances;
    }

    /**
     * Configure the main bot with optimized webhook settings
     */
    async configureMainBot() {
        console.log('🤖 Configuring main bot with webhook optimization...');

        try {
            // Create main bot instance with webhook configuration
            const mainBot = new Telegraf(this.config.botToken, {
                telegram: {
                    webhookReply: false,
                    agent: null // Use default agent
                }
            });

            // Store the instance
            this.instances.set('main', {
                bot: mainBot,
                type: 'Telegraf',
                mode: 'webhook',
                created: Date.now()
            });

            // Set webhook with max_connections parameter
            const webhookUrl = `${this.config.webhookDomain}/webhook/${this.config.botToken}`;
            
            console.log(`🔗 Setting webhook: ${webhookUrl}`);
            console.log(`⚡ Max connections: ${this.config.maxConnections}`);

            await mainBot.telegram.setWebhook(webhookUrl, {
                max_connections: this.config.maxConnections,
                drop_pending_updates: false // Keep pending updates
            });

            // Verify webhook configuration
            const webhookInfo = await mainBot.telegram.getWebhookInfo();
            console.log('📊 Webhook configured:', {
                url: webhookInfo.url,
                has_custom_certificate: webhookInfo.has_custom_certificate,
                pending_update_count: webhookInfo.pending_update_count,
                max_connections: webhookInfo.max_connections || 40,
                ip_address: webhookInfo.ip_address
            });

            this.stats.activeConnections = 1;
            
            return mainBot;

        } catch (error) {
            console.error('❌ Failed to configure main bot:', error);
            this.stats.errors++;
            this.stats.lastError = error.message;
            throw error;
        }
    }

    /**
     * Set up webhook routes for all bot instances
     */
    setupWebhookRoutes() {
        console.log('🌐 Setting up webhook routes...');

        // Main webhook endpoint with token in path
        this.webhookRouter.post('/webhook/:token', async (req, res) => {
            try {
                const token = req.params.token;
                const instance = this.getInstanceByToken(token);
                
                if (!instance) {
                    console.warn(`⚠️ No bot instance found for token: ${token.slice(0, 10)}...`);
                    return res.status(404).json({ error: 'Bot not found' });
                }

                // Process the update
                await instance.bot.handleUpdate(req.body);
                this.stats.requestsProcessed++;
                
                res.status(200).json({ ok: true });
                
            } catch (error) {
                console.error('❌ Webhook processing error:', error);
                this.stats.errors++;
                this.stats.lastError = error.message;
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Health check endpoint
        this.webhookRouter.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                manager: 'TelegramConnectionManager',
                stats: this.getStats(),
                uptime: Date.now() - this.stats.uptime
            });
        });

        // Stats endpoint
        this.webhookRouter.get('/stats', (req, res) => {
            res.json(this.getStats());
        });

        console.log('✅ Webhook routes configured');
    }

    /**
     * Get bot instance by token
     */
    getInstanceByToken(token) {
        for (const [key, instance] of this.instances) {
            if (instance.token === token || this.config.botToken === token) {
                return instance;
            }
        }
        return null;
    }

    /**
     * Register a new bot instance
     */
    registerInstance(key, bot, config = {}) {
        console.log(`📝 Registering bot instance: ${key}`);
        
        if (this.instances.has(key)) {
            console.warn(`⚠️ Instance ${key} already exists, replacing...`);
        }

        this.instances.set(key, {
            bot,
            type: bot.constructor.name,
            mode: config.mode || 'webhook',
            token: config.token || this.config.botToken,
            created: Date.now(),
            ...config
        });

        this.stats.activeConnections = this.instances.size;
        console.log(`✅ Instance ${key} registered (total: ${this.instances.size})`);
        
        return true;
    }

    /**
     * Unregister a bot instance
     */
    unregisterInstance(key) {
        if (!this.instances.has(key)) {
            console.warn(`⚠️ Instance ${key} not found`);
            return false;
        }

        const instance = this.instances.get(key);
        
        // Stop the bot if it has a stop method
        if (instance.bot && typeof instance.bot.stop === 'function') {
            instance.bot.stop();
        }

        this.instances.delete(key);
        this.stats.activeConnections = this.instances.size;
        
        console.log(`✅ Instance ${key} unregistered`);
        return true;
    }

    /**
     * Get a specific bot instance
     */
    getInstance(key) {
        const instance = this.instances.get(key);
        return instance ? instance.bot : null;
    }

    /**
     * Get all bot instances
     */
    getAllInstances() {
        return Array.from(this.instances.entries()).map(([key, value]) => ({
            key,
            type: value.type,
            mode: value.mode,
            created: value.created
        }));
    }

    /**
     * Migrate an existing bot to use the connection manager
     */
    async migrateBot(existingBot, key, config = {}) {
        console.log(`🔄 Migrating bot: ${key}`);

        try {
            // Stop polling if it's using polling mode
            if (existingBot.polling) {
                console.log('⏹ Stopping polling mode...');
                if (typeof existingBot.stopPolling === 'function') {
                    await existingBot.stopPolling();
                } else if (typeof existingBot.stop === 'function') {
                    existingBot.stop();
                }
            }

            // Configure for webhook mode
            const webhookUrl = `${this.config.webhookDomain}/webhook/${config.token || this.config.botToken}`;
            
            if (existingBot.telegram) {
                // Telegraf bot
                await existingBot.telegram.setWebhook(webhookUrl, {
                    max_connections: this.config.maxConnections
                });
            } else if (existingBot.setWebHook) {
                // node-telegram-bot-api
                await existingBot.setWebHook(webhookUrl, {
                    max_connections: this.config.maxConnections
                });
            }

            // Register the migrated bot
            this.registerInstance(key, existingBot, {
                ...config,
                mode: 'webhook',
                migrated: true
            });

            console.log(`✅ Bot ${key} migrated to webhook mode`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to migrate bot ${key}:`, error);
            this.stats.errors++;
            this.stats.lastError = error.message;
            return false;
        }
    }

    /**
     * Update max_connections parameter for all bots
     */
    async updateMaxConnections(newMax) {
        if (newMax < 1 || newMax > 100) {
            throw new Error('max_connections must be between 1 and 100');
        }

        console.log(`🔄 Updating max_connections from ${this.config.maxConnections} to ${newMax}`);
        this.config.maxConnections = newMax;

        // Update all webhook configurations
        for (const [key, instance] of this.instances) {
            if (instance.mode === 'webhook') {
                try {
                    const webhookUrl = `${this.config.webhookDomain}/webhook/${instance.token}`;
                    
                    if (instance.bot.telegram) {
                        await instance.bot.telegram.setWebhook(webhookUrl, {
                            max_connections: newMax
                        });
                    } else if (instance.bot.setWebHook) {
                        await instance.bot.setWebHook(webhookUrl, {
                            max_connections: newMax
                        });
                    }
                    
                    console.log(`✅ Updated ${key} to max_connections: ${newMax}`);
                } catch (error) {
                    console.error(`❌ Failed to update ${key}:`, error.message);
                }
            }
        }

        console.log('✅ All webhooks updated');
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            ...this.stats,
            instances: this.getAllInstances(),
            config: {
                maxConnections: this.config.maxConnections,
                webhookDomain: this.config.webhookDomain,
                webhookPort: this.config.webhookPort
            }
        };
    }

    /**
     * Gracefully shutdown all bot instances
     */
    async shutdown() {
        console.log('🛑 Shutting down Telegram Connection Manager...');

        for (const [key, instance] of this.instances) {
            try {
                console.log(`⏹ Stopping ${key}...`);
                
                if (instance.bot) {
                    // Clear webhook
                    if (instance.bot.telegram) {
                        await instance.bot.telegram.deleteWebhook({ drop_pending_updates: false });
                    } else if (instance.bot.deleteWebHook) {
                        await instance.bot.deleteWebHook();
                    }

                    // Stop the bot
                    if (typeof instance.bot.stop === 'function') {
                        instance.bot.stop();
                    } else if (typeof instance.bot.stopPolling === 'function') {
                        await instance.bot.stopPolling();
                    }
                }
                
                console.log(`✅ ${key} stopped`);
            } catch (error) {
                console.error(`❌ Error stopping ${key}:`, error.message);
            }
        }

        this.instances.clear();
        this.stats.activeConnections = 0;
        
        console.log('✅ All bot instances shut down');
    }

    /**
     * Get Express router for webhook endpoints
     */
    getRouter() {
        return this.webhookRouter;
    }
}

// Export as singleton
module.exports = new TelegramConnectionManager();
