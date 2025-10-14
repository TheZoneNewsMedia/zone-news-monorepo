/**
 * Scalable TBC Reaction System
 * Handles reactions from multiple users without conflicts
 * Includes rate limiting, user tracking, and performance optimization
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

class ScalableReactionSystem {
    constructor(db, bot) {
        this.db = db;
        this.bot = bot;
        
        // In-memory cache for frequently accessed reactions
        this.reactionCache = new Map();
        this.cacheExpiry = 60000; // 1 minute cache
        
        // Rate limiting per user
        this.userRateLimit = new Map();
        this.rateLimitWindow = 10000; // 10 seconds
        this.rateLimitMax = 5; // 5 reactions per window
        
        // Queue for batch database updates
        this.updateQueue = [];
        this.batchSize = 10;
        this.batchTimeout = 2000; // 2 seconds
        
        this.startBatchProcessor();
    }

    /**
     * Check if user is rate limited
     */
    checkRateLimit(userId) {
        const now = Date.now();
        const userLimit = this.userRateLimit.get(userId) || { count: 0, windowStart: now };
        
        // Reset window if expired
        if (now - userLimit.windowStart > this.rateLimitWindow) {
            userLimit.count = 0;
            userLimit.windowStart = now;
        }
        
        if (userLimit.count >= this.rateLimitMax) {
            return false; // Rate limited
        }
        
        userLimit.count++;
        this.userRateLimit.set(userId, userLimit);
        return true;
    }

    /**
     * Get reaction data with caching
     */
    async getReactionData(messageKey) {
        // Check cache first
        const cached = this.reactionCache.get(messageKey);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }
        
        // Fetch from database
        let reactionDoc = await this.db.collection('zone_persistent_reactions').findOne({
            message_key: messageKey
        });
        
        if (!reactionDoc) {
            // Create default reaction document
            reactionDoc = {
                message_key: messageKey,
                reactions: { like: 0, love: 0, fire: 0, party: 0, happy: 0, wow: 0 },
                user_reactions: { like: [], love: [], fire: [], party: [], happy: [], wow: [] },
                total_count: 0,
                created_at: new Date(),
                last_updated: new Date()
            };
            
            await this.db.collection('zone_persistent_reactions').insertOne(reactionDoc);
        }
        
        // Update cache
        this.reactionCache.set(messageKey, {
            data: reactionDoc,
            timestamp: Date.now()
        });
        
        return reactionDoc;
    }

    /**
     * Process reaction with optimistic updates
     */
    async processReaction(messageKey, reactionType, userId, userName = 'User') {
        try {
            // Rate limiting check
            if (!this.checkRateLimit(userId)) {
                return {
                    success: false,
                    error: 'Rate limited. Please wait before reacting again.',
                    rateLimited: true
                };
            }
            
            // Get current reaction data
            const reactionDoc = await this.getReactionData(messageKey);
            
            // Initialize if needed
            if (!reactionDoc.reactions[reactionType]) reactionDoc.reactions[reactionType] = 0;
            if (!reactionDoc.user_reactions[reactionType]) reactionDoc.user_reactions[reactionType] = [];
            
            // Check if user already reacted
            const userReacted = reactionDoc.user_reactions[reactionType].includes(userId);
            let actionText = '';
            let countChange = 0;
            
            if (userReacted) {
                // Remove reaction
                reactionDoc.reactions[reactionType] = Math.max(0, reactionDoc.reactions[reactionType] - 1);
                reactionDoc.user_reactions[reactionType] = reactionDoc.user_reactions[reactionType].filter(id => id !== userId);
                actionText = `Removed ${this.getEmojiForReaction(reactionType)}`;
                countChange = -1;
            } else {
                // Add reaction
                reactionDoc.reactions[reactionType]++;
                reactionDoc.user_reactions[reactionType].push(userId);
                actionText = `Added ${this.getEmojiForReaction(reactionType)}`;
                countChange = 1;
            }
            
            // Update total count
            reactionDoc.total_count = Object.values(reactionDoc.reactions).reduce((sum, count) => sum + count, 0);
            reactionDoc.last_updated = new Date();
            
            // Update cache immediately (optimistic update)
            this.reactionCache.set(messageKey, {
                data: reactionDoc,
                timestamp: Date.now()
            });
            
            // Queue database update
            this.queueDatabaseUpdate(messageKey, reactionDoc, {
                userId,
                userName,
                reactionType,
                action: userReacted ? 'remove' : 'add',
                countChange,
                timestamp: new Date()
            });
            
            return {
                success: true,
                actionText,
                newReactions: reactionDoc.reactions,
                totalCount: reactionDoc.total_count,
                userReacted: !userReacted // New state
            };
            
        } catch (error) {
            console.error('❌ Error processing reaction:', error);
            return {
                success: false,
                error: 'Failed to process reaction. Please try again.'
            };
        }
    }

    /**
     * Queue database update for batch processing
     */
    queueDatabaseUpdate(messageKey, reactionDoc, metadata) {
        this.updateQueue.push({
            messageKey,
            reactionDoc,
            metadata,
            timestamp: Date.now()
        });
        
        // Process immediately if queue is full
        if (this.updateQueue.length >= this.batchSize) {
            this.processBatchUpdates();
        }
    }

    /**
     * Start batch processor for database updates
     */
    startBatchProcessor() {
        setInterval(() => {
            if (this.updateQueue.length > 0) {
                this.processBatchUpdates();
            }
        }, this.batchTimeout);
    }

    /**
     * Process queued database updates in batch
     */
    async processBatchUpdates() {
        if (this.updateQueue.length === 0) return;
        
        const updates = [...this.updateQueue];
        this.updateQueue = [];
        
        try {
            console.log(`📝 Processing ${updates.length} reaction updates...`);
            
            // Group updates by message key to avoid conflicts
            const groupedUpdates = new Map();
            updates.forEach(update => {
                groupedUpdates.set(update.messageKey, update);
            });
            
            // Process each message's updates
            const operations = [];
            const activityLogs = [];
            
            for (const [messageKey, update] of groupedUpdates) {
                // Database update operation
                operations.push({
                    replaceOne: {
                        filter: { message_key: messageKey },
                        replacement: update.reactionDoc,
                        upsert: true
                    }
                });
                
                // Activity log for analytics
                activityLogs.push({
                    message_key: messageKey,
                    user_id: update.metadata.userId,
                    user_name: update.metadata.userName,
                    reaction_type: update.metadata.reactionType,
                    action: update.metadata.action,
                    count_change: update.metadata.countChange,
                    timestamp: update.metadata.timestamp,
                    batch_processed_at: new Date()
                });
            }
            
            // Execute batch operations
            if (operations.length > 0) {
                await this.db.collection('zone_persistent_reactions').bulkWrite(operations);
                console.log(`   ✅ Updated ${operations.length} reaction documents`);
            }
            
            // Log activity for analytics
            if (activityLogs.length > 0) {
                await this.db.collection('reaction_activity_log').insertMany(activityLogs);
                console.log(`   📊 Logged ${activityLogs.length} reaction activities`);
            }
            
        } catch (error) {
            console.error('❌ Error in batch processing:', error);
            
            // Re-queue failed updates for retry
            updates.forEach(update => {
                if (!update.retryCount) update.retryCount = 0;
                if (update.retryCount < 3) {
                    update.retryCount++;
                    this.updateQueue.push(update);
                }
            });
        }
    }

    /**
     * Create updated reaction keyboard
     */
    createReactionKeyboard(messageKey, reactions) {
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

    /**
     * Handle callback query with full scalability
     */
    async handleScalableReaction(ctx) {
        try {
            const callbackData = ctx.callbackQuery.data;
            const userId = ctx.callbackQuery.from.id;
            const userName = ctx.callbackQuery.from.first_name || 'User';
            const messageId = ctx.callbackQuery.message.message_id;
            
            console.log(`🔄 Processing scalable reaction: ${callbackData} from ${userName} (${userId})`);
            
            // Parse callback data
            const parts = callbackData.split('_');
            if (parts.length < 3 || parts[0] !== 'persist') {
                return await ctx.answerCbQuery('Invalid reaction format');
            }
            
            const reactionType = parts[1];
            const messageKey = parts.slice(2).join('_');
            
            // Process reaction
            const result = await this.processReaction(messageKey, reactionType, userId, userName);
            
            if (!result.success) {
                return await ctx.answerCbQuery(result.error);
            }
            
            // Update message keyboard immediately (optimistic update)
            try {
                const updatedKeyboard = this.createReactionKeyboard(messageKey, result.newReactions);
                await ctx.editMessageReplyMarkup(updatedKeyboard);
                console.log(`   ✅ Updated keyboard for ${messageKey} (${result.totalCount} total reactions)`);
            } catch (editError) {
                console.log(`   ⚠️  Could not update keyboard: ${editError.message}`);
            }
            
            // Answer callback query
            await ctx.answerCbQuery(result.actionText);
            
            return result;
            
        } catch (error) {
            console.error('❌ Error in scalable reaction handler:', error);
            await ctx.answerCbQuery('Error processing reaction').catch(() => {});
            return { success: false, error: error.message };
        }
    }

    /**
     * Get reaction statistics for analytics
     */
    async getReactionStats(timeframe = '24h') {
        try {
            const timeframeMs = {
                '1h': 60 * 60 * 1000,
                '24h': 24 * 60 * 60 * 1000,
                '7d': 7 * 24 * 60 * 60 * 1000,
                '30d': 30 * 24 * 60 * 60 * 1000
            };
            
            const since = new Date(Date.now() - timeframeMs[timeframe]);
            
            const stats = await this.db.collection('reaction_activity_log').aggregate([
                { $match: { timestamp: { $gte: since } } },
                {
                    $group: {
                        _id: '$reaction_type',
                        total_reactions: { $sum: 1 },
                        unique_users: { $addToSet: '$user_id' },
                        adds: { $sum: { $cond: [{ $eq: ['$action', 'add'] }, 1, 0] } },
                        removes: { $sum: { $cond: [{ $eq: ['$action', 'remove'] }, 1, 0] } }
                    }
                },
                {
                    $project: {
                        reaction_type: '$_id',
                        total_reactions: 1,
                        unique_users: { $size: '$unique_users' },
                        adds: 1,
                        removes: 1,
                        net_reactions: { $subtract: ['$adds', '$removes'] }
                    }
                }
            ]).toArray();
            
            return {
                timeframe,
                period: since.toISOString(),
                stats
            };
            
        } catch (error) {
            console.error('❌ Error getting reaction stats:', error);
            return { timeframe, stats: [] };
        }
    }

    /**
     * Clean up old data and optimize performance
     */
    async cleanup() {
        try {
            console.log('🧹 Running reaction system cleanup...');
            
            // Clear expired cache entries
            const now = Date.now();
            for (const [key, entry] of this.reactionCache) {
                if (now - entry.timestamp > this.cacheExpiry) {
                    this.reactionCache.delete(key);
                }
            }
            
            // Clear old rate limit entries
            for (const [userId, limit] of this.userRateLimit) {
                if (now - limit.windowStart > this.rateLimitWindow * 2) {
                    this.userRateLimit.delete(userId);
                }
            }
            
            // Archive old activity logs (older than 30 days)
            const archiveDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const result = await this.db.collection('reaction_activity_log').deleteMany({
                timestamp: { $lt: archiveDate }
            });
            
            console.log(`   ✅ Cleaned ${result.deletedCount} old activity logs`);
            console.log(`   ✅ Cache size: ${this.reactionCache.size} entries`);
            console.log(`   ✅ Rate limit tracking: ${this.userRateLimit.size} users`);
            
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }
}

module.exports = ScalableReactionSystem;