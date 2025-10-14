/**
 * ReactionService - Handles message reactions
 * Single Responsibility: Track and manage reactions on posts
 */

class ReactionService {
    constructor(database) {
        this.bot = null;
        this.db = database;
        this.reactionHandlers = new Map();
    }

    setBot(bot) {
        this.bot = bot;
        this.setupHandlers();
    }

    async initialize() {
        console.log('  📊 Reaction tracking enabled');
    }

    /**
     * Set up reaction handlers
     */
    setupHandlers() {
        // Handle new reactions
        this.bot.on('message_reaction', async (ctx) => {
            await this.handleReaction(ctx);
        });

        // Handle reaction count updates
        this.bot.on('message_reaction_count', async (ctx) => {
            await this.handleReactionCount(ctx);
        });
    }

    /**
     * Handle individual reaction
     */
    async handleReaction(ctx) {
        try {
            const update = ctx.update.message_reaction;
            
            // Log reaction
            console.log(`👍 Reaction from user ${update.user.id} on message ${update.message_id}`);
            
            // Store in database
            if (this.db) {
                await this.db.collection('reactions').insertOne({
                    messageId: update.message_id,
                    chatId: update.chat.id,
                    userId: update.user.id,
                    oldReaction: update.old_reaction,
                    newReaction: update.new_reaction,
                    timestamp: new Date()
                });
            }

            // Call custom handlers if registered
            const handler = this.reactionHandlers.get(update.chat.id);
            if (handler) {
                await handler(update);
            }
        } catch (error) {
            console.error('Error handling reaction:', error);
        }
    }

    /**
     * Handle reaction count updates
     */
    async handleReactionCount(ctx) {
        try {
            const update = ctx.update.message_reaction_count;
            
            console.log(`📊 Reaction count update for message ${update.message_id}`);
            
            // Update article reaction count
            if (this.db) {
                await this.db.collection('news_articles').updateOne(
                    { message_id: update.message_id },
                    { 
                        $set: { 
                            reactions: update.reactions,
                            updated_at: new Date()
                        }
                    }
                );
            }
        } catch (error) {
            console.error('Error handling reaction count:', error);
        }
    }

    /**
     * Register custom reaction handler for a channel
     */
    registerHandler(chatId, handler) {
        this.reactionHandlers.set(chatId, handler);
    }

    /**
     * Get reaction stats for a message
     */
    async getReactionStats(messageId) {
        if (!this.db) return null;
        
        const reactions = await this.db.collection('reactions')
            .find({ messageId })
            .toArray();
        
        // Aggregate by reaction type
        const stats = {};
        reactions.forEach(r => {
            if (r.newReaction) {
                r.newReaction.forEach(emoji => {
                    stats[emoji.emoji] = (stats[emoji.emoji] || 0) + 1;
                });
            }
        });
        
        return stats;
    }

    /**
     * Get top reacted articles
     */
    async getTopReactedArticles(limit = 10) {
        if (!this.db) return [];
        
        return await this.db.collection('news_articles')
            .find({ reactions: { $exists: true } })
            .sort({ 'reactions.total': -1 })
            .limit(limit)
            .toArray();
    }
}

module.exports = ReactionService;