/**
 * Local Reaction Sync Service
 * Handles reactions locally and syncs with server
 */

const { ObjectId } = require('mongodb');

class LocalReactionSync {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.localCache = new Map(); // Local reaction cache
        this.syncQueue = [];
        this.syncInterval = null;
    }
    
    /**
     * Initialize local sync service
     */
    async init() {
        // Load existing reactions into local cache
        await this.loadReactionsToCache();
        
        // Start sync interval (every 30 seconds)
        this.syncInterval = setInterval(() => {
            this.syncToServer();
        }, 30000);
        
        console.log('✅ Local reaction sync initialized');
    }
    
    /**
     * Load reactions from DB to local cache
     */
    async loadReactionsToCache() {
        try {
            const reactions = await this.db.collection('posted_articles')
                .find({}, { projection: { _id: 1, reactions: 1, message_id: 1, destination_chat_id: 1 } })
                .toArray();
            
            reactions.forEach(post => {
                const key = `${post.destination_chat_id}_${post.message_id}`;
                this.localCache.set(key, {
                    postId: post._id.toString(),
                    reactions: post.reactions || { like: 0, love: 0, fire: 0 },
                    synced: true
                });
            });
            
            console.log(`📊 Loaded ${reactions.length} posts to local cache`);
        } catch (error) {
            console.error('Failed to load reactions to cache:', error);
        }
    }
    
    /**
     * Handle reaction locally first
     */
    async handleReactionLocal(ctx, reactionType, articleId, postId) {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const messageId = ctx.callbackQuery.message.message_id;
        
        // Create cache key
        const cacheKey = `${chatId}_${messageId}`;
        const userReactionKey = `${userId}_${postId}_${reactionType}`;
        
        // Get or create local reaction data
        let localData = this.localCache.get(cacheKey);
        if (!localData) {
            localData = {
                postId: postId,
                reactions: { like: 0, love: 0, fire: 0 },
                synced: false
            };
            this.localCache.set(cacheKey, localData);
        }
        
        // Track user reactions locally
        const userReactions = this.getUserReactions(userId);
        const hasReacted = userReactions.has(userReactionKey);
        
        // Update local counts
        if (hasReacted) {
            // Remove reaction
            localData.reactions[reactionType]--;
            userReactions.delete(userReactionKey);
            
            // Add to sync queue
            this.addToSyncQueue({
                type: 'remove_reaction',
                userId,
                postId,
                articleId,
                reactionType,
                chatId,
                messageId,
                timestamp: new Date()
            });
        } else {
            // Add reaction
            localData.reactions[reactionType]++;
            userReactions.add(userReactionKey);
            
            // Add to sync queue
            this.addToSyncQueue({
                type: 'add_reaction',
                userId,
                postId,
                articleId,
                reactionType,
                chatId,
                messageId,
                username: ctx.from.username,
                timestamp: new Date()
            });
        }
        
        // Mark as unsynced
        localData.synced = false;
        
        // Update keyboard immediately with local data
        await this.updateKeyboardLocal(ctx, localData.reactions, articleId, postId);
        
        // Answer callback immediately
        const emoji = reactionType === 'like' ? '👍' : reactionType === 'love' ? '❤️' : '🔥';
        await ctx.answerCbQuery(
            hasReacted ? `${emoji} Removed` : `${emoji} Added!`,
            { cache_time: 1 }
        );
        
        // Try immediate sync if online
        this.trySyncNow();
        
        return {
            success: true,
            action: hasReacted ? 'removed' : 'added',
            localCount: localData.reactions[reactionType]
        };
    }
    
    /**
     * Get user reactions from local storage
     */
    getUserReactions(userId) {
        const key = `user_${userId}`;
        if (!this.localCache.has(key)) {
            this.localCache.set(key, new Set());
        }
        return this.localCache.get(key);
    }
    
    /**
     * Update keyboard with local reaction counts
     */
    async updateKeyboardLocal(ctx, reactions, articleId, postId) {
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
        
        try {
            await ctx.editMessageReplyMarkup(keyboard);
        } catch (error) {
            // Ignore if message not modified
            if (!error.message?.includes('message is not modified')) {
                console.error('Failed to update keyboard:', error.message);
            }
        }
    }
    
    /**
     * Add action to sync queue
     */
    addToSyncQueue(action) {
        this.syncQueue.push(action);
        
        // Store queue locally in case of crash
        this.saveQueueLocally();
    }
    
    /**
     * Save sync queue to local file
     */
    saveQueueLocally() {
        try {
            const fs = require('fs');
            const queueFile = '/tmp/reaction_sync_queue.json';
            fs.writeFileSync(queueFile, JSON.stringify(this.syncQueue));
        } catch (error) {
            console.error('Failed to save sync queue:', error);
        }
    }
    
    /**
     * Load sync queue from local file
     */
    loadQueueLocally() {
        try {
            const fs = require('fs');
            const queueFile = '/tmp/reaction_sync_queue.json';
            if (fs.existsSync(queueFile)) {
                const data = fs.readFileSync(queueFile, 'utf8');
                this.syncQueue = JSON.parse(data);
                console.log(`📥 Loaded ${this.syncQueue.length} pending syncs from disk`);
            }
        } catch (error) {
            console.error('Failed to load sync queue:', error);
        }
    }
    
    /**
     * Try to sync immediately
     */
    async trySyncNow() {
        // Check if we have network connection
        const isOnline = await this.checkConnection();
        if (isOnline && this.syncQueue.length > 0) {
            await this.syncToServer();
        }
    }
    
    /**
     * Sync local reactions to server
     */
    async syncToServer() {
        if (this.syncQueue.length === 0) return;
        
        console.log(`🔄 Syncing ${this.syncQueue.length} reactions to server...`);
        
        const batch = [...this.syncQueue];
        this.syncQueue = [];
        
        try {
            // Process batch
            for (const action of batch) {
                if (action.type === 'add_reaction') {
                    await this.syncAddReaction(action);
                } else if (action.type === 'remove_reaction') {
                    await this.syncRemoveReaction(action);
                }
            }
            
            console.log(`✅ Synced ${batch.length} reactions`);
            
            // Clear local queue file
            this.saveQueueLocally();
            
        } catch (error) {
            console.error('Sync failed, will retry:', error);
            // Put items back in queue
            this.syncQueue = [...batch, ...this.syncQueue];
            this.saveQueueLocally();
        }
    }
    
    /**
     * Sync add reaction to database
     */
    async syncAddReaction(action) {
        // Add to user_reactions
        await this.db.collection('user_reactions').insertOne({
            user_id: action.userId,
            username: action.username,
            post_id: action.postId,
            article_id: new ObjectId(action.articleId),
            reaction: action.reactionType,
            chat_id: action.chatId,
            message_id: action.messageId,
            created_at: action.timestamp,
            synced_from_local: true
        });
        
        // Update posted_articles count
        await this.db.collection('posted_articles').updateOne(
            { _id: new ObjectId(action.postId) },
            { $inc: { [`reactions.${action.reactionType}`]: 1 } }
        );
        
        // Update global reactions
        await this.db.collection('news_articles').updateOne(
            { _id: new ObjectId(action.articleId) },
            { 
                $inc: { [`total_reactions.${action.reactionType}`]: 1 },
                $set: { last_reaction_at: action.timestamp }
            }
        );
    }
    
    /**
     * Sync remove reaction to database
     */
    async syncRemoveReaction(action) {
        // Remove from user_reactions
        await this.db.collection('user_reactions').deleteOne({
            user_id: action.userId,
            post_id: action.postId,
            reaction: action.reactionType
        });
        
        // Update posted_articles count
        await this.db.collection('posted_articles').updateOne(
            { _id: new ObjectId(action.postId) },
            { $inc: { [`reactions.${action.reactionType}`]: -1 } }
        );
        
        // Update global reactions
        await this.db.collection('news_articles').updateOne(
            { _id: new ObjectId(action.articleId) },
            { $inc: { [`total_reactions.${action.reactionType}`]: -1 } }
        );
    }
    
    /**
     * Check if we have connection to database
     */
    async checkConnection() {
        try {
            await this.db.admin().ping();
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Get local reaction stats
     */
    getLocalStats() {
        let totalReactions = 0;
        let unsyncedPosts = 0;
        
        this.localCache.forEach((value, key) => {
            if (key.includes('_')) { // It's a post cache entry
                const reactions = value.reactions;
                totalReactions += (reactions.like + reactions.love + reactions.fire);
                if (!value.synced) {
                    unsyncedPosts++;
                }
            }
        });
        
        return {
            cachedPosts: this.localCache.size,
            totalReactions,
            unsyncedPosts,
            pendingSyncs: this.syncQueue.length
        };
    }
    
    /**
     * Stop sync service
     */
    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        // Final sync attempt
        this.syncToServer().catch(console.error);
    }
}

module.exports = LocalReactionSync;