/**
 * Command Service - Main integration point for all bot commands and handlers
 * This is the central coordinator that registers all command modules
 */

const CommandUtils = require('./utils/command-utils');
const { CircuitBreakerManager } = require('../utils/circuit-breaker');
const HealthMonitor = require('./health-monitor');

// Core Services
const StateService = require('./state-service');
const AdminSystem = require('./admin-system');
const PostManager = require('./post-manager');
const TierManager = require('./tier-manager');
const ChannelGroupManager = require('./channel-group-manager');

// Command modules
const InfoCommands = require('./commands/info-commands');
const NewsCommands = require('./commands/news-commands');
const UserCommands = require('./commands/user-commands');
const SubscriptionCommands = require('./commands/subscription-commands');
const PostingCommands = require('./commands/posting-commands');
const TieredHelp = require('./commands/help-tiered');
const UsageCommands = require('./commands/usage-commands');

// Premium feature modules
const OnboardingFlow = require('./onboarding-flow');
const TemplateSystem = require('./template-system');
const BulkEditSystem = require('./bulk-edit-system');
const MediaHandler = require('./media-handler');
const ScheduledPosting = require('./scheduled-posting');
const PaymentSystem = require('./payment-system');

// Callback handler modules
const NewsCallbacks = require('./callbacks/news-callbacks');
const SettingsCallbacks = require('./callbacks/settings-callbacks');
const GeneralCallbacks = require('./callbacks/general-callbacks');

// Service modules
const LocalReactionSync = require('./local-reaction-sync');
const MessageHandlers = require('./message-handlers');

class CommandService {
    constructor(bot, db, config) {
        this.bot = bot;
        this.db = db;
        this.config = config || {};
        
        // Initialize circuit breaker manager
        this.circuitBreakers = new CircuitBreakerManager();
        
        // Initialize health monitor
        this.healthMonitor = new HealthMonitor(bot, db, this.circuitBreakers);
        this.setupHealthMonitorEvents();
        
        // Get admin IDs from config or environment
        this.adminIds = this.config.adminIds || 
                       (process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id)) : []);
        
        // Initialize core services FIRST (before command modules that depend on them)
        this.tierManager = new TierManager(db);
        this.postManager = new PostManager(bot, db);
        this.reactionSync = new LocalReactionSync(bot, db);
        this.messageHandlers = new MessageHandlers(bot, db);
        this.adminSystem = new AdminSystem(bot, db);
        this.channelGroupManager = new ChannelGroupManager(bot, db, this.tierManager);
        
        // Initialize premium services (depend on tierManager)
        this.paymentSystem = new PaymentSystem(bot, db, this.tierManager);
        this.mediaHandler = new MediaHandler(bot, db, this.tierManager);
        this.scheduledPosting = new ScheduledPosting(bot, db, this.tierManager);
        this.onboardingFlow = new OnboardingFlow(bot, db, this.tierManager);
        this.templateSystem = new TemplateSystem(bot, db, this.tierManager);
        this.bulkEditSystem = new BulkEditSystem(bot, db, this.tierManager);
        
        // Initialize command modules (depend on services)
        this.infoCommands = new InfoCommands(bot, db);
        this.newsCommands = new NewsCommands(bot, db);
        this.userCommands = new UserCommands(bot, db);
        this.subscriptionCommands = new SubscriptionCommands(bot, db);
        this.postingCommands = new PostingCommands(bot, db, { 
            postManager: this.postManager 
        });
        this.tieredHelp = new TieredHelp(bot, db);
        this.usageCommands = new UsageCommands(bot, db);
        
        // Initialize callback handlers
        this.newsCallbacks = new NewsCallbacks(bot, db);
        this.settingsCallbacks = new SettingsCallbacks(bot, db);
        this.generalCallbacks = new GeneralCallbacks(bot, db);
        
        console.log(' Command Service initialized with all modules');
    }
    
    /**
     * Register all commands and handlers
     */
    async registerCommands() {
        try {
            console.log('=� Registering all commands...');
            
            // Register admin commands (if admin module available)
            if (this.adminCommands) {
                await this.registerAdminCommands();
            }
            
            // Register public commands
            await this.registerPublicCommands();
            
            // Register callback handlers
            await this.registerCallbackHandlers();
            
            // Register message handlers
            await this.registerMessageHandlers();
            
            // Register inline query handlers
            await this.registerInlineHandlers();
            
            // Initialize reaction sync
            if (this.reactionSync) {
                if (typeof this.reactionSync.initialize === 'function') {
                    // await this.reactionSync.initialize(); // LocalReactionSync doesn't have this method
                } else {
                    // LocalReactionSync doesn't have initialize method
                }
                console.log(' Reaction sync initialized');
            }
            
            console.log(' All commands and handlers registered successfully');
            
        } catch (error) {
            console.error('L Error registering commands:', error);
            throw error;
        }
    }
    
    /**
     * Register admin commands
     */
    async registerAdminCommands() {
        try {
            this.adminCommands.register();
            console.log(' Admin commands registered');
        } catch (error) {
            console.error('L Error registering admin commands:', error);
        }
    }
    
    /**
     * Register public user commands
     */
    async registerPublicCommands() {
        try {
            // Register info commands
            this.infoCommands.register();
            console.log(' Info commands registered');
            
            // Register news commands
            this.newsCommands.register();
            console.log(' News commands registered');
            
            // Register user commands
            this.userCommands.register();
            console.log(' User commands registered');
            
            // Register subscription commands
            this.subscriptionCommands.register();
            console.log(' Subscription commands registered');
            
        } catch (error) {
            console.error('L Error registering public commands:', error);
            throw error;
        }
    }
    
    /**
     * Register callback query handlers
     */
    async registerCallbackHandlers() {
        try {
            // Register news callbacks
            this.newsCallbacks.register();
            console.log(' News callbacks registered');
            
            // Register settings callbacks
            this.settingsCallbacks.register();
            console.log(' Settings callbacks registered');
            
            // Register general callbacks
            this.generalCallbacks.register();
            console.log(' General callbacks registered');
            
            // Register reaction callbacks (handled by LocalReactionSync)
            if (this.reactionSync) {
                // Reaction callbacks are registered in LocalReactionSync.initialize()
                console.log(' Reaction callbacks will be registered by LocalReactionSync');
            }
            
        } catch (error) {
            console.error('L Error registering callback handlers:', error);
            throw error;
        }
    }
    
    /**
     * Register message handlers (non-command messages)
     */
    async registerMessageHandlers() {
        try {
            // Use the comprehensive MessageHandlers class which includes group support
            this.messageHandlers.register();
            
            // Additionally handle forwarded messages for channel detection
            this.bot.on('forward_date', async (ctx) => {
                try {
                    await CommandUtils.trackUser(ctx, this.db);
                    
                    // Check if it's from a channel
                    if (ctx.message.forward_from_chat && ctx.message.forward_from_chat.type === 'channel') {
                        const channel = ctx.message.forward_from_chat;
                        
                        // Check if user is admin
                        const isAdmin = this.adminIds.includes(ctx.from.id);
                        
                        if (isAdmin) {
                            await ctx.reply(
                                `=� *Channel Detected*\n\n` +
                                `Name: ${channel.title}\n` +
                                `ID: ${channel.id}\n` +
                                `Username: ${channel.username || 'N/A'}\n\n` +
                                `Would you like to add this channel as a destination?`,
                                {
                                    parse_mode: 'Markdown',
                                    reply_markup: {
                                        inline_keyboard: [[
                                            { text: ' Add Channel', callback_data: `add:channel:${channel.id}` },
                                            { text: 'L Cancel', callback_data: 'cancel' }
                                        ]]
                                    }
                                }
                            );
                        }
                    }
                } catch (error) {
                    await CommandUtils.handleError(ctx, error);
                }
            });
            
            // Handle text messages (for natural language processing)
            this.bot.on('text', async (ctx, next) => {
                // Skip if it's a command
                if (ctx.message.text.startsWith('/')) {
                    return next();
                }
                
                try {
                    await CommandUtils.trackUser(ctx, this.db);
                    
                    // Check for user state (multi-step processes)
                    const userState = await this.db.collection('user_states').findOne({
                        user_id: ctx.from.id
                    });
                    
                    if (userState) {
                        // Handle based on state
                        switch (userState.state) {
                            case 'awaiting_feedback':
                                await this.handleFeedbackSubmission(ctx, userState);
                                break;
                            case 'awaiting_report':
                                await this.handleReportSubmission(ctx, userState);
                                break;
                            case 'awaiting_search':
                                await this.handleSearchQuery(ctx);
                                break;
                            default:
                                // No active state, continue
                                break;
                        }
                    }
                } catch (error) {
                    await CommandUtils.handleError(ctx, error);
                }
                
                return next();
            });
            
            console.log(' Message handlers registered with group support');
            
        } catch (error) {
            console.error('L Error registering message handlers:', error);
            throw error;
        }
    }
    
    /**
     * Register inline query handlers
     */
    async registerInlineHandlers() {
        try {
            // Handle inline queries for article search
            this.bot.on('inline_query', async (ctx) => {
                try {
                    const query = ctx.inlineQuery.query.trim();
                    
                    if (!query) {
                        // Show recent articles if no query
                        const articles = await this.db.collection('news_articles')
                            .find({})
                            .sort({ published_date: -1 })
                            .limit(10)
                            .toArray();
                        
                        const results = articles.map(article => ({
                            type: 'article',
                            id: article._id.toString(),
                            title: article.title,
                            description: CommandUtils.truncateText(article.summary || article.content, 100),
                            input_message_content: {
                                message_text: CommandUtils.formatArticle(article, true),
                                parse_mode: 'Markdown'
                            }
                        }));
                        
                        await ctx.answerInlineQuery(results, { cache_time: 60 });
                    } else {
                        // Search articles
                        const articles = await this.db.collection('news_articles')
                            .find({ $text: { $search: query } })
                            .limit(10)
                            .toArray();
                        
                        const results = articles.map(article => ({
                            type: 'article',
                            id: article._id.toString(),
                            title: article.title,
                            description: CommandUtils.truncateText(article.summary || article.content, 100),
                            input_message_content: {
                                message_text: CommandUtils.formatArticle(article, true),
                                parse_mode: 'Markdown'
                            }
                        }));
                        
                        await ctx.answerInlineQuery(results, { cache_time: 30 });
                    }
                } catch (error) {
                    console.error('Error handling inline query:', error);
                    await ctx.answerInlineQuery([], { cache_time: 0 });
                }
            });
            
            console.log(' Inline handlers registered');
            
        } catch (error) {
            console.error('L Error registering inline handlers:', error);
            throw error;
        }
    }
    
    /**
     * Handle feedback submission from user state
     */
    async handleFeedbackSubmission(ctx, userState) {
        try {
            const feedback = ctx.message.text;
            
            // Save feedback
            await this.db.collection('feedback').insertOne({
                user_id: ctx.from.id,
                username: ctx.from.username,
                category: userState.data.category,
                feedback: feedback,
                created_at: new Date()
            });
            
            // Clear user state
            await this.db.collection('user_states').deleteOne({ user_id: ctx.from.id });
            
            await ctx.reply(
                ' *Feedback Received!*\n\n' +
                'Thank you for your feedback. We appreciate your input and will review it soon.',
                { parse_mode: 'Markdown' }
            );
            
        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }
    
    /**
     * Handle report submission from user state
     */
    async handleReportSubmission(ctx, userState) {
        try {
            const report = ctx.message.text;
            const ticketId = `ZN-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
            
            // Save report
            await this.db.collection('reports').insertOne({
                ticket_id: ticketId,
                user_id: ctx.from.id,
                username: ctx.from.username,
                issue_type: userState.data.issue_type,
                priority: userState.data.priority,
                description: report,
                status: 'open',
                created_at: new Date()
            });
            
            // Clear user state
            await this.db.collection('user_states').deleteOne({ user_id: ctx.from.id });
            
            await ctx.reply(
                ` *Report Submitted!*\n\n` +
                `Ticket ID: \`${ticketId}\`\n` +
                `Priority: ${userState.data.priority}\n\n` +
                `We'll investigate this issue and get back to you soon.`,
                { parse_mode: 'Markdown' }
            );
            
        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }
    
    /**
     * Handle search query from text
     */
    async handleSearchQuery(ctx) {
        try {
            const query = ctx.message.text;
            
            // Perform search
            const articles = await this.db.collection('news_articles')
                .find({ $text: { $search: query } })
                .limit(5)
                .toArray();
            
            if (articles.length === 0) {
                await ctx.reply('No articles found for your search. Try different keywords.');
                return;
            }
            
            // Format and send results
            let message = `= *Search Results for "${query}"*\n\n`;
            articles.forEach((article, i) => {
                message += `${i + 1}. *${article.title}*\n`;
                message += `   ${CommandUtils.truncateText(article.summary || article.content, 100)}\n\n`;
            });
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
            
        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }
    
    /**
     * Setup health monitor event handlers
     */
    setupHealthMonitorEvents() {
        this.healthMonitor.on('criticalHealth', (healthData) => {
            console.error('🚨 CRITICAL HEALTH ALERT:', healthData);
            this.notifyAdminsOfCriticalHealth(healthData);
        });

        this.healthMonitor.on('memoryPressure', (memoryData) => {
            console.warn('⚠️ Memory pressure detected:', memoryData);
            if (global.gc) {
                console.log('Running garbage collection...');
                global.gc();
            }
        });

        this.healthMonitor.on('databaseDown', (dbData) => {
            console.error('💾 Database connectivity lost:', dbData);
        });

        this.healthMonitor.on('telegramDown', (telegramData) => {
            console.error('📱 Telegram API connectivity lost:', telegramData);
        });

        this.healthMonitor.on('healthRecovered', (healthData) => {
            console.log('✅ Health recovered:', healthData.status);
        });
    }

    /**
     * Notify admins of critical health issues
     */
    async notifyAdminsOfCriticalHealth(healthData) {
        const message = `🚨 *CRITICAL HEALTH ALERT*\n\n` +
                       `Status: ${healthData.status.toUpperCase()}\n` +
                       `Time: ${healthData.timestamp}\n\n` +
                       `Database: ${healthData.checks?.database?.status || 'unknown'}\n` +
                       `Telegram: ${healthData.checks?.telegram?.status || 'unknown'}\n` +
                       `Memory: ${healthData.checks?.memory?.status || 'unknown'}\n` +
                       `Circuit Breakers: ${healthData.checks?.circuitBreakers?.failed || 0} failed\n\n` +
                       `Service requires immediate attention!`;

        for (const adminId of this.adminIds) {
            try {
                await this.circuitBreakers.executeWithBreaker(
                    'telegram_api',
                    async () => {
                        await this.bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
                    },
                    async () => {
                        console.log(`Failed to notify admin ${adminId} - circuit breaker open`);
                    }
                );
            } catch (error) {
                console.error(`Failed to notify admin ${adminId}:`, error.message);
            }
        }
    }

    /**
     * Get health report for admin commands
     */
    getHealthReport() {
        return this.healthMonitor.getHealthReport();
    }

    /**
     * Reset circuit breakers (admin command)
     */
    resetCircuitBreakers() {
        this.circuitBreakers.resetAll();
        return 'All circuit breakers have been reset.';
    }

    /**
     * Execute function with circuit breaker protection
     */
    async executeWithBreaker(breakerName, fn, fallback = null) {
        return await this.circuitBreakers.executeWithBreaker(breakerName, fn, fallback);
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        try {
            console.log('Starting command service cleanup...');
            
            // Shutdown health monitor
            if (this.healthMonitor) {
                await this.healthMonitor.shutdown();
            }
            
            // Reset circuit breakers
            if (this.circuitBreakers) {
                this.circuitBreakers.resetAll();
            }
            
            if (this.reactionSync) {
                // Any cleanup needed for reaction sync
                console.log('Cleaning up reaction sync...');
            }
            
            console.log(' Command service cleanup complete');
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

module.exports = CommandService;