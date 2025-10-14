/**
 * Zone News to TBC Thread Workflow Service
 * Posts articles to @ZoneNewsAdl with reactions and custom emojis, then forwards to TBC topic
 * Configuration managed under Duke Exxotic account (@dukexotic)
 */

const { Markup } = require('telegraf');
const CustomEmojiService = require('./emoji-service');

class ZoneNewsTBCWorkflow {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        
        // Initialize custom emoji service
        this.emojiService = new CustomEmojiService(bot, db);
        
        // Load TBC configuration from centralized config (managed by Duke Exxotic account)
        const tbcConfig = this.loadTBCConfig();
        this.config = {
            sourceChannel: tbcConfig.sourceChannel,
            sourceChannelId: tbcConfig.sourceChannelId,
            tbcGroupId: tbcConfig.targetGroupId,
            tbcTopicId: tbcConfig.targetTopicId,
            adminIds: [tbcConfig.managedBy.userId], // Duke Exxotic as primary admin
            enableReactions: tbcConfig.enableReactions,
            enableCustomEmojis: tbcConfig.enableCustomEmojis,
            syncEdits: tbcConfig.syncEdits,
            autoPostingEnabled: tbcConfig.autoPostingEnabled,
            managedBy: tbcConfig.managedBy
        };
        
        // Track forwarded messages
        this.forwardMappings = new Map();
        
        // Premium custom emoji IDs for reactions
        this.customEmojiIds = {
            'breaking': '5000569394542078246',
            'exclusive': '5000569394542078247', 
            'trending': '5000569394542078248',
            'verified': '5000569394542078249',
            'premium': '5000569394542078250',
            'fire': '5000569394542078251',
            'rocket': '5000569394542078252',
            'star': '5000569394542078253',
            'lightning': '5000569394542078254',
            'gem': '5000569394542078255'
        };
    }

    /**
     * Load TBC configuration from centralized config
     * Managed under Duke Exxotic account settings
     */
    loadTBCConfig() {
        try {
            // Try to load from project root config first
            const config = require('../../../../../config/bot-config');
            if (config.tbc) {
                console.log('✅ Loaded TBC config from centralized configuration (Duke Exxotic account)');
                return config.tbc;
            }
        } catch (error) {
            console.log('⚠️ Could not load centralized config, using environment variables');
            console.log('Config load error:', error.message);
        }
        
        // Fallback to environment variables with Duke Exxotic defaults
        return {
            sourceChannel: process.env.TBC_SOURCE_CHANNEL || '@ZoneNewsAdl',
            sourceChannelId: parseInt(process.env.TBC_SOURCE_CHANNEL_ID) || -1002212113452,
            targetGroupId: parseInt(process.env.TBC_GROUP_ID) || -2665614394,
            targetTopicId: parseInt(process.env.TBC_TOPIC_ID) || 9,
            autoPostingEnabled: process.env.TBC_AUTO_POSTING_ENABLED === 'true',
            syncEdits: process.env.TBC_SYNC_EDITS !== 'false',
            enableReactions: process.env.TBC_REACTIONS_ENABLED !== 'false',
            enableCustomEmojis: process.env.TBC_CUSTOM_EMOJIS_ENABLED !== 'false',
            managedBy: {
                account: '@dukexotic',
                userId: 7802629063,
                permissions: ['tbc_manager', 'forward_manager', 'reaction_manager']
            }
        };
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Zone News TBC Workflow');
            console.log(`📋 Configuration managed by: ${this.config.managedBy.account} (${this.config.managedBy.userId})`);
            console.log(`🎯 TBC Auto-posting: ${this.config.autoPostingEnabled ? 'ENABLED' : 'DISABLED'}`);
            
            // Initialize custom emoji service
            if (this.config.enableCustomEmojis) {
                await this.emojiService.initialize();
            }
            
            // Setup database collections
            await this.setupCollections();
            
            // Load existing mappings
            await this.loadForwardMappings();
            
            console.log('✅ Zone News TBC Workflow initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize workflow:', error);
            return false;
        }
    }

    async setupCollections() {
        const collections = await this.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        if (!collectionNames.includes('tbc_forward_mappings')) {
            await this.db.createCollection('tbc_forward_mappings');
        }
        
        // Create indexes
        await this.db.collection('tbc_forward_mappings').createIndexes([
            { key: { channel_message_id: 1 }, unique: true },
            { key: { tbc_message_id: 1 } },
            { key: { created_at: -1 } }
        ]);
    }

    async loadForwardMappings() {
        const mappings = await this.db.collection('tbc_forward_mappings')
            .find({})
            .toArray();
        
        mappings.forEach(mapping => {
            this.forwardMappings.set(mapping.channel_message_id, mapping);
        });
        
        console.log(`📚 Loaded ${mappings.length} forward mappings`);
    }

    /**
     * Format article for posting with custom emojis
     */
    async formatArticle(article) {
        const { title, content, category, source, link } = article;
        
        // Check if custom emojis are enabled
        if (this.config.enableCustomEmojis) {
            // Process with premium emojis
            const formatted = await this.emojiService.processArticleWithPremiumEmojis(article);
            return formatted.text;
        }
        
        // Standard formatting without custom emojis
        let text = `<b>${title}</b>\n\n`;
        text += `${content}\n\n`;
        text += `<b>Category:</b> ${category}\n`;
        text += `<b>Source:</b> ${source}\n`;
        
        if (link) {
            text += `<b>Link:</b> <a href="${link}">Read more</a>`;
        }
        
        return text;
    }

    /**
     * Create reaction keyboard with custom emojis
     */
    createReactionKeyboard(messageId, initialReactions = {}, useCustomEmojis = false) {
        let reactions;
        
        if (useCustomEmojis && this.config.enableCustomEmojis) {
            // Use custom emoji reactions
            reactions = {
                '🚀': initialReactions['🚀'] || 0,  // Rocket
                '⚡': initialReactions['⚡'] || 0,  // Lightning
                '🔥': initialReactions['🔥'] || 0,  // Fire
                '💎': initialReactions['💎'] || 0,  // Gem
                '⭐': initialReactions['⭐'] || 0,  // Star
                '💯': initialReactions['💯'] || 0   // 100
            };
        } else {
            // Standard reactions
            reactions = {
                '👍': initialReactions['👍'] || 0,
                '❤️': initialReactions['❤️'] || 0,
                '🔥': initialReactions['🔥'] || 0,
                '😂': initialReactions['😂'] || 0,
                '😮': initialReactions['😮'] || 0,
                '😢': initialReactions['😢'] || 0
            };
        }
        
        const buttons = Object.entries(reactions).map(([emoji, count]) => ({
            text: count > 0 ? `${emoji} ${count}` : emoji,
            callback_data: `react:${messageId}:${emoji}`
        }));
        
        // Split into rows of 3
        const rows = [];
        for (let i = 0; i < buttons.length; i += 3) {
            rows.push(buttons.slice(i, i + 3));
        }
        
        // Add view count and share buttons
        rows.push([
            { text: '👁 Views', callback_data: `views:${messageId}` },
            { text: '📤 Share', url: `https://t.me/${this.config.sourceChannel.replace('@', '')}/${messageId}` }
        ]);
        
        return Markup.inlineKeyboard(rows);
    }

    /**
     * Post article to channel with reactions
     */
    async postToChannel(article) {
        try {
            // Determine if this is premium content
            const isPremium = article.premium || article.exclusive || 
                            article.title?.toLowerCase().includes('breaking') ||
                            article.title?.toLowerCase().includes('exclusive');
            
            // Format article with custom emojis if applicable
            const text = await this.formatArticle(article);
            
            // Create reaction keyboard (use custom emojis for premium content)
            const keyboard = this.createReactionKeyboard(0, {}, isPremium);
            
            // Prepare message options with entities if custom emojis are used
            const messageOptions = {
                parse_mode: 'HTML',
                disable_web_page_preview: false,
                reply_markup: keyboard.reply_markup
            };
            
            // Add custom emoji entities if available
            if (this.config.enableCustomEmojis && article.customEmojiEntities) {
                messageOptions.entities = article.customEmojiEntities;
            }
            
            // Send to channel
            const channelMessage = await this.bot.telegram.sendMessage(
                this.config.sourceChannelId,
                text,
                messageOptions
            );
            
            // Update keyboard with actual message ID
            await this.bot.telegram.editMessageReplyMarkup(
                this.config.sourceChannelId,
                channelMessage.message_id,
                null,
                this.createReactionKeyboard(channelMessage.message_id, {}, isPremium).reply_markup
            );
            
            console.log(`✅ Posted article to channel: ${channelMessage.message_id} ${isPremium ? '(Premium)' : ''}`);
            return channelMessage;
        } catch (error) {
            console.error('❌ Error posting to channel:', error);
            throw error;
        }
    }

    /**
     * Forward to TBC topic (silent forward - copy message)
     */
    async forwardToTBC(channelMessage, article) {
        try {
            // Format for TBC (same content but as new message, not forward)
            const text = this.formatArticle(article);
            
            // Send to TBC topic as new message (not forward)
            const tbcMessage = await this.bot.telegram.sendMessage(
                this.config.tbcGroupId,
                text,
                {
                    parse_mode: 'HTML',
                    disable_web_page_preview: false,
                    message_thread_id: this.config.tbcTopicId,
                    reply_markup: this.createReactionKeyboard(channelMessage.message_id).reply_markup
                }
            );
            
            // Save mapping
            await this.saveForwardMapping(channelMessage.message_id, tbcMessage.message_id);
            
            console.log(`✅ Forwarded to TBC topic: ${tbcMessage.message_id}`);
            return tbcMessage;
        } catch (error) {
            console.error('❌ Error forwarding to TBC:', error);
            throw error;
        }
    }

    /**
     * Save forward mapping to database
     */
    async saveForwardMapping(channelMessageId, tbcMessageId) {
        const mapping = {
            channel_message_id: channelMessageId,
            tbc_message_id: tbcMessageId,
            created_at: new Date(),
            last_synced: new Date()
        };
        
        await this.db.collection('tbc_forward_mappings').insertOne(mapping);
        this.forwardMappings.set(channelMessageId, mapping);
        
        return mapping;
    }

    /**
     * Process multiple articles
     */
    async processArticles(articles) {
        const results = [];
        
        for (const article of articles) {
            try {
                // Post to channel
                const channelMessage = await this.postToChannel(article);
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Forward to TBC
                const tbcMessage = await this.forwardToTBC(channelMessage, article);
                
                results.push({
                    success: true,
                    channelMessageId: channelMessage.message_id,
                    tbcMessageId: tbcMessage.message_id
                });
            } catch (error) {
                console.error('Error processing article:', error);
                results.push({
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Handle reaction updates
     */
    async handleReaction(callbackQuery) {
        const data = callbackQuery.data;
        if (!data.startsWith('react:')) return false;
        
        const [_, messageId, emoji] = data.split(':');
        const userId = callbackQuery.from.id;
        
        // Get or create reaction data
        const reactionKey = `reactions:${messageId}`;
        let reactions = await this.db.collection('reactions').findOne({ _id: reactionKey });
        
        if (!reactions) {
            reactions = {
                _id: reactionKey,
                messageId: parseInt(messageId),
                reactions: {},
                users: {}
            };
        }
        
        // Initialize emoji reactions if not exists
        if (!reactions.reactions[emoji]) {
            reactions.reactions[emoji] = 0;
        }
        if (!reactions.users[emoji]) {
            reactions.users[emoji] = [];
        }
        
        // Toggle reaction
        const userIndex = reactions.users[emoji].indexOf(userId);
        if (userIndex === -1) {
            // Add reaction
            reactions.users[emoji].push(userId);
            reactions.reactions[emoji]++;
        } else {
            // Remove reaction
            reactions.users[emoji].splice(userIndex, 1);
            reactions.reactions[emoji]--;
        }
        
        // Save to database
        await this.db.collection('reactions').replaceOne(
            { _id: reactionKey },
            reactions,
            { upsert: true }
        );
        
        // Update both messages (channel and TBC)
        await this.syncReactions(parseInt(messageId), reactions.reactions);
        
        // Answer callback
        await this.bot.telegram.answerCallbackQuery(
            callbackQuery.id,
            { text: userIndex === -1 ? `Added ${emoji}` : `Removed ${emoji}` }
        );
        
        return true;
    }

    /**
     * Sync reactions between channel and TBC
     */
    async syncReactions(channelMessageId, reactions) {
        try {
            // Update channel message
            const channelKeyboard = this.createReactionKeyboard(channelMessageId, reactions);
            await this.bot.telegram.editMessageReplyMarkup(
                this.config.sourceChannelId,
                channelMessageId,
                null,
                channelKeyboard.reply_markup
            ).catch((error) => {
                console.warn('Failed to update channel message keyboard:', {
                    channelId: this.config.sourceChannelId,
                    messageId: channelMessageId,
                    error: error.message
                });
            });
            
            // Update TBC message if exists
            const mapping = this.forwardMappings.get(channelMessageId);
            if (mapping) {
                await this.bot.telegram.editMessageReplyMarkup(
                    this.config.tbcGroupId,
                    mapping.tbc_message_id,
                    null,
                    channelKeyboard.reply_markup
                ).catch((error) => {
                    console.warn('Failed to update TBC message keyboard:', {
                        groupId: this.config.tbcGroupId,
                        messageId: mapping.tbc_message_id,
                        error: error.message
                    });
                });
            }
        } catch (error) {
            console.error('Error syncing reactions:', error);
        }
    }

    /**
     * Handle message edits
     */
    async handleEdit(editedMessage) {
        if (!this.config.syncEdits) return;
        
        try {
            // Check if this is from our channel
            if (editedMessage.chat.id !== this.config.sourceChannelId) return;
            
            // Find mapping
            const mapping = this.forwardMappings.get(editedMessage.message_id);
            if (!mapping) return;
            
            // Update TBC message
            await this.bot.telegram.editMessageText(
                this.config.tbcGroupId,
                mapping.tbc_message_id,
                null,
                editedMessage.text || editedMessage.caption,
                {
                    parse_mode: 'HTML',
                    disable_web_page_preview: false
                }
            );
            
            console.log(`✅ Synced edit for message ${editedMessage.message_id}`);
        } catch (error) {
            console.error('Error syncing edit:', error);
        }
    }

    /**
     * Check if user has TBC management permissions (Duke Exxotic + @TheZoneNews)
     */
    checkTBCPermissions(userId) {
        const authorizedUsers = [
            7802629063,  // @dukexotic (primary)
            8123893898   // @TheZoneNews (secondary owner)
        ];
        
        const isAuthorized = authorizedUsers.includes(userId) || 
                           this.config.adminIds.includes(userId);
        
        if (!isAuthorized) {
            console.log(`❌ TBC access denied for user ${userId}. Only @dukexotic and @TheZoneNews can manage TBC settings.`);
        }
        
        return isAuthorized;
    }

    /**
     * Get user role for TBC management
     */
    getTBCUserRole(userId) {
        if (userId === 7802629063) return { role: 'primary', account: '@dukexotic' };
        if (userId === 8123893898) return { role: 'owner', account: '@TheZoneNews' };
        if (this.config.adminIds.includes(userId)) return { role: 'admin', account: 'admin' };
        return { role: 'none', account: 'unauthorized' };
    }

    /**
     * Get workflow statistics with Duke Exxotic account info
     */
    async getStatistics() {
        const totalMappings = this.forwardMappings.size;
        
        const recentPosts = await this.db.collection('tbc_forward_mappings')
            .find({ created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
            .count();
        
        const totalReactions = await this.db.collection('reactions')
            .aggregate([
                { $match: { _id: { $regex: '^reactions:' } } },
                { $project: { total: { $sum: { $objectToArray: '$reactions' } } } },
                { $group: { _id: null, grandTotal: { $sum: '$total' } } }
            ])
            .toArray();
        
        return {
            totalForwarded: totalMappings,
            last24Hours: recentPosts,
            totalReactions: totalReactions[0]?.grandTotal || 0,
            sourceChannel: this.config.sourceChannel,
            tbcGroup: this.config.tbcGroupId,
            tbcTopic: this.config.tbcTopicId,
            autoPostingEnabled: this.config.autoPostingEnabled,
            managedBy: {
                account: this.config.managedBy.account,
                userId: this.config.managedBy.userId,
                permissions: this.config.managedBy.permissions
            }
        };
    }

    /**
     * Get pending posts from @ZoneNewsAdl that haven't been forwarded to TBC
     */
    async getPendingPosts(limit = 10) {
        try {
            // Get recent messages from @ZoneNewsAdl channel
            const channelMessages = await this.bot.telegram.getChat(this.config.sourceChannelId);
            
            // Get already forwarded message IDs
            const forwardedIds = Array.from(this.forwardMappings.keys());
            
            // Get excluded message IDs
            const excludedIds = await this.getExcludedPosts();
            
            // Return mock data for now - in production this would fetch actual channel messages
            const pendingPosts = [
                {
                    messageId: 1001,
                    title: "Breaking: Major Development in Adelaide",
                    content: "Adelaide city council announces new infrastructure project...",
                    timestamp: new Date(),
                    category: "breaking",
                    reactions: { '👍': 0, '❤️': 0, '🔥': 0 }
                },
                {
                    messageId: 1002,
                    title: "Tech Update: Innovation Hub Opens",
                    content: "New technology innovation hub opens in North Adelaide...",
                    timestamp: new Date(),
                    category: "tech",
                    reactions: { '👍': 0, '❤️': 0, '🔥': 0 }
                },
                {
                    messageId: 1003,
                    title: "Sports: Local Team Wins Championship",
                    content: "Adelaide United defeats rivals in stunning victory...",
                    timestamp: new Date(),
                    category: "sports",
                    reactions: { '👍': 0, '❤️': 0, '🔥': 0 }
                },
                {
                    messageId: 1004,
                    title: "Weather Alert: Storm Warning",
                    content: "Severe weather warning issued for Adelaide metro...",
                    timestamp: new Date(),
                    category: "weather",
                    reactions: { '👍': 0, '❤️': 0, '🔥': 0 }
                }
            ].filter(post => !forwardedIds.includes(post.messageId) && !excludedIds.includes(post.messageId));
            
            return pendingPosts.slice(0, limit);
        } catch (error) {
            console.error('Error getting pending posts:', error);
            return [];
        }
    }

    /**
     * Get excluded post IDs
     */
    async getExcludedPosts() {
        try {
            const excludedPosts = await this.db.collection('tbc_excluded_posts').find({}).toArray();
            return excludedPosts.map(post => post.messageId);
        } catch (error) {
            console.error('Error getting excluded posts:', error);
            return [];
        }
    }

    /**
     * Exclude a post from TBC forwarding (Duke only)
     */
    async excludePost(userId, messageId, reason = '') {
        if (!this.checkTBCPermissions(userId)) {
            throw new Error(`Access denied. TBC management is restricted to ${this.config.managedBy.account}.`);
        }

        try {
            const exclusion = {
                messageId: parseInt(messageId),
                excludedBy: this.config.managedBy.account,
                excludedAt: new Date(),
                reason: reason || 'No reason provided',
                userId: userId
            };

            await this.db.collection('tbc_excluded_posts').insertOne(exclusion);
            
            console.log(`✅ Post ${messageId} excluded from TBC by ${this.config.managedBy.account}`);
            return { success: true, messageId, reason };
        } catch (error) {
            console.error('Error excluding post:', error);
            throw error;
        }
    }

    /**
     * Remove post from exclusion list (Duke only)
     */
    async unexcludePost(userId, messageId) {
        if (!this.checkTBCPermissions(userId)) {
            throw new Error(`Access denied. TBC management is restricted to ${this.config.managedBy.account}.`);
        }

        try {
            const result = await this.db.collection('tbc_excluded_posts').deleteOne({
                messageId: parseInt(messageId)
            });

            if (result.deletedCount > 0) {
                console.log(`✅ Post ${messageId} removed from exclusions by ${this.config.managedBy.account}`);
                return { success: true, messageId };
            } else {
                return { success: false, error: 'Post not found in exclusions' };
            }
        } catch (error) {
            console.error('Error removing exclusion:', error);
            throw error;
        }
    }

    /**
     * Get all excluded posts with details
     */
    async getExcludedPostsDetails(userId) {
        if (!this.checkTBCPermissions(userId)) {
            throw new Error(`Access denied. TBC management is restricted to ${this.config.managedBy.account}.`);
        }

        try {
            const excludedPosts = await this.db.collection('tbc_excluded_posts')
                .find({})
                .sort({ excludedAt: -1 })
                .toArray();

            return excludedPosts;
        } catch (error) {
            console.error('Error getting excluded posts details:', error);
            return [];
        }
    }

    /**
     * Forward specific message to TBC with live reaction buttons
     */
    async forwardMessageToTBC(messageId, customizations = {}) {
        try {
            // Get the message from @ZoneNewsAdl
            const message = await this.bot.telegram.forwardMessage(
                this.config.tbcGroupId,
                this.config.sourceChannelId,
                messageId,
                {
                    message_thread_id: this.config.tbcTopicId
                }
            );

            // Create live reaction keyboard
            const reactionKeyboard = this.createLiveReactionKeyboard(message.message_id, customizations.reactions || {});

            // Edit the forwarded message to add reaction buttons
            try {
                await this.bot.telegram.editMessageReplyMarkup(
                    this.config.tbcGroupId,
                    message.message_id,
                    null,
                    reactionKeyboard.reply_markup
                );
            } catch (error) {
                // If we can't edit the forwarded message, send a new message with reactions
                await this.bot.telegram.sendMessage(
                    this.config.tbcGroupId,
                    '👆 React to the message above:',
                    {
                        message_thread_id: this.config.tbcTopicId,
                        reply_markup: reactionKeyboard.reply_markup
                    }
                );
            }

            // Save mapping
            await this.saveForwardMapping(messageId, message.message_id);

            console.log(`✅ Forwarded message ${messageId} to TBC: ${message.message_id}`);
            return { success: true, originalMessageId: messageId, tbcMessageId: message.message_id };

        } catch (error) {
            console.error('Error forwarding message to TBC:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create live reaction keyboard with real-time counts
     */
    createLiveReactionKeyboard(messageId, initialReactions = {}) {
        const reactions = {
            '👍': initialReactions['👍'] || 0,
            '❤️': initialReactions['❤️'] || 0,
            '🔥': initialReactions['🔥'] || 0,
            '😂': initialReactions['😂'] || 0,
            '😮': initialReactions['😮'] || 0,
            '💯': initialReactions['💯'] || 0
        };

        const buttons = Object.entries(reactions).map(([emoji, count]) => ({
            text: count > 0 ? `${emoji} ${count}` : emoji,
            callback_data: `tbc_react:${messageId}:${emoji}`
        }));

        // Create rows of 3 buttons each
        const rows = [];
        for (let i = 0; i < buttons.length; i += 3) {
            rows.push(buttons.slice(i, i + 3));
        }

        // Add management buttons for Duke
        rows.push([
            { text: '📊 Stats', callback_data: `tbc_stats:${messageId}` },
            { text: '🔄 Sync', callback_data: `tbc_sync:${messageId}` },
            { text: '❌ Remove', callback_data: `tbc_remove:${messageId}` }
        ]);

        return Markup.inlineKeyboard(rows);
    }

    /**
     * Handle TBC reaction button clicks
     */
    async handleTBCReaction(callbackQuery) {
        const data = callbackQuery.data;
        if (!data.startsWith('tbc_react:')) return false;

        const [_, messageId, emoji] = data.split(':');
        const userId = callbackQuery.from.id;

        try {
            // Get current reactions from database
            const reactionKey = `tbc_reactions:${messageId}`;
            let reactions = await this.db.collection('tbc_reactions').findOne({ _id: reactionKey });

            if (!reactions) {
                reactions = {
                    _id: reactionKey,
                    messageId: parseInt(messageId),
                    reactions: {},
                    users: {},
                    lastUpdated: new Date()
                };
            }

            // Initialize emoji reactions if not exists
            if (!reactions.reactions[emoji]) reactions.reactions[emoji] = 0;
            if (!reactions.users[emoji]) reactions.users[emoji] = [];

            // Toggle reaction
            const userIndex = reactions.users[emoji].indexOf(userId);
            let actionText = '';
            
            if (userIndex === -1) {
                // Add reaction
                reactions.users[emoji].push(userId);
                reactions.reactions[emoji]++;
                actionText = `Added ${emoji}`;
            } else {
                // Remove reaction
                reactions.users[emoji].splice(userIndex, 1);
                reactions.reactions[emoji]--;
                actionText = `Removed ${emoji}`;
            }

            reactions.lastUpdated = new Date();

            // Save to database
            await this.db.collection('tbc_reactions').replaceOne(
                { _id: reactionKey },
                reactions,
                { upsert: true }
            );

            // Update the button display with new counts
            const newKeyboard = this.createLiveReactionKeyboard(messageId, reactions.reactions);
            
            await this.bot.telegram.editMessageReplyMarkup(
                callbackQuery.message.chat.id,
                callbackQuery.message.message_id,
                null,
                newKeyboard.reply_markup
            );

            // Answer callback
            await this.bot.telegram.answerCallbackQuery(callbackQuery.id, { text: actionText });

            return true;
        } catch (error) {
            console.error('Error handling TBC reaction:', error);
            await this.bot.telegram.answerCallbackQuery(callbackQuery.id, { text: 'Error updating reaction' });
            return false;
        }
    }

    /**
     * Handle TBC management button clicks
     */
    async handleTBCManagement(callbackQuery) {
        const data = callbackQuery.data;
        const userId = callbackQuery.from.id;

        // Check permissions
        if (!this.checkTBCPermissions(userId)) {
            await this.bot.telegram.answerCallbackQuery(
                callbackQuery.id, 
                { text: 'Access denied. TBC management is restricted to @dukexotic.', show_alert: true }
            );
            return false;
        }

        try {
            if (data.startsWith('tbc_stats:')) {
                const messageId = data.split(':')[1];
                const stats = await this.getMessageStats(messageId);
                
                await this.bot.telegram.answerCallbackQuery(
                    callbackQuery.id,
                    { 
                        text: `Stats: ${stats.totalReactions} reactions, ${stats.totalViews || 0} views`,
                        show_alert: true 
                    }
                );
                
            } else if (data.startsWith('tbc_sync:')) {
                const messageId = data.split(':')[1];
                await this.syncMessageReactions(messageId);
                
                await this.bot.telegram.answerCallbackQuery(
                    callbackQuery.id,
                    { text: 'Reactions synced successfully!' }
                );
                
            } else if (data.startsWith('tbc_remove:')) {
                const messageId = data.split(':')[1];
                
                // Remove the message and its reactions
                await this.removeForwardedMessage(messageId);
                
                await this.bot.telegram.answerCallbackQuery(
                    callbackQuery.id,
                    { text: 'Message removed from TBC workflow' }
                );
            }

            return true;
        } catch (error) {
            console.error('Error handling TBC management:', error);
            await this.bot.telegram.answerCallbackQuery(callbackQuery.id, { text: 'Management action failed' });
            return false;
        }
    }

    /**
     * Get message statistics
     */
    async getMessageStats(messageId) {
        try {
            const reactionKey = `tbc_reactions:${messageId}`;
            const reactions = await this.db.collection('tbc_reactions').findOne({ _id: reactionKey });
            
            const totalReactions = reactions ? 
                Object.values(reactions.reactions).reduce((sum, count) => sum + count, 0) : 0;
            
            return {
                messageId,
                totalReactions,
                reactions: reactions?.reactions || {},
                lastUpdated: reactions?.lastUpdated
            };
        } catch (error) {
            console.error('Error getting message stats:', error);
            return { messageId, totalReactions: 0, reactions: {} };
        }
    }

    /**
     * Sync reactions between source and TBC
     */
    async syncMessageReactions(messageId) {
        try {
            const mapping = this.forwardMappings.get(parseInt(messageId));
            if (!mapping) return false;

            const stats = await this.getMessageStats(messageId);
            const newKeyboard = this.createLiveReactionKeyboard(messageId, stats.reactions);

            // Update TBC message
            await this.bot.telegram.editMessageReplyMarkup(
                this.config.tbcGroupId,
                mapping.tbc_message_id,
                null,
                newKeyboard.reply_markup
            );

            console.log(`✅ Synced reactions for message ${messageId}`);
            return true;
        } catch (error) {
            console.error('Error syncing reactions:', error);
            return false;
        }
    }

    /**
     * Remove forwarded message from TBC workflow
     */
    async removeForwardedMessage(messageId) {
        try {
            const mapping = this.forwardMappings.get(parseInt(messageId));
            if (!mapping) return false;

            // Delete from database
            await this.db.collection('tbc_forward_mappings').deleteOne({
                channel_message_id: parseInt(messageId)
            });
            
            await this.db.collection('tbc_reactions').deleteOne({
                _id: `tbc_reactions:${messageId}`
            });

            // Remove from memory
            this.forwardMappings.delete(parseInt(messageId));

            console.log(`✅ Removed message ${messageId} from TBC workflow`);
            return true;
        } catch (error) {
            console.error('Error removing message:', error);
            return false;
        }
    }

    /**
     * Auto-posting service for monitoring @ZoneNewsAdl and forwarding to TBC
     */
    async startAutoPosting() {
        if (!this.config.autoPostingEnabled) {
            console.log('⏭️ TBC auto-posting is disabled');
            return false;
        }

        console.log('🚀 Starting TBC auto-posting service...');
        
        // Check for new posts every 2 minutes
        this.autoPostingInterval = setInterval(async () => {
            try {
                await this.checkForNewPosts();
            } catch (error) {
                console.error('Error in auto-posting service:', error);
            }
        }, 2 * 60 * 1000); // 2 minutes

        return true;
    }

    /**
     * Stop auto-posting service
     */
    stopAutoPosting() {
        if (this.autoPostingInterval) {
            clearInterval(this.autoPostingInterval);
            this.autoPostingInterval = null;
            console.log('🛑 TBC auto-posting service stopped');
            return true;
        }
        return false;
    }

    /**
     * Check for new posts in @ZoneNewsAdl and auto-forward to TBC
     */
    async checkForNewPosts() {
        try {
            const pendingPosts = await this.getPendingPosts(5); // Check last 5 posts
            
            if (pendingPosts.length === 0) {
                return;
            }

            console.log(`🔍 Found ${pendingPosts.length} new posts to auto-forward`);

            for (const post of pendingPosts) {
                try {
                    const result = await this.forwardMessageToTBC(post.messageId, {
                        autoForwarded: true,
                        timestamp: new Date()
                    });

                    if (result.success) {
                        console.log(`✅ Auto-forwarded message ${post.messageId} to TBC`);
                    } else {
                        console.error(`❌ Auto-forward failed for message ${post.messageId}:`, result.error);
                    }

                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (error) {
                    console.error(`Error auto-forwarding message ${post.messageId}:`, error);
                }
            }
        } catch (error) {
            console.error('Error checking for new posts:', error);
        }
    }

    /**
     * Set auto-posting schedule (Duke can customize timing)
     */
    async setAutoPostingSchedule(userId, schedule) {
        if (!this.checkTBCPermissions(userId)) {
            throw new Error(`Access denied. TBC configuration is managed by ${this.config.managedBy.account}.`);
        }

        // Stop current auto-posting
        this.stopAutoPosting();

        // Update schedule configuration
        this.config.autoPostingSchedule = {
            enabled: schedule.enabled !== false,
            interval: schedule.interval || 2, // minutes
            maxPostsPerRun: schedule.maxPostsPerRun || 5,
            quietHours: schedule.quietHours || { start: 23, end: 7 }, // 11 PM to 7 AM
            customizedBy: this.config.managedBy.account,
            lastUpdated: new Date()
        };

        // Restart with new schedule if enabled
        if (this.config.autoPostingSchedule.enabled) {
            this.autoPostingInterval = setInterval(async () => {
                // Check quiet hours
                const now = new Date();
                const hour = now.getHours();
                const quietHours = this.config.autoPostingSchedule.quietHours;
                
                if (hour >= quietHours.start || hour < quietHours.end) {
                    console.log('😴 TBC auto-posting: Quiet hours active');
                    return;
                }

                await this.checkForNewPosts();
            }, this.config.autoPostingSchedule.interval * 60 * 1000);
        }

        console.log(`✅ TBC auto-posting schedule updated by ${this.config.managedBy.account}:`, this.config.autoPostingSchedule);
        return { success: true, schedule: this.config.autoPostingSchedule };
    }

    /**
     * Get auto-posting status and statistics
     */
    getAutoPostingStatus() {
        return {
            enabled: this.config.autoPostingEnabled,
            running: !!this.autoPostingInterval,
            schedule: this.config.autoPostingSchedule || {
                enabled: false,
                interval: 2,
                maxPostsPerRun: 5,
                quietHours: { start: 23, end: 7 }
            },
            managedBy: this.config.managedBy,
            lastCheck: this.lastAutoPostCheck,
            nextCheck: this.autoPostingInterval ? 
                new Date(Date.now() + (this.config.autoPostingSchedule?.interval || 2) * 60 * 1000) : null
        };
    }

    /**
     * Update TBC configuration (Duke Exxotic only)
     */
    async updateTBCConfig(userId, newConfig) {
        if (!this.checkTBCPermissions(userId)) {
            throw new Error(`Access denied. TBC configuration is managed by ${this.config.managedBy.account}.`);
        }

        const allowedFields = ['autoPostingEnabled', 'syncEdits', 'enableReactions', 'enableCustomEmojis'];
        const updates = {};
        
        for (const field of allowedFields) {
            if (newConfig.hasOwnProperty(field)) {
                updates[field] = newConfig[field];
                this.config[field] = newConfig[field];
            }
        }

        // Handle auto-posting toggle
        if (updates.hasOwnProperty('autoPostingEnabled')) {
            if (updates.autoPostingEnabled) {
                await this.startAutoPosting();
            } else {
                this.stopAutoPosting();
            }
        }
        
        console.log(`✅ TBC config updated by ${this.config.managedBy.account}:`, updates);
        return { success: true, updates };
    }
}

module.exports = ZoneNewsTBCWorkflow;
