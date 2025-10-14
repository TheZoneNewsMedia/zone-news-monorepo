/**
 * Subscription Service - Manages user subscriptions to channels and topics
 * Part of the stable bot implementation
 */

const mongoose = require('mongoose');

// Subscription Schema
const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    index: true
  },
  username: String,
  firstName: String,
  lastName: String,
  channels: [{
    channelId: String,
    channelName: String,
    subscribedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    },
    preferences: {
      notifications: {
        type: Boolean,
        default: true
      },
      digest: {
        type: Boolean,
        default: false
      },
      instantAlerts: {
        type: Boolean,
        default: true
      }
    }
  }],
  topics: [{
    topic: String,
    subscribedAt: {
      type: Date,
      default: Date.now
    },
    keywords: [String]
  }],
  notificationSettings: {
    morning: {
      type: Boolean,
      default: true
    },
    evening: {
      type: Boolean,
      default: true
    },
    breaking: {
      type: Boolean,
      default: true
    },
    customTime: String,
    timezone: {
      type: String,
      default: 'Australia/Adelaide'
    }
  },
  stats: {
    totalReceived: {
      type: Number,
      default: 0
    },
    totalOpened: {
      type: Number,
      default: 0
    },
    lastActive: Date,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'blocked', 'deleted'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Channel Info Schema
const channelInfoSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  channelName: String,
  description: String,
  category: {
    type: String,
    enum: ['main', 'tech', 'crypto', 'business', 'sports', 'entertainment', 'custom'],
    default: 'main'
  },
  subscriberCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    language: {
      type: String,
      default: 'en'
    },
    region: {
      type: String,
      default: 'AU'
    },
    tags: [String]
  }
}, {
  timestamps: true
});

// Notification Queue Schema
const notificationQueueSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true
  },
  messageType: {
    type: String,
    enum: ['news', 'digest', 'alert', 'announcement', 'custom'],
    default: 'news'
  },
  content: {
    title: String,
    text: String,
    media: [{
      type: String,
      url: String
    }],
    buttons: [{
      text: String,
      url: String,
      callback_data: String
    }]
  },
  channelId: String,
  priority: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  scheduledFor: Date,
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'cancelled'],
    default: 'pending'
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastAttempt: Date,
  error: String
}, {
  timestamps: true
});

// Models
const Subscription = mongoose.model('Subscription', subscriptionSchema);
const ChannelInfo = mongoose.model('ChannelInfo', channelInfoSchema);
const NotificationQueue = mongoose.model('NotificationQueue', notificationQueueSchema);

class SubscriptionService {
  constructor() {
    this.cache = new Map(); // Cache for quick lookups
    this.channelCache = new Map();
  }

  /**
   * Initialize the subscription service
   */
  async initialize() {
    try {
      // Load active subscriptions into cache
      const activeSubscriptions = await Subscription.find({ status: 'active' });
      activeSubscriptions.forEach(sub => {
        this.cache.set(sub.userId, sub);
      });

      // Load channel info into cache
      const channels = await ChannelInfo.find({ isActive: true });
      channels.forEach(channel => {
        this.channelCache.set(channel.channelId, channel);
      });

      console.log(`✅ Subscription service initialized with ${this.cache.size} active subscriptions`);
      return true;
    } catch (error) {
      console.error('Error initializing subscription service:', error);
      return false;
    }
  }

  /**
   * Subscribe a user to a channel
   */
  async subscribe(userId, channelId, userInfo = {}) {
    try {
      let subscription = await Subscription.findOne({ userId });
      
      if (!subscription) {
        // Create new subscription
        subscription = new Subscription({
          userId,
          username: userInfo.username,
          firstName: userInfo.first_name,
          lastName: userInfo.last_name,
          channels: [{
            channelId,
            channelName: this.getChannelName(channelId),
            subscribedAt: new Date()
          }]
        });
      } else {
        // Check if already subscribed
        const existingChannel = subscription.channels.find(ch => ch.channelId === channelId);
        
        if (existingChannel) {
          existingChannel.isActive = true;
          existingChannel.subscribedAt = new Date();
        } else {
          subscription.channels.push({
            channelId,
            channelName: this.getChannelName(channelId),
            subscribedAt: new Date()
          });
        }
      }

      await subscription.save();
      this.cache.set(userId, subscription);
      
      // Update channel subscriber count
      await this.updateChannelSubscriberCount(channelId);
      
      console.log(`✅ User ${userId} subscribed to ${channelId}`);
      return subscription;
    } catch (error) {
      console.error('Error subscribing user:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe a user from a channel
   */
  async unsubscribe(userId, channelId) {
    try {
      const subscription = await Subscription.findOne({ userId });
      
      if (!subscription) {
        return false;
      }

      const channelIndex = subscription.channels.findIndex(ch => ch.channelId === channelId);
      
      if (channelIndex === -1) {
        return false;
      }

      subscription.channels[channelIndex].isActive = false;
      await subscription.save();
      
      this.cache.set(userId, subscription);
      
      // Update channel subscriber count
      await this.updateChannelSubscriberCount(channelId);
      
      console.log(`✅ User ${userId} unsubscribed from ${channelId}`);
      return true;
    } catch (error) {
      console.error('Error unsubscribing user:', error);
      throw error;
    }
  }

  /**
   * Subscribe to a topic
   */
  async subscribeToTopic(userId, topic, keywords = []) {
    try {
      const subscription = await Subscription.findOne({ userId });
      
      if (!subscription) {
        return false;
      }

      const existingTopic = subscription.topics.find(t => t.topic === topic);
      
      if (!existingTopic) {
        subscription.topics.push({
          topic,
          keywords,
          subscribedAt: new Date()
        });
      } else {
        existingTopic.keywords = [...new Set([...existingTopic.keywords, ...keywords])];
      }

      await subscription.save();
      this.cache.set(userId, subscription);
      
      console.log(`✅ User ${userId} subscribed to topic: ${topic}`);
      return true;
    } catch (error) {
      console.error('Error subscribing to topic:', error);
      throw error;
    }
  }

  /**
   * Get user subscriptions
   */
  async getUserSubscriptions(userId) {
    try {
      // Check cache first
      if (this.cache.has(userId)) {
        return this.cache.get(userId);
      }

      const subscription = await Subscription.findOne({ userId });
      
      if (subscription) {
        this.cache.set(userId, subscription);
      }
      
      return subscription;
    } catch (error) {
      console.error('Error getting user subscriptions:', error);
      return null;
    }
  }

  /**
   * Get subscribers for a channel
   */
  async getChannelSubscribers(channelId, options = {}) {
    try {
      const query = {
        'channels.channelId': channelId,
        'channels.isActive': true,
        status: 'active'
      };

      if (options.notificationsOnly) {
        query['channels.preferences.notifications'] = true;
      }

      const subscribers = await Subscription.find(query).lean();
      
      return subscribers.map(sub => ({
        userId: sub.userId,
        username: sub.username,
        preferences: sub.channels.find(ch => ch.channelId === channelId)?.preferences
      }));
    } catch (error) {
      console.error('Error getting channel subscribers:', error);
      return [];
    }
  }

  /**
   * Queue a notification for delivery
   */
  async queueNotification(userId, content, options = {}) {
    try {
      const notification = new NotificationQueue({
        userId,
        messageType: options.type || 'news',
        content,
        channelId: options.channelId,
        priority: options.priority || 5,
        scheduledFor: options.scheduledFor || new Date()
      });

      await notification.save();
      console.log(`📬 Notification queued for user ${userId}`);
      return notification;
    } catch (error) {
      console.error('Error queuing notification:', error);
      throw error;
    }
  }

  /**
   * Process pending notifications
   */
  async processPendingNotifications(bot) {
    try {
      const notifications = await NotificationQueue.find({
        status: 'pending',
        scheduledFor: { $lte: new Date() },
        attempts: { $lt: 3 }
      }).sort({ priority: -1, scheduledFor: 1 }).limit(50);

      for (const notification of notifications) {
        try {
          await this.sendNotification(bot, notification);
          notification.status = 'sent';
        } catch (error) {
          notification.attempts++;
          notification.lastAttempt = new Date();
          notification.error = error.message;
          
          if (notification.attempts >= 3) {
            notification.status = 'failed';
          }
        }
        
        await notification.save();
      }

      return notifications.length;
    } catch (error) {
      console.error('Error processing notifications:', error);
      return 0;
    }
  }

  /**
   * Send a notification to a user
   */
  async sendNotification(bot, notification) {
    try {
      const options = {
        parse_mode: 'HTML'
      };

      if (notification.content.buttons && notification.content.buttons.length > 0) {
        options.reply_markup = {
          inline_keyboard: [notification.content.buttons.map(btn => ({
            text: btn.text,
            url: btn.url,
            callback_data: btn.callback_data
          }))]
        };
      }

      const message = notification.content.title ? 
        `<b>${notification.content.title}</b>\n\n${notification.content.text}` :
        notification.content.text;

      await bot.telegram.sendMessage(notification.userId, message, options);
      
      // Update user stats
      await this.updateUserStats(notification.userId, 'received');
      
      return true;
    } catch (error) {
      console.error(`Error sending notification to ${notification.userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user statistics
   */
  async updateUserStats(userId, action) {
    try {
      const update = {
        'stats.lastActive': new Date()
      };

      if (action === 'received') {
        update.$inc = { 'stats.totalReceived': 1 };
      } else if (action === 'opened') {
        update.$inc = { 'stats.totalOpened': 1 };
      }

      await Subscription.updateOne({ userId }, update);
      
      // Update cache
      const subscription = this.cache.get(userId);
      if (subscription) {
        subscription.stats.lastActive = new Date();
        if (action === 'received') subscription.stats.totalReceived++;
        if (action === 'opened') subscription.stats.totalOpened++;
      }
    } catch (error) {
      console.error('Error updating user stats:', error);
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(userId, preferences) {
    try {
      const subscription = await Subscription.findOne({ userId });
      
      if (!subscription) {
        return false;
      }

      Object.assign(subscription.notificationSettings, preferences);
      await subscription.save();
      
      this.cache.set(userId, subscription);
      
      console.log(`✅ Updated notification preferences for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error updating preferences:', error);
      throw error;
    }
  }

  /**
   * Get subscription statistics
   */
  async getSubscriptionStats() {
    try {
      const stats = await Subscription.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalChannelSubscriptions: { $sum: { $size: '$channels' } },
            totalTopicSubscriptions: { $sum: { $size: '$topics' } },
            avgChannelsPerUser: { $avg: { $size: '$channels' } },
            avgTopicsPerUser: { $avg: { $size: '$topics' } }
          }
        }
      ]);

      const channelStats = await Subscription.aggregate([
        { $unwind: '$channels' },
        { $match: { 'channels.isActive': true } },
        {
          $group: {
            _id: '$channels.channelId',
            subscriberCount: { $sum: 1 }
          }
        }
      ]);

      return {
        overview: stats[0] || {},
        channels: channelStats
      };
    } catch (error) {
      console.error('Error getting subscription stats:', error);
      return null;
    }
  }

  /**
   * Clean up inactive subscriptions
   */
  async cleanupInactive(daysInactive = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

      const result = await Subscription.updateMany(
        {
          'stats.lastActive': { $lt: cutoffDate },
          status: 'active'
        },
        {
          $set: { status: 'paused' }
        }
      );

      console.log(`🧹 Paused ${result.modifiedCount} inactive subscriptions`);
      return result.modifiedCount;
    } catch (error) {
      console.error('Error cleaning up inactive subscriptions:', error);
      return 0;
    }
  }

  /**
   * Helper: Get channel name
   */
  getChannelName(channelId) {
    const channel = this.channelCache.get(channelId);
    return channel?.channelName || channelId;
  }

  /**
   * Helper: Update channel subscriber count
   */
  async updateChannelSubscriberCount(channelId) {
    try {
      const count = await Subscription.countDocuments({
        'channels.channelId': channelId,
        'channels.isActive': true,
        status: 'active'
      });

      await ChannelInfo.updateOne(
        { channelId },
        { $set: { subscriberCount: count } },
        { upsert: true }
      );

      return count;
    } catch (error) {
      console.error('Error updating channel subscriber count:', error);
      return 0;
    }
  }

  /**
   * Export subscribers for backup
   */
  async exportSubscribers(format = 'json') {
    try {
      const subscribers = await Subscription.find({}).lean();
      
      if (format === 'csv') {
        // Convert to CSV format
        const csv = subscribers.map(sub => ({
          userId: sub.userId,
          username: sub.username,
          channels: sub.channels.map(ch => ch.channelId).join(';'),
          topics: sub.topics.map(t => t.topic).join(';'),
          status: sub.status,
          joinedAt: sub.stats.joinedAt
        }));
        return csv;
      }
      
      return subscribers;
    } catch (error) {
      console.error('Error exporting subscribers:', error);
      return [];
    }
  }
}

// Export class for instantiation in bot-initialization
module.exports = SubscriptionService;
