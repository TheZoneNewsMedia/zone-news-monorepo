/**
 * Message Service - Core message and article management for Zone News Bot
 * Handles article fetching, formatting, and message composition
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Schemas
const ArticleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  summary: String,
  url: String,
  imageUrl: String,
  source: {
    type: String,
    default: 'Zone News'
  },
  category: {
    type: String,
    enum: ['technology', 'business', 'sports', 'entertainment', 'politics', 'health', 'general'],
    default: 'general'
  },
  tags: [String],
  author: String,
  publishedAt: {
    type: Date,
    default: Date.now
  },
  views: {
    type: Number,
    default: 0
  },
  shares: {
    type: Number,
    default: 0
  },
  reactions: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    readTime: Number,
    wordCount: Number,
    language: {
      type: String,
      default: 'en'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
ArticleSchema.index({ publishedAt: -1 });
ArticleSchema.index({ category: 1, publishedAt: -1 });
ArticleSchema.index({ tags: 1 });
ArticleSchema.index({ 'metadata.language': 1 });

const MessageTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['article', 'announcement', 'alert', 'welcome', 'digest'],
    required: true
  },
  template: {
    type: String,
    required: true
  },
  variables: [String],
  formatting: {
    parseMode: {
      type: String,
      enum: ['HTML', 'Markdown', 'MarkdownV2'],
      default: 'HTML'
    },
    disableWebPagePreview: {
      type: Boolean,
      default: false
    },
    disableNotification: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const MessageQueueSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    index: true
  },
  messageType: {
    type: String,
    enum: ['article', 'announcement', 'alert', 'digest', 'custom'],
    required: true
  },
  content: {
    text: String,
    photo: String,
    document: String,
    video: String,
    animation: String
  },
  options: {
    parseMode: String,
    replyMarkup: mongoose.Schema.Types.Mixed,
    disableWebPagePreview: Boolean,
    disableNotification: Boolean
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed'],
    default: 'pending',
    index: true
  },
  priority: {
    type: Number,
    default: 0,
    index: true
  },
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  error: String,
  scheduledFor: Date,
  sentAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Models
const Article = mongoose.models.Article || mongoose.model('Article', ArticleSchema);
const MessageTemplate = mongoose.models.MessageTemplate || mongoose.model('MessageTemplate', MessageTemplateSchema);
const MessageQueue = mongoose.models.MessageQueue || mongoose.model('MessageQueue', MessageQueueSchema);

class MessageService {
  constructor(bot) {
    this.bot = bot;
    this.cache = new Map();
    this.templates = new Map();
    this.processingQueue = false;
    this.initializeTemplates();
  }

  /**
   * Initialize default message templates
   */
  async initializeTemplates() {
    try {
      const defaultTemplates = [
        {
          name: 'article_full',
          type: 'article',
          template: '<b>{{title}}</b>\n\n{{content}}\n\n📰 <i>{{source}}</i> | 📅 {{date}}\n👁 {{views}} views | 💬 {{reactions}} reactions',
          variables: ['title', 'content', 'source', 'date', 'views', 'reactions'],
          formatting: { parseMode: 'HTML' }
        },
        {
          name: 'article_summary',
          type: 'article',
          template: '<b>{{title}}</b>\n\n{{summary}}\n\n🔗 <a href="{{url}}">Read more</a>',
          variables: ['title', 'summary', 'url'],
          formatting: { parseMode: 'HTML', disableWebPagePreview: true }
        },
        {
          name: 'daily_digest',
          type: 'digest',
          template: '📅 <b>Daily News Digest</b>\n\n{{articles}}\n\n<i>Stay informed with Zone News!</i>',
          variables: ['articles'],
          formatting: { parseMode: 'HTML' }
        },
        {
          name: 'welcome',
          type: 'welcome',
          template: '👋 <b>Welcome to Zone News Bot!</b>\n\nYour source for Adelaide\'s latest news and updates.\n\nUse /help to see available commands.',
          variables: [],
          formatting: { parseMode: 'HTML' }
        }
      ];

      for (const template of defaultTemplates) {
        await MessageTemplate.findOneAndUpdate(
          { name: template.name },
          template,
          { upsert: true, new: true }
        );
        this.templates.set(template.name, template);
      }

      logger.info('Message templates initialized');
    } catch (error) {
      logger.error('Error initializing templates:', error);
    }
  }

  /**
   * Create or update an article
   */
  async saveArticle(articleData) {
    try {
      // Calculate metadata
      const wordCount = articleData.content ? articleData.content.split(/\s+/).length : 0;
      const readTime = Math.ceil(wordCount / 200); // Average reading speed

      const article = await Article.findOneAndUpdate(
        { url: articleData.url },
        {
          ...articleData,
          metadata: {
            ...articleData.metadata,
            wordCount,
            readTime
          },
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      // Clear cache for this category
      this.cache.delete(`articles_${article.category}`);
      
      logger.info(`Article saved: ${article.title}`);
      return article;
    } catch (error) {
      logger.error('Error saving article:', error);
      throw error;
    }
  }

  /**
   * Get latest articles with optional filters
   */
  async getLatestArticles(options = {}) {
    const {
      limit = 10,
      category = null,
      tags = [],
      startDate = null,
      endDate = null,
      sortBy = 'publishedAt'
    } = options;

    try {
      const cacheKey = `articles_${category}_${limit}`;
      
      // Check cache
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 minutes cache
          return cached.data;
        }
      }

      const query = { isActive: true };
      
      if (category) {
        query.category = category;
      }
      
      if (tags.length > 0) {
        query.tags = { $in: tags };
      }
      
      if (startDate || endDate) {
        query.publishedAt = {};
        if (startDate) query.publishedAt.$gte = startDate;
        if (endDate) query.publishedAt.$lte = endDate;
      }

      const articles = await Article.find(query)
        .sort({ [sortBy]: -1 })
        .limit(limit)
        .lean();

      // Cache the results
      this.cache.set(cacheKey, {
        data: articles,
        timestamp: Date.now()
      });

      return articles;
    } catch (error) {
      logger.error('Error fetching articles:', error);
      return [];
    }
  }

  /**
   * Get a single article by ID
   */
  async getArticleById(articleId) {
    try {
      const article = await Article.findById(articleId);
      
      if (article) {
        // Increment view count
        article.views += 1;
        await article.save();
      }
      
      return article;
    } catch (error) {
      logger.error('Error fetching article:', error);
      return null;
    }
  }

  /**
   * Format article for display
   */
  formatArticle(article, templateName = 'article_full') {
    try {
      const template = this.templates.get(templateName) || this.templates.get('article_full');
      let formatted = template.template;

      const replacements = {
        title: article.title || 'Untitled',
        content: article.content || '',
        summary: article.summary || article.content?.substring(0, 200) + '...',
        source: article.source || 'Zone News',
        date: article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Today',
        url: article.url || '',
        views: article.views || 0,
        reactions: Object.values(article.reactions || {}).reduce((sum, count) => sum + count, 0),
        author: article.author || 'Zone News Team',
        category: article.category || 'general',
        readTime: article.metadata?.readTime || Math.ceil((article.content?.split(/\s+/).length || 0) / 200)
      };

      for (const [key, value] of Object.entries(replacements)) {
        formatted = formatted.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      return {
        text: formatted,
        options: template.formatting
      };
    } catch (error) {
      logger.error('Error formatting article:', error);
      return {
        text: `📰 ${article.title}\n\n${article.content}`,
        options: { parseMode: 'HTML' }
      };
    }
  }

  /**
   * Format multiple articles as a digest
   */
  formatDigest(articles, title = 'News Digest') {
    try {
      const articleList = articles.map((article, index) => {
        return `${index + 1}. <b>${article.title}</b>\n   ${article.summary || article.content?.substring(0, 100)}...\n   🔗 /article_${article._id}`;
      }).join('\n\n');

      const digest = `📅 <b>${title}</b>\n\n${articleList}\n\n<i>Click on any article ID to read more!</i>`;
      
      return {
        text: digest,
        options: { parseMode: 'HTML', disableWebPagePreview: true }
      };
    } catch (error) {
      logger.error('Error formatting digest:', error);
      return {
        text: title,
        options: {}
      };
    }
  }

  /**
   * Queue a message for sending
   */
  async queueMessage(chatId, messageType, content, options = {}, priority = 0) {
    try {
      const message = new MessageQueue({
        chatId,
        messageType,
        content,
        options,
        priority,
        scheduledFor: options.scheduledFor || new Date()
      });

      await message.save();
      
      // Start processing if not already running
      if (!this.processingQueue) {
        this.processMessageQueue();
      }

      return message;
    } catch (error) {
      logger.error('Error queueing message:', error);
      throw error;
    }
  }

  /**
   * Process message queue
   */
  async processMessageQueue() {
    if (this.processingQueue) return;
    
    this.processingQueue = true;

    try {
      while (true) {
        const message = await MessageQueue.findOneAndUpdate(
          {
            status: 'pending',
            scheduledFor: { $lte: new Date() }
          },
          { status: 'processing' },
          { sort: { priority: -1, createdAt: 1 }, new: true }
        );

        if (!message) {
          break;
        }

        try {
          // Send the message
          await this.sendMessage(message.chatId, message.content, message.options);
          
          // Mark as sent
          message.status = 'sent';
          message.sentAt = new Date();
          await message.save();
        } catch (error) {
          logger.error(`Error sending message to ${message.chatId}:`, error);
          
          message.retryCount += 1;
          message.error = error.message;
          
          if (message.retryCount >= message.maxRetries) {
            message.status = 'failed';
          } else {
            message.status = 'pending';
            message.scheduledFor = new Date(Date.now() + 60000 * message.retryCount); // Exponential backoff
          }
          
          await message.save();
        }
      }
    } catch (error) {
      logger.error('Error processing message queue:', error);
    } finally {
      this.processingQueue = false;
      
      // Schedule next check
      setTimeout(() => {
        if (!this.processingQueue) {
          this.processMessageQueue();
        }
      }, 10000); // Check every 10 seconds
    }
  }

  /**
   * Send a message with appropriate method based on content type
   */
  async sendMessage(chatId, content, options = {}) {
    try {
      let result;

      if (content.photo) {
        result = await this.bot.telegram.sendPhoto(chatId, content.photo, {
          caption: content.text,
          ...options
        });
      } else if (content.document) {
        result = await this.bot.telegram.sendDocument(chatId, content.document, {
          caption: content.text,
          ...options
        });
      } else if (content.video) {
        result = await this.bot.telegram.sendVideo(chatId, content.video, {
          caption: content.text,
          ...options
        });
      } else if (content.animation) {
        result = await this.bot.telegram.sendAnimation(chatId, content.animation, {
          caption: content.text,
          ...options
        });
      } else {
        result = await this.bot.telegram.sendMessage(chatId, content.text || content, options);
      }

      return result;
    } catch (error) {
      logger.error(`Error sending message to ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Get trending articles based on engagement
   */
  async getTrendingArticles(limit = 5) {
    try {
      const articles = await Article.aggregate([
        {
          $match: {
            isActive: true,
            publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
          }
        },
        {
          $addFields: {
            engagementScore: {
              $add: [
                '$views',
                { $multiply: ['$shares', 2] },
                {
                  $reduce: {
                    input: { $objectToArray: '$reactions' },
                    initialValue: 0,
                    in: { $add: ['$$value', '$$this.v'] }
                  }
                }
              ]
            }
          }
        },
        { $sort: { engagementScore: -1 } },
        { $limit: limit }
      ]);

      return articles;
    } catch (error) {
      logger.error('Error fetching trending articles:', error);
      return [];
    }
  }

  /**
   * Search articles by keyword
   */
  async searchArticles(keyword, limit = 10) {
    try {
      const articles = await Article.find({
        isActive: true,
        $or: [
          { title: { $regex: keyword, $options: 'i' } },
          { content: { $regex: keyword, $options: 'i' } },
          { tags: { $in: [new RegExp(keyword, 'i')] } }
        ]
      })
        .sort({ publishedAt: -1 })
        .limit(limit)
        .lean();

      return articles;
    } catch (error) {
      logger.error('Error searching articles:', error);
      return [];
    }
  }

  /**
   * Get article statistics
   */
  async getArticleStats() {
    try {
      const stats = await Article.aggregate([
        {
          $group: {
            _id: null,
            totalArticles: { $sum: 1 },
            totalViews: { $sum: '$views' },
            totalShares: { $sum: '$shares' },
            avgViews: { $avg: '$views' },
            categories: { $addToSet: '$category' }
          }
        }
      ]);

      const categoryBreakdown = await Article.aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            views: { $sum: '$views' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      return {
        overall: stats[0] || {},
        byCategory: categoryBreakdown
      };
    } catch (error) {
      logger.error('Error fetching article stats:', error);
      return { overall: {}, byCategory: [] };
    }
  }

  /**
   * Clean up old messages from queue
   */
  async cleanupMessageQueue(daysOld = 7) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      const result = await MessageQueue.deleteMany({
        status: { $in: ['sent', 'failed'] },
        createdAt: { $lt: cutoffDate }
      });

      logger.info(`Cleaned up ${result.deletedCount} old messages from queue`);
      return result.deletedCount;
    } catch (error) {
      logger.error('Error cleaning up message queue:', error);
      return 0;
    }
  }

  /**
   * Archive old articles
   */
  async archiveOldArticles(daysOld = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      const result = await Article.updateMany(
        {
          publishedAt: { $lt: cutoffDate },
          isActive: true
        },
        {
          isActive: false
        }
      );

      logger.info(`Archived ${result.modifiedCount} old articles`);
      return result.modifiedCount;
    } catch (error) {
      logger.error('Error archiving articles:', error);
      return 0;
    }
  }
}

module.exports = MessageService;
