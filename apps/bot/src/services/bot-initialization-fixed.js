const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const config = require('../config/environment');
const DatabaseService = require('./database-service');
const AdminService = require('./admin-service');
const MessageService = require('./message-service');
const ReactionService = require('./reaction-service');
const SchedulingService = require('./scheduling-service');
const StatsService = require('./stats-service');
const SubscriptionService = require('./subscription-service');
const TbcWorkflowService = require('./tbc-workflow-service');
const CommandRegistry = require('./command-registry');

class BotInitialization {
    constructor() {
        this.bot = null;
        this.services = {};
        this.isInitialized = false;
        this.healthStatus = {
            status: 'initializing',
            services: {},
            lastCheck: new Date()
        };
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('Bot already initialized');
            return this.bot;
        }

        try {
            console.log('🚀 Initializing Zone News Bot...');
            
            // Initialize bot
            await this.initializeBot();
            
            // Initialize services
            await this.initializeServices();
            
            // Setup handlers
            await this.setupBotHandlers();
            
            // Initialize scheduled jobs
            await this.initializeScheduledJobs();
            
            this.isInitialized = true;
            console.log('✅ Bot initialization completed successfully');
            
            return this.bot;
            
        } catch (error) {
            console.error('❌ Bot initialization failed:', error);
            throw error;
        }
    }

    async initializeBot() {
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            throw new Error('TELEGRAM_BOT_TOKEN is required');
        }

        this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        console.log('🤖 Bot instance created');
    }

    async initializeServices() {
        console.log('🔧 Initializing services...');

        try {
            // Database service
            this.services.db = await DatabaseService.getInstance();
            console.log('✅ Database service initialized');

            // Stats service
            this.services.stats = new StatsService();
            await this.services.stats.initialize();
            console.log('✅ Stats service initialized');

            // Admin service
            this.services.admin = new AdminService(this.bot, this.services.db);
            console.log('✅ Admin service initialized');

            // Message service
            this.services.message = new MessageService(this.bot, this.services.db);
            console.log('✅ Message service initialized');

            // Reaction service
            this.services.reaction = new ReactionService(this.bot, this.services.db);
            console.log('✅ Reaction service initialized');

            // Subscription service
            this.services.subscription = new SubscriptionService(this.bot, this.services.db);
            console.log('✅ Subscription service initialized');

            // Scheduling service
            this.services.scheduling = new SchedulingService(this.bot, this.services.db);
            console.log('✅ Scheduling service initialized');

            // TBC Workflow service
            this.services.tbcWorkflow = new TbcWorkflowService(this.bot, this.services.db);
            console.log('✅ TBC workflow service initialized');

            // Update health status
            this.updateHealthStatus();
            
        } catch (error) {
            throw new Error(`Service initialization failed: ${error.message}`);
        }
    }

    async setupBotHandlers() {
        console.log('🎯 Setting up bot command handlers...');
        
        // Initialize command registry - this handles all commands including /start
        this.commandRegistry = new CommandRegistry(this.bot, this.services.db, this.services);
        console.log('✅ Command registry initialized');

        // Message handling
        this.bot.on('message', async (ctx) => {
            try {
                // Record message stats
                await this.services.stats.trackMessage(ctx.from.id);
                
                // Update user activity
                await this.services.stats.trackUser({
                    userId: ctx.from.id,
                    lastActive: new Date(),
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name
                });
                
            } catch (error) {
                console.error('Message handling error:', error);
            }
        });

        // Callback query handling
        this.bot.on('callback_query', async (ctx) => {
            try {
                await this.services.stats.trackMessage(ctx.from.id);
                
                // Let command registry handle callback queries
                await this.commandRegistry.handleCallbackQuery(ctx);
                
            } catch (error) {
                console.error('Callback query error:', error);
                await ctx.answerCallbackQuery('Something went wrong. Please try again.');
            }
        });

        // Error handling
        this.bot.catch((err, ctx) => {
            console.error(`Error for ${ctx.updateType}:`, err);
            if (ctx.reply) {
                ctx.reply('❌ An error occurred while processing your request. Please try again later.')
                  .catch((replyError) => {
                    console.error('Failed to send error message to user:', replyError);
                  });
            }
        });

        console.log('✅ Bot handlers setup completed');
    }

    async initializeScheduledJobs() {
        console.log('⏰ Initializing scheduled jobs...');
        
        try {
            await this.services.scheduling.initialize();
            console.log('✅ Scheduled jobs initialized');
        } catch (error) {
            console.error('Scheduled jobs initialization failed:', error);
            // Don't throw - this is not critical for basic bot functionality
        }
    }

    updateHealthStatus() {
        this.healthStatus = {
            status: 'healthy',
            services: {
                environment: process.env.NODE_ENV || 'development',
                database: this.services.db ? 'healthy' : 'error',
                bot: this.bot ? 'healthy' : 'error',
                admin: this.services.admin ? 'healthy' : 'error',
                message: this.services.message ? 'healthy' : 'error',
                reaction: this.services.reaction ? 'healthy' : 'error',
                stats: this.services.stats ? 'healthy' : 'error',
                subscription: this.services.subscription ? 'healthy' : 'error',
                scheduling: this.services.scheduling ? 'healthy' : 'error',
                tbcWorkflow: this.services.tbcWorkflow ? 'healthy' : 'error'
            },
            lastCheck: new Date()
        };
    }

    getHealthStatus() {
        this.updateHealthStatus();
        return this.healthStatus;
    }

    async shutdown() {
        console.log('🔄 Shutting down bot...');
        
        try {
            if (this.services.scheduling) {
                await this.services.scheduling.shutdown();
            }
            
            if (this.bot) {
                this.bot.stop();
            }
            
            console.log('✅ Bot shutdown completed');
        } catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}

module.exports = BotInitialization;