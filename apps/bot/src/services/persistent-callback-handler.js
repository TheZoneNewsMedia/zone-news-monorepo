/**
 * Persistent Callback Handler
 * Stores inline button callbacks in database for zero-downtime handling
 * When bot restarts, it can process missed callbacks
 */

const { ObjectId } = require('mongodb');

class PersistentCallbackHandler {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.processingQueue = new Map();
    }
    
    /**
     * Store callback data when creating inline keyboards
     */
    async storeCallbackData(messageId, chatId, callbackData) {
        try {
            await this.db.collection('pending_callbacks').insertOne({
                message_id: messageId,
                chat_id: chatId,
                callback_data: callbackData,
                created_at: new Date(),
                processed: false,
                expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
            });
        } catch (error) {
            console.error('Failed to store callback data:', error);
        }
    }
    
    /**
     * Process callback query with persistence
     */
    async handleCallbackQuery(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message?.message_id;
        const chatId = callbackQuery.message?.chat?.id;
        const userId = callbackQuery.from.id;
        
        // Store the callback attempt
        const callbackRecord = {
            callback_id: callbackQuery.id,
            message_id: messageId,
            chat_id: chatId,
            user_id: userId,
            callback_data: data,
            received_at: new Date(),
            processed: false
        };
        
        try {
            // Insert or update callback record
            await this.db.collection('callback_queue').replaceOne(
                { callback_id: callbackQuery.id },
                callbackRecord,
                { upsert: true }
            );
            
            // Process the callback
            const result = await this.processCallback(ctx, callbackRecord);
            
            // Mark as processed
            await this.db.collection('callback_queue').updateOne(
                { callback_id: callbackQuery.id },
                { 
                    $set: { 
                        processed: true,
                        processed_at: new Date(),
                        result: result
                    }
                }
            );
            
            return result;
            
        } catch (error) {
            console.error('Callback handling error:', error);
            
            // Store error for retry
            await this.db.collection('callback_queue').updateOne(
                { callback_id: callbackQuery.id },
                { 
                    $set: { 
                        error: error.message,
                        retry_count: { $inc: 1 },
                        last_retry: new Date()
                    }
                }
            );
            
            throw error;
        }
    }
    
    /**
     * Process callback based on type
     */
    async processCallback(ctx, record) {
        const data = record.callback_data;
        
        // Handle reactions - these are most critical for persistence
        if (data.startsWith('react:')) {
            return await this.handleReactionCallback(ctx, record);
        }
        
        // Handle other callback types
        if (data.startsWith('post:')) {
            return await this.handlePostCallback(ctx, record);
        }
        
        if (data.startsWith('news:')) {
            return await this.handleNewsCallback(ctx, record);
        }
        
        // Default handler
        return { processed: true };
    }
    
    /**
     * Handle reaction callbacks with zero downtime
     */
    async handleReactionCallback(ctx, record) {
        const parts = record.callback_data.split(':');
        const reactionType = parts[1];
        const articleId = parts[2];
        const postId = parts[3];
        
        // Check if reaction already exists (in case of duplicate processing)
        const existingReaction = await this.db.collection('user_reactions').findOne({
            user_id: record.user_id,
            post_id: postId,
            reaction: reactionType,
            message_id: record.message_id
        });
        
        if (existingReaction?.processed_while_offline) {
            // This was already handled while bot was down
            await ctx.answerCbQuery('Reaction already recorded!');
            return { status: 'duplicate', existing: true };
        }
        
        // Process the reaction
        let action;
        if (existingReaction) {
            // Remove reaction
            await this.db.collection('user_reactions').deleteOne({
                _id: existingReaction._id
            });
            
            // Update counts
            await this.db.collection('posted_articles').updateOne(
                { _id: new ObjectId(postId) },
                { $inc: { [`reactions.${reactionType}`]: -1 } }
            );
            
            action = 'removed';
        } else {
            // Add reaction
            await this.db.collection('user_reactions').insertOne({
                user_id: record.user_id,
                username: ctx.from?.username,
                post_id: postId,
                article_id: new ObjectId(articleId),
                message_id: record.message_id,
                chat_id: record.chat_id,
                reaction: reactionType,
                created_at: new Date(),
                processed_while_offline: !ctx.botInfo // Mark if bot was offline
            });
            
            // Update counts
            await this.db.collection('posted_articles').updateOne(
                { _id: new ObjectId(postId) },
                { $inc: { [`reactions.${reactionType}`]: 1 } }
            );
            
            action = 'added';
        }
        
        // Update the keyboard with new counts
        await this.updateReactionKeyboard(ctx, postId, articleId);
        
        // Answer callback
        const emoji = reactionType === 'like' ? '👍' : reactionType === 'love' ? '❤️' : '🔥';
        await ctx.answerCbQuery(`${emoji} ${action === 'added' ? 'Added!' : 'Removed'}`);
        
        return { status: 'success', action, reaction: reactionType };
    }
    
    /**
     * Update reaction keyboard with current counts
     */
    async updateReactionKeyboard(ctx, postId, articleId) {
        try {
            const post = await this.db.collection('posted_articles')
                .findOne({ _id: new ObjectId(postId) });
            
            if (!post) return;
            
            const reactions = post.reactions || { like: 0, love: 0, fire: 0 };
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: `👍 ${reactions.like}`, callback_data: `react:like:${articleId}:${postId}` },
                        { text: `❤️ ${reactions.love}`, callback_data: `react:love:${articleId}:${postId}` },
                        { text: `🔥 ${reactions.fire}`, callback_data: `react:fire:${articleId}:${postId}` }
                    ],
                    [
                        { text: '💬 Comment', callback_data: `comment:${articleId}` },
                        { text: '🔗 Share', callback_data: `share:${articleId}` }
                    ]
                ]
            };
            
            await ctx.editMessageReplyMarkup(keyboard);
        } catch (error) {
            // Ignore errors - message might be too old or deleted
            if (!error.message?.includes('message is not modified')) {
                console.error('Failed to update keyboard:', error);
            }
        }
    }
    
    /**
     * Process pending callbacks on bot startup
     */
    async processPendingCallbacks() {
        console.log('🔄 Processing pending callbacks...');
        
        const pendingCallbacks = await this.db.collection('callback_queue')
            .find({
                processed: false,
                $or: [
                    { retry_count: { $lt: 3 } },
                    { retry_count: { $exists: false } }
                ]
            })
            .sort({ received_at: 1 })
            .limit(100)
            .toArray();
        
        console.log(`Found ${pendingCallbacks.length} pending callbacks`);
        
        for (const callback of pendingCallbacks) {
            try {
                // Create a minimal context for processing
                const minimalCtx = {
                    callbackQuery: {
                        id: callback.callback_id,
                        data: callback.callback_data,
                        message: {
                            message_id: callback.message_id,
                            chat: { id: callback.chat_id }
                        },
                        from: { id: callback.user_id }
                    },
                    from: { id: callback.user_id },
                    answerCbQuery: async (text) => {
                        console.log(`Callback answer: ${text}`);
                    },
                    editMessageReplyMarkup: async (markup) => {
                        try {
                            await this.bot.telegram.editMessageReplyMarkup(
                                callback.chat_id,
                                callback.message_id,
                                null,
                                markup
                            );
                        } catch (e) {
                            // Message might be too old
                        }
                    }
                };
                
                await this.processCallback(minimalCtx, callback);
                
                // Mark as processed
                await this.db.collection('callback_queue').updateOne(
                    { _id: callback._id },
                    { 
                        $set: { 
                            processed: true,
                            processed_at: new Date()
                        }
                    }
                );
                
            } catch (error) {
                console.error(`Failed to process pending callback ${callback.callback_id}:`, error);
                
                // Update retry count
                await this.db.collection('callback_queue').updateOne(
                    { _id: callback._id },
                    { 
                        $inc: { retry_count: 1 },
                        $set: { 
                            last_error: error.message,
                            last_retry: new Date()
                        }
                    }
                );
            }
        }
        
        console.log('✅ Pending callbacks processed');
    }
    
    /**
     * Clean up old callback records
     */
    async cleanupOldCallbacks() {
        const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
        
        const result = await this.db.collection('callback_queue').deleteMany({
            processed: true,
            processed_at: { $lt: cutoffDate }
        });
        
        console.log(`🧹 Cleaned up ${result.deletedCount} old callback records`);
    }
    
    /**
     * Get callback statistics
     */
    async getCallbackStats() {
        const [total, pending, failed] = await Promise.all([
            this.db.collection('callback_queue').countDocuments(),
            this.db.collection('callback_queue').countDocuments({ processed: false }),
            this.db.collection('callback_queue').countDocuments({ 
                processed: false,
                retry_count: { $gte: 3 }
            })
        ]);
        
        return {
            total,
            pending,
            failed,
            success: total - pending
        };
    }
    
    /**
     * Handle post callbacks
     */
    async handlePostCallback(ctx, record) {
        // Implementation for post callbacks
        return { status: 'success', type: 'post' };
    }
    
    /**
     * Handle news callbacks
     */
    async handleNewsCallback(ctx, record) {
        // Implementation for news callbacks
        return { status: 'success', type: 'news' };
    }
}

module.exports = PersistentCallbackHandler;