/**
 * Admin Article JSON Submission Service
 *
 * Allows admins to submit articles directly via JSON format.
 * Integrates with existing ArticleCurationService and AIArticleProcessor.
 *
 * Usage:
 * 1. Admin sends /submit_article command
 * 2. Admin pastes JSON article data
 * 3. Service validates, processes with AI
 * 4. Presents for approval (same workflow as URL submissions)
 */

const AIArticleProcessor = require('./ai-article-processor.service');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs').promises;
const path = require('path');

class AdminArticleJSONSubmissionService {
  constructor(bot, db, articleCurationService) {
    this.bot = bot;
    this.db = db;
    this.articleCurationService = articleCurationService;

    // Initialize JSON schema validator
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);

    // AI processor for enrichment
    this.aiProcessor = new AIArticleProcessor({
      defaultModel: process.env.AI_MODEL || 'llama-3.1-70b-versatile',
      temperature: 0.3,
      maxTokens: 2000
    });

    // Store pending JSON submissions
    this.pendingSubmissions = new Map();

    // Schema will be loaded
    this.schema = null;
  }

  /**
   * Initialize service and load schema
   */
  async initialize() {
    try {
      // Load JSON schema
      const schemaPath = path.join(__dirname, '../schemas/admin-article-submission.schema.json');
      const schemaContent = await fs.readFile(schemaPath, 'utf8');
      this.schema = JSON.parse(schemaContent);

      // Compile schema for validation
      this.validateArticle = this.ajv.compile(this.schema);

      console.log('✅ Admin Article JSON Submission Service initialized');

      // Set up bot commands
      this.setupCommands();

    } catch (error) {
      console.error('❌ Failed to initialize JSON submission service:', error);
      throw error;
    }
  }

  /**
   * Set up bot commands
   */
  setupCommands() {
    // Command: /submit_article - Start JSON submission
    this.bot.command('submit_article', async (ctx) => {
      await this.handleSubmitCommand(ctx);
    });

    // Command: /article_template - Get JSON template
    this.bot.command('article_template', async (ctx) => {
      await this.handleTemplateCommand(ctx);
    });

    // Command: /article_schema - Get full schema documentation
    this.bot.command('article_schema', async (ctx) => {
      await this.handleSchemaCommand(ctx);
    });

    // Listen for JSON messages from admins in submission mode
    this.bot.on('text', async (ctx) => {
      const userId = ctx.from.id;
      const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

      // Only process if user is admin and in submission mode
      if (adminIds.includes(userId) && this.pendingSubmissions.has(userId)) {
        await this.handleJSONSubmission(ctx);
      }
    });
  }

  /**
   * Handle /submit_article command
   */
  async handleSubmitCommand(ctx) {
    const userId = ctx.from.id;
    const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

    // Check if user is admin
    if (!adminIds.includes(userId)) {
      await ctx.reply('❌ This command is only available to administrators.');
      return;
    }

    // Set submission mode
    this.pendingSubmissions.set(userId, {
      timestamp: new Date(),
      chatId: ctx.chat.id
    });

    const instructions = `📝 <b>Article Submission Mode</b>

Send me your article in JSON format. I'll validate it, process with AI, and show you a preview.

<b>📋 Quick Templates:</b>

<b>Minimal</b> (AI fills the rest):
<code>{
  "title": "Your Headline Here",
  "content": "Full article text here..."
}</code>

<b>Standard</b> (recommended):
<code>{
  "title": "Adelaide CBD Gets Major Upgrade",
  "content": "The Adelaide City Council...",
  "category": "general",
  "url": "https://thezonenews.com/article",
  "imageUrl": "https://thezonenews.com/image.jpg",
  "tags": ["adelaide", "infrastructure"]
}</code>

<b>Categories:</b> general, business, entertainment, health, science, sports, technology, politics, environment, weather

<b>🔗 Need help?</b>
• /article_template - Copy-paste templates
• /article_schema - Full documentation
• /cancel - Exit submission mode

<i>Paste your JSON below to continue...</i>`;

    await ctx.reply(instructions, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    // Auto-cancel after 10 minutes
    setTimeout(() => {
      if (this.pendingSubmissions.has(userId)) {
        this.pendingSubmissions.delete(userId);
        ctx.reply('⏱️ Submission mode timed out. Use /submit_article to try again.').catch(() => {});
      }
    }, 600000);
  }

  /**
   * Handle /article_template command
   */
  async handleTemplateCommand(ctx) {
    const templates = `📋 <b>Article JSON Templates</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>🎯 Minimal Template</b>
<i>AI will automatically add category, keywords, and formatting</i>

<code>{
  "title": "Your Article Headline",
  "content": "Your full article text here. Can be multiple paragraphs. Include all the details you want to share."
}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>⭐ Standard Template</b>
<i>Recommended for most articles</i>

<code>{
  "title": "Adelaide Tech Startup Raises $5M",
  "description": "Local renewable energy startup secures major funding",
  "content": "A local Adelaide technology startup focused on renewable energy solutions has secured $5 million in Series A funding. The company, GreenTech Innovations, plans to use the funds to expand its team and accelerate product development.",
  "category": "business",
  "url": "https://thezonenews.com/articles/greentech-funding",
  "imageUrl": "https://thezonenews.com/images/startup.jpg",
  "author": "Sarah Johnson",
  "tags": ["startup", "funding", "adelaide", "technology"]
}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>🚀 Advanced Template</b>
<i>Full control over all fields</i>

<code>{
  "title": "Breaking: Major Weather Event Hits Adelaide",
  "description": "Severe storms cause widespread disruption",
  "content": "Adelaide is experiencing severe weather with heavy rain and strong winds causing power outages across the metropolitan area. The Bureau of Meteorology has issued warnings for residents to stay indoors.",
  "category": "weather",
  "url": "https://thezonenews.com/weather/storm-2025",
  "imageUrl": "https://thezonenews.com/images/storm.jpg",
  "author": "Weather Team",
  "source": {
    "name": "The Zone News",
    "url": "https://thezonenews.com"
  },
  "tags": ["weather", "adelaide", "storm", "breaking"],
  "keywords": ["adelaide weather", "storm", "power outage"],
  "isBreaking": true,
  "publishedAt": "2025-01-15T14:30:00+10:30"
}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>📚 Field Reference:</b>

<b>Required:</b>
• title - Article headline
• content - Full article text

<b>Optional:</b>
• description - Summary/excerpt
• category - See categories below
• url - Source/article URL
• imageUrl - Featured image
• author - Author name
• source - Publication details
• tags - Array of tags
• keywords - SEO keywords
• isBreaking - Mark as breaking news
• publishedAt - Publication date

<b>🏷️ Categories:</b>
general, business, entertainment, health, science, sports, technology, politics, environment, weather

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>💡 Tips:</b>
• Use Australian English spelling (colour, centre, etc.)
• Include Adelaide context when relevant
• Keep titles under 60 characters for best display
• Use descriptive tags for better organisation

Ready? Copy a template, fill it in, and send it to me!`;

    await ctx.reply(templates, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  }

  /**
   * Handle /article_schema command
   */
  async handleSchemaCommand(ctx) {
    const schemaDoc = `📚 <b>Article Schema Documentation</b>

Full JSON schema specification with all available fields and validation rules.

<b>GitHub:</b> <code>apps/bot/src/schemas/admin-article-submission.schema.json</code>

<b>🔍 Three Submission Levels:</b>

<b>1. Minimal</b> - Let AI do the work
   Required: title, content
   AI adds: category, keywords, sentiment, formatting

<b>2. Standard</b> - Recommended approach
   Required: title, content, category
   You control: description, source, tags, images
   AI enhances: keywords, sentiment, formatting

<b>3. Advanced</b> - Full control
   All fields available
   Override AI analysis
   Set breaking news flags
   Link related articles

<b>📝 Field Specifications:</b>

<code>title</code>
  Type: string
  Length: 10-500 characters
  Required: Yes

<code>description</code>
  Type: string
  Length: up to 1000 characters
  Optional: Yes

<code>content</code>
  Type: string
  Min length: 100 characters
  Required: Yes

<code>url</code>
  Type: string (valid URL)
  Optional: Yes

<code>imageUrl</code>
  Type: string (valid URL)
  Optional: Yes

<code>category</code>
  Type: enum
  Values: general, business, entertainment, health, science, sports, technology, politics, environment, weather
  Required: Standard/Advanced only

<code>tags</code>
  Type: array of strings
  Max items: 10
  Optional: Yes

<code>isBreaking</code>
  Type: boolean
  Default: false
  Optional: Yes

<b>🔗 View Full Schema:</b>
Use /article_template for practical examples

<b>❓ Need Help?</b>
Start with /submit_article and paste your JSON`;

    await ctx.reply(schemaDoc, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  }

  /**
   * Handle JSON submission from admin
   */
  async handleJSONSubmission(ctx) {
    const userId = ctx.from.id;
    const jsonText = ctx.message.text;

    // Check for cancel command
    if (jsonText === '/cancel') {
      this.pendingSubmissions.delete(userId);
      await ctx.reply('❌ Submission cancelled.');
      return;
    }

    // Ignore other commands
    if (jsonText.startsWith('/')) {
      return;
    }

    try {
      await ctx.reply('🔄 Processing JSON submission...\n\n📥 Parsing JSON\n⏳ Please wait...');

      // Parse JSON
      let articleData;
      try {
        articleData = JSON.parse(jsonText);
      } catch (parseError) {
        throw new Error(`Invalid JSON format: ${parseError.message}`);
      }

      await ctx.reply('🔄 Processing...\n\n✅ JSON parsed\n🔍 Validating schema...');

      // Validate against schema
      const valid = this.validateArticle(articleData);

      if (!valid) {
        const errors = this.ajv.errorsText(this.validateArticle.errors);
        throw new Error(`Schema validation failed:\n${errors}`);
      }

      await ctx.reply('🔄 Processing...\n\n✅ JSON parsed\n✅ Schema valid\n🤖 AI processing...');

      // Convert to article format compatible with existing system
      const article = await this.convertJSONToArticle(articleData);

      // Process with AI (same as URL workflow)
      const aiResult = await this.aiProcessor.processArticle(article);

      await ctx.reply('🔄 Processing...\n\n✅ JSON parsed\n✅ Schema valid\n✅ AI processed\n✍️ Generating preview...');

      // Create structured post
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
          is_breaking: articleData.isBreaking || aiResult.analysis.is_breaking,
          submission_type: 'json_admin'
        }
      };

      // Generate article ID
      const articleId = this.articleCurationService.generateArticleId();

      // Save for approval in the curation service
      this.articleCurationService.pendingApprovals.set(articleId, {
        userId,
        article,
        structuredPost,
        timestamp: new Date(),
        url: article.url,
        originalJson: articleData
      });

      // Clear submission mode
      this.pendingSubmissions.delete(userId);

      // Present for approval (reuse existing method)
      await ctx.reply('✅ Article processed successfully!\n\nHere\'s the preview:');
      await this.articleCurationService.presentForApproval(ctx, articleId, structuredPost);

    } catch (error) {
      console.error('JSON submission error:', error);
      await ctx.reply(
        `❌ <b>Submission Failed</b>\n\n` +
        `<i>Error:</i> ${this.escapeHtml(error.message)}\n\n` +
        `💡 <b>Tips:</b>\n` +
        `• Check JSON syntax (use a validator)\n` +
        `• Ensure required fields are present\n` +
        `• Verify URLs are valid\n` +
        `• Try /article_template for examples\n\n` +
        `Use /submit_article to try again.`,
        { parse_mode: 'HTML' }
      );

      // Don't clear submission mode on error - let them fix and retry
    }
  }

  /**
   * Convert JSON article data to internal article format
   */
  async convertJSONToArticle(jsonData) {
    return {
      title: jsonData.title,
      content: jsonData.content,
      excerpt: jsonData.description || jsonData.content.substring(0, 300) + '...',
      byline: jsonData.author,
      siteName: jsonData.source?.name || 'The Zone News',
      publishedDate: jsonData.publishedAt || new Date().toISOString(),
      image: jsonData.imageUrl,
      category: jsonData.category || 'General',
      url: jsonData.url || `https://thezonenews.com/articles/${Date.now()}`,
      // Additional metadata
      tags: jsonData.tags || [],
      keywords: jsonData.keywords || [],
      isBreaking: jsonData.isBreaking || false,
      isPremium: jsonData.isPremium || false,
      sentiment: jsonData.sentiment,
      relatedArticleIds: jsonData.relatedArticleIds || []
    };
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
   * Get submission statistics
   */
  getStats() {
    return {
      pendingSubmissions: this.pendingSubmissions.size,
      activeUsers: Array.from(this.pendingSubmissions.keys())
    };
  }

  /**
   * Clean up expired submissions (run periodically)
   */
  cleanupExpiredSubmissions() {
    const now = new Date();
    const expiryTime = 600000; // 10 minutes

    for (const [userId, submission] of this.pendingSubmissions.entries()) {
      if (now - submission.timestamp > expiryTime) {
        this.pendingSubmissions.delete(userId);
        console.log(`🗑️ Cleaned up expired submission from user ${userId}`);
      }
    }
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredSubmissions();
    }, 600000); // Every 10 minutes
  }
}

module.exports = AdminArticleJSONSubmissionService;
