/**
 * Message Handlers - Comprehensive message processing for Zone News Bot
 * 
 * Handles all non-command messages:
 * - Forward message processing
 * - Text message processing  
 * - Media handling
 * - Inline queries
 * - Context management
 * 
 * @version 1.0.0
 * @author Zone News Bot Team
 */

const { ObjectId } = require('mongodb');
const PostManager = require('./post-manager');
const LocalReactionSync = require('./local-reaction-sync');

/**
 * Message Handlers Service
 * Production-ready message processing with comprehensive error handling
 */
class MessageHandlers {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.postManager = new PostManager(bot, db);
        this.reactionSync = new LocalReactionSync(bot, db);
        
        // Rate limiting maps
        this.userMessageCounts = new Map();
        this.spamDetection = new Map();
        
        // Context tracking
        this.userContexts = new Map();
        
        // Statistics
        this.stats = {
            messagesProcessed: 0,
            forwardsProcessed: 0,
            mediaProcessed: 0,
            inlineQueries: 0,
            spamBlocked: 0,
            errorsHandled: 0
        };
        
        console.log('✅ Message Handlers initialized');
    }

    /**
     * Register all message handlers
     */
    register() {
        try {
            // Text message handling
            this.bot.on('text', (ctx) => this.handleTextMessage(ctx));
            
            // Forward message handling
            this.bot.on('message', (ctx) => {
                if (ctx.message.forward_from || ctx.message.forward_from_chat) {
                    return this.handleForwardedMessage(ctx);
                }
            });
            
            // Media message handling
            this.bot.on(['photo', 'video', 'document', 'voice', 'audio'], (ctx) => 
                this.handleMediaMessage(ctx));
            
            // Sticker handling
            this.bot.on('sticker', (ctx) => this.handleStickerMessage(ctx));
            
            // Inline query handling
            this.bot.on('inline_query', (ctx) => this.handleInlineQuery(ctx));
            
            // Location handling
            this.bot.on('location', (ctx) => this.handleLocationMessage(ctx));
            
            // Contact handling  
            this.bot.on('contact', (ctx) => this.handleContactMessage(ctx));
            
            // Poll handling
            this.bot.on('poll', (ctx) => this.handlePollMessage(ctx));
            
            // New chat members
            this.bot.on('new_chat_members', (ctx) => this.handleNewChatMembers(ctx));
            
            // Left chat member
            this.bot.on('left_chat_member', (ctx) => this.handleLeftChatMember(ctx));
            
            // My chat member status changes (bot added/removed/promoted)
            this.bot.on('my_chat_member', (ctx) => this.handleMyChatMemberUpdate(ctx));
            
            console.log('✅ Message handlers registered');
            
        } catch (error) {
            console.error('❌ Failed to register message handlers:', error);
            this.stats.errorsHandled++;
        }
    }

    /**
     * Handle text messages with natural language processing
     * @param {Object} ctx - Telegraf context
     */
    async handleTextMessage(ctx) {
        try {
            // Pre-processing checks
            if (!await this.preprocessMessage(ctx)) {
                return;
            }
            
            const text = ctx.message.text.toLowerCase().trim();
            const userId = ctx.from.id;
            const chatType = ctx.chat.type;
            
            // Track user activity
            await this.trackUserActivity(ctx);
            
            // Natural language command detection
            if (await this.processNaturalLanguageCommand(ctx, text)) {
                return;
            }
            
            // URL extraction and processing
            if (await this.processUrlsInMessage(ctx, text)) {
                return;
            }
            
            // Search query detection
            if (await this.processSearchQuery(ctx, text)) {
                return;
            }
            
            // Context-aware responses
            await this.processContextualResponse(ctx, text);
            
            this.stats.messagesProcessed++;
            
        } catch (error) {
            console.error('Text message handling error:', error);
            await this.handleError(ctx, error, 'text_message');
        }
    }

    /**
     * Handle forwarded messages from channels/groups
     * @param {Object} ctx - Telegraf context
     */
    async handleForwardedMessage(ctx) {
        try {
            if (!await this.preprocessMessage(ctx)) {
                return;
            }
            
            const message = ctx.message;
            const userId = ctx.from.id;
            
            // Only process forwards in private chats
            if (ctx.chat.type !== 'private') {
                return;
            }
            
            // Extract forward information
            const forwardInfo = await this.extractForwardInfo(message);
            if (!forwardInfo) {
                return;
            }
            
            // Check if user is admin
            const isAdmin = await this.checkUserAdminStatus(userId);
            if (!isAdmin) {
                await ctx.reply(
                    '🔐 Forward processing is available for administrators only.\n\n' +
                    'Use /help to see available commands for regular users.',
                    { reply_to_message_id: message.message_id }
                );
                return;
            }
            
            // Process the forwarded content
            const processedContent = await this.processForwardedContent(message, forwardInfo);
            
            // Auto-add destination if new
            const destination = await this.autoAddDestination(forwardInfo, userId);
            
            // Show forward processing options
            await this.showForwardOptions(ctx, processedContent, destination, forwardInfo);
            
            this.stats.forwardsProcessed++;
            
        } catch (error) {
            console.error('Forward message handling error:', error);
            await this.handleError(ctx, error, 'forward_message');
        }
    }

    /**
     * Handle media messages (photos, videos, documents, etc.)
     * @param {Object} ctx - Telegraf context
     */
    async handleMediaMessage(ctx) {
        try {
            if (!await this.preprocessMessage(ctx)) {
                return;
            }
            
            const message = ctx.message;
            const userId = ctx.from.id;
            const mediaType = this.getMediaType(message);
            
            // Track user activity
            await this.trackUserActivity(ctx);
            
            // Process different media types
            let processedMedia;
            switch (mediaType) {
                case 'photo':
                    processedMedia = await this.processPhotoMessage(message);
                    break;
                case 'video':
                    processedMedia = await this.processVideoMessage(message);
                    break;
                case 'document':
                    processedMedia = await this.processDocumentMessage(message);
                    break;
                case 'voice':
                    processedMedia = await this.processVoiceMessage(message);
                    break;
                case 'audio':
                    processedMedia = await this.processAudioMessage(message);
                    break;
                default:
                    console.log('Unknown media type:', mediaType);
                    return;
            }
            
            // Handle caption processing
            if (message.caption) {
                await this.processCaptionText(ctx, message.caption, processedMedia);
            }
            
            // Show media processing result
            await this.showMediaProcessingResult(ctx, processedMedia, mediaType);
            
            this.stats.mediaProcessed++;
            
        } catch (error) {
            console.error('Media message handling error:', error);
            await this.handleError(ctx, error, 'media_message');
        }
    }

    /**
     * Handle sticker messages for reaction tracking
     * @param {Object} ctx - Telegraf context  
     */
    async handleStickerMessage(ctx) {
        try {
            if (!await this.preprocessMessage(ctx)) {
                return;
            }
            
            const sticker = ctx.message.sticker;
            const userId = ctx.from.id;
            
            // Track sticker reactions for analytics
            await this.trackStickerReaction(userId, sticker, ctx.chat);
            
            // Respond to common reaction stickers
            await this.respondToReactionSticker(ctx, sticker);
            
        } catch (error) {
            console.error('Sticker message handling error:', error);
            await this.handleError(ctx, error, 'sticker_message');
        }
    }

    /**
     * Handle inline queries for article sharing
     * @param {Object} ctx - Telegraf context
     */
    async handleInlineQuery(ctx) {
        try {
            const query = ctx.inlineQuery.query.toLowerCase().trim();
            const userId = ctx.from.id;
            const queryId = ctx.inlineQuery.id;
            
            // Rate limiting for inline queries
            if (!await this.checkInlineQueryRateLimit(userId)) {
                return;
            }
            
            let results = [];
            
            if (query === '' || query.length < 2) {
                // Show trending articles for empty/short queries
                results = await this.getTrendingInlineResults();
            } else if (query.startsWith('cat:')) {
                // Category browsing: @bot cat:tech
                const category = query.replace('cat:', '').trim();
                results = await this.getCategoryInlineResults(category);
            } else {
                // Search articles: @bot climate change
                results = await this.getSearchInlineResults(query);
            }
            
            // Answer inline query
            await ctx.answerInlineQuery(results, {
                cache_time: 300, // 5 minutes
                is_personal: true,
                next_offset: results.length >= 50 ? '50' : '',
                switch_pm_text: 'Open Zone News Bot',
                switch_pm_parameter: 'inline_search'
            });
            
            // Log inline query for analytics
            await this.logInlineQuery(userId, query, results.length);
            
            this.stats.inlineQueries++;
            
        } catch (error) {
            console.error('Inline query handling error:', error);
            await ctx.answerInlineQuery([], { cache_time: 60 });
            this.stats.errorsHandled++;
        }
    }

    /**
     * Handle location messages
     * @param {Object} ctx - Telegraf context
     */
    async handleLocationMessage(ctx) {
        try {
            if (!await this.preprocessMessage(ctx)) {
                return;
            }
            
            const location = ctx.message.location;
            const userId = ctx.from.id;
            
            // Store user location for local news preferences
            await this.storeUserLocation(userId, location);
            
            // Show local news options
            await this.showLocalNewsOptions(ctx, location);
            
        } catch (error) {
            console.error('Location message handling error:', error);
            await this.handleError(ctx, error, 'location_message');
        }
    }

    /**
     * Handle contact messages
     * @param {Object} ctx - Telegraf context
     */
    async handleContactMessage(ctx) {
        try {
            if (!await this.preprocessMessage(ctx)) {
                return;
            }
            
            const contact = ctx.message.contact;
            
            // Process contact sharing for support or feedback
            await this.processContactShare(ctx, contact);
            
        } catch (error) {
            console.error('Contact message handling error:', error);
            await this.handleError(ctx, error, 'contact_message');
        }
    }

    /**
     * Handle poll messages
     * @param {Object} ctx - Telegraf context
     */
    async handlePollMessage(ctx) {
        try {
            if (!await this.preprocessMessage(ctx)) {
                return;
            }
            
            const poll = ctx.message.poll;
            
            // Process poll for engagement tracking
            await this.processPollEngagement(ctx, poll);
            
        } catch (error) {
            console.error('Poll message handling error:', error);
            await this.handleError(ctx, error, 'poll_message');
        }
    }

    /**
     * Handle new chat members
     * @param {Object} ctx - Telegraf context
     */
    async handleNewChatMembers(ctx) {
        try {
            const newMembers = ctx.message.new_chat_members;
            const chat = ctx.chat;
            
            // Check if bot was added
            const botAdded = newMembers.some(member => member.id === this.bot.botInfo.id);
            
            if (botAdded) {
                await this.handleBotAddedToChat(ctx, chat);
            } else {
                await this.handleNewMembersJoined(ctx, newMembers, chat);
            }
            
        } catch (error) {
            console.error('New chat members handling error:', error);
            await this.handleError(ctx, error, 'new_members');
        }
    }

    /**
     * Handle left chat member
     * @param {Object} ctx - Telegraf context
     */
    async handleLeftChatMember(ctx) {
        try {
            const leftMember = ctx.message.left_chat_member;
            const chat = ctx.chat;
            
            // Check if bot was removed
            if (leftMember.id === this.bot.botInfo.id) {
                await this.handleBotRemovedFromChat(ctx, chat);
            }
            
        } catch (error) {
            console.error('Left chat member handling error:', error);
            await this.handleError(ctx, error, 'left_member');
        }
    }

    /**
     * Pre-processing checks for all messages
     * @param {Object} ctx - Telegraf context
     * @returns {boolean} Whether to continue processing
     */
    async preprocessMessage(ctx) {
        try {
            // Rate limiting check
            if (!await this.checkRateLimit(ctx)) {
                return false;
            }
            
            // Spam detection
            if (await this.detectSpam(ctx)) {
                this.stats.spamBlocked++;
                return false;
            }
            
            // Check if message is too old (avoid processing old messages on startup)
            const messageAge = Date.now() - (ctx.message.date * 1000);
            if (messageAge > 5 * 60 * 1000) { // 5 minutes
                return false;
            }
            
            return true;
            
        } catch (error) {
            console.error('Message preprocessing error:', error);
            return false;
        }
    }

    /**
     * Track user activity and update last_active
     * @param {Object} ctx - Telegraf context
     */
    async trackUserActivity(ctx) {
        try {
            const userId = ctx.from.id;
            const username = ctx.from.username;
            const chatType = ctx.chat.type;
            
            // Update user document with last activity
            await this.db.collection('users').updateOne(
                { telegram_id: userId },
                {
                    $set: {
                        last_active: new Date(),
                        username: username || null,
                        first_name: ctx.from.first_name || null,
                        last_name: ctx.from.last_name || null,
                        language_code: ctx.from.language_code || 'en'
                    },
                    $setOnInsert: {
                        created_at: new Date(),
                        preferences: {
                            notifications: true,
                            categories: [],
                            timezone: 'Australia/Adelaide'
                        },
                        stats: {
                            messages_sent: 0,
                            articles_read: 0,
                            reactions_given: 0
                        }
                    },
                    $inc: {
                        'stats.messages_sent': 1
                    }
                },
                { upsert: true }
            );
            
            // Track chat interaction if not private
            if (chatType !== 'private') {
                await this.db.collection('user_chat_interactions').updateOne(
                    { 
                        user_id: userId,
                        chat_id: ctx.chat.id 
                    },
                    {
                        $set: {
                            last_interaction: new Date(),
                            chat_title: ctx.chat.title || null,
                            chat_type: chatType
                        },
                        $inc: { interaction_count: 1 },
                        $setOnInsert: { first_interaction: new Date() }
                    },
                    { upsert: true }
                );
            }
            
        } catch (error) {
            console.error('User activity tracking error:', error);
        }
    }

    /**
     * Process natural language commands
     * @param {Object} ctx - Telegraf context
     * @param {string} text - Message text
     * @returns {boolean} Whether command was processed
     */
    async processNaturalLanguageCommand(ctx, text) {
        try {
            // News-related queries
            if (text.includes('news') || text.includes('latest') || text.includes('update')) {
                if (text.includes('tech') || text.includes('technology')) {
                    await this.showCategoryNews(ctx, 'technology');
                    return true;
                } else if (text.includes('sport') || text.includes('sports')) {
                    await this.showCategoryNews(ctx, 'sports');
                    return true;
                } else if (text.includes('business') || text.includes('finance')) {
                    await this.showCategoryNews(ctx, 'business');
                    return true;
                } else {
                    await this.showLatestNews(ctx);
                    return true;
                }
            }
            
            // Help queries
            if (text.includes('help') || text.includes('how') || text.includes('what can')) {
                await this.showHelp(ctx);
                return true;
            }
            
            // Search queries
            if (text.startsWith('search ') || text.startsWith('find ')) {
                const searchTerm = text.replace(/^(search|find)\s+/, '');
                await this.performSearch(ctx, searchTerm);
                return true;
            }
            
            // Subscription queries
            if (text.includes('subscribe') || text.includes('follow')) {
                await this.showSubscriptionOptions(ctx);
                return true;
            }
            
            // Trending queries
            if (text.includes('trending') || text.includes('popular') || text.includes('hot')) {
                await this.showTrendingNews(ctx);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('Natural language command processing error:', error);
            return false;
        }
    }

    /**
     * Process URLs found in messages
     * @param {Object} ctx - Telegraf context
     * @param {string} text - Message text
     * @returns {boolean} Whether URLs were processed
     */
    async processUrlsInMessage(ctx, text) {
        try {
            // Extract URLs using regex
            const urlRegex = /(https?:\/\/[^\s]+)/gi;
            const urls = text.match(urlRegex);
            
            if (!urls || urls.length === 0) {
                return false;
            }
            
            // Check if user is admin for URL processing
            const userId = ctx.from.id;
            const isAdmin = await this.checkUserAdminStatus(userId);
            
            if (!isAdmin) {
                // For regular users, just acknowledge the URL
                if (urls.length === 1) {
                    await ctx.reply('🔗 I see you shared a link! Use /help to see what I can do.');
                } else {
                    await ctx.reply(`🔗 I see you shared ${urls.length} links! Use /help to see what I can do.`);
                }
                return true;
            }
            
            // Process URLs for admins
            const processedUrls = [];
            for (const url of urls) {
                const processed = await this.processUrl(url);
                if (processed) {
                    processedUrls.push(processed);
                }
            }
            
            if (processedUrls.length > 0) {
                await this.showUrlProcessingResults(ctx, processedUrls);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('URL processing error:', error);
            return false;
        }
    }

    /**
     * Process search queries in plain text
     * @param {Object} ctx - Telegraf context
     * @param {string} text - Message text
     * @returns {boolean} Whether search was performed
     */
    async processSearchQuery(ctx, text) {
        try {
            // Detect if text looks like a search query
            const searchIndicators = [
                text.split(' ').length >= 2 && text.split(' ').length <= 5,
                !text.includes('?') && !text.includes('!'),
                text.length > 5 && text.length < 50,
                !text.includes('http'),
                !text.includes('@')
            ];
            
            const isSearchQuery = searchIndicators.filter(Boolean).length >= 3;
            
            if (isSearchQuery && ctx.chat.type === 'private') {
                // Show search suggestion
                await ctx.reply(
                    `🔍 Searching for "${text}"...\n\n` +
                    'Use /search command for more detailed search options.',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '🔍 Search Articles', callback_data: `search:${text}` },
                                    { text: '📰 Browse News', callback_data: 'news:browse' }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('Search query processing error:', error);
            return false;
        }
    }

    /**
     * Process contextual responses based on chat history
     * @param {Object} ctx - Telegraf context
     * @param {string} text - Message text
     */
    async processContextualResponse(ctx, text) {
        try {
            const userId = ctx.from.id;
            const chatType = ctx.chat.type;
            
            // Only provide contextual responses in private chats
            if (chatType !== 'private') {
                return;
            }
            
            // Get user context
            const userContext = this.userContexts.get(userId) || { lastCommand: null, waitingFor: null };
            
            // Context-specific responses
            if (userContext.waitingFor === 'feedback') {
                await this.processFeedbackResponse(ctx, text);
                this.userContexts.delete(userId);
                return;
            }
            
            if (userContext.waitingFor === 'report') {
                await this.processReportResponse(ctx, text);
                this.userContexts.delete(userId);
                return;
            }
            
            // General contextual responses
            if (text.includes('thank') || text.includes('thanks')) {
                await ctx.reply('You\'re welcome! 😊 Let me know if you need anything else.');
                return;
            }
            
            if (text.includes('good') || text.includes('great') || text.includes('awesome')) {
                await ctx.reply('Glad you like it! 🎉 Don\'t forget to check out the latest news with /news');
                return;
            }
            
            // Default response for unrecognised text
            await ctx.reply(
                '🤔 I\'m not sure what you mean. Here are some things I can help with:',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📰 Latest News', callback_data: 'news:latest' },
                                { text: '🔍 Search', callback_data: 'search:show' }
                            ],
                            [
                                { text: '📊 Trending', callback_data: 'news:trending' },
                                { text: '❓ Help', callback_data: 'help:main' }
                            ]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Contextual response processing error:', error);
        }
    }

    /**
     * Extract forward information from message
     * @param {Object} message - Telegram message object
     * @returns {Object|null} Forward information
     */
    async extractForwardInfo(message) {
        try {
            let forwardInfo = null;
            
            if (message.forward_from_chat) {
                // Forwarded from channel/group
                const chat = message.forward_from_chat;
                forwardInfo = {
                    type: chat.type === 'channel' ? 'channel' : 'group',
                    id: chat.id,
                    title: chat.title,
                    username: chat.username || null,
                    messageId: message.forward_from_message_id || null,
                    date: message.forward_date
                };
            } else if (message.forward_from) {
                // Forwarded from user
                const user = message.forward_from;
                forwardInfo = {
                    type: 'user',
                    id: user.id,
                    firstName: user.first_name,
                    lastName: user.last_name || null,
                    username: user.username || null,
                    date: message.forward_date
                };
            }
            
            return forwardInfo;
            
        } catch (error) {
            console.error('Extract forward info error:', error);
            return null;
        }
    }

    /**
     * Process forwarded content for article creation
     * @param {Object} message - Telegram message object
     * @param {Object} forwardInfo - Forward information
     * @returns {Object} Processed content
     */
    async processForwardedContent(message, forwardInfo) {
        try {
            const content = {
                text: message.text || message.caption || '',
                entities: message.entities || message.caption_entities || [],
                hasMedia: false,
                mediaType: null,
                mediaInfo: null,
                urls: [],
                hashtags: [],
                mentions: []
            };
            
            // Extract URLs from entities
            if (content.entities) {
                content.entities.forEach(entity => {
                    if (entity.type === 'url') {
                        const url = content.text.substring(entity.offset, entity.offset + entity.length);
                        content.urls.push(url);
                    } else if (entity.type === 'hashtag') {
                        const hashtag = content.text.substring(entity.offset, entity.offset + entity.length);
                        content.hashtags.push(hashtag);
                    } else if (entity.type === 'mention') {
                        const mention = content.text.substring(entity.offset, entity.offset + entity.length);
                        content.mentions.push(mention);
                    }
                });
            }
            
            // Check for media
            if (message.photo) {
                content.hasMedia = true;
                content.mediaType = 'photo';
                content.mediaInfo = {
                    fileId: message.photo[message.photo.length - 1].file_id,
                    sizes: message.photo.map(p => ({ width: p.width, height: p.height }))
                };
            } else if (message.video) {
                content.hasMedia = true;
                content.mediaType = 'video';
                content.mediaInfo = {
                    fileId: message.video.file_id,
                    duration: message.video.duration,
                    width: message.video.width,
                    height: message.video.height
                };
            } else if (message.document) {
                content.hasMedia = true;
                content.mediaType = 'document';
                content.mediaInfo = {
                    fileId: message.document.file_id,
                    fileName: message.document.file_name,
                    mimeType: message.document.mime_type,
                    fileSize: message.document.file_size
                };
            }
            
            return content;
            
        } catch (error) {
            console.error('Process forwarded content error:', error);
            return null;
        }
    }

    /**
     * Auto-add new destination from forward info
     * @param {Object} forwardInfo - Forward information
     * @param {number} userId - User ID who forwarded
     * @returns {Object} Destination document
     */
    async autoAddDestination(forwardInfo, userId) {
        try {
            if (forwardInfo.type === 'user') {
                return null; // Don't auto-add user forwards
            }
            
            // Check if destination already exists
            let destination = await this.db.collection('destinations').findOne({
                id: forwardInfo.id.toString()
            });
            
            if (!destination) {
                // Create new destination
                destination = {
                    id: forwardInfo.id.toString(),
                    name: forwardInfo.title,
                    username: forwardInfo.username,
                    type: forwardInfo.type,
                    active: true,
                    added_by: userId,
                    added_at: new Date(),
                    auto_added: true,
                    last_used: new Date(),
                    post_count: 0,
                    source: 'forward_auto_add'
                };
                
                const result = await this.db.collection('destinations').insertOne(destination);
                destination._id = result.insertedId;
                
                console.log(`✅ Auto-added destination: ${forwardInfo.title} (${forwardInfo.type})`);
            } else {
                // Update existing destination
                await this.db.collection('destinations').updateOne(
                    { _id: destination._id },
                    {
                        $set: {
                            last_used: new Date(),
                            name: forwardInfo.title, // Update name in case it changed
                            username: forwardInfo.username
                        }
                    }
                );
            }
            
            return destination;
            
        } catch (error) {
            console.error('Auto-add destination error:', error);
            return null;
        }
    }

    /**
     * Show forward processing options
     * @param {Object} ctx - Telegraf context
     * @param {Object} content - Processed content
     * @param {Object} destination - Destination info
     * @param {Object} forwardInfo - Forward information
     */
    async showForwardOptions(ctx, content, destination, forwardInfo) {
        try {
            const sourceInfo = forwardInfo.type === 'channel' ? 
                `📢 ${forwardInfo.title} ${forwardInfo.username ? `(@${forwardInfo.username})` : ''}` :
                `👥 ${forwardInfo.title}`;
            
            let message = `📨 **Forward Detected**\n\n`;
            message += `**Source**: ${sourceInfo}\n`;
            message += `**Date**: ${new Date(forwardInfo.date * 1000).toLocaleString('en-AU')}\n\n`;
            
            if (content.text) {
                const preview = content.text.length > 200 ? 
                    content.text.substring(0, 200) + '...' : 
                    content.text;
                message += `**Content Preview**:\n${preview}\n\n`;
            }
            
            if (content.hasMedia) {
                message += `**Media**: ${content.mediaType}\n\n`;
            }
            
            if (content.urls.length > 0) {
                message += `**URLs Found**: ${content.urls.length}\n\n`;
            }
            
            if (destination) {
                message += `**Destination**: ${destination.auto_added ? '🆕 Auto-added' : '✅ Existing'}\n\n`;
            }
            
            message += `**What would you like to do?**`;
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📰 Create Article', callback_data: `forward:create:${forwardInfo.id}` },
                        { text: '📋 Extract Info', callback_data: `forward:extract:${forwardInfo.id}` }
                    ],
                    [
                        { text: '📤 Add to Queue', callback_data: `forward:queue:${forwardInfo.id}` },
                        { text: '🔗 Process URLs', callback_data: `forward:urls:${forwardInfo.id}` }
                    ],
                    [
                        { text: '❌ Dismiss', callback_data: 'forward:dismiss' }
                    ]
                ]
            };
            
            // Store forward data for callback processing
            const forwardKey = `forward_${ctx.from.id}_${Date.now()}`;
            await this.db.collection('temp_forwards').insertOne({
                _id: forwardKey,
                user_id: ctx.from.id,
                forward_info: forwardInfo,
                content: content,
                destination: destination,
                created_at: new Date(),
                expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
            });
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Show forward options error:', error);
            await ctx.reply('❌ Error processing forward. Please try again.');
        }
    }

    /**
     * Get media type from message
     * @param {Object} message - Telegram message object
     * @returns {string} Media type
     */
    getMediaType(message) {
        if (message.photo) return 'photo';
        if (message.video) return 'video';
        if (message.document) return 'document';
        if (message.voice) return 'voice';
        if (message.audio) return 'audio';
        if (message.animation) return 'animation';
        return 'unknown';
    }

    /**
     * Process photo message
     * @param {Object} message - Telegram message object
     * @returns {Object} Processed photo info
     */
    async processPhotoMessage(message) {
        try {
            const photo = message.photo[message.photo.length - 1]; // Highest resolution
            
            return {
                type: 'photo',
                fileId: photo.file_id,
                width: photo.width,
                height: photo.height,
                fileSize: photo.file_size || null,
                hasCaption: !!message.caption,
                caption: message.caption || null
            };
            
        } catch (error) {
            console.error('Process photo message error:', error);
            return null;
        }
    }

    /**
     * Process video message
     * @param {Object} message - Telegram message object
     * @returns {Object} Processed video info
     */
    async processVideoMessage(message) {
        try {
            const video = message.video;
            
            return {
                type: 'video',
                fileId: video.file_id,
                width: video.width,
                height: video.height,
                duration: video.duration,
                fileSize: video.file_size || null,
                mimeType: video.mime_type || null,
                hasCaption: !!message.caption,
                caption: message.caption || null
            };
            
        } catch (error) {
            console.error('Process video message error:', error);
            return null;
        }
    }

    /**
     * Process document message
     * @param {Object} message - Telegram message object
     * @returns {Object} Processed document info
     */
    async processDocumentMessage(message) {
        try {
            const document = message.document;
            
            return {
                type: 'document',
                fileId: document.file_id,
                fileName: document.file_name || 'Unknown',
                mimeType: document.mime_type || null,
                fileSize: document.file_size || null,
                hasCaption: !!message.caption,
                caption: message.caption || null
            };
            
        } catch (error) {
            console.error('Process document message error:', error);
            return null;
        }
    }

    /**
     * Process voice message
     * @param {Object} message - Telegram message object
     * @returns {Object} Processed voice info
     */
    async processVoiceMessage(message) {
        try {
            const voice = message.voice;
            
            return {
                type: 'voice',
                fileId: voice.file_id,
                duration: voice.duration,
                mimeType: voice.mime_type || null,
                fileSize: voice.file_size || null
            };
            
        } catch (error) {
            console.error('Process voice message error:', error);
            return null;
        }
    }

    /**
     * Process audio message
     * @param {Object} message - Telegram message object
     * @returns {Object} Processed audio info
     */
    async processAudioMessage(message) {
        try {
            const audio = message.audio;
            
            return {
                type: 'audio',
                fileId: audio.file_id,
                duration: audio.duration,
                performer: audio.performer || null,
                title: audio.title || null,
                mimeType: audio.mime_type || null,
                fileSize: audio.file_size || null
            };
            
        } catch (error) {
            console.error('Process audio message error:', error);
            return null;
        }
    }

    /**
     * Process caption text from media messages
     * @param {Object} ctx - Telegraf context
     * @param {string} caption - Caption text
     * @param {Object} mediaInfo - Media information
     */
    async processCaptionText(ctx, caption, mediaInfo) {
        try {
            // Process caption like regular text message
            await this.processNaturalLanguageCommand(ctx, caption.toLowerCase());
            
        } catch (error) {
            console.error('Process caption text error:', error);
        }
    }

    /**
     * Show media processing result
     * @param {Object} ctx - Telegraf context
     * @param {Object} mediaInfo - Processed media information
     * @param {string} mediaType - Media type
     */
    async showMediaProcessingResult(ctx, mediaInfo, mediaType) {
        try {
            if (!mediaInfo) return;
            
            const userId = ctx.from.id;
            const isAdmin = await this.checkUserAdminStatus(userId);
            
            if (isAdmin) {
                // Show admin media processing options
                let message = `📎 **${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} Received**\n\n`;
                
                if (mediaInfo.hasCaption) {
                    message += `**Caption**: ${mediaInfo.caption}\n\n`;
                }
                
                message += `**File Info**:\n`;
                if (mediaInfo.fileName) message += `• Name: ${mediaInfo.fileName}\n`;
                if (mediaInfo.fileSize) message += `• Size: ${(mediaInfo.fileSize / 1024 / 1024).toFixed(2)} MB\n`;
                if (mediaInfo.duration) message += `• Duration: ${mediaInfo.duration}s\n`;
                if (mediaInfo.width && mediaInfo.height) message += `• Resolution: ${mediaInfo.width}x${mediaInfo.height}\n`;
                
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📰 Use in Article', callback_data: `media:article:${mediaInfo.fileId}` },
                            { text: '💾 Save Media', callback_data: `media:save:${mediaInfo.fileId}` }
                        ],
                        [
                            { text: '🔗 Get Link', callback_data: `media:link:${mediaInfo.fileId}` },
                            { text: '❌ Dismiss', callback_data: 'media:dismiss' }
                        ]
                    ]
                };
                
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                // Simple acknowledgment for regular users
                const mediaEmojis = {
                    photo: '🖼️',
                    video: '🎥',
                    document: '📄',
                    voice: '🎙️',
                    audio: '🎵'
                };
                
                await ctx.reply(`${mediaEmojis[mediaType] || '📎'} Thanks for sharing! Use /help to see what I can do.`);
            }
            
        } catch (error) {
            console.error('Show media processing result error:', error);
        }
    }

    /**
     * Track sticker reactions for analytics
     * @param {number} userId - User ID
     * @param {Object} sticker - Sticker object
     * @param {Object} chat - Chat object
     */
    async trackStickerReaction(userId, sticker, chat) {
        try {
            await this.db.collection('sticker_reactions').insertOne({
                user_id: userId,
                sticker_file_id: sticker.file_id,
                sticker_emoji: sticker.emoji || null,
                sticker_set_name: sticker.set_name || null,
                chat_id: chat.id,
                chat_type: chat.type,
                created_at: new Date()
            });
            
        } catch (error) {
            console.error('Track sticker reaction error:', error);
        }
    }

    /**
     * Respond to reaction stickers
     * @param {Object} ctx - Telegraf context
     * @param {Object} sticker - Sticker object
     */
    async respondToReactionSticker(ctx, sticker) {
        try {
            const reactionEmojis = ['👍', '❤️', '😂', '😢', '😮', '😡'];
            
            if (sticker.emoji && reactionEmojis.includes(sticker.emoji)) {
                const responses = {
                    '👍': 'Glad you like it! 👍',
                    '❤️': 'Love you too! ❤️',
                    '😂': 'Haha! 😄',
                    '😢': 'Sorry to hear that 😔',
                    '😮': 'Wow indeed! 😮',
                    '😡': 'Let me know if something\'s wrong!'
                };
                
                await ctx.reply(responses[sticker.emoji]);
            }
            
        } catch (error) {
            console.error('Respond to reaction sticker error:', error);
        }
    }

    /**
     * Get trending articles for inline results
     * @returns {Array} Inline query results
     */
    async getTrendingInlineResults() {
        try {
            const trendingArticles = await this.db.collection('news_articles')
                .find({ 
                    published_date: { 
                        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                    } 
                })
                .sort({ 'total_reactions.like': -1, 'total_reactions.love': -1, 'total_reactions.fire': -1 })
                .limit(10)
                .toArray();
            
            return trendingArticles.map((article, index) => ({
                type: 'article',
                id: article._id.toString(),
                title: article.title,
                description: article.summary || article.content?.substring(0, 100) + '...',
                url: article.url || 'https://thezonenews.com',
                thumb_url: article.image_url || 'https://thezonenews.com/logo.png',
                input_message_content: {
                    message_text: `📰 **${article.title}**\n\n${article.summary || article.content?.substring(0, 300)}...\n\n🔥 Trending #${index + 1}\n📅 ${new Date(article.published_date).toLocaleDateString('en-AU')}\n🔗 [Read More](${article.url || 'https://thezonenews.com'})`,
                    parse_mode: 'Markdown'
                }
            }));
            
        } catch (error) {
            console.error('Get trending inline results error:', error);
            return [];
        }
    }

    /**
     * Get category articles for inline results
     * @param {string} category - Category name
     * @returns {Array} Inline query results
     */
    async getCategoryInlineResults(category) {
        try {
            const articles = await this.db.collection('news_articles')
                .find({ 
                    category: new RegExp(category, 'i'),
                    published_date: { 
                        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
                    }
                })
                .sort({ published_date: -1 })
                .limit(15)
                .toArray();
            
            return articles.map(article => ({
                type: 'article',
                id: article._id.toString(),
                title: article.title,
                description: `${article.category} • ${new Date(article.published_date).toLocaleDateString('en-AU')}`,
                url: article.url || 'https://thezonenews.com',
                thumb_url: article.image_url || 'https://thezonenews.com/logo.png',
                input_message_content: {
                    message_text: `📰 **${article.title}**\n\n${article.summary || article.content?.substring(0, 300)}...\n\n📂 ${article.category}\n📅 ${new Date(article.published_date).toLocaleDateString('en-AU')}\n🔗 [Read More](${article.url || 'https://thezonenews.com'})`,
                    parse_mode: 'Markdown'
                }
            }));
            
        } catch (error) {
            console.error('Get category inline results error:', error);
            return [];
        }
    }

    /**
     * Get search results for inline query
     * @param {string} query - Search query
     * @returns {Array} Inline query results
     */
    async getSearchInlineResults(query) {
        try {
            const articles = await this.db.collection('news_articles')
                .find({ 
                    $text: { $search: query },
                    published_date: { 
                        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                    }
                })
                .sort({ score: { $meta: 'textScore' }, published_date: -1 })
                .limit(20)
                .toArray();
            
            return articles.map(article => ({
                type: 'article',
                id: article._id.toString(),
                title: article.title,
                description: `${article.category || 'News'} • ${new Date(article.published_date).toLocaleDateString('en-AU')}`,
                url: article.url || 'https://thezonenews.com',
                thumb_url: article.image_url || 'https://thezonenews.com/logo.png',
                input_message_content: {
                    message_text: `📰 **${article.title}**\n\n${article.summary || article.content?.substring(0, 300)}...\n\n🔍 Found via search\n📂 ${article.category || 'News'}\n📅 ${new Date(article.published_date).toLocaleDateString('en-AU')}\n🔗 [Read More](${article.url || 'https://thezonenews.com'})`,
                    parse_mode: 'Markdown'
                }
            }));
            
        } catch (error) {
            console.error('Get search inline results error:', error);
            return [];
        }
    }

    /**
     * Log inline query for analytics
     * @param {number} userId - User ID
     * @param {string} query - Search query
     * @param {number} resultCount - Number of results
     */
    async logInlineQuery(userId, query, resultCount) {
        try {
            await this.db.collection('inline_queries').insertOne({
                user_id: userId,
                query: query,
                result_count: resultCount,
                created_at: new Date()
            });
            
        } catch (error) {
            console.error('Log inline query error:', error);
        }
    }

    /**
     * Check rate limit for messages
     * @param {Object} ctx - Telegraf context
     * @returns {boolean} Whether message should be processed
     */
    async checkRateLimit(ctx) {
        try {
            const userId = ctx.from.id;
            const now = Date.now();
            const timeWindow = 60 * 1000; // 1 minute
            const maxMessages = 30; // Max messages per minute
            
            if (!this.userMessageCounts.has(userId)) {
                this.userMessageCounts.set(userId, []);
            }
            
            const userMessages = this.userMessageCounts.get(userId);
            
            // Remove old messages outside time window
            const recentMessages = userMessages.filter(timestamp => now - timestamp < timeWindow);
            
            if (recentMessages.length >= maxMessages) {
                // Send rate limit warning only once per minute
                const lastWarning = recentMessages[0];
                if (now - lastWarning > timeWindow) {
                    await ctx.reply('⚠️ You\'re sending messages too quickly. Please slow down a bit.');
                }
                return false;
            }
            
            // Add current message timestamp
            recentMessages.push(now);
            this.userMessageCounts.set(userId, recentMessages);
            
            return true;
            
        } catch (error) {
            console.error('Rate limit check error:', error);
            return true; // Allow message on error
        }
    }

    /**
     * Check inline query rate limit
     * @param {number} userId - User ID
     * @returns {boolean} Whether query should be processed
     */
    async checkInlineQueryRateLimit(userId) {
        try {
            const now = Date.now();
            const timeWindow = 10 * 1000; // 10 seconds
            const maxQueries = 5; // Max queries per 10 seconds
            
            const key = `inline_${userId}`;
            if (!this.userMessageCounts.has(key)) {
                this.userMessageCounts.set(key, []);
            }
            
            const userQueries = this.userMessageCounts.get(key);
            
            // Remove old queries outside time window
            const recentQueries = userQueries.filter(timestamp => now - timestamp < timeWindow);
            
            if (recentQueries.length >= maxQueries) {
                return false;
            }
            
            // Add current query timestamp
            recentQueries.push(now);
            this.userMessageCounts.set(key, recentQueries);
            
            return true;
            
        } catch (error) {
            console.error('Inline query rate limit check error:', error);
            return true;
        }
    }

    /**
     * Detect spam messages
     * @param {Object} ctx - Telegraf context
     * @returns {boolean} Whether message is spam
     */
    async detectSpam(ctx) {
        try {
            const userId = ctx.from.id;
            const text = ctx.message.text || ctx.message.caption || '';
            
            // Simple spam detection rules
            const spamIndicators = [
                text.length > 1000, // Very long messages
                (text.match(/https?:\/\//g) || []).length > 3, // Too many URLs
                /win.*money|lottery|prize|click here|free.*money/i.test(text), // Common spam phrases
                text.includes('🎉'.repeat(5)), // Excessive emojis
                /(.)\1{10,}/.test(text) // Repeated characters
            ];
            
            const spamScore = spamIndicators.filter(Boolean).length;
            
            if (spamScore >= 2) {
                // Track spam attempt
                await this.db.collection('spam_attempts').insertOne({
                    user_id: userId,
                    username: ctx.from.username,
                    text: text.substring(0, 500),
                    spam_score: spamScore,
                    chat_id: ctx.chat.id,
                    created_at: new Date()
                });
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('Spam detection error:', error);
            return false; // Allow message on error
        }
    }

    /**
     * Check if user is admin
     * @param {number} userId - User ID
     * @returns {boolean} Whether user is admin
     */
    async checkUserAdminStatus(userId) {
        try {
            const admin = await this.db.collection('bot_admins').findOne({
                telegram_id: userId,
                active: true
            });
            
            return !!admin;
            
        } catch (error) {
            console.error('Check user admin status error:', error);
            return false;
        }
    }

    /**
     * Handle error with user feedback
     * @param {Object} ctx - Telegraf context
     * @param {Error} error - Error object
     * @param {string} context - Error context
     */
    async handleError(ctx, error, context) {
        try {
            this.stats.errorsHandled++;
            
            // Log error
            console.error(`Message handler error (${context}):`, error);
            
            // Store error for analytics
            await this.db.collection('bot_errors').insertOne({
                context: context,
                error_message: error.message,
                error_stack: error.stack,
                user_id: ctx.from?.id,
                chat_id: ctx.chat?.id,
                created_at: new Date()
            });
            
            // Send user-friendly error message
            const errorMessages = {
                'text_message': '❌ Sorry, I had trouble processing your message. Please try again.',
                'forward_message': '❌ Error processing forwarded message. Please try again.',
                'media_message': '❌ Error processing media. Please try again.',
                'inline_query': '❌ Search temporarily unavailable. Please try again later.',
                'default': '❌ Something went wrong. Please try again.'
            };
            
            const userMessage = errorMessages[context] || errorMessages.default;
            
            await ctx.reply(userMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '❓ Get Help', callback_data: 'help:main' },
                            { text: '📝 Report Issue', callback_data: 'report:error' }
                        ]
                    ]
                }
            });
            
        } catch (errorHandlingError) {
            console.error('Error handling error:', errorHandlingError);
        }
    }

    /**
     * Get service statistics
     * @returns {Object} Service statistics
     */
    getStats() {
        return {
            ...this.stats,
            uptime: Date.now() - this.startTime,
            activeUsers: this.userMessageCounts.size,
            activeContexts: this.userContexts.size,
            cacheSize: this.userMessageCounts.size
        };
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        try {
            // Clear rate limiting maps
            this.userMessageCounts.clear();
            this.spamDetection.clear();
            this.userContexts.clear();
            
            // Clean up temporary forwards older than 1 hour
            await this.db.collection('temp_forwards').deleteMany({
                created_at: { $lt: new Date(Date.now() - 60 * 60 * 1000) }
            });
            
            console.log('✅ Message handlers cleaned up');
            
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }

    // Additional helper methods for specific functionality would be implemented here
    // These methods are referenced in the main handlers but kept separate for modularity:
    
    async showCategoryNews(ctx, category) {
        // Implementation for showing category news
        await ctx.reply(`🔍 Showing ${category} news...`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📰 View Articles', callback_data: `news:category:${category}` }
                ]]
            }
        });
    }

    async showLatestNews(ctx) {
        // Implementation for showing latest news
        await ctx.reply('📰 Here are the latest news articles:', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📊 View Latest', callback_data: 'news:latest' },
                    { text: '🔥 Trending', callback_data: 'news:trending' }
                ]]
            }
        });
    }

    async showHelp(ctx) {
        // Implementation for showing help
        await ctx.reply('❓ Here\'s how I can help you:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📰 Browse News', callback_data: 'help:news' }],
                    [{ text: '🔍 Search Articles', callback_data: 'help:search' }],
                    [{ text: '⚙️ Settings', callback_data: 'help:settings' }]
                ]
            }
        });
    }

    async performSearch(ctx, searchTerm) {
        // Implementation for performing search
        await ctx.reply(`🔍 Searching for "${searchTerm}"...`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📋 View Results', callback_data: `search:results:${encodeURIComponent(searchTerm)}` }
                ]]
            }
        });
    }

    async showSubscriptionOptions(ctx) {
        // Implementation for showing subscription options
        await ctx.reply('📧 Subscription options:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📊 Technology', callback_data: 'sub:tech' }],
                    [{ text: '🏈 Sports', callback_data: 'sub:sports' }],
                    [{ text: '💼 Business', callback_data: 'sub:business' }]
                ]
            }
        });
    }

    async showTrendingNews(ctx) {
        // Implementation for showing trending news
        await ctx.reply('🔥 Trending news:', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📊 View Trending', callback_data: 'news:trending' }
                ]]
            }
        });
    }

    async processUrl(url) {
        // Implementation for processing URLs
        // This would extract metadata, check for news articles, etc.
        return {
            url,
            title: 'Extracted Title',
            description: 'Extracted Description',
            valid: true
        };
    }

    async showUrlProcessingResults(ctx, processedUrls) {
        // Implementation for showing URL processing results
        let message = `🔗 **${processedUrls.length} URL(s) Processed**\n\n`;
        processedUrls.forEach((url, index) => {
            message += `${index + 1}. ${url.title}\n${url.url}\n\n`;
        });
        await ctx.reply(message, { parse_mode: 'Markdown' });
    }

    async processFeedbackResponse(ctx, text) {
        // Implementation for processing feedback
        await ctx.reply('📝 Thank you for your feedback! We\'ll review it and get back to you.');
    }

    async processReportResponse(ctx, text) {
        // Implementation for processing reports
        await ctx.reply('🚨 Thank you for the report. We\'ll investigate this issue.');
    }

    async storeUserLocation(userId, location) {
        // Implementation for storing user location
        await this.db.collection('user_locations').updateOne(
            { user_id: userId },
            { 
                $set: { 
                    latitude: location.latitude,
                    longitude: location.longitude,
                    updated_at: new Date()
                }
            },
            { upsert: true }
        );
    }

    async showLocalNewsOptions(ctx, location) {
        // Implementation for showing local news
        await ctx.reply('📍 Thanks for sharing your location! Here are local news options:', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🌍 Local News', callback_data: 'news:local' }
                ]]
            }
        });
    }

    async processContactShare(ctx, contact) {
        // Implementation for processing contact sharing
        await ctx.reply('📞 Thanks for sharing the contact. This will be forwarded to our support team.');
    }

    async processPollEngagement(ctx, poll) {
        // Implementation for processing poll engagement
        console.log('Poll received:', poll.question);
    }

    async handleBotAddedToChat(ctx, chat) {
        // Implementation for bot added to chat
        await ctx.reply(`👋 Hello! I'm Zone News Bot. Type /help to see what I can do in ${chat.title || 'this chat'}.`);
    }

    async handleNewMembersJoined(ctx, members, chat) {
        // Implementation for new members
        const memberNames = members.map(m => m.first_name).join(', ');
        await ctx.reply(`👋 Welcome ${memberNames} to ${chat.title || 'the chat'}!`);
    }

    async handleBotRemovedFromChat(ctx, chat) {
        // Implementation for bot removed
        console.log(`Bot removed from ${chat.title || chat.id}`);
        // Mark destinations as inactive
        await this.db.collection('destinations').updateMany(
            { id: chat.id.toString() },
            { $set: { active: false, removed_at: new Date() } }
        );
    }
    
    /**
     * Handle my_chat_member updates (bot permissions changed)
     * This is the preferred way to detect bot being added/removed in modern Telegram Bot API
     * @param {Object} ctx - Telegraf context
     */
    async handleMyChatMemberUpdate(ctx) {
        try {
            const update = ctx.update.my_chat_member;
            const chat = update.chat;
            const newStatus = update.new_chat_member.status;
            const oldStatus = update.old_chat_member.status;
            
            console.log(`Bot status changed in ${chat.title || chat.id}: ${oldStatus} -> ${newStatus}`);
            
            // Bot was added to chat (or made admin)
            if ((oldStatus === 'left' || oldStatus === 'kicked') && 
                (newStatus === 'member' || newStatus === 'administrator')) {
                
                // Store group info
                await this.db.collection('destinations').updateOne(
                    { id: chat.id.toString() },
                    {
                        $set: {
                            id: chat.id.toString(),
                            type: chat.type,
                            title: chat.title || 'Unnamed Group',
                            username: chat.username || null,
                            active: true,
                            added_at: new Date(),
                            status: newStatus,
                            permissions: update.new_chat_member
                        }
                    },
                    { upsert: true }
                );
                
                // Send welcome message
                await ctx.reply(
                    `👋 Hello! I'm Zone News Bot.\n\n` +
                    `I can help you stay updated with Adelaide news!\n\n` +
                    `Available commands:\n` +
                    `/help - Show all commands\n` +
                    `/news - Get latest news\n` +
                    `/settings - Configure preferences\n\n` +
                    `Admins can use /post to share news to this group.`
                );
            }
            
            // Bot was removed from chat
            if ((oldStatus === 'member' || oldStatus === 'administrator') && 
                (newStatus === 'left' || newStatus === 'kicked')) {
                
                // Mark as inactive
                await this.db.collection('destinations').updateMany(
                    { id: chat.id.toString() },
                    { 
                        $set: { 
                            active: false, 
                            removed_at: new Date(),
                            status: newStatus
                        } 
                    }
                );
                
                console.log(`Bot removed from ${chat.title || chat.id}`);
            }
            
        } catch (error) {
            console.error('My chat member update error:', error);
        }
    }
}

module.exports = MessageHandlers;