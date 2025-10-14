/**
 * Search Handler - Handle search and discovery callbacks
 */

class SearchHandler {
    constructor(bot, db, articleSearch) {
        this.bot = bot;
        this.db = db;
        this.articleSearch = articleSearch;
    }

    /**
     * Handle search-related callbacks
     */
    async handleSearchCallback(ctx, action) {
        try {
            switch (action) {
                case 'cmd_search':
                    await ctx.answerCbQuery();
                    await ctx.reply(
                        '🔍 **Search Articles**\n\n' +
                        '**Quick Search Options:**\n\n' +
                        '🔍 **Simple Search:** Type `/search your keywords`\n' +
                        '🔧 **Advanced Search:** Use filters and options\n' +
                        '📊 **Trending:** Popular articles\n\n' +
                        'Choose your preferred search method:',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '🔧 Advanced Search', callback_data: 'advanced_search' },
                                        { text: '📊 Trending', callback_data: 'cmd_trending' }
                                    ],
                                    [{ text: '💡 Search Examples', callback_data: 'search_help' }],
                                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                                ]
                            }
                        }
                    );
                    break;

                case 'cmd_trending':
                    await ctx.answerCbQuery();
                    await this.handleTrendingCallback(ctx);
                    break;

                case 'search_help':
                    await ctx.answerCbQuery();
                    await ctx.reply(
                        '💡 **Search Examples**\n\n' +
                        '**Simple Search:**\n' +
                        '• `/search breaking news`\n' +
                        '• `/search technology Adelaide`\n' +
                        '• `/search local business`\n\n' +
                        '**Advanced Search Tips:**\n' +
                        '• Use `/find` for filters\n' +
                        '• Filter by category, date, author\n' +
                        '• Sort by views or date\n' +
                        '• Set minimum engagement\n\n' +
                        '**Trending:**\n' +
                        '• `/trending` for popular articles\n' +
                        '• Sorted by views and reactions',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔧 Try Advanced Search', callback_data: 'advanced_search' }],
                                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                                ]
                            }
                        }
                    );
                    break;

                case 'advanced_search':
                    await ctx.answerCbQuery();
                    if (this.articleSearch) {
                        await this.articleSearch.startAdvancedSearch(ctx);
                    } else {
                        await ctx.reply('🔧 Advanced search is currently unavailable. Please try again later.');
                    }
                    break;

                default:
                    await ctx.answerCbQuery('Feature coming soon!');
            }
        } catch (error) {
            console.error('Search callback error:', error);
            await ctx.answerCbQuery('❌ Error processing search request');
        }
    }

    /**
     * Handle trending callback
     */
    async handleTrendingCallback(ctx) {
        try {
            const trendingArticles = await this.db.collection('news_articles')
                .find({ status: 'published' })
                .sort({ views: -1 })
                .limit(10)
                .toArray();

            if (trendingArticles.length === 0) {
                return ctx.reply(
                    '📊 **Trending Articles**\n\n' +
                    'No published articles found yet.\n' +
                    'Be the first to create and publish content!',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✍️ Create Article', callback_data: 'cmd_newarticle' }],
                                [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                            ]
                        }
                    }
                );
            }

            let message = `📊 **Trending Articles (${trendingArticles.length})**\n\n`;
            const keyboard = [];

            trendingArticles.forEach((article, index) => {
                const totalReactions = (article.reactions?.like || 0) + 
                                     (article.reactions?.love || 0) + 
                                     (article.reactions?.fire || 0);
                
                message += `${index + 1}. **${article.title}**\n`;
                message += `   👁️ ${article.views || 0} views | ❤️ ${totalReactions} reactions\n`;
                message += `   🏷️ ${article.category} | 📅 ${new Date(article.published_date).toLocaleDateString()}\n\n`;

                keyboard.push([{
                    text: `📖 Read "${article.title.substring(0, 25)}${article.title.length > 25 ? '...' : ''}"`,
                    callback_data: `view_article:${article._id}`
                }]);
            });

            keyboard.push([
                { text: '🔍 Search Articles', callback_data: 'cmd_search' },
                { text: '🔙 Back', callback_data: 'back_to_start' }
            ]);

            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error('Trending callback error:', error);
            await ctx.reply('❌ Error fetching trending articles. Please try again.');
        }
    }
}

module.exports = SearchHandler;