const CommandUtils = require('../utils/command-utils');

class NewsCallbacks {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.loadingUsers = new Set();
    }

    /**
     * Register all news-related callback handlers with specific actions
     */
    register() {
        // News pagination actions
        this.bot.action('news:next', this.handlePagination.bind(this));
        this.bot.action('news:prev', this.handlePagination.bind(this));
        this.bot.action(/^news:page:\d+$/, this.handlePagination.bind(this));
        
        // Article actions
        this.bot.action(/^article:read:.+$/, this.handleArticleActions.bind(this));
        this.bot.action(/^article:save:.+$/, this.handleArticleActions.bind(this));
        this.bot.action(/^article:share:.+$/, this.handleArticleActions.bind(this));
        
        // Category navigation actions
        this.bot.action(/^category:browse:.+$/, this.handleCategoryNavigation.bind(this));
        this.bot.action(/^category:filter:.+$/, this.handleCategoryNavigation.bind(this));
        
        // Trending actions
        this.bot.action('trending:more', this.handleTrendingActions.bind(this));
        this.bot.action('trending:refresh', this.handleTrendingActions.bind(this));
        
        // Search actions
        this.bot.action(/^search:results:\d+$/, this.handleSearchActions.bind(this));
        this.bot.action(/^search:refine:.*$/, this.handleSearchActions.bind(this));
    }

    /**
     * Handle news pagination callbacks
     */
    async handlePagination(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from, message } = callbackQuery;
        
        if (!data?.startsWith('news:')) return;

        if (this.loadingUsers.has(from.id)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '⏳ Please wait...',
                show_alert: false
            });
            return;
        }

        try {
            this.loadingUsers.add(from.id);
            
            let page = 1;
            
            if (data === 'news:next') {
                const currentPage = this.extractPageFromMessage(message);
                page = currentPage + 1;
            } else if (data === 'news:prev') {
                const currentPage = this.extractPageFromMessage(message);
                page = Math.max(1, currentPage - 1);
            } else if (data.startsWith('news:page:')) {
                page = parseInt(data.split(':')[2]) || 1;
            }

            // Show loading state
            await this.bot.editMessageText('⏳ Loading news...', {
                chat_id: message.chat.id,
                message_id: message.message_id,
                reply_markup: { inline_keyboard: [] }
            });

            // Fetch news for page
            const newsData = await this.fetchNews(page, from.id);
            const newsMessage = await CommandUtils.formatNewsList(newsData.articles, page, newsData.total);
            const keyboard = this.buildNewsKeyboard(page, newsData.total);

            await this.bot.editMessageText(newsMessage, {
                chat_id: message.chat.id,
                message_id: message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
                disable_web_page_preview: true
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: `📄 Page ${page}`,
                show_alert: false
            });

        } catch (error) {
            console.error('Pagination error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to load page',
                show_alert: true
            });
        } finally {
            this.loadingUsers.delete(from.id);
        }
    }

    /**
     * Handle article action callbacks
     */
    async handleArticleActions(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('article:')) return;

        const [action, operation, articleId] = data.split(':');
        
        try {
            switch (operation) {
                case 'read':
                    await this.handleArticleRead(callbackQuery, articleId);
                    break;
                case 'save':
                    await this.handleArticleSave(callbackQuery, articleId);
                    break;
                case 'share':
                    await this.handleArticleShare(callbackQuery, articleId);
                    break;
            }
        } catch (error) {
            console.error('Article action error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Action failed',
                show_alert: false
            });
        }
    }

    /**
     * Handle category navigation callbacks
     */
    async handleCategoryNavigation(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from, message } = callbackQuery;
        
        if (!data?.startsWith('category:')) return;

        const [action, operation, category] = data.split(':');
        
        try {
            if (operation === 'browse') {
                await this.handleCategoryBrowse(callbackQuery, category);
            } else if (operation === 'filter') {
                await this.handleCategoryFilter(callbackQuery, category);
            }
        } catch (error) {
            console.error('Category navigation error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Navigation failed',
                show_alert: false
            });
        }
    }

    /**
     * Handle trending action callbacks
     */
    async handleTrendingActions(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from, message } = callbackQuery;
        
        if (!data?.startsWith('trending:')) return;

        try {
            if (data === 'trending:more') {
                await this.handleTrendingMore(callbackQuery);
            } else if (data === 'trending:refresh') {
                await this.handleTrendingRefresh(callbackQuery);
            }
        } catch (error) {
            console.error('Trending action error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to update trending',
                show_alert: false
            });
        }
    }

    /**
     * Handle search action callbacks
     */
    async handleSearchActions(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from, message } = callbackQuery;
        
        if (!data?.startsWith('search:')) return;

        const [action, operation, ...params] = data.split(':');
        
        try {
            if (operation === 'results') {
                const page = parseInt(params[0]) || 1;
                await this.handleSearchResults(callbackQuery, page);
            } else if (operation === 'refine') {
                const query = params.join(':');
                await this.handleSearchRefine(callbackQuery, query);
            }
        } catch (error) {
            console.error('Search action error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Search failed',
                show_alert: false
            });
        }
    }

    /**
     * Handle article read action
     */
    async handleArticleRead(callbackQuery, articleId) {
        const article = await this.db.collection('articles').findOne({ 
            _id: require('mongodb').ObjectId(articleId) 
        });
        
        if (!article) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Article not found',
                show_alert: true
            });
            return;
        }

        // Update read count
        await this.db.collection('articles').updateOne(
            { _id: article._id },
            { $inc: { readCount: 1 } }
        );

        // Track user read
        await this.db.collection('user_reads').updateOne(
            { userId: callbackQuery.from.id, articleId: article._id },
            { $set: { readAt: new Date() } },
            { upsert: true }
        );

        const fullArticle = CommandUtils.formatFullArticle(article);
        const keyboard = this.buildArticleKeyboard(articleId);

        await this.bot.sendMessage(callbackQuery.message.chat.id, fullArticle, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
            disable_web_page_preview: false
        });

        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '📖 Article opened',
            show_alert: false
        });
    }

    /**
     * Handle article save/unsave toggle
     */
    async handleArticleSave(callbackQuery, articleId) {
        const userId = callbackQuery.from.id;
        
        const existingSave = await this.db.collection('user_saves').findOne({
            userId,
            articleId: require('mongodb').ObjectId(articleId)
        });

        let message;
        if (existingSave) {
            await this.db.collection('user_saves').deleteOne({ _id: existingSave._id });
            message = '💾 Article unsaved';
        } else {
            await this.db.collection('user_saves').insertOne({
                userId,
                articleId: require('mongodb').ObjectId(articleId),
                savedAt: new Date()
            });
            message = '💾 Article saved';
        }

        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: message,
            show_alert: false
        });
    }

    /**
     * Handle article share action
     */
    async handleArticleShare(callbackQuery, articleId) {
        const article = await this.db.collection('articles').findOne({ 
            _id: require('mongodb').ObjectId(articleId) 
        });

        if (!article) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Article not found',
                show_alert: true
            });
            return;
        }

        // Track share
        await this.db.collection('article_shares').insertOne({
            articleId: article._id,
            userId: callbackQuery.from.id,
            sharedAt: new Date()
        });

        // Update share count
        await this.db.collection('articles').updateOne(
            { _id: article._id },
            { $inc: { shareCount: 1 } }
        );

        const shareText = `📰 ${article.title}\n\n${article.summary}\n\n🔗 ${article.url}`;
        
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '📤 Ready to share',
            show_alert: false
        });

        await this.bot.sendMessage(callbackQuery.message.chat.id, shareText, {
            parse_mode: 'HTML'
        });
    }

    /**
     * Fetch news data for pagination
     */
    async fetchNews(page = 1, userId = null) {
        const limit = 10;
        const skip = (page - 1) * limit;

        const filter = {};
        
        // Get user preferences if available
        if (userId) {
            const userPrefs = await this.db.collection('user_preferences').findOne({ userId });
            if (userPrefs?.categories?.length) {
                filter.category = { $in: userPrefs.categories };
            }
        }

        const articles = await this.db.collection('articles')
            .find(filter)
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        const total = await this.db.collection('articles').countDocuments(filter);

        return { articles, total, page, totalPages: Math.ceil(total / limit) };
    }

    /**
     * Build news navigation keyboard
     */
    buildNewsKeyboard(page, total) {
        const limit = 10;
        const totalPages = Math.ceil(total / limit);
        const keyboard = [];

        // Pagination row
        const navRow = [];
        if (page > 1) {
            navRow.push({ text: '⬅️ Previous', callback_data: 'news:prev' });
        }
        if (page < totalPages) {
            navRow.push({ text: 'Next ➡️', callback_data: 'news:next' });
        }
        if (navRow.length) keyboard.push(navRow);

        // Action row
        keyboard.push([
            { text: '🔍 Search', callback_data: 'search:refine:' },
            { text: '📂 Categories', callback_data: 'category:browse:all' },
            { text: '🔥 Trending', callback_data: 'trending:more' }
        ]);

        return keyboard;
    }

    /**
     * Build article action keyboard
     */
    buildArticleKeyboard(articleId) {
        return [
            [
                { text: '💾 Save', callback_data: `article:save:${articleId}` },
                { text: '📤 Share', callback_data: `article:share:${articleId}` }
            ],
            [
                { text: '🔙 Back to News', callback_data: 'news:page:1' }
            ]
        ];
    }

    /**
     * Extract current page from message
     */
    extractPageFromMessage(message) {
        const match = message.text?.match(/Page (\d+)/);
        return match ? parseInt(match[1]) : 1;
    }

    /**
     * Handle category browse
     */
    async handleCategoryBrowse(callbackQuery, category) {
        // Implementation for category browsing
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `📂 Browsing ${category}`,
            show_alert: false
        });
    }

    /**
     * Handle category filter
     */
    async handleCategoryFilter(callbackQuery, category) {
        // Implementation for category filtering
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `🔍 Filtered by ${category}`,
            show_alert: false
        });
    }

    /**
     * Handle trending more
     */
    async handleTrendingMore(callbackQuery) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '🔥 Loading more trending...',
            show_alert: false
        });
    }

    /**
     * Handle trending refresh
     */
    async handleTrendingRefresh(callbackQuery) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '🔄 Refreshing trending...',
            show_alert: false
        });
    }

    /**
     * Handle search results
     */
    async handleSearchResults(callbackQuery, page) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `📄 Search results page ${page}`,
            show_alert: false
        });
    }

    /**
     * Handle search refine
     */
    async handleSearchRefine(callbackQuery, query) {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '🔍 Search refinement...',
            show_alert: false
        });
    }
}

module.exports = NewsCallbacks;