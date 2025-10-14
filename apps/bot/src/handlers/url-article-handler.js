/**
 * URL Article Handler
 * Handles article submission via URL
 */

const URLArticleExtractor = require('../services/url-article-extractor.service');

class URLArticleHandler {
    constructor(bot, db, services) {
        this.bot = bot;
        this.db = db;
        this.services = services;
        this.extractor = new URLArticleExtractor(services.logger);
        this.pendingArticles = new Map(); // Store extracted articles temporarily
    }

    /**
     * Setup URL message handler
     */
    setupURLHandler() {
        // Listen for text messages containing URLs
        this.bot.on('text', async (ctx) => {
            const text = ctx.message.text;

            // Skip if it's a command
            if (text.startsWith('/')) return;

            // Detect URL in message
            const url = this.extractor.detectURL(text);
            if (!url) return;

            try {
                // Send "fetching" message
                const fetchingMsg = await ctx.reply('🔍 *Fetching article content...*', {
                    parse_mode: 'Markdown'
                });

                // Extract article content
                const article = await this.extractor.extractArticle(url);

                // Store article temporarily with unique ID
                const articleId = `${ctx.from.id}_${Date.now()}`;
                this.pendingArticles.set(articleId, {
                    ...article,
                    userId: ctx.from.id,
                    username: ctx.from.username || ctx.from.first_name
                });

                // Delete "fetching" message
                try {
                    await ctx.deleteMessage(fetchingMsg.message_id);
                } catch (err) {
                    // Ignore if message can't be deleted
                }

                // Show preview
                const preview = this.extractor.formatPreview(article);
                const keyboard = this.createPreviewKeyboard(articleId);

                // Send article with image if available
                if (article.image) {
                    await ctx.replyWithPhoto(article.image, {
                        caption: preview,
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                } else {
                    await ctx.reply(preview, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                }

                this.services.logger.info('URL article preview sent:', articleId);

            } catch (error) {
                this.services.logger.error('URL extraction error:', error);

                await ctx.reply(
                    '❌ *Failed to extract article*\n\n' +
                    `Could not fetch content from the URL. This could be because:\n` +
                    `• The page requires authentication\n` +
                    `• The URL is invalid or unavailable\n` +
                    `• The website blocks automated access\n\n` +
                    `Please try:\n` +
                    `• Checking the URL is correct\n` +
                    `• Using a different article source\n` +
                    `• Creating an article manually with /newarticle`,
                    { parse_mode: 'Markdown' }
                );
            }
        });
    }

    /**
     * Setup callback handlers for article actions
     */
    setupCallbackHandlers() {
        // Publish now handler
        this.bot.action(/^publish_url_article:(.+)$/, async (ctx) => {
            const articleId = ctx.match[1];
            const article = this.pendingArticles.get(articleId);

            if (!article) {
                await ctx.answerCbQuery('❌ Article expired. Please submit the URL again.');
                return;
            }

            try {
                await ctx.answerCbQuery('📝 Publishing article...');

                // Save to database
                const savedArticle = await this.saveArticleToDatabase(article);

                // Update message
                await ctx.editMessageCaption(
                    `✅ *Article Published!*\n\n` +
                    `📰 ${article.title}\n\n` +
                    `Your article has been saved successfully.\n\n` +
                    `Article ID: \`${savedArticle._id}\`\n\n` +
                    `What's next?`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '🚀 Post to Channel', callback_data: `quick_post_article:${savedArticle._id}` }
                                ],
                                [
                                    { text: '✏️ Edit Article', callback_data: `edit_article:${savedArticle._id}` },
                                    { text: '📰 My Articles', callback_data: 'cmd_drafts' }
                                ],
                                [
                                    { text: '🏠 Main Menu', callback_data: 'back_to_start' }
                                ]
                            ]
                        }
                    }
                );

                // Clean up pending article
                this.pendingArticles.delete(articleId);

            } catch (error) {
                this.services.logger.error('Publish error:', error);
                await ctx.answerCbQuery('❌ Failed to publish article');
            }
        });

        // Edit first handler
        this.bot.action(/^edit_url_article:(.+)$/, async (ctx) => {
            const articleId = ctx.match[1];
            const article = this.pendingArticles.get(articleId);

            if (!article) {
                await ctx.answerCbQuery('❌ Article expired. Please submit the URL again.');
                return;
            }

            try {
                await ctx.answerCbQuery('✏️ Opening editor...');

                // Save as draft first
                const savedArticle = await this.saveArticleToDatabase({
                    ...article,
                    status: 'draft'
                });

                // Show editing options
                await ctx.editMessageCaption(
                    `✏️ *Edit Article*\n\n` +
                    `📰 ${article.title}\n\n` +
                    `What would you like to edit?`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '📝 Edit Title', callback_data: `edit_title:${savedArticle._id}` },
                                    { text: '📄 Edit Description', callback_data: `edit_description:${savedArticle._id}` }
                                ],
                                [
                                    { text: '🖼️ Change Image', callback_data: `edit_image:${savedArticle._id}` },
                                    { text: '✍️ Edit Content', callback_data: `edit_content:${savedArticle._id}` }
                                ],
                                [
                                    { text: '✅ Done Editing', callback_data: `publish_url_article:${articleId}` }
                                ],
                                [
                                    { text: '❌ Cancel', callback_data: 'cancel_url_article' }
                                ]
                            ]
                        }
                    }
                );

                // Clean up pending article
                this.pendingArticles.delete(articleId);

            } catch (error) {
                this.services.logger.error('Edit error:', error);
                await ctx.answerCbQuery('❌ Failed to open editor');
            }
        });

        // Cancel handler
        this.bot.action('cancel_url_article', async (ctx) => {
            await ctx.answerCbQuery('Cancelled');
            await ctx.deleteMessage();
        });
    }

    /**
     * Save article to database
     */
    async saveArticleToDatabase(article) {
        try {
            const newsArticlesCollection = this.db.collection('news_articles');

            const articleDoc = {
                title: article.title,
                description: article.description,
                content: article.content || article.description,
                imageUrl: article.image,
                sourceUrl: article.url,
                author: article.author,
                authorId: article.userId,
                authorUsername: article.username,
                siteName: article.siteName,
                publishedDate: article.publishedDate || new Date(),
                status: article.status || 'published',
                category: this.detectCategory(article.title, article.description),
                tags: this.extractTags(article.title, article.description),
                views: 0,
                likes: 0,
                shares: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                submissionMethod: 'url_extraction'
            };

            const result = await newsArticlesCollection.insertOne(articleDoc);
            this.services.logger.info('Article saved to database:', result.insertedId);

            return {
                _id: result.insertedId,
                ...articleDoc
            };

        } catch (error) {
            this.services.logger.error('Database save error:', error);
            throw new Error('Failed to save article to database');
        }
    }

    /**
     * Detect article category from content
     */
    detectCategory(title, description) {
        const text = `${title} ${description}`.toLowerCase();

        const categories = {
            'politics': ['election', 'government', 'minister', 'parliament', 'policy'],
            'sports': ['football', 'cricket', 'afl', 'rugby', 'sport', 'game', 'team'],
            'business': ['economy', 'business', 'market', 'company', 'trade', 'investment'],
            'technology': ['tech', 'digital', 'ai', 'software', 'app', 'internet'],
            'health': ['health', 'medical', 'hospital', 'doctor', 'covid', 'vaccine'],
            'crime': ['police', 'court', 'crime', 'arrest', 'trial', 'investigation'],
            'weather': ['weather', 'storm', 'rain', 'temperature', 'forecast'],
            'entertainment': ['music', 'film', 'celebrity', 'arts', 'festival', 'concert']
        };

        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return category;
            }
        }

        return 'general';
    }

    /**
     * Extract tags from content
     */
    extractTags(title, description) {
        const text = `${title} ${description}`;
        const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];

        // Get most frequent words as tags
        const wordCount = {};
        words.forEach(word => {
            wordCount[word] = (wordCount[word] || 0) + 1;
        });

        return Object.entries(wordCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word]) => word);
    }

    /**
     * Create preview keyboard
     */
    createPreviewKeyboard(articleId) {
        return {
            inline_keyboard: [
                [
                    { text: '✅ Publish Now', callback_data: `publish_url_article:${articleId}` },
                    { text: '✏️ Edit First', callback_data: `edit_url_article:${articleId}` }
                ],
                [
                    { text: '❌ Cancel', callback_data: 'cancel_url_article' }
                ]
            ]
        };
    }

    /**
     * Initialize URL handler
     */
    initialize() {
        this.setupURLHandler();
        this.setupCallbackHandlers();
        this.services.logger.info('✅ URL article handler initialized');
    }
}

module.exports = URLArticleHandler;
