/**
 * Article Curation Service
 *
 * Handles the complete workflow:
 * 1. User sends article URL or text
 * 2. Extract and analyze content
 * 3. Structure for posting
 * 4. Present for approval
 * 5. Post to channel after confirmation
 */

const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const AIArticleProcessor = require('./ai-article-processor.service');

class ArticleCurationService {
  constructor(bot, db) {
    this.bot = bot;
    this.db = db;
    this.pendingApprovals = new Map(); // Store pending articles for approval

    // Initialize AI processor
    this.aiProcessor = new AIArticleProcessor({
      defaultModel: process.env.AI_MODEL || 'llama-3.1-70b-versatile',
      temperature: 0.3,
      maxTokens: 2000
    });
  }

  /**
   * Initialize the service and set up handlers
   */
  initialize() {
    console.log('✅ Article Curation Service initialized');

    // Handle URLs sent to bot
    this.bot.hears(/https?:\/\/[^\s]+/, async (ctx) => {
      await this.handleArticleURL(ctx);
    });

    // Handle approval/rejection callbacks
    this.bot.action(/^approve_article_(.+)$/, async (ctx) => {
      await this.handleApproval(ctx);
    });

    this.bot.action(/^reject_article_(.+)$/, async (ctx) => {
      await this.handleRejection(ctx);
    });

    this.bot.action(/^edit_article_(.+)$/, async (ctx) => {
      await this.handleEdit(ctx);
    });
  }

  /**
   * Handle article URL submission
   */
  async handleArticleURL(ctx) {
    const url = ctx.message.text.match(/https?:\/\/[^\s]+/)[0];
    const userId = ctx.from.id;

    try {
      // Send processing message
      const processingMsg = await ctx.reply('🔄 Processing article...\n\n📥 Fetching content\n⏳ Please wait...');

      // Extract article content
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        null,
        '🔄 Processing article...\n\n✅ Content fetched\n🤖 AI analyzing...'
      );

      const article = await this.extractArticle(url);

      // Process with AI
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        null,
        '🔄 Processing article...\n\n✅ Content fetched\n✅ AI analysis complete\n✍️ Structuring post...'
      );

      const aiResult = await this.aiProcessor.processArticle(article);

      // Use AI-generated post structure
      const structuredPost = {
        text: aiResult.post.text,
        image: article.image,
        hasImage: !!article.image,
        metadata: {
          title: article.title,
          category: aiResult.analysis.category,
          source: article.siteName,
          url: article.url,
          ai_sentiment: aiResult.analysis.sentiment,
          ai_keywords: aiResult.analysis.keywords,
          is_breaking: aiResult.analysis.is_breaking
        }
      };

      // Save for approval
      const articleId = this.generateArticleId();
      this.pendingApprovals.set(articleId, {
        userId,
        article,
        structuredPost,
        timestamp: new Date(),
        url
      });

      // Delete processing message
      await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);

      // Present for approval
      await this.presentForApproval(ctx, articleId, structuredPost);

    } catch (error) {
      console.error('Error processing article:', error);
      await ctx.reply(`❌ Failed to process article:\n${error.message}`);
    }
  }

  /**
   * Extract article content from URL
   */
  async extractArticle(url) {
    try {
      // Fetch the page
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      // Parse with Readability
      const dom = new JSDOM(response.data, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        throw new Error('Could not extract article content');
      }

      // Extract metadata
      const metadata = this.extractMetadata(dom.window.document);

      return {
        title: article.title,
        content: article.textContent,
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName,
        publishedDate: metadata.publishedDate,
        image: metadata.image,
        category: metadata.category,
        url
      };

    } catch (error) {
      console.error('Article extraction failed:', error);
      throw new Error(`Failed to extract article: ${error.message}`);
    }
  }

  /**
   * Extract metadata from page
   */
  extractMetadata(document) {
    const getMetaContent = (name) => {
      const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return meta ? meta.getAttribute('content') : null;
    };

    return {
      publishedDate: getMetaContent('article:published_time') ||
                      getMetaContent('pubdate') ||
                      new Date().toISOString(),
      image: getMetaContent('og:image') ||
             getMetaContent('twitter:image'),
      category: getMetaContent('article:section') || 'General'
    };
  }

  /**
   * Structure the post for Telegram
   */
  async structurePost(article) {
    // Create a well-formatted Telegram post
    let post = '';

    // Title (bold)
    post += `<b>${this.escapeHtml(article.title)}</b>\n\n`;

    // Excerpt or first 300 chars of content
    const excerpt = article.excerpt || article.content.substring(0, 300) + '...';
    post += `${this.escapeHtml(excerpt)}\n\n`;

    // Metadata
    if (article.byline) {
      post += `✍️ ${this.escapeHtml(article.byline)}\n`;
    }

    if (article.siteName) {
      post += `📰 ${this.escapeHtml(article.siteName)}\n`;
    }

    if (article.category && article.category !== 'General') {
      post += `📂 ${this.escapeHtml(article.category)}\n`;
    }

    post += `\n🔗 <a href="${article.url}">Read full article</a>`;

    // Add hashtags
    const hashtags = this.generateHashtags(article);
    if (hashtags.length > 0) {
      post += `\n\n${hashtags.join(' ')}`;
    }

    return {
      text: post,
      image: article.image,
      hasImage: !!article.image,
      metadata: {
        title: article.title,
        category: article.category,
        source: article.siteName,
        url: article.url
      }
    };
  }

  /**
   * Generate hashtags from article
   */
  generateHashtags(article) {
    const tags = [];

    // Add category tag
    if (article.category && article.category !== 'General') {
      const categoryTag = article.category.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
      tags.push(`#${categoryTag}`);
    }

    // Add location tag if Adelaide is mentioned
    const content = (article.title + ' ' + article.content).toLowerCase();
    if (content.includes('adelaide')) {
      tags.push('#Adelaide');
    }

    // Add source tag if available
    if (article.siteName) {
      const sourceTag = article.siteName.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
      tags.push(`#${sourceTag}`);
    }

    // Add generic tag
    tags.push('#ZoneNews');

    return tags.slice(0, 5); // Max 5 hashtags
  }

  /**
   * Present article for approval
   */
  async presentForApproval(ctx, articleId, structuredPost) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve & Post', callback_data: `approve_article_${articleId}` },
          { text: '❌ Reject', callback_data: `reject_article_${articleId}` }
        ],
        [
          { text: '✏️ Edit Before Posting', callback_data: `edit_article_${articleId}` }
        ]
      ]
    };

    // Send preview
    const previewHeader = '📋 <b>Article Preview</b>\n' +
                         '━━━━━━━━━━━━━━━━━━━━\n\n';

    const previewFooter = '\n\n━━━━━━━━━━━━━━━━━━━━\n' +
                         '👆 This is how it will appear on the channel';

    try {
      if (structuredPost.hasImage && structuredPost.image) {
        // Send with image
        await ctx.replyWithPhoto(structuredPost.image, {
          caption: previewHeader + structuredPost.text + previewFooter,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } else {
        // Send text only
        await ctx.reply(
          previewHeader + structuredPost.text + previewFooter,
          {
            parse_mode: 'HTML',
            reply_markup: keyboard,
            disable_web_page_preview: true
          }
        );
      }
    } catch (error) {
      console.error('Error presenting for approval:', error);
      // Fallback to text only
      await ctx.reply(
        previewHeader + structuredPost.text + previewFooter,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
          disable_web_page_preview: true
        }
      );
    }
  }

  /**
   * Handle approval
   */
  async handleApproval(ctx) {
    const articleId = ctx.match[1];
    const pending = this.pendingApprovals.get(articleId);

    if (!pending) {
      await ctx.answerCbQuery('❌ Article not found or expired');
      return;
    }

    // Check if user is authorized
    if (pending.userId !== ctx.from.id) {
      await ctx.answerCbQuery('❌ You can only approve your own submissions');
      return;
    }

    try {
      await ctx.answerCbQuery('📤 Posting to channel...');

      // Edit message to show posting status
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.editMessageCaption(
        ctx.callbackQuery.message.caption + '\n\n⏳ Posting to channel...',
        { parse_mode: 'HTML' }
      ).catch(() => {
        // Fallback for text messages
        ctx.editMessageText(
          ctx.callbackQuery.message.text + '\n\n⏳ Posting to channel...',
          { parse_mode: 'HTML' }
        );
      });

      // Post to channel
      const result = await this.postToChannel(pending.structuredPost);

      // Save to database
      await this.saveArticle(pending, result);

      // Remove from pending
      this.pendingApprovals.delete(articleId);

      // Update message with success
      await ctx.editMessageCaption(
        ctx.callbackQuery.message.caption + '\n\n✅ Posted successfully!',
        { parse_mode: 'HTML' }
      ).catch(() => {
        ctx.editMessageText(
          ctx.callbackQuery.message.text + '\n\n✅ Posted successfully!',
          { parse_mode: 'HTML' }
        );
      });

      // Send confirmation with link
      const channelUsername = process.env.CHANNEL_USERNAME || 'ZoneNewsAdl';
      await ctx.reply(
        `✅ Article posted successfully!\n\n` +
        `📍 View post: https://t.me/${channelUsername}/${result.message_id}`
      );

    } catch (error) {
      console.error('Error posting article:', error);
      await ctx.reply(`❌ Failed to post article:\n${error.message}`);
    }
  }

  /**
   * Handle rejection
   */
  async handleRejection(ctx) {
    const articleId = ctx.match[1];
    const pending = this.pendingApprovals.get(articleId);

    if (!pending) {
      await ctx.answerCbQuery('❌ Article not found or expired');
      return;
    }

    if (pending.userId !== ctx.from.id) {
      await ctx.answerCbQuery('❌ You can only reject your own submissions');
      return;
    }

    // Remove from pending
    this.pendingApprovals.delete(articleId);

    await ctx.answerCbQuery('🗑️ Article rejected');

    // Update message
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.editMessageCaption(
      ctx.callbackQuery.message.caption + '\n\n❌ Rejected - will not be posted',
      { parse_mode: 'HTML' }
    ).catch(() => {
      ctx.editMessageText(
        ctx.callbackQuery.message.text + '\n\n❌ Rejected - will not be posted',
        { parse_mode: 'HTML' }
      );
    });
  }

  /**
   * Handle edit request
   */
  async handleEdit(ctx) {
    const articleId = ctx.match[1];
    const pending = this.pendingApprovals.get(articleId);

    if (!pending) {
      await ctx.answerCbQuery('❌ Article not found or expired');
      return;
    }

    if (pending.userId !== ctx.from.id) {
      await ctx.answerCbQuery('❌ You can only edit your own submissions');
      return;
    }

    await ctx.answerCbQuery('✏️ Edit mode activated');

    // Store edit state
    pending.editMode = true;
    this.pendingApprovals.set(articleId, pending);

    // Ask for edited content
    await ctx.reply(
      '✏️ <b>Edit Mode</b>\n\n' +
      'Send me the edited version of the post.\n\n' +
      'You can use HTML formatting:\n' +
      '• <code>&lt;b&gt;bold&lt;/b&gt;</code>\n' +
      '• <code>&lt;i&gt;italic&lt;/i&gt;</code>\n' +
      '• <code>&lt;a href="url"&gt;link&lt;/a&gt;</code>\n\n' +
      `Reply with your edited text, then I'll show you a new preview.\n\n` +
      `Article ID: <code>${articleId}</code>`,
      { parse_mode: 'HTML' }
    );

    // Set up temporary handler for edited text
    this.setupEditHandler(ctx, articleId);
  }

  /**
   * Set up handler for edited text
   */
  setupEditHandler(ctx, articleId) {
    // Listen for next message from this user
    const editHandler = async (editCtx) => {
      if (editCtx.from.id !== ctx.from.id) return;
      if (!editCtx.message?.text) return;

      const pending = this.pendingApprovals.get(articleId);
      if (!pending || !pending.editMode) return;

      // Update structured post with edited text
      pending.structuredPost.text = editCtx.message.text;
      pending.editMode = false;
      this.pendingApprovals.set(articleId, pending);

      // Show new preview
      await editCtx.reply('✅ Content updated! Here\'s the new preview:');
      await this.presentForApproval(editCtx, articleId, pending.structuredPost);

      // Remove this handler
      this.bot.off('text', editHandler);
    };

    this.bot.on('text', editHandler);

    // Auto-remove handler after 5 minutes
    setTimeout(() => {
      this.bot.off('text', editHandler);
    }, 300000);
  }

  /**
   * Post to channel
   */
  async postToChannel(structuredPost) {
    const channelId = process.env.CHANNEL_ID || '@ZoneNewsAdl';

    try {
      let result;

      if (structuredPost.hasImage && structuredPost.image) {
        result = await this.bot.telegram.sendPhoto(
          channelId,
          structuredPost.image,
          {
            caption: structuredPost.text,
            parse_mode: 'HTML'
          }
        );
      } else {
        result = await this.bot.telegram.sendMessage(
          channelId,
          structuredPost.text,
          {
            parse_mode: 'HTML',
            disable_web_page_preview: false
          }
        );
      }

      return result;
    } catch (error) {
      console.error('Failed to post to channel:', error);
      throw error;
    }
  }

  /**
   * Save article to database
   */
  async saveArticle(pending, postResult) {
    try {
      const articleDoc = {
        title: pending.structuredPost.metadata.title,
        content: pending.structuredPost.text,
        category: pending.structuredPost.metadata.category,
        source: pending.structuredPost.metadata.source,
        url: pending.url,
        image_url: pending.structuredPost.image,
        published_date: new Date(),
        posted_by: pending.userId,
        channel_message_id: postResult.message_id,
        status: 'published',
        created_at: new Date()
      };

      await this.db.collection('curated_articles').insertOne(articleDoc);
      console.log('✅ Article saved to database');
    } catch (error) {
      console.error('Failed to save article:', error);
    }
  }

  /**
   * Generate unique article ID
   */
  generateArticleId() {
    return `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Clean up expired pending approvals (run periodically)
   */
  cleanupExpiredApprovals() {
    const now = new Date();
    const expiryTime = 3600000; // 1 hour

    for (const [articleId, pending] of this.pendingApprovals.entries()) {
      if (now - pending.timestamp > expiryTime) {
        this.pendingApprovals.delete(articleId);
        console.log(`🗑️ Cleaned up expired approval: ${articleId}`);
      }
    }
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredApprovals();
    }, 600000); // Every 10 minutes
  }
}

module.exports = ArticleCurationService;
