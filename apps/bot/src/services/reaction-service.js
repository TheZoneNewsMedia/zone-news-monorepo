/**
 * Reaction Service
 * Handles message reactions and reaction analytics
 */

const mongoose = require('mongoose');

// Reaction Schema
const reactionSchema = new mongoose.Schema({
  messageId: { type: Number, required: true, index: true },
  chatId: { type: Number, required: true },
  userId: { type: Number, required: true },
  reactions: [{
    emoji: String,
    count: Number,
    users: [Number]
  }],
  totalReactions: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Create compound index for efficient queries
reactionSchema.index({ messageId: 1, chatId: 1 });
reactionSchema.index({ userId: 1, timestamp: -1 });

const Reaction = mongoose.model('Reaction', reactionSchema);

class ReactionService {
  constructor() {
    this.reactionCache = new Map();
  }

  /**
   * Handle a new reaction or reaction change
   */
  async handleReaction(data) {
    const { messageId, userId, chatId, newReaction, oldReaction, timestamp } = data;
    
    try {
      // Find or create reaction document
      let reactionDoc = await Reaction.findOne({ messageId, chatId });
      
      if (!reactionDoc) {
        reactionDoc = new Reaction({
          messageId,
          chatId,
          reactions: [],
          totalReactions: 0
        });
      }

      // Remove old reaction if exists
      if (oldReaction && oldReaction.length > 0) {
        const oldEmoji = oldReaction[0].emoji;
        const oldReactionIndex = reactionDoc.reactions.findIndex(r => r.emoji === oldEmoji);
        
        if (oldReactionIndex !== -1) {
          const userIndex = reactionDoc.reactions[oldReactionIndex].users.indexOf(userId);
          if (userIndex !== -1) {
            reactionDoc.reactions[oldReactionIndex].users.splice(userIndex, 1);
            reactionDoc.reactions[oldReactionIndex].count--;
            
            // Remove reaction if no users left
            if (reactionDoc.reactions[oldReactionIndex].count === 0) {
              reactionDoc.reactions.splice(oldReactionIndex, 1);
            }
            
            reactionDoc.totalReactions--;
          }
        }
      }

      // Add new reaction if exists
      if (newReaction && newReaction.length > 0) {
        const newEmoji = newReaction[0].emoji;
        let reactionIndex = reactionDoc.reactions.findIndex(r => r.emoji === newEmoji);
        
        if (reactionIndex === -1) {
          reactionDoc.reactions.push({
            emoji: newEmoji,
            count: 1,
            users: [userId]
          });
        } else {
          if (!reactionDoc.reactions[reactionIndex].users.includes(userId)) {
            reactionDoc.reactions[reactionIndex].users.push(userId);
            reactionDoc.reactions[reactionIndex].count++;
          }
        }
        
        reactionDoc.totalReactions++;
      }

      reactionDoc.lastUpdated = timestamp || new Date();
      await reactionDoc.save();

      // Update cache
      this.reactionCache.set(`${messageId}_${chatId}`, reactionDoc);

      // Log reaction activity
      console.log(`[Reaction] User ${userId} changed reaction on message ${messageId}: ${oldReaction?.[0]?.emoji || 'none'} → ${newReaction?.[0]?.emoji || 'none'}`);

      return reactionDoc;
    } catch (error) {
      console.error('Error handling reaction:', error);
      throw error;
    }
  }

  /**
   * Update reaction count for a message
   */
  async updateReactionCount(data) {
    const { messageId, chatId, reactions, timestamp } = data;
    
    try {
      let reactionDoc = await Reaction.findOne({ messageId, chatId });
      
      if (!reactionDoc) {
        reactionDoc = new Reaction({
          messageId,
          chatId,
          reactions: [],
          totalReactions: 0
        });
      }

      // Update reactions based on count
      reactionDoc.reactions = reactions.map(r => ({
        emoji: r.type === 'emoji' ? r.emoji : r.type,
        count: r.total_count,
        users: [] // We don't get user list in count updates
      }));

      reactionDoc.totalReactions = reactions.reduce((sum, r) => sum + r.total_count, 0);
      reactionDoc.lastUpdated = timestamp || new Date();
      
      await reactionDoc.save();

      // Update cache
      this.reactionCache.set(`${messageId}_${chatId}`, reactionDoc);

      console.log(`[Reaction Count] Updated message ${messageId}: ${reactionDoc.totalReactions} total reactions`);

      return reactionDoc;
    } catch (error) {
      console.error('Error updating reaction count:', error);
      throw error;
    }
  }

  /**
   * Get reaction statistics for a message
   */
  async getMessageReactions(messageId, chatId) {
    // Check cache first
    const cacheKey = `${messageId}_${chatId}`;
    if (this.reactionCache.has(cacheKey)) {
      return this.reactionCache.get(cacheKey);
    }

    try {
      const reactionDoc = await Reaction.findOne({ messageId, chatId });
      if (reactionDoc) {
        this.reactionCache.set(cacheKey, reactionDoc);
      }
      return reactionDoc;
    } catch (error) {
      console.error('Error getting message reactions:', error);
      throw error;
    }
  }

  /**
   * Get top reacted messages
   */
  async getTopReactedMessages(limit = 10, timeRange = null) {
    try {
      const query = {};
      
      if (timeRange) {
        query.createdAt = { $gte: new Date(Date.now() - timeRange) };
      }

      const topMessages = await Reaction.find(query)
        .sort({ totalReactions: -1 })
        .limit(limit)
        .lean();

      return topMessages;
    } catch (error) {
      console.error('Error getting top reacted messages:', error);
      throw error;
    }
  }

  /**
   * Get user reaction history
   */
  async getUserReactionHistory(userId, limit = 50) {
    try {
      const reactions = await Reaction.find({
        'reactions.users': userId
      })
        .sort({ lastUpdated: -1 })
        .limit(limit)
        .lean();

      return reactions.map(r => ({
        messageId: r.messageId,
        chatId: r.chatId,
        userReaction: r.reactions.find(reaction => reaction.users.includes(userId))?.emoji,
        timestamp: r.lastUpdated
      }));
    } catch (error) {
      console.error('Error getting user reaction history:', error);
      throw error;
    }
  }

  /**
   * Get reaction analytics
   */
  async getReactionAnalytics(days = 7) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const analytics = await Reaction.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $unwind: '$reactions' },
        {
          $group: {
            _id: '$reactions.emoji',
            totalCount: { $sum: '$reactions.count' },
            uniqueMessages: { $addToSet: '$messageId' }
          }
        },
        {
          $project: {
            emoji: '$_id',
            totalCount: 1,
            messageCount: { $size: '$uniqueMessages' },
            _id: 0
          }
        },
        { $sort: { totalCount: -1 } }
      ]);

      const totalStats = await Reaction.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalReactions: { $sum: '$totalReactions' },
            totalMessages: { $sum: 1 },
            avgReactionsPerMessage: { $avg: '$totalReactions' }
          }
        }
      ]);

      return {
        reactionBreakdown: analytics,
        summary: totalStats[0] || {
          totalReactions: 0,
          totalMessages: 0,
          avgReactionsPerMessage: 0
        },
        period: `Last ${days} days`,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting reaction analytics:', error);
      throw error;
    }
  }

  /**
   * Clean up old reaction data
   */
  async cleanupOldReactions(daysToKeep = 90) {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      
      const result = await Reaction.deleteMany({
        lastUpdated: { $lt: cutoffDate },
        totalReactions: 0
      });

      console.log(`[Cleanup] Removed ${result.deletedCount} old reaction records`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error cleaning up old reactions:', error);
      throw error;
    }
  }

  /**
   * Export reaction data for analysis
   */
  async exportReactionData(startDate, endDate) {
    try {
      const reactions = await Reaction.find({
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }).lean();

      return {
        exportDate: new Date(),
        dateRange: { startDate, endDate },
        totalRecords: reactions.length,
        data: reactions
      };
    } catch (error) {
      console.error('Error exporting reaction data:', error);
      throw error;
    }
  }
}

module.exports = ReactionService;
