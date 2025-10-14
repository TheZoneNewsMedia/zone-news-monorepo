/**
 * Statistics Service
 * Tracks bot usage, user engagement, and provides analytics
 */

const mongoose = require('mongoose');

// Stats Schemas
const userStatsSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  joinedAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  messageCount: { type: Number, default: 0 },
  commandsUsed: { type: Number, default: 0 },
  reactionsGiven: { type: Number, default: 0 },
  subscriptions: [String],
  isActive: { type: Boolean, default: true },
  isBlocked: { type: Boolean, default: false }
}, {
  timestamps: true
});

const commandStatsSchema = new mongoose.Schema({
  command: { type: String, required: true },
  userId: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  success: { type: Boolean, default: true },
  errorMessage: String,
  processingTime: Number
});

const dailyStatsSchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },
  newUsers: { type: Number, default: 0 },
  activeUsers: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
  totalCommands: { type: Number, default: 0 },
  totalReactions: { type: Number, default: 0 },
  postsSent: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 } // Renamed from 'errors' to avoid reserved keyword
}, {
  timestamps: true
});

// Create indexes (userId already has unique index from schema definition)
userStatsSchema.index({ lastActive: -1 });
commandStatsSchema.index({ command: 1, timestamp: -1 });
commandStatsSchema.index({ userId: 1, timestamp: -1 });
dailyStatsSchema.index({ date: -1 });

const UserStats = mongoose.model('UserStats', userStatsSchema);
const CommandStats = mongoose.model('CommandStats', commandStatsSchema);
const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);

class StatsService {
  constructor() {
    this.statsCache = new Map();
    this.dailyStatsCache = null;
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize the stats service
   */
  async initialize() {
    try {
      // Ensure today's stats exist
      await this.ensureDailyStats();
      console.log('✅ Stats service initialized');
    } catch (error) {
      console.error('Error initializing stats service:', error);
      throw error;
    }
  }

  /**
   * Ensure daily stats document exists for today
   */
  async ensureDailyStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dailyStats = await DailyStats.findOne({ date: today });
    if (!dailyStats) {
      dailyStats = new DailyStats({ date: today });
      await dailyStats.save();
    }

    this.dailyStatsCache = dailyStats;
    return dailyStats;
  }

  /**
   * Track user activity
   */
  async trackUser(userData) {
    const { userId, username, firstName, lastName } = userData;

    try {
      let userStats = await UserStats.findOne({ userId });
      
      if (!userStats) {
        userStats = new UserStats({
          userId,
          username,
          firstName,
          lastName
        });

        // Increment new users count
        await this.incrementDailyStat('newUsers');
      }

      userStats.lastActive = new Date();
      userStats.username = username || userStats.username;
      userStats.firstName = firstName || userStats.firstName;
      userStats.lastName = lastName || userStats.lastName;
      
      await userStats.save();

      // Track daily active user
      await this.trackDailyActiveUser(userId);

      return userStats;
    } catch (error) {
      console.error('Error tracking user:', error);
      throw error;
    }
  }

  /**
   * Track daily active users
   */
  async trackDailyActiveUser(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const cacheKey = `active_${today.toISOString()}_${userId}`;
    
    if (!this.statsCache.has(cacheKey)) {
      this.statsCache.set(cacheKey, true);
      await this.incrementDailyStat('activeUsers');
    }
  }

  /**
   * Track command usage
   */
  async trackCommand(command, userId, success = true, errorMessage = null, processingTime = null) {
    try {
      const commandStat = new CommandStats({
        command,
        userId,
        success,
        errorMessage,
        processingTime
      });

      await commandStat.save();

      // Update user stats
      await UserStats.findOneAndUpdate(
        { userId },
        { 
          $inc: { commandsUsed: 1 },
          $set: { lastActive: new Date() }
        }
      );

      // Update daily stats
      await this.incrementDailyStat('totalCommands');
      
      if (!success) {
        await this.incrementDailyStat('errorCount');
      }

      console.log(`[Stats] Command tracked: ${command} by user ${userId} (${success ? 'success' : 'failed'})`);
    } catch (error) {
      console.error('Error tracking command:', error);
    }
  }

  /**
   * Track message
   */
  async trackMessage(userId) {
    try {
      await UserStats.findOneAndUpdate(
        { userId },
        { 
          $inc: { messageCount: 1 },
          $set: { lastActive: new Date() }
        }
      );

      await this.incrementDailyStat('totalMessages');
    } catch (error) {
      console.error('Error tracking message:', error);
    }
  }

  /**
   * Track reaction
   */
  async trackReaction(data) {
    const { userId, messageId, reactionType } = data;

    try {
      await UserStats.findOneAndUpdate(
        { userId },
        { 
          $inc: { reactionsGiven: 1 },
          $set: { lastActive: new Date() }
        }
      );

      await this.incrementDailyStat('totalReactions');

      console.log(`[Stats] Reaction tracked: ${reactionType} by user ${userId} on message ${messageId}`);
    } catch (error) {
      console.error('Error tracking reaction:', error);
    }
  }

  /**
   * Track post sent
   */
  async trackPostSent() {
    try {
      await this.incrementDailyStat('postsSent');
    } catch (error) {
      console.error('Error tracking post sent:', error);
    }
  }

  /**
   * Increment a daily stat
   */
  async incrementDailyStat(field, value = 1) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      await DailyStats.findOneAndUpdate(
        { date: today },
        { $inc: { [field]: value } },
        { upsert: true }
      );
    } catch (error) {
      console.error(`Error incrementing daily stat ${field}:`, error);
    }
  }

  /**
   * Get overall statistics
   */
  async getOverallStats() {
    try {
      const totalUsers = await UserStats.countDocuments();
      const activeUsers = await UserStats.countDocuments({
        lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });
      const blockedUsers = await UserStats.countDocuments({ isBlocked: true });

      const totalCommands = await CommandStats.countDocuments();
      const failedCommands = await CommandStats.countDocuments({ success: false });

      const dailyStats = await DailyStats.find()
        .sort({ date: -1 })
        .limit(30)
        .lean();

      const last30Days = dailyStats.reduce((acc, day) => ({
        totalMessages: acc.totalMessages + day.totalMessages,
        totalCommands: acc.totalCommands + day.totalCommands,
        totalReactions: acc.totalReactions + day.totalReactions,
        postsSent: acc.postsSent + day.postsSent,
        errorCount: acc.errorCount + day.errorCount
      }), {
        totalMessages: 0,
        totalCommands: 0,
        totalReactions: 0,
        postsSent: 0,
        errorCount: 0
      });

      return {
        users: {
          total: totalUsers,
          active: activeUsers,
          blocked: blockedUsers
        },
        commands: {
          total: totalCommands,
          failed: failedCommands,
          successRate: totalCommands > 0 ? ((totalCommands - failedCommands) / totalCommands * 100).toFixed(2) + '%' : '0%'
        },
        last30Days,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting overall stats:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId) {
    try {
      const userStats = await UserStats.findOne({ userId }).lean();
      
      if (!userStats) {
        return null;
      }

      const recentCommands = await CommandStats.find({ userId })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();

      return {
        ...userStats,
        recentCommands
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }

  /**
   * Get command statistics
   */
  async getCommandStats(days = 7) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const commandStats = await CommandStats.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        {
          $group: {
            _id: '$command',
            count: { $sum: 1 },
            successCount: {
              $sum: { $cond: ['$success', 1, 0] }
            },
            avgProcessingTime: { $avg: '$processingTime' },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        {
          $project: {
            command: '$_id',
            count: 1,
            successRate: {
              $multiply: [
                { $divide: ['$successCount', '$count'] },
                100
              ]
            },
            avgProcessingTime: 1,
            uniqueUsers: { $size: '$uniqueUsers' },
            _id: 0
          }
        },
        { $sort: { count: -1 } }
      ]);

      return {
        period: `Last ${days} days`,
        commands: commandStats,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting command stats:', error);
      throw error;
    }
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(days = 7) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const dailyEngagement = await DailyStats.find({
        date: { $gte: startDate }
      })
        .sort({ date: 1 })
        .lean();

      const activeUsersTrend = await UserStats.aggregate([
        { $match: { lastActive: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$lastActive' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const engagementRate = dailyEngagement.reduce((acc, day) => {
        if (day.activeUsers > 0) {
          const rate = ((day.totalMessages + day.totalCommands + day.totalReactions) / day.activeUsers);
          return acc + rate;
        }
        return acc;
      }, 0) / dailyEngagement.length;

      return {
        period: `Last ${days} days`,
        dailyStats: dailyEngagement,
        activeUsersTrend,
        avgEngagementRate: engagementRate.toFixed(2),
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error getting engagement metrics:', error);
      throw error;
    }
  }

  /**
   * Export statistics data
   */
  async exportStats(startDate, endDate) {
    try {
      const users = await UserStats.find({
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }).lean();

      const commands = await CommandStats.find({
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }).lean();

      const dailyStats = await DailyStats.find({
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }).lean();

      return {
        exportDate: new Date(),
        dateRange: { startDate, endDate },
        data: {
          users,
          commands,
          dailyStats
        }
      };
    } catch (error) {
      console.error('Error exporting stats:', error);
      throw error;
    }
  }

  /**
   * Clean up old statistics data
   */
  async cleanupOldStats(daysToKeep = 90) {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

      const commandResult = await CommandStats.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      const dailyResult = await DailyStats.deleteMany({
        date: { $lt: cutoffDate }
      });

      console.log(`[Cleanup] Removed ${commandResult.deletedCount} old command records and ${dailyResult.deletedCount} old daily stats`);
      
      return {
        commands: commandResult.deletedCount,
        dailyStats: dailyResult.deletedCount
      };
    } catch (error) {
      console.error('Error cleaning up old stats:', error);
      throw error;
    }
  }

  /**
   * Backward compatibility method for recordCommand
   */
  async recordCommand(userId, command, success = true, errorMessage = null, processingTime = null) {
    return this.trackCommand(command, userId, success, errorMessage, processingTime);
  }

  /**
   * Handle the /stats command
   */
  async handle(ctx) {
    try {
      const userId = ctx.from.id;
      const userStats = await this.getUserStats(userId);
      
      if (!userStats) {
        return ctx.reply('📊 No statistics available yet. Start using the bot to generate stats!');
      }

      const message = `📊 *Your Statistics*\n\n` +
        `👤 User: ${userStats.firstName || 'User'} ${userStats.lastName || ''}\n` +
        `📅 Joined: ${new Date(userStats.joinedAt).toLocaleDateString()}\n` +
        `💬 Messages: ${userStats.messageCount}\n` +
        `⚡ Commands Used: ${userStats.commandsUsed}\n` +
        `❤️ Reactions Given: ${userStats.reactionsGiven}\n` +
        `📱 Subscriptions: ${userStats.subscriptions.length || 0}\n` +
        `⏰ Last Active: ${new Date(userStats.lastActive).toLocaleString()}`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error handling stats command:', error);
      await ctx.reply('❌ Error retrieving statistics. Please try again later.');
    }
  }
}

// Export singleton instance and also export the handle method separately for command registration
const statsService = new StatsService();
statsService.handle = statsService.handle.bind(statsService);

module.exports = statsService;
