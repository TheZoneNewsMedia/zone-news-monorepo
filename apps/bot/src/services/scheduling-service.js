/**
 * Scheduling Service - Manages scheduled posts and automated content delivery
 * Part of the stable bot implementation
 */

const mongoose = require('mongoose');
const cron = require('node-cron');

// Scheduled Post Schema
const scheduledPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  media: [{
    type: {
      type: String,
      enum: ['photo', 'video', 'document', 'audio'],
      required: true
    },
    url: String,
    fileId: String,
    caption: String
  }],
  channels: [{
    type: String,
    required: true
  }],
  scheduledTime: {
    type: Date,
    required: true,
    index: true
  },
  recurringPattern: {
    enabled: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'custom'],
      default: 'daily'
    },
    customCron: String,
    endDate: Date,
    daysOfWeek: [Number], // 0-6 for Sunday-Saturday
    timeOfDay: String // HH:MM format
  },
  metadata: {
    author: {
      userId: Number,
      username: String
    },
    tags: [String],
    category: String,
    priority: {
      type: Number,
      default: 5,
      min: 1,
      max: 10
    },
    source: String,
    language: {
      type: String,
      default: 'en'
    }
  },
  options: {
    parseMode: {
      type: String,
      enum: ['HTML', 'Markdown', 'MarkdownV2'],
      default: 'HTML'
    },
    disableNotification: {
      type: Boolean,
      default: false
    },
    disableWebPagePreview: {
      type: Boolean,
      default: false
    },
    protectContent: {
      type: Boolean,
      default: false
    },
    replyMarkup: Object // Inline keyboard or reply keyboard
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'cancelled', 'draft'],
    default: 'pending',
    index: true
  },
  sentAt: Date,
  error: String,
  attempts: {
    type: Number,
    default: 0
  },
  messageIds: [{
    channelId: String,
    messageId: Number
  }],
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    reactions: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Content Template Schema
const contentTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: String,
  type: {
    type: String,
    enum: ['morning', 'evening', 'breaking', 'digest', 'announcement', 'custom'],
    required: true
  },
  template: {
    title: String,
    content: String,
    variables: [String], // e.g., {{date}}, {{weather}}, {{top_stories}}
    media: [{
      type: String,
      url: String
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsed: Date
}, {
  timestamps: true
});

// Posting Schedule Configuration Schema
const scheduleConfigSchema = new mongoose.Schema({
  configName: {
    type: String,
    required: true,
    unique: true
  },
  morningPost: {
    enabled: {
      type: Boolean,
      default: true
    },
    time: {
      type: String,
      default: '07:00'
    },
    channels: [String],
    templateId: mongoose.Schema.Types.ObjectId,
    daysOfWeek: {
      type: [Number],
      default: [1, 2, 3, 4, 5] // Monday to Friday
    }
  },
  eveningPost: {
    enabled: {
      type: Boolean,
      default: true
    },
    time: {
      type: String,
      default: '18:00'
    },
    channels: [String],
    templateId: mongoose.Schema.Types.ObjectId,
    daysOfWeek: {
      type: [Number],
      default: [1, 2, 3, 4, 5] // Monday to Friday
    }
  },
  weekendSchedule: {
    enabled: {
      type: Boolean,
      default: false
    },
    posts: [{
      time: String,
      channels: [String],
      templateId: mongoose.Schema.Types.ObjectId
    }]
  },
  timezone: {
    type: String,
    default: 'Australia/Adelaide'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Models
const ScheduledPost = mongoose.model('ScheduledPost', scheduledPostSchema);
const ContentTemplate = mongoose.model('ContentTemplate', contentTemplateSchema);
const ScheduleConfig = mongoose.model('ScheduleConfig', scheduleConfigSchema);

class SchedulingService {
  constructor() {
    this.activeJobs = new Map(); // Track active cron jobs
    this.config = null;
    this.templates = new Map();
  }

  /**
   * Initialize the scheduling service
   */
  async initialize() {
    try {
      // Load active schedule configuration
      this.config = await ScheduleConfig.findOne({ isActive: true });
      
      if (!this.config) {
        // Create default configuration
        this.config = await this.createDefaultConfig();
      }

      // Load content templates
      let templates = await ContentTemplate.find({ isActive: true });
      
      // Create default templates if none exist
      if (templates.length === 0) {
        await this.createDefaultTemplates();
        templates = await ContentTemplate.find({ isActive: true });
      }
      
      templates.forEach(template => {
        this.templates.set(template._id.toString(), template);
      });

      // Process any missed scheduled posts
      await this.processMissedPosts();

      console.log(`✅ Scheduling service initialized with ${this.templates.size} templates`);
      return true;
    } catch (error) {
      console.error('Error initializing scheduling service:', error);
      return false;
    }
  }

  /**
   * Create default configuration
   */
  async createDefaultConfig() {
    try {
      const defaultConfig = new ScheduleConfig({
        configName: 'default',
        morningPost: {
          enabled: true,
          time: '07:00',
          channels: ['@ZoneNewsAdl'],
          daysOfWeek: [1, 2, 3, 4, 5] // Monday to Friday
        },
        eveningPost: {
          enabled: true,
          time: '18:00',
          channels: ['@ZoneNewsAdl'],
          daysOfWeek: [1, 2, 3, 4, 5] // Monday to Friday
        },
        weekendSchedule: {
          enabled: false,
          posts: []
        },
        timezone: 'Australia/Adelaide',
        isActive: true
      });
      
      await defaultConfig.save();
      console.log('✅ Default schedule configuration created');
      return defaultConfig;
    } catch (error) {
      console.error('Error creating default config:', error);
      throw error;
    }
  }

  /**
   * Create default content templates
   */
  async createDefaultTemplates() {
    try {
      const defaultTemplates = [
        {
          name: 'Morning News Digest',
          description: 'Daily morning news summary for Adelaide',
          type: 'morning',
          template: {
            title: '🌅 Good Morning Adelaide! - {{date}}',
            content: `Good morning, Adelaide! ☀️\n\nToday is {{day}}, {{date}}\n\n📰 **Today's Headlines:**\n{{top_stories}}\n\n🌤️ **Weather:** {{weather}}\n\nStay informed throughout the day with The Zone News!\n\n#GoodMorning #Adelaide #TheZoneNews`,
            variables: ['date', 'day', 'weather', 'top_stories']
          },
          isActive: true
        },
        {
          name: 'Evening Update',
          description: 'Daily evening news summary',
          type: 'evening',
          template: {
            title: '🌆 Evening Update - {{date}}',
            content: `Good evening, Adelaide! 🌇\n\nAs we wrap up {{day}}, here are today's key highlights:\n\n📊 **Today's Top Stories:**\n{{top_stories}}\n\n🌙 **Tomorrow's Weather:** {{weather}}\n\nThank you for staying connected with The Zone News!\n\n#EveningUpdate #Adelaide #TheZoneNews`,
            variables: ['date', 'day', 'weather', 'top_stories']
          },
          isActive: true
        },
        {
          name: 'Breaking News Alert',
          description: 'Template for urgent breaking news',
          type: 'breaking',
          template: {
            title: '🚨 BREAKING: {{headline}}',
            content: `🚨 **BREAKING NEWS**\n\n{{content}}\n\n📍 **Location:** Adelaide, SA\n⏰ **Time:** {{time}}\n\nStay tuned for updates...\n\n#Breaking #Adelaide #TheZoneNews`,
            variables: ['headline', 'content', 'time']
          },
          isActive: true
        },
        {
          name: 'Weekly Digest',
          description: 'Weekly summary of top stories',
          type: 'digest',
          template: {
            title: '📰 Weekly Digest - Week of {{date}}',
            content: `📰 **The Zone News Weekly Digest**\n\nHere's what happened this week in Adelaide:\n\n{{top_stories}}\n\n📊 **This Week's Highlights:**\n• Major local developments\n• Community events\n• Business updates\n\nSee you next week, Adelaide!\n\n#WeeklyDigest #Adelaide #TheZoneNews`,
            variables: ['date', 'top_stories']
          },
          isActive: true
        },
        {
          name: 'Community Announcement',
          description: 'Template for community announcements',
          type: 'announcement',
          template: {
            title: '📢 Community Announcement',
            content: `📢 **Community Announcement**\n\n{{content}}\n\n📅 **Date:** {{date}}\n📍 **Location:** Adelaide, SA\n\nYour trusted news source for Adelaide.\n\n#Community #Adelaide #TheZoneNews`,
            variables: ['content', 'date']
          },
          isActive: true
        }
      ];

      for (const templateData of defaultTemplates) {
        const template = new ContentTemplate(templateData);
        await template.save();
      }

      console.log('✅ Default content templates created');
      return defaultTemplates.length;
    } catch (error) {
      console.error('Error creating default templates:', error);
      throw error;
    }
  }

  /**
   * Schedule a new post
   */
  async schedulePost(postData) {
    try {
      const scheduledPost = new ScheduledPost({
        title: postData.title,
        content: postData.content,
        media: postData.media || [],
        channels: postData.channels,
        scheduledTime: postData.scheduledTime,
        recurringPattern: postData.recurringPattern || {},
        metadata: postData.metadata || {},
        options: postData.options || {},
        status: 'pending'
      });

      await scheduledPost.save();

      // If recurring, set up cron job
      if (scheduledPost.recurringPattern.enabled) {
        this.setupRecurringJob(scheduledPost);
      }

      console.log(`📅 Post scheduled for ${scheduledPost.scheduledTime}`);
      return scheduledPost;
    } catch (error) {
      console.error('Error scheduling post:', error);
      throw error;
    }
  }

  /**
   * Process scheduled posts that are due
   */
  async processScheduledPosts(bot) {
    try {
      const now = new Date();
      const posts = await ScheduledPost.find({
        status: 'pending',
        scheduledTime: { $lte: now },
        attempts: { $lt: 3 }
      }).sort({ priority: -1, scheduledTime: 1 });

      for (const post of posts) {
        await this.sendScheduledPost(bot, post);
      }

      return posts.length;
    } catch (error) {
      console.error('Error processing scheduled posts:', error);
      return 0;
    }
  }

  /**
   * Send a scheduled post
   */
  async sendScheduledPost(bot, post) {
    try {
      post.attempts++;
      const messageIds = [];

      for (const channelId of post.channels) {
        try {
          const options = {
            parse_mode: post.options.parseMode || 'HTML',
            disable_notification: post.options.disableNotification || false,
            disable_web_page_preview: post.options.disableWebPagePreview || false,
            protect_content: post.options.protectContent || false
          };

          // Add reply markup if present
          if (post.options.replyMarkup) {
            options.reply_markup = post.options.replyMarkup;
          }

          // Format message
          let message = post.title ? `<b>${post.title}</b>\n\n${post.content}` : post.content;
          
          // Send message based on media type
          let sentMessage;
          if (post.media && post.media.length > 0) {
            const media = post.media[0];
            
            switch (media.type) {
              case 'photo':
                sentMessage = await bot.telegram.sendPhoto(channelId, media.url || media.fileId, {
                  ...options,
                  caption: message
                });
                break;
              case 'video':
                sentMessage = await bot.telegram.sendVideo(channelId, media.url || media.fileId, {
                  ...options,
                  caption: message
                });
                break;
              case 'document':
                sentMessage = await bot.telegram.sendDocument(channelId, media.url || media.fileId, {
                  ...options,
                  caption: message
                });
                break;
              default:
                sentMessage = await bot.telegram.sendMessage(channelId, message, options);
            }
          } else {
            sentMessage = await bot.telegram.sendMessage(channelId, message, options);
          }

          messageIds.push({
            channelId,
            messageId: sentMessage.message_id
          });

          console.log(`✅ Posted to ${channelId}: ${post.title}`);
        } catch (error) {
          console.error(`Failed to post to ${channelId}:`, error);
        }
      }

      // Update post status
      post.status = messageIds.length > 0 ? 'sent' : 'failed';
      post.sentAt = new Date();
      post.messageIds = messageIds;
      
      if (post.status === 'failed') {
        post.error = 'Failed to send to all channels';
      }

      await post.save();

      // Handle recurring posts
      if (post.status === 'sent' && post.recurringPattern.enabled) {
        await this.scheduleNextRecurrence(post);
      }

      return true;
    } catch (error) {
      console.error('Error sending scheduled post:', error);
      post.error = error.message;
      post.status = post.attempts >= 3 ? 'failed' : 'pending';
      await post.save();
      return false;
    }
  }

  /**
   * Send morning post
   */
  async sendMorningPost(bot) {
    try {
      if (!this.config?.morningPost?.enabled) {
        return false;
      }

      const dayOfWeek = new Date().getDay();
      if (!this.config.morningPost.daysOfWeek.includes(dayOfWeek)) {
        console.log('Morning post not scheduled for today');
        return false;
      }

      // Get or create morning content
      const content = await this.generateMorningContent();
      
      const post = {
        title: content.title || '🌅 Good Morning Adelaide!',
        content: content.content || await this.getDefaultMorningMessage(),
        channels: this.config.morningPost.channels || [process.env.MAIN_CHANNEL_ID],
        scheduledTime: new Date(),
        metadata: {
          category: 'morning',
          tags: ['daily', 'morning', 'digest']
        },
        options: {
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [[
              { text: '📰 Read More', url: 'https://t.me/TheZoneNewsAU' },
              { text: '🔔 Subscribe', callback_data: 'subscribe_main' }
            ]]
          }
        }
      };

      await this.sendScheduledPost(bot, post);
      console.log('✅ Morning post sent successfully');
      return true;
    } catch (error) {
      console.error('Error sending morning post:', error);
      return false;
    }
  }

  /**
   * Send evening post
   */
  async sendEveningPost(bot) {
    try {
      if (!this.config?.eveningPost?.enabled) {
        return false;
      }

      const dayOfWeek = new Date().getDay();
      if (!this.config.eveningPost.daysOfWeek.includes(dayOfWeek)) {
        console.log('Evening post not scheduled for today');
        return false;
      }

      // Get or create evening content
      const content = await this.generateEveningContent();
      
      const post = {
        title: content.title || '🌆 Evening Update',
        content: content.content || await this.getDefaultEveningMessage(),
        channels: this.config.eveningPost.channels || [process.env.MAIN_CHANNEL_ID],
        scheduledTime: new Date(),
        metadata: {
          category: 'evening',
          tags: ['daily', 'evening', 'summary']
        },
        options: {
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [[
              { text: '📊 Today\'s Stats', callback_data: 'view_daily_stats' },
              { text: '🌙 Night Mode', callback_data: 'enable_night_mode' }
            ]]
          }
        }
      };

      await this.sendScheduledPost(bot, post);
      console.log('✅ Evening post sent successfully');
      return true;
    } catch (error) {
      console.error('Error sending evening post:', error);
      return false;
    }
  }

  /**
   * Generate morning content
   */
  async generateMorningContent() {
    try {
      // Try to use a template
      if (this.config?.morningPost?.templateId) {
        const template = this.templates.get(this.config.morningPost.templateId.toString());
        if (template) {
          return this.processTemplate(template);
        }
      }

      // Generate dynamic content
      const date = new Date().toLocaleDateString('en-AU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      return {
        title: `🌅 Good Morning Adelaide! - ${date}`,
        content: await this.getDefaultMorningMessage()
      };
    } catch (error) {
      console.error('Error generating morning content:', error);
      return {
        title: '🌅 Good Morning Adelaide!',
        content: 'Start your day with the latest news and updates from The Zone News.'
      };
    }
  }

  /**
   * Generate evening content
   */
  async generateEveningContent() {
    try {
      // Try to use a template
      if (this.config?.eveningPost?.templateId) {
        const template = this.templates.get(this.config.eveningPost.templateId.toString());
        if (template) {
          return this.processTemplate(template);
        }
      }

      // Generate dynamic content
      return {
        title: '🌆 Evening Update',
        content: await this.getDefaultEveningMessage()
      };
    } catch (error) {
      console.error('Error generating evening content:', error);
      return {
        title: '🌆 Evening Update',
        content: 'Catch up on today\'s top stories and prepare for tomorrow.'
      };
    }
  }

  /**
   * Process a content template
   */
  async processTemplate(template) {
    try {
      let content = template.template.content;
      let title = template.template.title;

      // Replace variables
      const variables = {
        date: new Date().toLocaleDateString('en-AU'),
        time: new Date().toLocaleTimeString('en-AU'),
        day: new Date().toLocaleDateString('en-AU', { weekday: 'long' }),
        weather: await this.getWeatherInfo(),
        top_stories: await this.getTopStories()
      };

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        content = content.replace(regex, value);
        title = title.replace(regex, value);
      }

      // Update usage stats
      template.usageCount++;
      template.lastUsed = new Date();
      await template.save();

      return { title, content };
    } catch (error) {
      console.error('Error processing template:', error);
      return {
        title: template.template.title,
        content: template.template.content
      };
    }
  }

  /**
   * Set up recurring job
   */
  setupRecurringJob(post) {
    try {
      let cronExpression;
      
      if (post.recurringPattern.customCron) {
        cronExpression = post.recurringPattern.customCron;
      } else {
        // Build cron expression based on frequency
        switch (post.recurringPattern.frequency) {
          case 'daily':
            cronExpression = `0 ${post.recurringPattern.timeOfDay || '12:00'} * * *`;
            break;
          case 'weekly':
            const days = post.recurringPattern.daysOfWeek?.join(',') || '1';
            cronExpression = `0 ${post.recurringPattern.timeOfDay || '12:00'} * * ${days}`;
            break;
          case 'monthly':
            cronExpression = `0 ${post.recurringPattern.timeOfDay || '12:00'} 1 * *`;
            break;
          default:
            return false;
        }
      }

      const job = cron.schedule(cronExpression, async () => {
        await this.handleRecurringPost(post._id);
      });

      this.activeJobs.set(post._id.toString(), job);
      console.log(`⏰ Recurring job set up for post ${post._id}`);
      return true;
    } catch (error) {
      console.error('Error setting up recurring job:', error);
      return false;
    }
  }

  /**
   * Handle recurring post execution
   */
  async handleRecurringPost(postId) {
    try {
      const originalPost = await ScheduledPost.findById(postId);
      
      if (!originalPost || !originalPost.recurringPattern.enabled) {
        // Cancel the job if post is disabled
        const job = this.activeJobs.get(postId.toString());
        if (job) {
          job.stop();
          this.activeJobs.delete(postId.toString());
        }
        return;
      }

      // Check if we've reached the end date
      if (originalPost.recurringPattern.endDate && new Date() > originalPost.recurringPattern.endDate) {
        originalPost.recurringPattern.enabled = false;
        await originalPost.save();
        
        const job = this.activeJobs.get(postId.toString());
        if (job) {
          job.stop();
          this.activeJobs.delete(postId.toString());
        }
        return;
      }

      // Create a new scheduled post based on the recurring pattern
      await this.scheduleNextRecurrence(originalPost);
    } catch (error) {
      console.error('Error handling recurring post:', error);
    }
  }

  /**
   * Schedule next recurrence
   */
  async scheduleNextRecurrence(post) {
    try {
      const nextPost = new ScheduledPost({
        title: post.title,
        content: post.content,
        media: post.media,
        channels: post.channels,
        scheduledTime: this.calculateNextRecurrence(post),
        metadata: {
          ...post.metadata,
          originalPostId: post._id
        },
        options: post.options,
        status: 'pending'
      });

      await nextPost.save();
      console.log(`📅 Next recurrence scheduled for ${nextPost.scheduledTime}`);
      return nextPost;
    } catch (error) {
      console.error('Error scheduling next recurrence:', error);
      return null;
    }
  }

  /**
   * Calculate next recurrence time
   */
  calculateNextRecurrence(post) {
    const now = new Date();
    let nextTime = new Date(now);

    switch (post.recurringPattern.frequency) {
      case 'daily':
        nextTime.setDate(nextTime.getDate() + 1);
        break;
      case 'weekly':
        nextTime.setDate(nextTime.getDate() + 7);
        break;
      case 'monthly':
        nextTime.setMonth(nextTime.getMonth() + 1);
        break;
    }

    // Set specific time if provided
    if (post.recurringPattern.timeOfDay) {
      const [hours, minutes] = post.recurringPattern.timeOfDay.split(':');
      nextTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    return nextTime;
  }

  /**
   * Process missed posts
   */
  async processMissedPosts() {
    try {
      const missedPosts = await ScheduledPost.find({
        status: 'pending',
        scheduledTime: { $lt: new Date() },
        attempts: { $lt: 3 }
      });

      console.log(`Found ${missedPosts.length} missed posts to process`);
      
      for (const post of missedPosts) {
        post.metadata.wasMissed = true;
        await post.save();
      }

      return missedPosts.length;
    } catch (error) {
      console.error('Error processing missed posts:', error);
      return 0;
    }
  }

  /**
   * Cancel a scheduled post
   */
  async cancelScheduledPost(postId) {
    try {
      const post = await ScheduledPost.findById(postId);
      
      if (!post) {
        return false;
      }

      post.status = 'cancelled';
      await post.save();

      // Cancel recurring job if exists
      const job = this.activeJobs.get(postId.toString());
      if (job) {
        job.stop();
        this.activeJobs.delete(postId.toString());
      }

      console.log(`❌ Cancelled scheduled post ${postId}`);
      return true;
    } catch (error) {
      console.error('Error cancelling scheduled post:', error);
      return false;
    }
  }

  /**
   * Get upcoming scheduled posts
   */
  async getUpcomingPosts(limit = 10) {
    try {
      return await ScheduledPost.find({
        status: 'pending',
        scheduledTime: { $gt: new Date() }
      })
      .sort({ scheduledTime: 1 })
      .limit(limit)
      .lean();
    } catch (error) {
      console.error('Error getting upcoming posts:', error);
      return [];
    }
  }

  /**
   * Get scheduling analytics
   */
  async getSchedulingAnalytics() {
    try {
      const analytics = await ScheduledPost.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgViews: { $avg: '$analytics.views' },
            avgReactions: { $avg: '$analytics.reactions' }
          }
        }
      ]);

      const recurringCount = await ScheduledPost.countDocuments({
        'recurringPattern.enabled': true
      });

      return {
        statusBreakdown: analytics,
        recurringPosts: recurringCount,
        activeJobs: this.activeJobs.size
      };
    } catch (error) {
      console.error('Error getting scheduling analytics:', error);
      return null;
    }
  }

  /**
   * Create default configuration
   */
  async createDefaultConfig() {
    try {
      const config = new ScheduleConfig({
        configName: 'default',
        morningPost: {
          enabled: true,
          time: '07:00',
          channels: [process.env.MAIN_CHANNEL_ID || '@TheZoneNewsAU'],
          daysOfWeek: [1, 2, 3, 4, 5]
        },
        eveningPost: {
          enabled: true,
          time: '18:00',
          channels: [process.env.MAIN_CHANNEL_ID || '@TheZoneNewsAU'],
          daysOfWeek: [1, 2, 3, 4, 5]
        },
        timezone: 'Australia/Adelaide',
        isActive: true
      });

      await config.save();
      return config;
    } catch (error) {
      console.error('Error creating default config:', error);
      return null;
    }
  }

  /**
   * Helper: Get default morning message
   */
  async getDefaultMorningMessage() {
    const tips = [
      '☕ Start your day with a coffee and catch up on the latest news',
      '🏃 Morning exercise tip: A 20-minute walk can boost your productivity',
      '📱 Check our app for personalized news recommendations',
      '🌟 Today is a new opportunity to learn something amazing'
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    
    return `Good morning, Adelaide! 🌅\n\n` +
           `Today is ${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n` +
           `${randomTip}\n\n` +
           `Stay tuned for today's top stories and updates throughout the day!\n\n` +
           `#GoodMorning #Adelaide #TheZoneNews`;
  }

  /**
   * Helper: Get default evening message
   */
  async getDefaultEveningMessage() {
    return `Good evening, Adelaide! 🌆\n\n` +
           `As the day winds down, here's your evening digest of today's most important news and updates.\n\n` +
           `📊 Today's highlights:\n` +
           `• Major developments in local news\n` +
           `• Technology updates and innovations\n` +
           `• Market closing reports\n\n` +
           `Thank you for staying informed with The Zone News.\n\n` +
           `#EveningUpdate #Adelaide #TheZoneNews`;
  }

  /**
   * Helper: Get weather info (placeholder)
   */
  async getWeatherInfo() {
    // This would integrate with a weather API
    return 'Sunny, 22°C';
  }

  /**
   * Helper: Get top stories (placeholder)
   */
  async getTopStories() {
    // This would fetch from the news database
    return '• Breaking: Major development in Adelaide\n• Tech: New innovation announced\n• Sports: Local team wins championship';
  }
}

// Export class for instantiation in bot-initialization
module.exports = SchedulingService;
