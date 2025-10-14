/**
 * News Commands Module
 * Handles all news browsing commands: news, trending, search, categories
 * 
 * @module NewsCommands
 */

const { Markup } = require('telegraf');
const CommandUtils = require('../utils/command-utils');

class NewsCommands {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.articlesPerPage = 5;
        this.searchResultsPerPage = 8;
        this.trendingCount = 10;
    }

    /**
     * Register all news commands with the bot
     */
    register() {
        // Register main news commands
        this.bot.command('news', (ctx) => this.news(ctx, ctx.args));
        this.bot.command('trending', this.trending.bind(this));
        this.bot.command('search', (ctx) => this.search(ctx, ctx.args));
        this.bot.command('categories', this.categories.bind(this));
        
        // Register callback queries for interactive features
        this.bot.action(/^news:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action === 'latest') {
                return this.news(ctx);
            } else if (action === 'refresh') {
                return this.news(ctx);
            } else if (action.startsWith('category:')) {
                const category = action.split(':')[1];
                return this.news(ctx, [category]);
            } else if (action.startsWith('page:')) {
                const page = parseInt(action.split(':')[1]);
                return this.handleNewsPagination(ctx, page);
            }
        });
        
        this.bot.action(/^trending:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action === 'show' || action === 'refresh') {
                return this.trending(ctx);
            }
        });
        
        this.bot.action(/^search:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action === 'start') {
                return this.search(ctx);
            } else if (action.includes(':page:')) {
                const parts = action.split(':page:');
                const query = decodeURIComponent(parts[0]);
                const page = parseInt(parts[1]);
                return this.handleSearchPagination(ctx, query, page);
            }
        });
        
        this.bot.action(/^category:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action === 'list' || action === 'refresh') {
                return this.categories(ctx);
            } else if (action.startsWith('toggle:')) {
                const category = action.split(':')[1];
                return this.handleCategoryToggle(ctx, category);
            } else if (action === 'select_all') {
                // Handle select all categories
                return this.handleCategoryToggle(ctx, 'all');
            } else if (action === 'clear_all') {
                // Handle clear all categories
                return this.handleCategoryToggle(ctx, 'none');
            }
        });
        
        // Handle text messages for search input
        this.bot.on('text', async (ctx) => {
            // Check if user is in search mode by looking at user state
            const userState = await this.getUserState(ctx.from.id);
            if (userState && userState.state === 'awaiting_search') {
                await this.clearUserState(ctx.from.id);
                return this.handleSearchInput(ctx, ctx.message.text);
            }
        });
    }

    /**
     * Helper method to get user state for search mode
     */
    async getUserState(userId) {
        try {
            return await this.db.collection('user_states').findOne({ user_id: userId });
        } catch (error) {
            return null;
        }
    }

    /**
     * Helper method to clear user state
     */
    async clearUserState(userId) {
        try {
            await this.db.collection('user_states').deleteOne({ user_id: userId });
        } catch (error) {
            console.error('Error clearing user state:', error);
        }
    }

    /**
     * Browse Latest News - Main news command with pagination and filtering
     */
    async news(ctx, args = []) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'news', { args });
            await CommandUtils.sendTyping(ctx);

            const userId = ctx.from.id;
            const page = parseInt(args.find(arg => arg.startsWith('p:'))?.split(':')[1]) || 1;
            const category = args.find(arg => !arg.startsWith('p:')) || null;

            const preferences = await CommandUtils.getUserPreferences(userId, this.db);
            const query = await this.buildNewsQuery(preferences, category);
            
            // Get articles with reaction counts
            const aggregationPipeline = [
                { $match: query },
                {
                    $lookup: {
                        from: 'global_reactions',
                        localField: '_id',
                        foreignField: 'article_id',
                        as: 'reactions'
                    }
                },
                {
                    $addFields: {
                        reaction_counts: {
                            $reduce: {
                                input: '$reactions',
                                initialValue: {},
                                in: {
                                    $mergeObjects: [
                                        '$$value',
                                        {
                                            $arrayToObject: [
                                                [{
                                                    k: '$$this.reaction_type',
                                                    v: { $ifNull: ['$$this.count', 0] }
                                                }]
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        total_reactions: {
                            $sum: '$reactions.count'
                        }
                    }
                },
                { $sort: { published_date: -1 } }
            ];

            const totalArticles = await this.db.collection('news_articles')
                .aggregate([...aggregationPipeline, { $count: 'total' }]).toArray();
            
            const totalCount = totalArticles[0]?.total || 0;
            const pagination = CommandUtils.getPaginationData(page, this.articlesPerPage, totalCount);

            if (totalCount === 0) {
                return this.sendNoArticlesMessage(ctx, category);
            }

            const articles = await this.db.collection('news_articles')
                .aggregate([
                    ...aggregationPipeline,
                    { $skip: pagination.skip },
                    { $limit: pagination.limit }
                ]).toArray();

            const message = await this.formatNewsMessage(articles, pagination, category, preferences.city);
            const keyboard = this.buildNewsKeyboard(pagination, category);

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard),
                disable_web_page_preview: true
            });

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Trending Articles - Popular articles based on reactions and views
     */
    async trending(ctx) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'trending');
            await CommandUtils.sendTyping(ctx);

            const userId = ctx.from.id;
            const preferences = await CommandUtils.getUserPreferences(userId, this.db);

            // Calculate trending score based on reactions, views, and recency
            const aggregationPipeline = [
                {
                    $lookup: {
                        from: 'global_reactions',
                        localField: '_id',
                        foreignField: 'article_id',
                        as: 'reactions'
                    }
                },
                {
                    $addFields: {
                        total_reactions: { $sum: '$reactions.count' },
                        reaction_counts: {
                            $reduce: {
                                input: '$reactions',
                                initialValue: {},
                                in: {
                                    $mergeObjects: [
                                        '$$value',
                                        {
                                            $arrayToObject: [
                                                [{
                                                    k: '$$this.reaction_type',
                                                    v: { $ifNull: ['$$this.count', 0] }
                                                }]
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        hours_ago: {
                            $divide: [
                                { $subtract: [new Date(), '$published_date'] },
                                3600000
                            ]
                        }
                    }
                },
                {
                    $addFields: {
                        trending_score: {
                            $add: [
                                { $multiply: ['$total_reactions', 10] },
                                { $multiply: [{ $ifNull: ['$views', 0] }, 1] },
                                { $divide: [100, { $add: ['$hours_ago', 1] }] }
                            ]
                        }
                    }
                },
                { 
                    $match: { 
                        trending_score: { $gt: 0 },
                        published_date: {
                            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                        }
                    }
                },
                { $sort: { trending_score: -1 } },
                { $limit: this.trendingCount }
            ];

            // Apply city filter if specified
            if (preferences.city && preferences.city !== 'all') {
                aggregationPipeline.unshift({
                    $match: {
                        $or: [
                            { city: preferences.city },
                            { city: { $exists: false } }
                        ]
                    }
                });
            }

            const trendingArticles = await this.db.collection('news_articles')
                .aggregate(aggregationPipeline).toArray();

            if (trendingArticles.length === 0) {
                const message = 
                    `📈 *Trending News*\n\n` +
                    `🔍 No trending articles found in the past week.\n\n` +
                    `Articles need reactions and engagement to trend. Try:\n` +
                    `• Browse latest news with /news\n` +
                    `• React to articles you enjoy\n` +
                    `• Check back later for trending content`;

                return CommandUtils.editOrReply(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('📰 Latest News', 'news:latest')],
                        [Markup.button.callback('↩️ Back', 'start')]
                    ])
                });
            }

            let message = `📈 *Trending News*\n`;
            message += `🔥 Top ${trendingArticles.length} trending stories\n\n`;

            trendingArticles.forEach((article, i) => {
                const rank = i + 1;
                const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                const engagement = this.formatEngagement(article);
                
                message += `${rankEmoji} ${CommandUtils.formatArticle(article, false, { showViews: true })}\n`;
                message += `🔥 ${engagement}\n\n`;
            });

            const keyboard = [
                [
                    Markup.button.callback('📰 Latest News', 'news:latest'),
                    Markup.button.callback('🔍 Search', 'search:start')
                ],
                [
                    Markup.button.callback('📂 Categories', 'categories:list'),
                    Markup.button.callback('🔄 Refresh', 'trending:refresh')
                ],
                [Markup.button.callback('↩️ Back', 'start')]
            ];

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard),
                disable_web_page_preview: true
            });

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Search Articles - Keyword search with relevance sorting and pagination
     */
    async search(ctx, args = []) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'search', { args });

            const userId = ctx.from.id;
            const queryText = args.join(' ').trim();
            const page = 1;

            if (!queryText) {
                return this.showSearchPrompt(ctx);
            }

            await CommandUtils.sendTyping(ctx);
            await this.performSearch(ctx, queryText, page);

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Categories Management - List categories with article counts and subscription status
     */
    async categories(ctx) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'categories');
            await CommandUtils.sendTyping(ctx);

            const userId = ctx.from.id;
            const preferences = await CommandUtils.getUserPreferences(userId, this.db);
            const userCategories = preferences.categories || ['general'];

            // Get category statistics
            const categoryStats = await this.db.collection('news_articles').aggregate([
                { $match: { published_date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 },
                        latest: { $max: '$published_date' }
                    }
                },
                { $sort: { count: -1 } }
            ]).toArray();

            if (categoryStats.length === 0) {
                const message = 
                    `📂 *News Categories*\n\n` +
                    `📭 No categories available at the moment.\n` +
                    `Check back later for news categories.`;

                return CommandUtils.editOrReply(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.callback('📰 Latest News', 'news:latest')],
                        [Markup.button.callback('↩️ Back', 'start')]
                    ])
                });
            }

            let message = `📂 *News Categories*\n`;
            message += `📊 Manage your news preferences\n\n`;

            categoryStats.forEach((cat, i) => {
                const category = cat._id || 'General';
                const isSubscribed = userCategories.includes(category.toLowerCase()) || userCategories.includes('all');
                const status = isSubscribed ? '✅ Subscribed' : '🔘 Not subscribed';
                const daysSince = Math.floor((new Date() - new Date(cat.latest)) / (24 * 60 * 60 * 1000));
                
                message += `${i + 1}. **${category}**\n`;
                message += `   ${status} | ${cat.count} articles | Updated ${daysSince}d ago\n\n`;
            });

            message += `💡 *Tip:* Subscribe to categories for personalised news filtering.`;

            const keyboard = [];
            
            // Category subscription buttons
            const categoryButtons = categoryStats.slice(0, 6).map(cat => {
                const category = cat._id || 'general';
                const isSubscribed = userCategories.includes(category.toLowerCase());
                const emoji = isSubscribed ? '✅' : '🔘';
                
                return Markup.button.callback(
                    `${emoji} ${category}`,
                    `category:toggle:${category.toLowerCase()}`
                );
            });

            // Arrange in rows of 2
            for (let i = 0; i < categoryButtons.length; i += 2) {
                keyboard.push(categoryButtons.slice(i, i + 2));
            }

            // Action buttons
            keyboard.push([
                Markup.button.callback('✅ Select All', 'category:select_all'),
                Markup.button.callback('❌ Clear All', 'category:clear_all')
            ]);

            keyboard.push([
                Markup.button.callback('📰 Browse News', 'news:latest'),
                Markup.button.callback('🔄 Refresh', 'categories:refresh')
            ]);

            keyboard.push([
                Markup.button.callback('↩️ Back', 'start')
            ]);

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Handle category toggle
     */
    async handleCategoryToggle(ctx, category) {
        try {
            const userId = ctx.from.id;
            const preferences = await CommandUtils.getUserPreferences(userId, this.db);
            let userCategories = preferences.categories || ['general'];

            if (userCategories.includes(category)) {
                userCategories = userCategories.filter(c => c !== category);
                await ctx.answerCbQuery(`❌ Unsubscribed from ${category}`, { show_alert: false });
            } else {
                if (!userCategories.includes(category)) {
                    userCategories.push(category);
                }
                await ctx.answerCbQuery(`✅ Subscribed to ${category}`, { show_alert: false });
            }

            await CommandUtils.saveUserPreference(userId, 'categories', userCategories, this.db);
            
            // Refresh the categories display
            await this.categories(ctx);

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Handle search query from user input
     */
    async handleSearchInput(ctx, query, page = 1) {
        try {
            await CommandUtils.sendTyping(ctx);
            await this.performSearch(ctx, query, page);
        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Handle pagination for news
     */
    async handleNewsPagination(ctx, page, category = null) {
        try {
            const args = category ? [category, `p:${page}`] : [`p:${page}`];
            await this.news(ctx, args);
            await ctx.answerCbQuery(`📄 Page ${page}`);
        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Handle pagination for search results
     */
    async handleSearchPagination(ctx, query, page) {
        try {
            await this.performSearch(ctx, query, page);
            await ctx.answerCbQuery(`🔍 Search page ${page}`);
        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Helper Methods
     */

    async buildNewsQuery(preferences, category) {
        const query = {};

        if (category && category !== 'all') {
            query.category = new RegExp(category, 'i');
        } else if (preferences.categories && preferences.categories.length > 0 && !preferences.categories.includes('all')) {
            query.category = { 
                $in: preferences.categories.map(c => new RegExp(c, 'i'))
            };
        }

        if (preferences.city && preferences.city !== 'all') {
            query.$or = [
                { city: new RegExp(preferences.city, 'i') },
                { city: { $exists: false } },
                { city: null }
            ];
        }

        return query;
    }

    async formatNewsMessage(articles, pagination, category, city) {
        let message = `📰 *Latest News*`;
        
        if (category) {
            message += ` - ${category.charAt(0).toUpperCase() + category.slice(1)}`;
        }
        if (city && city !== 'all') {
            message += ` | 🏙️ ${city}`;
        }
        
        message += `\n📄 Page ${pagination.page}/${pagination.totalPages} | ${pagination.totalItems} total\n\n`;

        articles.forEach((article, i) => {
            const num = pagination.startItem + i;
            message += `${num}. ${CommandUtils.formatArticle(article, true, { showCity: true, showViews: true })}\n\n`;
        });

        return message;
    }

    buildNewsKeyboard(pagination, category) {
        const keyboard = [];

        // Pagination
        if (pagination.totalPages > 1) {
            const pageButtons = CommandUtils.buildPagination(
                pagination.page,
                pagination.totalPages,
                category ? `news:${category}:page` : 'news:page'
            );
            keyboard.push(...pageButtons);
        }

        // Category filters
        keyboard.push([
            Markup.button.callback('💼 Business', 'news:category:business'),
            Markup.button.callback('🏃‍♂️ Sports', 'news:category:sports')
        ]);

        keyboard.push([
            Markup.button.callback('💻 Tech', 'news:category:technology'),
            Markup.button.callback('🏛️ Politics', 'news:category:politics')
        ]);

        // Action buttons
        keyboard.push([
            Markup.button.callback('📈 Trending', 'trending:show'),
            Markup.button.callback('🔍 Search', 'search:start'),
            Markup.button.callback('🔄 Refresh', category ? `news:category:${category}` : 'news:refresh')
        ]);

        return keyboard;
    }

    async performSearch(ctx, query, page) {
        const userId = ctx.from.id;
        const preferences = await CommandUtils.getUserPreferences(userId, this.db);
        
        // Build text search query with MongoDB text index
        const searchQuery = {
            $text: { $search: query }
        };

        // Apply city filter if specified
        if (preferences.city && preferences.city !== 'all') {
            searchQuery.$or = [
                { city: new RegExp(preferences.city, 'i') },
                { city: { $exists: false } }
            ];
        }

        const aggregationPipeline = [
            { $match: searchQuery },
            {
                $lookup: {
                    from: 'global_reactions',
                    localField: '_id',
                    foreignField: 'article_id',
                    as: 'reactions'
                }
            },
            {
                $addFields: {
                    score: { $meta: 'textScore' },
                    total_reactions: { $sum: '$reactions.count' }
                }
            },
            { $sort: { score: { $meta: 'textScore' }, published_date: -1 } }
        ];

        const totalResults = await this.db.collection('news_articles')
            .aggregate([...aggregationPipeline, { $count: 'total' }]).toArray();
        
        const totalCount = totalResults[0]?.total || 0;
        const pagination = CommandUtils.getPaginationData(page, this.searchResultsPerPage, totalCount);

        if (totalCount === 0) {
            const message = 
                `🔍 *Search Results*\n\n` +
                `❌ No articles found for: "${CommandUtils.escapeMarkdown(query)}"\n\n` +
                `💡 **Search Tips:**\n` +
                `• Try different keywords\n` +
                `• Use broader terms\n` +
                `• Check spelling\n` +
                `• Search by category or location`;

            const keyboard = [
                [Markup.button.callback('📰 Latest News', 'news:latest')],
                [Markup.button.callback('🔄 Try Again', 'search:start')],
                [Markup.button.callback('↩️ Back', 'start')]
            ];

            return CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });
        }

        const results = await this.db.collection('news_articles')
            .aggregate([
                ...aggregationPipeline,
                { $skip: pagination.skip },
                { $limit: pagination.limit }
            ]).toArray();

        let message = `🔍 *Search Results*\n`;
        message += `📝 "${CommandUtils.escapeMarkdown(query)}" | ${totalCount} found\n`;
        message += `📄 Page ${pagination.page}/${pagination.totalPages}\n\n`;

        results.forEach((article, i) => {
            const num = pagination.startItem + i;
            message += `${num}. ${CommandUtils.formatArticle(article, false, { showViews: true })}\n\n`;
        });

        const keyboard = [];
        
        if (pagination.totalPages > 1) {
            const pageButtons = CommandUtils.buildPagination(
                pagination.page,
                pagination.totalPages,
                `search:${encodeURIComponent(query)}:page`
            );
            keyboard.push(...pageButtons);
        }

        keyboard.push([
            Markup.button.callback('🔄 New Search', 'search:start'),
            Markup.button.callback('📰 Latest News', 'news:latest')
        ]);

        await CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard),
            disable_web_page_preview: true
        });
    }

    showSearchPrompt(ctx) {
        const message = 
            `🔍 *Search News Articles*\n\n` +
            `Enter keywords to search through our news database:\n\n` +
            `💡 **Examples:**\n` +
            `• \`Adelaide weather\`\n` +
            `• \`technology startup\`\n` +
            `• \`sports AFL\`\n` +
            `• \`business investment\`\n\n` +
            `🎯 **Features:**\n` +
            `• Multi-keyword search\n` +
            `• Relevance ranking\n` +
            `• Recent articles prioritised\n` +
            `• Filtered by your city preference\n\n` +
            `Type your search query:`;

        const keyboard = [
            [Markup.button.callback('❌ Cancel', 'start')]
        ];

        return CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    sendNoArticlesMessage(ctx, category) {
        let message = `📭 *No Articles Found*\n\n`;
        
        if (category) {
            message += `No articles found in the "${category}" category.\n\n`;
        } else {
            message += `No articles match your current preferences.\n\n`;
        }
        
        message += 
            `💡 **Try:**\n` +
            `• Browse all news with /news\n` +
            `• Change category filters\n` +
            `• Update city preferences\n` +
            `• Use search to find specific topics`;

        const keyboard = [
            [
                Markup.button.callback('📰 All News', 'news:all'),
                Markup.button.callback('📂 Categories', 'categories:list')
            ],
            [
                Markup.button.callback('⚙️ Settings', 'settings:main'),
                Markup.button.callback('🔍 Search', 'search:start')
            ]
        ];

        return CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    formatEngagement(article) {
        const reactions = article.total_reactions || 0;
        const views = article.views || 0;
        const score = Math.round(article.trending_score || 0);
        
        return `${reactions} reactions | ${views} views | ${score} trend score`;
    }
}

module.exports = NewsCommands;