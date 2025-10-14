/**
 * Enhanced Emoji Reaction Handler
 * Handles all emoji reaction callbacks with comprehensive error handling
 * Supports both old and new schema formats
 * Prevents duplicates and crashes
 */

const { validationService } = require('./validation-service');
const { logger } = require('./logger-service');

class EmojiReactionHandler {
    constructor(bot, db, reactionSystem) {
        this.bot = bot;
        this.db = db;
        this.reactionSystem = reactionSystem;
        this.logger = logger;
        
        // Emoji mapping
        this.emojiMap = {
            'like': '👍',
            'love': '❤️', 
            'fire': '🔥',
            'party': '🎉',
            'happy': '😊',
            'wow': '😮'
        };

        // Track processing to prevent duplicate handling
        this.processingCallbacks = new Set();
    }

    /**
     * Setup reaction callback handlers with error boundaries
     */
    setupHandlers() {
        try {
            // Handle persist_* callbacks with message keys
            this.bot.action(/^persist_(like|love|fire|party|happy|wow)_(.+)$/, async (ctx) => {
                await this.safeHandleReaction(ctx, 'withKey');
            });

            // Handle simple persist_* callbacks without keys
            this.bot.action(/^persist_(like|love|fire|party|happy|wow)$/, async (ctx) => {
                await this.safeHandleReaction(ctx, 'simple');
            });

            this.logger.log('✅ Enhanced emoji reaction handlers initialized');
        } catch (error) {
            this.logger.error('Failed to setup reaction handlers:', error);
        }
    }

    /**
     * Safe wrapper for handling reactions with comprehensive error handling
     */
    async safeHandleReaction(ctx, type) {
        const callbackId = `${ctx.from?.id}_${ctx.callbackQuery?.data}_${Date.now()}`;
        
        // Prevent duplicate processing
        if (this.processingCallbacks.has(callbackId)) {
            return await this.safeAnswerCallback(ctx, 'Processing...');
        }

        this.processingCallbacks.add(callbackId);

        try {
            if (type === 'withKey') {
                await this.handleReactionWithKey(ctx);
            } else {
                await this.handleSimpleReaction(ctx);
            }
        } catch (error) {
            this.logger.error(`Error in safeHandleReaction (${type}):`, error);
            await this.safeAnswerCallback(ctx, 'Error processing reaction');
        } finally {
            // Clean up processing flag after 1 second
            setTimeout(() => this.processingCallbacks.delete(callbackId), 1000);
        }
    }

    /**
     * Handle reactions with message keys with enhanced error handling
     */
    async handleReactionWithKey(ctx) {
        let answerText = '';
        
        try {
            // Safely extract callback data
            const callbackData = ctx.callbackQuery?.data;
            if (!callbackData) {
                this.logger.warn('No callback data received');
                return await this.safeAnswerCallback(ctx, 'Invalid request');
            }

            const match = callbackData.match(/^persist_(like|love|fire|party|happy|wow)_(.+)$/);
            if (!match) {
                this.logger.warn(`Invalid callback format: ${callbackData}`);
                return await this.safeAnswerCallback(ctx, 'Invalid format');
            }

            const [, reactionType, messageKey] = match;
            const userId = ctx.from?.id;
            const userName = ctx.from?.first_name || 'User';

            if (!userId) {
                this.logger.error('No user ID found in callback query');
                return await this.safeAnswerCallback(ctx, 'User identification failed');
            }

            this.logger.log(`🔄 Processing reaction: ${reactionType} for ${messageKey} by ${userName} (${userId})`);

            // Get database connection with error handling
            const db = await this.getSafeDatabase();
            if (!db) {
                return await this.safeAnswerCallback(ctx, 'Service temporarily unavailable');
            }

            // Process the reaction with new schema handling
            const result = await this.processReactionWithSchema(db, messageKey, reactionType, userId, userName);
            
            if (result.success) {
                // Update keyboard with new counts
                await this.updateReactionKeyboard(ctx, messageKey, result.reactions);
                answerText = result.message;
            } else {
                answerText = 'Failed to update reaction';
            }

            // Answer callback
            await this.safeAnswerCallback(ctx, answerText);

        } catch (error) {
            this.logger.error('Error handling reaction with key:', error);
            await this.safeAnswerCallback(ctx, 'Failed to process reaction');
        }
    }

    /**
     * Handle simple reactions without message keys
     */
    async handleSimpleReaction(ctx) {
        try {
            const callbackData = ctx.callbackQuery?.data;
            if (!callbackData) {
                return await this.safeAnswerCallback(ctx, 'Invalid request');
            }

            const match = callbackData.match(/^persist_(like|love|fire|party|happy|wow)$/);
            if (!match) {
                return await this.safeAnswerCallback(ctx, 'Invalid format');
            }

            const reactionType = match[1];
            const messageId = ctx.callbackQuery?.message?.message_id;
            const chatId = ctx.callbackQuery?.message?.chat?.id || ctx.chat?.id;
            const userId = ctx.from?.id;
            const userName = ctx.from?.first_name || 'User';

            if (!userId || !messageId) {
                this.logger.error('Missing required IDs in simple reaction');
                return await this.safeAnswerCallback(ctx, 'Invalid context');
            }

            // Generate message key from chat and message IDs
            const messageKey = `msg_${chatId}_${messageId}`;

            this.logger.log(`🔄 Processing simple reaction: ${reactionType} for message ${messageId} by ${userName}`);

            // Use the same logic as handleReactionWithKey
            ctx.callbackQuery.data = `persist_${reactionType}_${messageKey}`;
            return await this.handleReactionWithKey(ctx);

        } catch (error) {
            this.logger.error('Error handling simple reaction:', error);
            await this.safeAnswerCallback(ctx, 'Failed to process reaction');
        }
    }

    /**
     * Process reaction with schema detection and conversion
     */
    async processReactionWithSchema(db, messageKey, reactionType, userId, userName) {
        try {
            // Validate reaction input
            const validation = await validationService.validate({
                user_id: userId,
                message_id: messageKey,
                emoji: this.emojiMap[reactionType] || reactionType,
                username: userName
            }, 'reaction.add');
            
            if (!validation.valid) {
                logger.warn('Invalid reaction input', {
                    errors: validation.errors,
                    userId,
                    messageKey
                });
                throw new Error('Invalid reaction data');
            }
            
            const validatedData = validation.value;
            const collection = db.collection('zone_persistent_reactions');
            const reactionCollection = db.collection('emoji_reactions');

            // Try to find existing reaction document
            let reactionDoc = await collection.findOne({ message_key: messageKey }).catch(() => null);
            
            // Handle old format where user_reactions is an object like {"userId": "reactionType"}
            if (reactionDoc && reactionDoc.user_reactions && !Array.isArray(reactionDoc.user_reactions) && typeof reactionDoc.user_reactions === 'object') {
                // Convert old format to new format
                const oldUserReactions = reactionDoc.user_reactions;
                reactionDoc.user_reactions = {};
                
                // Initialize reaction types
                for (const type of ['like', 'love', 'fire', 'party', 'happy', 'wow']) {
                    reactionDoc.user_reactions[type] = [];
                }
                
                // Convert old format: {"userId": "reactionType"} to new format
                for (const [uid, rType] of Object.entries(oldUserReactions)) {
                    if (reactionDoc.user_reactions[rType]) {
                        reactionDoc.user_reactions[rType].push(parseInt(uid) || uid);
                    }
                }
                
                // Update schema version
                reactionDoc.schema_version = 2;
                this.logger.log(`Converted old user_reactions format for ${messageKey}`);
            }

            // Check if it's old schema and needs conversion
            if (reactionDoc && this.isOldSchemaFormat(reactionDoc)) {
                this.logger.log(`Converting old schema for ${messageKey}`);
                reactionDoc = await this.convertToNewSchema(reactionDoc, messageKey);
                
                // Save converted document
                await collection.replaceOne(
                    { message_key: messageKey },
                    reactionDoc,
                    { upsert: true }
                ).catch(err => {
                    this.logger.error('Failed to save converted schema:', err);
                });
            }

            // Create new document if doesn't exist
            if (!reactionDoc) {
                reactionDoc = {
                    message_key: messageKey,
                    reactions: {},
                    user_reactions: {},
                    total_count: 0,
                    created_at: new Date(),
                    last_updated: new Date(),
                    schema_version: 2
                };
            }

            // Ensure proper structure
            reactionDoc.reactions = reactionDoc.reactions || {};
            reactionDoc.user_reactions = reactionDoc.user_reactions || {};

            // Initialize reaction type if not exists
            if (!reactionDoc.reactions[reactionType]) {
                reactionDoc.reactions[reactionType] = 0;
            }
            if (!Array.isArray(reactionDoc.user_reactions[reactionType])) {
                reactionDoc.user_reactions[reactionType] = [];
            }

            // IMPORTANT: Only allow ONE reaction type per user per message
            // First, remove this user from ALL reaction types
            let previousReaction = null;
            for (const type of ['like', 'love', 'fire', 'party', 'happy', 'wow']) {
                if (reactionDoc.user_reactions[type]) {
                    const userIdStr = String(userId);
                    const typeUsers = reactionDoc.user_reactions[type].map(u => String(u));
                    const idx = typeUsers.indexOf(userIdStr);
                    
                    if (idx > -1) {
                        // User had a previous reaction
                        previousReaction = type;
                        // Remove user from this reaction type
                        reactionDoc.user_reactions[type].splice(idx, 1);
                        // Update count
                        reactionDoc.reactions[type] = Math.max(0, reactionDoc.user_reactions[type].length);
                        this.logger.log(`   🔄 Removed user's previous reaction: ${type}`);
                    }
                }
            }

            // Now handle the new reaction
            let actionText;
            const userIdStr = String(userId);
            const currentTypeUsers = reactionDoc.user_reactions[reactionType] || [];
            const currentTypeUsersStr = currentTypeUsers.map(u => String(u));
            
            if (previousReaction === reactionType) {
                // User clicked the same reaction - just remove it (already done above)
                actionText = `Removed ${this.emojiMap[reactionType]}`;
                this.logger.log(`   ➖ User ${userId} removed their ${reactionType} reaction`);
            } else {
                // Add the new reaction (user either had no reaction or a different one)
                reactionDoc.user_reactions[reactionType].push(userId);
                reactionDoc.reactions[reactionType] = reactionDoc.user_reactions[reactionType].length;
                
                if (previousReaction) {
                    actionText = `Changed to ${this.emojiMap[reactionType]}`;
                    this.logger.log(`   🔄 User ${userId} changed from ${previousReaction} to ${reactionType}`);
                } else {
                    actionText = `Added ${this.emojiMap[reactionType]}`;
                    this.logger.log(`   ➕ User ${userId} added ${reactionType}`);
                }
            }

            // Recalculate total count based on actual unique users
            reactionDoc.total_count = 0;
            for (const type in reactionDoc.user_reactions) {
                if (Array.isArray(reactionDoc.user_reactions[type])) {
                    reactionDoc.total_count += reactionDoc.user_reactions[type].length;
                }
            }

            // Update timestamp
            reactionDoc.last_updated = new Date();

            // Save with retry logic
            let saveSuccess = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await collection.replaceOne(
                        { message_key: messageKey },
                        reactionDoc,
                        { upsert: true }
                    );
                    saveSuccess = true;
                    this.logger.log(`   ✅ Saved: Total reactions = ${reactionDoc.total_count}`);
                    break;
                } catch (saveError) {
                    this.logger.error(`Save attempt ${attempt} failed:`, saveError);
                    if (attempt < 3) {
                        await this.sleep(100 * attempt);
                    }
                }
            }

            // Also check and clean up old emoji_reactions collection entries
            try {
                const oldReactions = await reactionCollection.find({ 
                    message_key: messageKey,
                    user_id: userId,
                    reaction_type: reactionType 
                }).toArray();

                if (oldReactions.length > 1) {
                    // Remove duplicates, keep only the newest
                    const sorted = oldReactions.sort((a, b) => 
                        (b.timestamp || new Date(0)) - (a.timestamp || new Date(0))
                    );
                    const toDelete = sorted.slice(1);
                    
                    if (toDelete.length > 0) {
                        await reactionCollection.deleteMany({
                            _id: { $in: toDelete.map(r => r._id) }
                        });
                        this.logger.log(`   🧹 Cleaned ${toDelete.length} duplicate reactions`);
                    }
                }
            } catch (cleanupError) {
                this.logger.warn('Failed to clean old reactions:', cleanupError.message);
            }

            return {
                success: saveSuccess,
                message: actionText,
                reactions: reactionDoc.reactions,
                totalCount: reactionDoc.total_count
            };

        } catch (error) {
            this.logger.error('Error processing reaction with schema:', error);
            return {
                success: false,
                message: 'Error processing reaction',
                reactions: {},
                totalCount: 0
            };
        }
    }

    /**
     * Check if document uses old schema format
     */
    isOldSchemaFormat(doc) {
        // Old schema indicators:
        // 1. Has reaction_type and user_id at root level
        // 2. Has reactions as an array instead of object
        // 3. Missing schema_version
        // 4. Has full reaction objects in reactions field
        return (
            doc.reaction_type || 
            doc.user_id || 
            Array.isArray(doc.reactions) ||
            (!doc.schema_version && doc.reactions && typeof doc.reactions === 'object' && 
             Object.values(doc.reactions).some(r => typeof r === 'object' && r.user_id))
        );
    }

    /**
     * Convert old schema to new schema format
     */
    async convertToNewSchema(oldDoc, messageKey) {
        const newDoc = {
            message_key: messageKey || oldDoc.message_key,
            message_id: oldDoc.message_id,
            chat_id: oldDoc.chat_id,
            reactions: {},
            user_reactions: {},
            total_count: 0,
            created_at: oldDoc.created_at || oldDoc._id?.getTimestamp() || new Date(),
            last_updated: new Date(),
            schema_version: 2
        };

        // If old doc has reaction_type and user_id at root (single reaction)
        if (oldDoc.reaction_type && oldDoc.user_id) {
            newDoc.reactions[oldDoc.reaction_type] = 1;
            newDoc.user_reactions[oldDoc.reaction_type] = [oldDoc.user_id];
            newDoc.total_count = 1;
        }
        // If old doc has reactions array
        else if (Array.isArray(oldDoc.reactions)) {
            for (const reaction of oldDoc.reactions) {
                if (reaction.type && reaction.user_id) {
                    const type = reaction.type;
                    if (!newDoc.reactions[type]) {
                        newDoc.reactions[type] = 0;
                        newDoc.user_reactions[type] = [];
                    }
                    if (!newDoc.user_reactions[type].includes(reaction.user_id)) {
                        newDoc.user_reactions[type].push(reaction.user_id);
                    }
                }
            }
            // Recalculate counts based on unique users
            for (const type in newDoc.user_reactions) {
                newDoc.reactions[type] = newDoc.user_reactions[type].length;
                newDoc.total_count += newDoc.user_reactions[type].length;
            }
        }
        // If old doc has reactions as object with full reaction objects
        else if (typeof oldDoc.reactions === 'object') {
            for (const [type, reactionData] of Object.entries(oldDoc.reactions)) {
                if (typeof reactionData === 'object' && reactionData.user_id) {
                    // Old format with full objects
                    if (!newDoc.reactions[type]) {
                        newDoc.reactions[type] = 0;
                        newDoc.user_reactions[type] = [];
                    }
                    if (!newDoc.user_reactions[type].includes(reactionData.user_id)) {
                        newDoc.user_reactions[type].push(reactionData.user_id);
                        newDoc.reactions[type]++;
                        newDoc.total_count++;
                    }
                } else if (typeof reactionData === 'number') {
                    // Already in correct format, just copy
                    newDoc.reactions[type] = reactionData;
                    if (oldDoc.user_reactions && oldDoc.user_reactions[type]) {
                        newDoc.user_reactions[type] = oldDoc.user_reactions[type];
                    }
                }
            }
        }

        return newDoc;
    }

    /**
     * Update the reaction keyboard with new counts
     */
    async updateReactionKeyboard(ctx, messageKey, reactions) {
        try {
            const keyboard = {
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

            await ctx.editMessageReplyMarkup(keyboard).catch(err => {
                this.logger.warn(`Could not update keyboard: ${err.message}`);
            });
            
        } catch (error) {
            this.logger.warn(`Failed to update reaction keyboard: ${error.message}`);
        }
    }

    /**
     * Get safe database connection
     */
    async getSafeDatabase() {
        try {
            if (!this.db) {
                throw new Error('Database service not initialized');
            }

            // Handle different database service interfaces
            if (typeof this.db.getDatabase === 'function') {
                return this.db.getDatabase();
            } else if (this.db.db) {
                return this.db.db;
            } else if (this.db.collection) {
                // Already a database object
                return this.db;
            }

            throw new Error('Unknown database service interface');
        } catch (error) {
            this.logger.error('Failed to get database connection:', error);
            return null;
        }
    }

    /**
     * Safe callback answer with error handling
     */
    async safeAnswerCallback(ctx, text, showAlert = false) {
        try {
            await ctx.answerCbQuery(text, { show_alert: showAlert });
        } catch (error) {
            // Check if error is because query is too old (common issue)
            if (error.description?.includes('query is too old')) {
                this.logger.debug('Callback query expired, user will see loading stop');
            } else {
                this.logger.warn(`Failed to answer callback: ${error.message}`);
            }
            // Silently fail - user will see loading stop
        }
    }

    /**
     * Sleep helper for retry logic
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get reaction stats for a message (for display purposes)
     */
    async getMessageReactions(messageKey) {
        try {
            const db = await this.getSafeDatabase();
            if (!db) return {};

            const collection = db.collection('zone_persistent_reactions');
            const doc = await collection.findOne({ message_key: messageKey });

            if (!doc || !doc.reactions) {
                return {};
            }

            // Return only valid reaction counts
            const validReactions = {};
            for (const [type, count] of Object.entries(doc.reactions)) {
                if (typeof count === 'number' && count >= 0) {
                    validReactions[type] = count;
                }
            }

            return validReactions;

        } catch (error) {
            this.logger.error('Error getting message reactions:', error);
            return {};
        }
    }
}

module.exports = EmojiReactionHandler;