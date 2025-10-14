/**
 * BotService - Main bot orchestrator
 * Single Responsibility: Initialize and coordinate all bot services
 */

const { Telegraf } = require('telegraf');

class BotService {
    constructor(config) {
        this.bot = new Telegraf(config.token);
        this.services = new Map();
        this.config = config;
    }

    /**
     * Register a service
     */
    registerService(name, service) {
        this.services.set(name, service);
        service.setBot(this.bot);
        console.log(`✅ Registered service: ${name}`);
    }

    /**
     * Initialize all services
     */
    async initialize() {
        console.log('🚀 Initializing Bot Services...');
        
        for (const [name, service] of this.services) {
            if (service.initialize) {
                await service.initialize();
                console.log(`  ✅ ${name} initialized`);
            }
        }
    }

    /**
     * Start the bot
     */
    async start() {
        await this.initialize();
        
        if (this.config.webhookUrl) {
            console.log('🌐 Starting in webhook mode');
            return this.bot.telegram.setWebhook(this.config.webhookUrl);
        } else {
            console.log('📡 Starting in polling mode');
            return this.bot.launch();
        }
    }

    /**
     * Stop the bot
     */
    async stop() {
        await this.bot.stop();
        console.log('👋 Bot stopped');
    }
}

module.exports = BotService;