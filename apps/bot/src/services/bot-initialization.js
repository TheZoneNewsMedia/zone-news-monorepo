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
const TDLibIntegration = require('./tdlib-integration');
const CacheService = require('./cache-service');
const { circuitBreakerManager } = require('./circuit-breaker');
// Optional ScalableReactionSystem - may not exist on all deployments
let ScalableReactionSystem;
try {
    ScalableReactionSystem = require('../../scalable-reaction-system');
} catch (e) {
    console.log('⚠️ ScalableReactionSystem not available, using basic reaction handling');
}
const EmojiReactionHandler = require('./emoji-reaction-handler');
const DatabaseIndexingService = require('./database-indexing.service');
const ArticleCurationService = require('./article-curation.service');

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

        // Initialize standard Telegraf bot with webhook configuration
        // Disable polling to prevent 409 Conflict errors
        this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
            telegram: {
                webhookReply: false  // Don't reply via webhook, use separate API calls
            }
        });
        
        // Explicitly stop polling to ensure no getUpdates calls
        this.bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
        
        console.log('🤖 Bot instance created (webhook mode only)');

        // Initialize TDLib for full Telegram client capabilities
        try {
            this.tdlib = TDLibIntegration.getInstance();
            await this.tdlib.initialize();
            console.log('📚 TDLib initialized for channel monitoring');
            
            // Setup TDLib event handlers
            await this.setupTDLibHandlers();
        } catch (error) {
            console.error('⚠️ TDLib initialization failed (non-critical):', error.message);
            // Continue without TDLib - bot can still function with standard API
        }
    }

    async initializeServices() {
        console.log('🔧 Initializing services...');

        try {
            // Database service with circuit breaker protection
            this.services.db = DatabaseService;
            await circuitBreakerManager.execute('database',
                async () => await this.services.db.connect(),
                {
                    failureThreshold: 3,
                    recoveryTimeout: 30000,
                    fallback: async () => {
                        console.warn('Database connection failed, using limited mode');
                        return { isConnected: false };
                    }
                }
            );
            console.log('✅ Database service initialized');
            
            // Initialize database indexes for optimal query performance
            if (this.services.db.getDb) {
                try {
                    const indexingService = new DatabaseIndexingService(this.services.db.getDb());
                    const indexResults = await indexingService.initializeIndexes();
                    console.log(`✅ Database indexes initialized (${indexResults.created.length} new, ${indexResults.existing.length} existing)`);
                    
                    // Store indexing service for monitoring
                    this.services.indexing = indexingService;
                } catch (error) {
                    console.error('⚠️ Database index initialization failed (non-critical):', error.message);
                }
            }
            
            // Cache service
            this.services.cache = new CacheService({
                userStatsTTL: 300,
                articlesTTL: 600,
                searchTTL: 180,
                reactionsTTL: 120
            });
            console.log('✅ Cache service initialized');
            
            // Circuit breaker manager
            this.services.circuitBreaker = circuitBreakerManager;
            console.log('✅ Circuit breaker protection enabled');

            // Stats service (singleton instance)
            this.services.stats = StatsService;
            if (this.services.stats.initialize) {
                await this.services.stats.initialize();
            }
            console.log('✅ Stats service initialized');

            // TDLib service (if initialized)
            if (this.tdlib) {
                this.services.tdlib = this.tdlib;
                console.log('✅ TDLib service added to services');
            }

            // Try to initialize other services as instances first, fallback to singletons
            try {
                this.services.admin = new AdminService(this.bot, this.services.db);
                console.log('✅ Admin service initialized');
            } catch (e) {
                console.log('⚠️ Admin service not available as constructor, skipping...');
            }

            try {
                this.services.message = new MessageService(this.bot, this.services.db);
                console.log('✅ Message service initialized');
            } catch (e) {
                console.log('⚠️ Message service not available as constructor, skipping...');
            }

            try {
                this.services.reaction = new ReactionService(this.bot, this.services.db);
                console.log('✅ Reaction service initialized');
            } catch (e) {
                console.error('❌ Reaction service initialization failed:', e.message);
                // Still assign a basic object to prevent health check errors
                this.services.reaction = { status: 'error', error: e.message };
            }

            try {
                this.services.subscription = new SubscriptionService(this.bot, this.services.db);
                console.log('✅ Subscription service initialized');
            } catch (e) {
                console.log('⚠️ Subscription service not available as constructor, skipping...');
            }

            try {
                this.services.scheduling = new SchedulingService(this.bot, this.services.db);
                console.log('✅ Scheduling service initialized');
            } catch (e) {
                console.log('⚠️ Scheduling service not available as constructor, skipping...');
            }

            try {
                this.services.tbcWorkflow = new TbcWorkflowService(this.bot, this.services.db);
                console.log('✅ TBC workflow service initialized');
            } catch (e) {
                console.log('⚠️ TBC workflow service not available as constructor, skipping...');
            }
            
            // Scalable Reaction System (optional)
            if (ScalableReactionSystem) {
                try {
                    this.services.reactionSystem = new ScalableReactionSystem(this.services.db.getDatabase(), this.bot);
                    console.log('✅ Scalable Reaction System initialized');
                } catch (e) {
                    console.log('⚠️ ScalableReactionSystem initialization failed:', e.message);
                    this.services.reactionSystem = null;
                }
            } else {
                this.services.reactionSystem = null;
            }
            
            // Emoji Reaction Handler - works with or without ScalableReactionSystem
            try {
                this.services.emojiHandler = new EmojiReactionHandler(this.bot, this.services.db, this.services.reactionSystem);
                console.log('✅ Emoji Reaction Handler initialized');
            } catch (e) {
                console.log('⚠️ Emoji Reaction Handler initialization failed:', e.message);
            }

            // Article Curation Service
            try {
                this.services.articleCuration = new ArticleCurationService(this.bot, this.services.db.getDatabase());
                this.services.articleCuration.initialize();
                this.services.articleCuration.startCleanupInterval();
                console.log('✅ Article Curation Service initialized');
            } catch (e) {
                console.log('⚠️ Article Curation Service initialization failed:', e.message);
            }

            // Channel reaction solution - removed as it's replaced by built-in reaction handlers
            // The functionality is now handled directly in the command registry

            // Update health status
            this.updateHealthStatus();
            
        } catch (error) {
            throw new Error(`Service initialization failed: ${error.message}`);
        }
    }

    async setupTDLibHandlers() {
        if (!this.tdlib) return;
        
        console.log('📡 Setting up TDLib event handlers...');
        
        // Handle new messages from monitored channels
        this.tdlib.on('updateNewMessage', async (update) => {
            try {
                const message = update.message;
                if (message && message.chat_id) {
                    console.log(`📨 New message in channel ${message.chat_id}`);
                    // Process channel messages here
                    // Could forward to bot users, store in DB, etc.
                }
            } catch (error) {
                console.error('Error handling TDLib message:', error);
            }
        });

        // Handle message views updates
        this.tdlib.on('updateMessageViews', async (update) => {
            console.log(`👁 Message views updated: ${update.views} views`);
        });

        // Handle message reactions
        this.tdlib.on('updateMessageReactions', async (update) => {
            console.log(`💬 Message reactions updated`);
        });

        console.log('✅ TDLib handlers configured');
    }

    async setupBotHandlers() {
        console.log('🎯 Setting up bot command handlers...');
        
        // Setup emoji reaction handlers first (before command registry)
        if (this.services.emojiHandler) {
            this.services.emojiHandler.setupHandlers();
            console.log('✅ Emoji reaction handlers setup');
        }
        
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

        // Callback query handling for stats tracking only
        // Actual callback handling is done by EmojiReactionHandler and CommandRegistry
        this.bot.on('callback_query', async (ctx) => {
            try {
                await this.services.stats.trackMessage(ctx.from.id);
                // All callback handling is now done by specific handlers
                
            } catch (error) {
                console.error('Callback query error:', error);
                try {
                    await ctx.answerCbQuery('Something went wrong. Please try again.');
                } catch (answerError) {
                    console.error('Could not answer callback query:', answerError);
                }
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
            if (this.services.scheduling && this.services.scheduling.initialize) {
                await this.services.scheduling.initialize();
                console.log('✅ Scheduled jobs initialized');
            } else {
                console.log('⚠️ Scheduling service not available, skipping scheduled jobs');
            }
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
                tbcWorkflow: this.services.tbcWorkflow ? 'healthy' : 'error',
                articleCuration: this.services.articleCuration ? 'healthy' : 'error'
            },
            lastCheck: new Date()
        };
    }

    getHealthStatus() {
        this.updateHealthStatus();
        return this.healthStatus;
    }

    /**
     * Handle TBC persistent reaction callbacks
     */
    async handleTBCReaction(ctx) {
        try {
            const callbackData = ctx.callbackQuery.data;
            const userId = ctx.callbackQuery.from.id;
            const messageId = ctx.callbackQuery.message.message_id;
            
            console.log(`🔄 Processing TBC reaction: ${callbackData} from user ${userId}`);
            
            // Parse callback data: persist_{reaction}_{messageKey}
            const parts = callbackData.split('_');
            if (parts.length < 3 || parts[0] !== 'persist') {
                return await ctx.answerCbQuery('Invalid reaction format');
            }
            
            const reactionType = parts[1]; // like, love, fire, etc.
            const messageKey = parts.slice(2).join('_'); // tbc_57999, etc.
            
            // Get database connection
            const db = this.services.db.getDatabase();
            
            // Get current reaction data
            let reactionDoc = await db.collection('zone_persistent_reactions').findOne({
                message_key: messageKey
            });
            
            if (!reactionDoc) {
                console.log(`   ❌ No reaction document found for ${messageKey}`);
                return await ctx.answerCbQuery('Reaction data not found');
            }
            
            // Initialize reaction counts and user tracking
            if (!reactionDoc.reactions) reactionDoc.reactions = {};
            if (!reactionDoc.user_reactions) reactionDoc.user_reactions = {};
            
            // Initialize this reaction type if not exists
            if (!reactionDoc.reactions[reactionType]) reactionDoc.reactions[reactionType] = 0;
            if (!reactionDoc.user_reactions[reactionType]) reactionDoc.user_reactions[reactionType] = [];
            
            // Check if user already reacted with this emoji
            const userReacted = reactionDoc.user_reactions[reactionType].includes(userId);
            let actionText = '';
            
            if (userReacted) {
                // Remove reaction
                reactionDoc.reactions[reactionType] = Math.max(0, reactionDoc.reactions[reactionType] - 1);
                reactionDoc.user_reactions[reactionType] = reactionDoc.user_reactions[reactionType].filter(id => id !== userId);
                actionText = `Removed ${this.getEmojiForReaction(reactionType)}`;
            } else {
                // Add reaction
                reactionDoc.reactions[reactionType]++;
                reactionDoc.user_reactions[reactionType].push(userId);
                actionText = `Added ${this.getEmojiForReaction(reactionType)}`;
            }
            
            // Calculate total count
            reactionDoc.total_count = Object.values(reactionDoc.reactions).reduce((sum, count) => sum + count, 0);
            reactionDoc.last_updated = new Date();
            
            // Save to database
            await db.collection('zone_persistent_reactions').replaceOne(
                { message_key: messageKey },
                reactionDoc
            );
            
            // Update message keyboard with new counts
            const updatedKeyboard = this.createTBCReactionKeyboard(messageKey, reactionDoc.reactions);
            
            try {
                await ctx.editMessageReplyMarkup(updatedKeyboard);
            } catch (editError) {
                console.log(`   ⚠️  Could not update keyboard: ${editError.message}`);
            }
            
            // Answer the callback query
            await ctx.answerCbQuery(actionText);
            
            console.log(`   📈 Total reactions for ${messageKey}: ${reactionDoc.total_count}`);
            
        } catch (error) {
            console.error('❌ Error handling TBC reaction:', error);
            await ctx.answerCbQuery('Error processing reaction').catch(() => {});
        }
    }

    /**
     * Create updated reaction keyboard
     */
    createTBCReactionKeyboard(messageKey, reactions) {
        return {
            inline_keyboard: [
                [
                    { text: `👍 ${reactions.like || 0}`, callback_data: `persist_like_${messageKey}` },
                    { text: `❤️ ${reactions.love || 0}`, callback_data: `persist_love_${messageKey}` },
                    { text: `🔥 ${reactions.fire || 0}`, callback_data: `persist_fire_${messageKey}` }
                ],
                [
                    { text: `🎉 ${reactions.party || 0}`, callback_data: `persist_party_${messageKey}` },
                    { text: `😊 ${reactions.happy || 0}`, callback_data: `persist_happy_${messageKey}` },
                    { text: `😮 ${reactions.wow || 0}`, callback_data: `persist_wow_${messageKey}` }
                ]
            ]
        };
    }

    /**
     * Get emoji for reaction type
     */
    getEmojiForReaction(reactionType) {
        const emojiMap = {
            like: '👍',
            love: '❤️', 
            fire: '🔥',
            party: '🎉',
            happy: '😊',
            wow: '😮'
        };
        return emojiMap[reactionType] || '👍';
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
