/**
 * ArticleSearch Service - Handle article search and discovery
 */

const { ObjectId } = require('mongodb');
const { Markup } = require('telegraf');

class ArticleSearch {
    constructor(db) {
        this.db = db;
        this.userSearchSessions = new Map();
    }

    /**
     * Simple text search across articles
     */
    async simpleSearch(ctx, query) {
        try {
            const userId = ctx.from.id;
            
            if (!query || query.length < 2) {
                return ctx.reply('🔍 Please provide a search term with at least 2 characters.');
            }

            // Create text search query
            const searchResults = await this.db.collection('news_articles')
                .find({
                    status: 'published',
                    $or: [
                        { title: { $regex: query, $options: 'i' } },
                        { content: { $regex: query, $options: 'i' } },
                        { summary: { $regex: query, $options: 'i' } },
                        { category: { $regex: query, $options: 'i' } }
                    ]
                })
                .sort({ published_date: -1 })
                .limit(10)
                .toArray();

            await this.displaySearchResults(ctx, searchResults, query, 'simple');
        } catch (error) {
            console.error('Simple search error:', error);
            ctx.reply('❌ Error performing search. Please try again.');
        }
    }

    /**
     * Advanced search with filters
     */
    async startAdvancedSearch(ctx) {
        const userId = ctx.from.id;
        
        // Initialize search session
        this.userSearchSessions.set(userId, {
            filters: {
                query: '',
                category: '',
                author: '',
                dateFrom: null,
                dateTo: null,
                minViews: 0,
                sortBy: 'date'
            },
            step: 'main_menu'
        });

        await this.showAdvancedSearchMenu(ctx);
    }

    /**
     * Show advanced search menu
     */
    async showAdvancedSearchMenu(ctx) {
        const userId = ctx.from.id;
        const session = this.userSearchSessions.get(userId);
        
        if (!session) {
            return ctx.reply('❌ Search session expired. Please try again.');
        }

        const filters = session.filters;
        let message = '🔍 **Advanced Search**\n\n';
        message += '**Current Filters:**\n';
        message += `📝 **Query:** ${filters.query || 'None'}\n`;
        message += `🏷️ **Category:** ${filters.category || 'All'}\n`;
        message += `👤 **Author:** ${filters.author || 'All'}\n`;
        message += `📅 **Date Range:** ${filters.dateFrom ? `${filters.dateFrom} to ${filters.dateTo || 'now'}` : 'All time'}\n`;
        message += `👁️ **Min Views:** ${filters.minViews}\n`;
        message += `📊 **Sort By:** ${filters.sortBy}\n\n`;
        message += 'Choose what to modify or search:';

        const keyboard = [
            [
                Markup.button.callback('📝 Set Query', 'search_set_query'),
                Markup.button.callback('🏷️ Set Category', 'search_set_category')
            ],
            [
                Markup.button.callback('👤 Set Author', 'search_set_author'),
                Markup.button.callback('📅 Set Date Range', 'search_set_date')
            ],
            [
                Markup.button.callback('👁️ Set Min Views', 'search_set_views'),
                Markup.button.callback('📊 Set Sort Order', 'search_set_sort')
            ],
            [
                Markup.button.callback('🔍 Search Now', 'search_execute'),
                Markup.button.callback('🗑️ Clear Filters', 'search_clear')
            ],
            [
                Markup.button.callback('❌ Cancel', 'search_cancel')
            ]
        ];

        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            });
        }
    }

    /**
     * Handle advanced search actions
     */
    async handleSearchAction(ctx, action) {
        const userId = ctx.from.id;
        const session = this.userSearchSessions.get(userId);
        
        if (!session) {
            return ctx.answerCbQuery('Search session expired.');
        }

        try {
            switch (action) {
                case 'search_set_query':
                    session.step = 'set_query';
                    await ctx.editMessageText(
                        '📝 **Set Search Query**\n\n' +
                        'Enter keywords to search in title, content, and summary:',
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('🔙 Back to Menu', 'search_back_menu')],
                                [Markup.button.callback('❌ Cancel', 'search_cancel')]
                            ])
                        }
                    );
                    break;

                case 'search_set_category':
                    await this.showCategoryFilter(ctx);
                    break;

                case 'search_set_author':
                    session.step = 'set_author';
                    await ctx.editMessageText(
                        '👤 **Set Author Filter**\n\n' +
                        'Enter author name or username:',
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('🔙 Back to Menu', 'search_back_menu')],
                                [Markup.button.callback('❌ Cancel', 'search_cancel')]
                            ])
                        }
                    );
                    break;

                case 'search_set_date':
                    await this.showDateRangeOptions(ctx);
                    break;

                case 'search_set_views':
                    session.step = 'set_views';
                    await ctx.editMessageText(
                        '👁️ **Set Minimum Views**\n\n' +
                        'Enter minimum number of views (0 for no minimum):',
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('🔙 Back to Menu', 'search_back_menu')],
                                [Markup.button.callback('❌ Cancel', 'search_cancel')]
                            ])
                        }
                    );
                    break;

                case 'search_set_sort':
                    await this.showSortOptions(ctx);
                    break;

                case 'search_execute':
                    await this.executeAdvancedSearch(ctx);
                    break;

                case 'search_clear':
                    session.filters = {
                        query: '',
                        category: '',
                        author: '',
                        dateFrom: null,
                        dateTo: null,
                        minViews: 0,
                        sortBy: 'date'
                    };
                    await this.showAdvancedSearchMenu(ctx);
                    break;

                case 'search_back_menu':
                    session.step = 'main_menu';
                    await this.showAdvancedSearchMenu(ctx);
                    break;

                case 'search_cancel':
                    this.userSearchSessions.delete(userId);
                    await ctx.editMessageText(
                        '❌ **Search Cancelled**\n\nSearch session ended.',
                        { parse_mode: 'Markdown' }
                    );
                    break;
            }

            await ctx.answerCbQuery();
        } catch (error) {
            console.error(`Search action error (${action}):`, error);
            await ctx.answerCbQuery('❌ Error processing action');
        }
    }

    /**
     * Show category filter options
     */
    async showCategoryFilter(ctx) {
        const categories = [
            'All Categories', 'Breaking News', 'Local News', 'Politics', 
            'Business', 'Technology', 'Sports', 'Entertainment', 
            'Health', 'Education', 'Opinion', 'Other'
        ];

        const keyboard = [];
        for (let i = 0; i < categories.length; i += 2) {
            const row = [
                Markup.button.callback(categories[i], `search_category:${categories[i]}`)
            ];
            if (categories[i + 1]) {
                row.push(Markup.button.callback(categories[i + 1], `search_category:${categories[i + 1]}`));
            }
            keyboard.push(row);
        }

        keyboard.push([
            [Markup.button.callback('🔙 Back to Menu', 'search_back_menu')],
            [Markup.button.callback('❌ Cancel', 'search_cancel')]
        ]);

        await ctx.editMessageText(
            '🏷️ **Select Category Filter**\n\n' +
            'Choose a category to filter by:',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            }
        );
    }

    /**
     * Show date range options
     */
    async showDateRangeOptions(ctx) {
        const keyboard = [
            [
                Markup.button.callback('📅 Today', 'search_date:today'),
                Markup.button.callback('📅 Yesterday', 'search_date:yesterday')
            ],
            [
                Markup.button.callback('📅 This Week', 'search_date:week'),
                Markup.button.callback('📅 This Month', 'search_date:month')
            ],
            [
                Markup.button.callback('📅 Last 3 Months', 'search_date:3months'),
                Markup.button.callback('📅 This Year', 'search_date:year')
            ],
            [
                Markup.button.callback('📅 All Time', 'search_date:all'),
                Markup.button.callback('📝 Custom Range', 'search_date:custom')
            ],
            [
                Markup.button.callback('🔙 Back to Menu', 'search_back_menu'),
                Markup.button.callback('❌ Cancel', 'search_cancel')
            ]
        ];

        await ctx.editMessageText(
            '📅 **Set Date Range**\n\n' +
            'Choose a date range for filtering articles:',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            }
        );
    }

    /**
     * Show sort options
     */
    async showSortOptions(ctx) {
        const keyboard = [
            [
                Markup.button.callback('📅 Newest First', 'search_sort:date_desc'),
                Markup.button.callback('📅 Oldest First', 'search_sort:date_asc')
            ],
            [
                Markup.button.callback('👁️ Most Views', 'search_sort:views_desc'),
                Markup.button.callback('❤️ Most Reactions', 'search_sort:reactions_desc')
            ],
            [
                Markup.button.callback('🔤 A-Z Title', 'search_sort:title_asc'),
                Markup.button.callback('🔤 Z-A Title', 'search_sort:title_desc')
            ],
            [
                Markup.button.callback('🔙 Back to Menu', 'search_back_menu'),
                Markup.button.callback('❌ Cancel', 'search_cancel')
            ]
        ];

        await ctx.editMessageText(
            '📊 **Set Sort Order**\n\n' +
            'Choose how to sort the search results:',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            }
        );
    }

    /**
     * Handle user text input for search filters
     */
    async handleSearchInput(ctx) {
        const userId = ctx.from.id;
        const session = this.userSearchSessions.get(userId);
        
        if (!session) {
            return; // No active search session
        }

        const text = ctx.message.text.trim();

        try {
            switch (session.step) {
                case 'set_query':
                    session.filters.query = text;
                    session.step = 'main_menu';
                    await ctx.reply('✅ Search query updated!');
                    await this.showAdvancedSearchMenu(ctx);
                    break;

                case 'set_author':
                    session.filters.author = text;
                    session.step = 'main_menu';
                    await ctx.reply('✅ Author filter updated!');
                    await this.showAdvancedSearchMenu(ctx);
                    break;

                case 'set_views':
                    const views = parseInt(text);
                    if (isNaN(views) || views < 0) {
                        return ctx.reply('❌ Please enter a valid number (0 or greater).');
                    }
                    session.filters.minViews = views;
                    session.step = 'main_menu';
                    await ctx.reply('✅ Minimum views filter updated!');
                    await this.showAdvancedSearchMenu(ctx);
                    break;
            }
        } catch (error) {
            console.error('Search input error:', error);
            ctx.reply('❌ Error processing input. Please try again.');
        }
    }

    /**
     * Execute advanced search with all filters
     */
    async executeAdvancedSearch(ctx) {
        const userId = ctx.from.id;
        const session = this.userSearchSessions.get(userId);
        
        if (!session) {
            return ctx.answerCbQuery('Search session expired.');
        }

        try {
            const filters = session.filters;
            const query = {};
            
            // Status filter - only published articles
            query.status = 'published';

            // Text query
            if (filters.query) {
                query.$or = [
                    { title: { $regex: filters.query, $options: 'i' } },
                    { content: { $regex: filters.query, $options: 'i' } },
                    { summary: { $regex: filters.query, $options: 'i' } }
                ];
            }

            // Category filter
            if (filters.category && filters.category !== 'All Categories') {
                query.category = filters.category;
            }

            // Author filter
            if (filters.author) {
                query.$or = query.$or || [];
                query.$or.push(
                    { author: { $regex: filters.author, $options: 'i' } },
                    { 'author_id': filters.author }
                );
            }

            // Date range filter
            if (filters.dateFrom) {
                query.published_date = { $gte: new Date(filters.dateFrom) };
                if (filters.dateTo) {
                    query.published_date.$lte = new Date(filters.dateTo);
                }
            }

            // Views filter
            if (filters.minViews > 0) {
                query.views = { $gte: filters.minViews };
            }

            // Sort options
            let sort = { published_date: -1 }; // Default: newest first
            switch (filters.sortBy) {
                case 'date_asc':
                    sort = { published_date: 1 };
                    break;
                case 'views_desc':
                    sort = { views: -1 };
                    break;
                case 'reactions_desc':
                    sort = { 'reactions.like': -1, 'reactions.love': -1, 'reactions.fire': -1 };
                    break;
                case 'title_asc':
                    sort = { title: 1 };
                    break;
                case 'title_desc':
                    sort = { title: -1 };
                    break;
            }

            const results = await this.db.collection('news_articles')
                .find(query)
                .sort(sort)
                .limit(20)
                .toArray();

            this.userSearchSessions.delete(userId);
            await this.displaySearchResults(ctx, results, filters.query || 'Advanced Search', 'advanced', filters);
        } catch (error) {
            console.error('Advanced search execution error:', error);
            ctx.answerCbQuery('❌ Error executing search');
        }
    }

    /**
     * Display search results
     */
    async displaySearchResults(ctx, results, query, searchType, filters = null) {
        if (results.length === 0) {
            let message = `🔍 **No Results Found**\n\n`;
            message += `Query: "${query}"\n\n`;
            message += 'Try:\n';
            message += '• Different keywords\n';
            message += '• Broader search terms\n';
            message += '• Advanced search with filters\n';
            message += '• Check spelling';

            return ctx.reply(message, { parse_mode: 'Markdown' });
        }

        let message = `🔍 **Search Results (${results.length})**\n\n`;
        if (searchType === 'advanced' && filters) {
            message += `**Applied Filters:**\n`;
            if (filters.query) message += `📝 Query: "${filters.query}"\n`;
            if (filters.category) message += `🏷️ Category: ${filters.category}\n`;
            if (filters.author) message += `👤 Author: ${filters.author}\n`;
            if (filters.minViews > 0) message += `👁️ Min Views: ${filters.minViews}\n`;
            message += '\n';
        } else {
            message += `Query: "${query}"\n\n`;
        }

        const keyboard = [];
        results.forEach((article, index) => {
            message += `${index + 1}. **${article.title}**\n`;
            message += `   🏷️ ${article.category} | 👤 ${article.author}\n`;
            message += `   👁️ ${article.views || 0} views | 📅 ${new Date(article.published_date).toLocaleDateString()}\n`;
            message += `   📝 ${article.summary?.substring(0, 80)}...\n\n`;

            // Add view button for each article
            keyboard.push([
                Markup.button.callback(
                    `📖 Read "${article.title.substring(0, 25)}${article.title.length > 25 ? '...' : ''}"`,
                    `view_article:${article._id}`
                )
            ]);
        });

        // Add action buttons
        keyboard.push([
            Markup.button.callback('🔍 New Search', 'new_search'),
            Markup.button.callback('🔧 Advanced Search', 'advanced_search')
        ]);

        keyboard.push([
            Markup.button.callback('❌ Close', 'close_search')
        ]);

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
    }

    /**
     * Handle category selection for search
     */
    async handleCategorySelection(ctx, category) {
        const userId = ctx.from.id;
        const session = this.userSearchSessions.get(userId);
        
        if (!session) {
            return ctx.answerCbQuery('Search session expired.');
        }

        session.filters.category = category === 'All Categories' ? '' : category;
        session.step = 'main_menu';
        
        await ctx.answerCbQuery('Category filter updated!');
        await this.showAdvancedSearchMenu(ctx);
    }

    /**
     * Handle date range selection
     */
    async handleDateSelection(ctx, dateRange) {
        const userId = ctx.from.id;
        const session = this.userSearchSessions.get(userId);
        
        if (!session) {
            return ctx.answerCbQuery('Search session expired.');
        }

        const now = new Date();
        let fromDate, toDate;

        switch (dateRange) {
            case 'today':
                fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                break;
            case 'yesterday':
                fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                toDate = now;
                break;
            case 'month':
                fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
                toDate = now;
                break;
            case '3months':
                fromDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                toDate = now;
                break;
            case 'year':
                fromDate = new Date(now.getFullYear(), 0, 1);
                toDate = now;
                break;
            case 'all':
                fromDate = null;
                toDate = null;
                break;
        }

        session.filters.dateFrom = fromDate;
        session.filters.dateTo = toDate;
        session.step = 'main_menu';

        await ctx.answerCbQuery('Date filter updated!');
        await this.showAdvancedSearchMenu(ctx);
    }

    /**
     * Handle sort selection
     */
    async handleSortSelection(ctx, sortType) {
        const userId = ctx.from.id;
        const session = this.userSearchSessions.get(userId);
        
        if (!session) {
            return ctx.answerCbQuery('Search session expired.');
        }

        session.filters.sortBy = sortType;
        session.step = 'main_menu';

        await ctx.answerCbQuery('Sort order updated!');
        await this.showAdvancedSearchMenu(ctx);
    }

    /**
     * Get user's search session
     */
    getUserSearchSession(userId) {
        return this.userSearchSessions.get(userId);
    }

    /**
     * Clear user search session
     */
    clearSearchSession(userId) {
        this.userSearchSessions.delete(userId);
    }
}

module.exports = ArticleSearch;