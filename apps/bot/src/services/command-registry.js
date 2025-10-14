/**
 * Command Registry - Central command management with modular handlers
 */

// Core services
const PostCommands = require('../commands/post-commands');
const TbcNightNews = require('../commands/tbc-night-news');
const ArticleCreator = require('./article-creator');
const ArticleSearch = require('./article-search');

// Modular handlers
const StartMenuHandler = require('../handlers/start-menu-handler');
const ContentHandler = require('../handlers/content-handler');
const SearchHandler = require('../handlers/search-handler');
const EmojiReactionHandler = require('./emoji-reaction-handler');

// Configuration
const { COMMANDS, getHelpMenu } = require('../config/commands.config');
const { EMOJI_CONFIG, getBackButton } = require('../config/emoji.config');

class CommandRegistry {
    constructor(bot, db, services) {
        this.bot = bot;
        this.db = db;
        this.services = services;
        this.commands = new Map();
        this.callbackRoutes = new Map(); // Optimized callback routing
        
        // Initialize handlers
        this.initializeHandlers();
        this.initializeCommands();
        this.initializeCallbackRoutes();
    }
    
    initializeHandlers() {
        // Initialize ArticleCreator and ArticleSearch services first
        try {
            this.articleCreator = new ArticleCreator(this.db);
            console.log('✅ ArticleCreator service initialized');
        } catch (error) {
            console.log('⚠️ ArticleCreator not available:', error.message);
        }

        try {
            this.articleSearch = new ArticleSearch(this.db);
            console.log('✅ ArticleSearch service initialized');
        } catch (error) {
            console.log('⚠️ ArticleSearch not available:', error.message);
        }

        // Initialize modular handlers
        this.startMenuHandler = new StartMenuHandler(this.bot, this.db, this.services);
        this.contentHandler = new ContentHandler(this.bot, this.db, this.articleCreator);
        this.searchHandler = new SearchHandler(this.bot, this.db, this.articleSearch);
        
        // Initialize emoji reaction handler
        try {
            this.emojiReactionHandler = new EmojiReactionHandler(this.bot, { db: this.db });
            console.log('✅ EmojiReactionHandler initialized');
        } catch (error) {
            console.log('⚠️ EmojiReactionHandler not available:', error.message);
        }
        
        console.log('✅ Modular handlers initialized');
        
        // Setup handlers
        this.setupHandlers();
    }
    
    /**
     * Initialize optimized callback routes using Map for O(1) performance
     */
    initializeCallbackRoutes() {
        // Main menu and navigation callbacks
        this.callbackRoutes.set('features_menu', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'features_menu'));
        this.callbackRoutes.set('help_menu', (ctx) => this.sendHelpMenu(ctx));
        this.callbackRoutes.set('back_to_start', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'back_to_start'));
        
        // Content management callbacks
        this.callbackRoutes.set('cmd_newarticle', (ctx) => this.contentHandler.handleContentCallback(ctx, 'cmd_newarticle'));
        this.callbackRoutes.set('cmd_drafts', (ctx) => this.contentHandler.handleContentCallback(ctx, 'cmd_drafts'));
        
        // Search callbacks
        this.callbackRoutes.set('cmd_search', (ctx) => this.searchHandler.handleSearchCallback(ctx, 'cmd_search'));
        this.callbackRoutes.set('cmd_trending', (ctx) => this.searchHandler.handleSearchCallback(ctx, 'cmd_trending'));
        this.callbackRoutes.set('advanced_search', (ctx) => this.searchHandler.handleSearchCallback(ctx, 'advanced_search'));
        this.callbackRoutes.set('search_help', (ctx) => this.searchHandler.handleSearchCallback(ctx, 'search_help'));
        
        // Settings callbacks
        this.callbackRoutes.set('settings_menu', (ctx) => this.handleSettingsMenu(ctx));
        this.callbackRoutes.set('settings_notifications', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'settings_notifications'));
        this.callbackRoutes.set('settings_channels', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'settings_channels'));
        this.callbackRoutes.set('settings_language', (ctx) => this.handleLanguageSettings(ctx));
        this.callbackRoutes.set('settings_analytics', (ctx) => this.handleAnalyticsSettings(ctx));
        this.callbackRoutes.set('settings_interface', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'settings_interface'));
        this.callbackRoutes.set('settings_privacy', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'settings_privacy'));
        
        // Analytics callbacks
        this.callbackRoutes.set('user_analytics', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'user_analytics'));
        this.callbackRoutes.set('detailed_analytics', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'detailed_analytics'));
        
        // Post management callbacks
        this.callbackRoutes.set('cmd_post', (ctx) => this.handlePostCommand(ctx));
        this.callbackRoutes.set('post_zone_news', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'post_zone_news'));
        this.callbackRoutes.set('post_tbc', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'post_tbc'));
        this.callbackRoutes.set('schedule_post', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'schedule_post'));
        
        // Management callbacks
        this.callbackRoutes.set('channel_mgmt', (ctx) => this.handleManagementCallback(ctx, 'channel_mgmt'));
        this.callbackRoutes.set('group_mgmt', (ctx) => this.handleManagementCallback(ctx, 'group_mgmt'));
        
        // Quick action callbacks
        this.callbackRoutes.set('quick_start', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'quick_start'));
        this.callbackRoutes.set('quick_start_new', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'quick_start_new'));
        this.callbackRoutes.set('quick_post', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'quick_post'));
        this.callbackRoutes.set('user_settings', (ctx) => this.startMenuHandler.handleMainMenuCallback(ctx, 'user_settings'));
        
        console.log(`✅ Initialized ${this.callbackRoutes.size} callback routes for O(1) routing`);
    }
    
    setupHandlers() {
        // Setup start command
        this.startMenuHandler.setupStartCommand();
        
        // Setup callback query handler for all interactions
        this.bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            const action = data.split(':')[0];
            
            try {
                // First check optimized Map routing for O(1) performance
                const handler = this.callbackRoutes.get(action);
                if (handler) {
                    await handler(ctx);
                    return;
                }
                
                // Handle pattern-based callbacks
                if (data.startsWith('persist_')) {
                    // Delegate to EmojiReactionHandler
                    if (this.emojiReactionHandler) {
                        await this.emojiReactionHandler.handleReaction(ctx);
                    } else {
                        console.warn('EmojiReactionHandler not available');
                        await ctx.answerCbQuery('Reaction system temporarily unavailable');
                    }
                } else if (data.startsWith('edit_draft:')) {
                    // Handle draft editing
                    const articleId = data.split(':')[1];
                    if (this.articleCreator) {
                        await ctx.answerCbQuery();
                        await this.articleCreator.startArticleEditing(ctx, articleId);
                    }
                } else if (data.startsWith('view_article:')) {
                    // Handle article viewing
                    await this.handleArticleView(ctx, data.split(':')[1]);
                } else if (data.startsWith('drafts_page:')) {
                    // Handle draft pagination
                    if (this.contentHandler && this.contentHandler.pagination) {
                        await this.contentHandler.pagination.handleDraftPageNavigation(ctx);
                    }
                } else if (data.startsWith('search_page:')) {
                    // Handle search pagination
                    if (this.searchHandler) {
                        const parts = data.split(':');
                        const query = parts[1];
                        const page = parseInt(parts[2]);
                        await this.searchHandler.handleSearchPagination(ctx, query, page);
                    }
                } else if (data.startsWith('category:') || data.startsWith('search_category:')) {
                    // Handle category filtering
                    await this.searchHandler.handleSearchCallback(ctx, action);
                } else if (data.startsWith('search_date:') || data.startsWith('search_sort:')) {
                    // Handle search filters
                    await this.searchHandler.handleSearchCallback(ctx, action);
                } else {
                    // Handle any remaining callbacks
                    await this.handleOtherCallbacks(ctx, data);
                }
            } catch (error) {
                console.error('Callback query routing error:', error);
                await ctx.answerCbQuery('❌ Error processing request');
            }
        });
        
        console.log('✅ Interactive callback handlers setup');
    }
    
    initializeCommands() {        
        // Set up text handling and remaining commands
        this.setupTextHandling();
        this.setupArticleActions();
        this.setupSearchActions();
        this.setupManagementCommands();
        console.log('✅ Command handlers initialized');
    }
    
    setupTextHandling() {
        // Handle text input for search and article creation
        this.bot.on('text', async (ctx) => {
            try {
                const userId = ctx.from.id;
                
                // Prevent command conflicts - check for active sessions
                const searchSession = this.articleSearch?.getUserSearchSession(userId);
                const articleSession = this.articleCreator?.getUserSession(userId);
                
                if (searchSession && searchSession.step !== 'main_menu') {
                    // Handle search input
                    await this.articleSearch.handleSearchInput(ctx);
                    return;
                } else if (articleSession && articleSession.step) {
                    // Handle article creation input
                    await this.articleCreator.handleInput(ctx);
                    return;
                } 
                // Else: ignore text input when no active session
                
            } catch (error) {
                console.error('Text handler error:', error);
            }
        });
    }
    
    setupArticleActions() {
        if (!this.articleCreator) return;
        
        // Article creation commands
        this.bot.command('newarticle', async (ctx) => {
            try {
                await this.articleCreator.startArticleCreation(ctx);
            } catch (error) {
                console.error('New article command error:', error);
                await ctx.reply('❌ Error starting article creation. Please try again.');
            }
        });

        this.bot.command('drafts', async (ctx) => {
            await this.contentHandler.handleDraftsCallback(ctx);
        });

        // Article action handlers
        this.bot.action(/^category:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            await this.articleCreator.handleCategorySelection(ctx);
        });

        this.bot.action(['auto_summary', 'use_auto_summary', 'save_draft', 'publish_now', 'cancel_article'], async (ctx) => {
            await ctx.answerCbQuery();
            const action = ctx.callbackQuery.data;
            
            switch (action) {
                case 'auto_summary':
                    await this.articleCreator.autoGenerateSummary(ctx);
                    break;
                case 'use_auto_summary':
                    const userId = ctx.from.id;
                    const session = this.articleCreator.getUserSession(userId);
                    if (session) await this.articleCreator.showArticlePreview(ctx, session);
                    break;
                case 'save_draft':
                    await this.articleCreator.saveDraft(ctx);
                    break;
                case 'publish_now':
                    await this.articleCreator.publishNow(ctx);
                    break;
                case 'cancel_article':
                    await this.articleCreator.cancelCreation(ctx);
                    break;
            }
        });

        // Edit actions
        this.bot.action(/^(edit_title|edit_content|edit_category|edit_summary|delete_draft)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const action = ctx.match[1];
            await this.articleCreator.handleEditAction(ctx, action);
        });

        this.bot.action(['back_to_edit_menu', 'new_article'], async (ctx) => {
            await ctx.answerCbQuery();
            const action = ctx.callbackQuery.data;
            
            if (action === 'back_to_edit_menu') {
                await this.articleCreator.backToEditMenu(ctx);
            } else {
                await this.articleCreator.startArticleCreation(ctx);
            }
        });
    }
    
    setupSearchActions() {
        if (!this.articleSearch) return;
        
        // Search commands
        this.bot.command('search', async (ctx) => {
            const args = ctx.message.text.split(' ').slice(1);
            const query = args.join(' ');
            
            if (!query) {
                return ctx.reply(
                    '🔍 **Quick Search**\\n\\n' +
                    'Usage: `/search your search terms`\\n\\n' +
                    'Examples:\\n' +
                    '• `/search breaking news`\\n' +
                    '• `/search technology`\\n' +
                    'Or use the Search button in /start!',
                    { parse_mode: 'Markdown' }
                );
            }
            await this.articleSearch.simpleSearch(ctx, query);
        });

        this.bot.command('find', async (ctx) => {
            await this.articleSearch.startAdvancedSearch(ctx);
        });

        this.bot.command('trending', async (ctx) => {
            await this.searchHandler.handleTrendingCallback(ctx);
        });

        // Search callback actions
        this.bot.action(/^search_(set_query|set_category|set_author|set_date|set_views|set_sort|execute|clear|back_menu|cancel)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const action = ctx.match[1];
            await this.articleSearch.handleSearchAction(ctx, `search_${action}`);
        });

        this.bot.action(/^search_category:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const category = ctx.match[1];
            await this.articleSearch.handleCategorySelection(ctx, category);
        });

        this.bot.action(/^search_date:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const dateRange = ctx.match[1];
            await this.articleSearch.handleDateSelection(ctx, dateRange);
        });

        this.bot.action(/^search_sort:(.+)$/, async (ctx) => {
            await ctx.answerCbQuery();
            const sortType = ctx.match[1];
            await this.articleSearch.handleSortSelection(ctx, sortType);
        });

        this.bot.action(['close_search'], async (ctx) => {
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                '✅ **Search Closed**\\n\\nUse /search, /find, or /trending anytime to discover content!',
                { parse_mode: 'Markdown' }
            );
        });
    }
    
    setupManagementCommands() {
        // Basic post command
        this.bot.command('post', async (ctx) => {
            try {
                if (this.postCommands) {
                    // Use existing PostCommands if available
                    await this.postCommands.handlePostCommand(ctx);
                } else {
                    await ctx.reply('📝 Post feature available! Contact admin for posting rights.');
                }
            } catch (error) {
                console.error('Post command error:', error);
                await ctx.reply('📝 Post feature coming soon! Contact admin for posting rights.');
            }
        });
        
        // Zone News Sync Commands
        this.setupZoneSyncCommands();
        
        // Help command
        this.bot.command('help', async (ctx) => {
            await this.sendHelpMenu(ctx);
        });
        
        // Initialize PostCommands if available
        try {
            this.postCommands = new PostCommands(this.bot, null, this.db);
            console.log('✅ Post commands initialized');
        } catch (error) {
            console.log('⚠️ PostCommands not available, using fallback');
        }
    }
    
    async handleManagementCallback(ctx, action) {
        await ctx.answerCbQuery();
        
        if (action === 'channel_mgmt') {
            await ctx.reply(
                '📢 **Channel Management**\\n\\n' +
                '🔧 **Available Commands:**\\n' +
                '• `/post` - Post to channels\\n' +
                '• `/addchannel` - Add new channel\\n' +
                '• `/channels` - List all channels\\n' +
                '• `/schedule` - Schedule posts\\n' +
                '• `/analytics` - View performance\\n\\n' +
                '⚠️ **Note:** Bot must be admin in target channels',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📤 Post Article', callback_data: 'cmd_post' }],
                            [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                        ]
                    }
                }
            );
        } else if (action === 'group_mgmt') {
            await ctx.reply(
                '👥 **Group Management**\\n\\n' +
                '🛡️ **Moderation Tools:**\\n' +
                '• Auto-moderation\\n' +
                '• Welcome messages\\n' +
                '• Custom rules\\n' +
                '• Member tracking\\n\\n' +
                '🔜 Advanced group features coming soon!',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                        ]
                    }
                }
            );
        }
    }
    
    async handleArticleView(ctx, articleId) {
        try {
            const article = await this.db.collection('news_articles').findOne({ 
                _id: require('mongodb').ObjectId(articleId) 
            });
            
            if (!article) {
                await ctx.answerCbQuery('❌ Article not found');
                return;
            }
            
            // Increment view count
            await this.db.collection('news_articles').updateOne(
                { _id: article._id },
                { $inc: { views: 1 } }
            );
            
            const totalReactions = (article.reactions?.like || 0) + 
                                 (article.reactions?.love || 0) + 
                                 (article.reactions?.fire || 0);
            
            const message = `📖 **${article.title}**\\n\\n` +
                          `${article.content.substring(0, 500)}${article.content.length > 500 ? '...' : ''}\\n\\n` +
                          `🏷️ **Category:** ${article.category}\\n` +
                          `👁️ **Views:** ${article.views || 0} | ❤️ **Reactions:** ${totalReactions}\\n` +
                          `📅 **Published:** ${new Date(article.published_date).toLocaleDateString()}`;
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '👍 Like', callback_data: `react:${articleId}:like` },
                            { text: '❤️ Love', callback_data: `react:${articleId}:love` },
                            { text: '🔥 Fire', callback_data: `react:${articleId}:fire` }
                        ],
                        [{ text: '🔙 Back to Search', callback_data: 'cmd_search' }]
                    ]
                }
            });
            
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Article view error:', error);
            await ctx.answerCbQuery('❌ Error loading article');
        }
    }
    
    /**
     * Send interactive help menu using centralized configuration
     */
    async sendHelpMenu(ctx) {
        try {
            const helpMenu = getHelpMenu();
            await ctx.reply(helpMenu.text, {
                parse_mode: helpMenu.parse_mode,
                reply_markup: helpMenu.reply_markup
            });
        } catch (error) {
            console.error('Error sending help menu:', error);
            await ctx.reply('❌ Error showing help. Please try again.');
        }
    }
    
    /**
     * Handle settings menu callback
     */
    async handleSettingsMenu(ctx) {
        await ctx.answerCbQuery();
        await ctx.reply(
            '⚙️ **Settings**\n\n' +
            'Configure your bot preferences:\n\n' +
            '🔔 **Notifications** - Alert preferences\n' +
            '📢 **Channels** - Manage subscriptions\n' +
            '🌐 **Language** - Select language\n' +
            '📊 **Analytics** - Data preferences',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔔 Notifications', callback_data: 'settings_notifications' }],
                        [{ text: '📢 Channels', callback_data: 'settings_channels' }],
                        [{ text: '🌐 Language', callback_data: 'settings_language' }],
                        [{ text: '📊 Analytics', callback_data: 'settings_analytics' }],
                        [getBackButton()]
                    ]
                }
            }
        );
    }
    
    /**
     * Handle language settings
     */
    async handleLanguageSettings(ctx) {
        await ctx.answerCbQuery();
        await ctx.reply(
            '🌐 **Language Settings**\n\n' +
            'Select your preferred language:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
                        [{ text: '🇪🇸 Spanish', callback_data: 'lang_es' }],
                        [{ text: '🇫🇷 French', callback_data: 'lang_fr' }],
                        [getBackButton('settings_menu')]
                    ]
                }
            }
        );
    }
    
    /**
     * Handle analytics settings
     */
    async handleAnalyticsSettings(ctx) {
        await ctx.answerCbQuery();
        await ctx.reply(
            '📊 **Analytics Settings**\n\n' +
            'Configure your data preferences:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📊 Enable Analytics', callback_data: 'analytics_on' }],
                        [{ text: '🚫 Disable Analytics', callback_data: 'analytics_off' }],
                        [getBackButton('settings_menu')]
                    ]
                }
            }
        );
    }
    
    /**
     * Handle post command
     */
    async handlePostCommand(ctx) {
        await ctx.answerCbQuery();
        if (this.postCommands) {
            await this.postCommands.handlePostCommand(ctx);
        } else {
            await this.handlePostNotAvailable(ctx);
        }
    }
    
    /**
     * Handle post not available
     */
    async handlePostNotAvailable(ctx) {
        await ctx.reply(
            '📝 **Post Feature**\n\n' +
            'This feature is available for authorized users only.\n' +
            'Contact admin for posting rights.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [getBackButton()]
                    ]
                }
            }
        );
    }
    
    /**
     * Handle legacy article reactions (for backward compatibility)
     */
    async handleLegacyReaction(ctx) {
        const data = ctx.callbackQuery.data;
        const [, articleId, reactionType] = data.split(':');
        try {
            await this.db.collection('news_articles').updateOne(
                { _id: require('mongodb').ObjectId(articleId) },
                { $inc: { [`reactions.${reactionType}`]: 1 } }
            );
            const emoji = reactionType === 'like' ? '👍' : reactionType === 'love' ? '❤️' : '🔥';
            await ctx.answerCbQuery(`✅ ${emoji} reaction added!`);
        } catch (error) {
            console.error('Reaction error:', error);
            await ctx.answerCbQuery('❌ Error adding reaction');
        }
    }
    
    async handleOtherCallbacks(ctx, data) {
        await ctx.answerCbQuery();
        
        // Note: persist_ callbacks are handled by EmojiReactionHandler via callback routes
        
        // Legacy reaction handling for backward compatibility
        if (data.startsWith('react:')) {
            // Handle old-style article reactions (for backward compatibility)
            const [, articleId, reactionType] = data.split(':');
            try {
                await this.db.collection('news_articles').updateOne(
                    { _id: require('mongodb').ObjectId(articleId) },
                    { $inc: { [`reactions.${reactionType}`]: 1 } }
                );
                await ctx.answerCbQuery(`✅ ${reactionType === 'like' ? '👍' : reactionType === 'love' ? '❤️' : '🔥'} reaction added!`);
            } catch (error) {
                console.error('Reaction error:', error);
                await ctx.answerCbQuery('❌ Error adding reaction');
            }
        } else {
            // Unknown callback
            console.warn('Unknown callback data:', data);
            await ctx.answerCbQuery('🔜 Feature coming soon!');
        }
    }
    
    /**
     * Setup Zone News sync commands
     */
    setupZoneSyncCommands() {
        // Command: /synczone - Auto-detect and forward new Zone News messages
        this.bot.command('synczone', async (ctx) => {
            try {
                const userId = ctx.from.id;
                
                // Check admin permissions
                if (!this.isAdmin(userId)) {
                    return ctx.reply('❌ Admin access required for Zone News sync');
                }

                await ctx.reply('🔍 Checking for new Zone News messages...');

                // Get last synced message ID from database
                const db = this.db.getDatabase ? this.db.getDatabase() : this.db;
                const lastSync = await db
                    .collection('zone_tbc_sync_mapping')
                    .findOne({}, { sort: { zone_message_id: -1 } });
                
                const lastSyncedId = lastSync ? lastSync.zone_message_id : 527;
                
                // Check for new messages (up to 10)
                const messagesToCheck = [];
                for (let i = 1; i <= 10; i++) {
                    messagesToCheck.push(lastSyncedId + i);
                }
                
                await ctx.reply(`📍 Last synced: ${lastSyncedId}\n🔍 Checking messages: ${messagesToCheck.slice(0, 5).join(', ')}...`);
                
                // For now, provide instructions for manual sync
                await ctx.reply(
                    `📋 **Manual Sync Instructions:**\n\n` +
                    `Run the auto-forward script on the server:\n` +
                    `\`cd /root/zone-news-monorepo/apps/bot\`\n` +
                    `\`node auto-forward-zone-news.js\`\n\n` +
                    `This will detect and forward new messages automatically.`,
                    { parse_mode: 'Markdown' }
                );
                
            } catch (error) {
                console.error('Sync error:', error);
                await ctx.reply('❌ Error syncing Zone News messages');
            }
        });

        // Command: /checkzone - Check for pending Zone News messages
        this.bot.command('checkzone', async (ctx) => {
            try {
                const userId = ctx.from.id;
                
                if (!this.isAdmin(userId)) {
                    return ctx.reply('❌ Admin access required');
                }

                const db = this.db.getDatabase ? this.db.getDatabase() : this.db;
                const lastSync = await db
                    .collection('zone_tbc_sync_mapping')
                    .findOne({}, { sort: { zone_message_id: -1 } });
                
                const lastSyncedId = lastSync ? lastSync.zone_message_id : 527;
                
                // Count total synced messages
                const totalSynced = await db
                    .collection('zone_tbc_sync_mapping')
                    .countDocuments();
                
                await ctx.reply(
                    `📊 **Zone News Sync Status:**\n\n` +
                    `Last synced message: ${lastSyncedId}\n` +
                    `Total synced messages: ${totalSynced}\n` +
                    `Next message to check: ${lastSyncedId + 1}\n\n` +
                    `Use /synczone to forward new messages`,
                    { parse_mode: 'Markdown' }
                );
                
            } catch (error) {
                console.error('Check error:', error);
                await ctx.reply('❌ Error checking sync status');
            }
        });

        // Command: /forwardzone <message_ids> - Forward specific Zone News messages
        this.bot.command('forwardzone', async (ctx) => {
            try {
                const userId = ctx.from.id;
                
                if (!this.isAdmin(userId)) {
                    return ctx.reply('❌ Admin access required');
                }

                const args = ctx.message.text.split(' ').slice(1);
                if (args.length === 0) {
                    return ctx.reply(
                        '📝 **Usage:** /forwardzone <message_ids>\n' +
                        'Example: /forwardzone 528 529 530\n\n' +
                        'This will forward the specified Zone News messages to TBC.',
                        { parse_mode: 'Markdown' }
                    );
                }

                const messageIds = args.map(id => parseInt(id)).filter(id => !isNaN(id));
                if (messageIds.length === 0) {
                    return ctx.reply('❌ Please provide valid message IDs');
                }

                await ctx.reply(
                    `🚀 To forward messages ${messageIds.join(', ')}:\n\n` +
                    `Run on server:\n` +
                    `\`cd /root/zone-news-monorepo/apps/bot\`\n` +
                    `\`node forward-zone-messages.js ${messageIds.join(' ')}\``,
                    { parse_mode: 'Markdown' }
                );
                
            } catch (error) {
                console.error('Forward error:', error);
                await ctx.reply('❌ Error forwarding messages');
            }
        });

        console.log('✅ Zone News sync commands initialized');
    }
    
    /**
     * Check if user is admin
     */
    isAdmin(userId) {
        const adminIds = [
            7802629063,  // @dukexotic
            // Add other admin IDs as needed
        ];
        return adminIds.includes(userId);
    }
}

module.exports = CommandRegistry;
