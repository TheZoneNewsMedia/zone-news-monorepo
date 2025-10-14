/**
 * Public Commands Module
 * Comprehensive public user functionality with full feature set
 * Production-ready implementation with error handling and user experience optimizations
 */

const { ObjectId } = require('mongodb');

class PublicCommands {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.supportedCategories = [
            'breaking', 'politics', 'business', 'sports', 'entertainment', 
            'technology', 'health', 'weather', 'traffic', 'local', 'international'
        ];
        this.supportedReactions = ['👍', '❤️', '🔥'];
        this.itemsPerPage = 5;
        this.maxSearchResults = 20;
    }
    
    register() {
        // Core user commands
        this.bot.command('help', this.handleHelp.bind(this));
        this.bot.command('news', this.handleNews.bind(this));
        this.bot.command('subscribe', this.handleSubscribe.bind(this));
        this.bot.command('unsubscribe', this.handleUnsubscribe.bind(this));
        this.bot.command('mystats', this.handleMyStats.bind(this));
        this.bot.command('settings', this.handleSettings.bind(this));
        this.bot.command('about', this.handleAbout.bind(this));
        this.bot.command('categories', this.handleCategories.bind(this));
        this.bot.command('search', this.handleSearch.bind(this));
        this.bot.command('trending', this.handleTrending.bind(this));
        this.bot.command('saved', this.handleSaved.bind(this));
        this.bot.command('share', this.handleShare.bind(this));
        this.bot.command('feedback', this.handleFeedback.bind(this));
        this.bot.command('report', this.handleReport.bind(this));
        
        // Register callback handlers
        this.registerCallbacks();
    }
    
    /**
     * Update user's last activity and ensure user exists
     */
    async updateUserActivity(ctx) {
        try {
            const userId = ctx.from.id;
            const userData = {
                user_id: userId,
                username: ctx.from.username || null,
                first_name: ctx.from.first_name || '',
                last_name: ctx.from.last_name || '',
                language_code: ctx.from.language_code || 'en',
                last_active: new Date(),
                updated_at: new Date()
            };
            
            await this.db.collection('users').updateOne(
                { user_id: userId },
                { 
                    $set: userData,
                    $setOnInsert: {
                        created_at: new Date(),
                        subscription_categories: [],
                        saved_articles: [],
                        preferences: {
                            notifications: true,
                            timezone: 'Australia/Adelaide',
                            language: 'en'
                        },
                        stats: {
                            articles_read: 0,
                            reactions_given: 0,
                            searches_performed: 0,
                            commands_used: 0
                        }
                    }
                },
                { upsert: true }
            );
            
            return await this.db.collection('users').findOne({ user_id: userId });
        } catch (error) {
            console.error('Failed to update user activity:', error);
            return null;
        }
    }
    
    /**
     * Log command usage for analytics
     */
    async logCommand(ctx, command, metadata = {}) {
        try {
            await this.db.collection('command_usage').insertOne({
                user_id: ctx.from.id,
                username: ctx.from.username,
                command: command,
                chat_id: ctx.chat.id,
                chat_type: ctx.chat.type,
                metadata: metadata,
                timestamp: new Date()
            });
            
            // Update user stats
            await this.db.collection('users').updateOne(
                { user_id: ctx.from.id },
                { $inc: { 'stats.commands_used': 1 } }
            );
        } catch (error) {
            console.error('Failed to log command:', error);
        }
    }
    
    /**
     * /help - Comprehensive categorized help system
     */
    async handleHelp(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'help');
            
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                // Main help menu
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📰 News Commands', callback_data: 'help:news' },
                            { text: '⚙️ Settings', callback_data: 'help:settings' }
                        ],
                        [
                            { text: '🔍 Search & Discovery', callback_data: 'help:search' },
                            { text: '💾 Saved & Bookmarks', callback_data: 'help:saved' }
                        ],
                        [
                            { text: '📊 Stats & Analytics', callback_data: 'help:stats' },
                            { text: '🤝 Community Features', callback_data: 'help:community' }
                        ],
                        [
                            { text: '🆘 Support & Feedback', callback_data: 'help:support' },
                            { text: '💡 Quick Start', callback_data: 'help:quickstart' }
                        ]
                    ]
                };
                
                await ctx.reply(
                    `🤖 *Adelaide Zone News Bot*\n\n` +
                    `Welcome! I'm your personal news assistant for Adelaide and surrounding areas.\n\n` +
                    `*Quick Commands:*\n` +
                    `• /news - Latest news\n` +
                    `• /trending - Popular articles\n` +
                    `• /categories - Browse by topic\n` +
                    `• /search - Find specific news\n\n` +
                    `Select a category below for detailed help:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    }
                );
            } else {
                // Specific help topic
                const topic = args[0].toLowerCase();
                await this.showSpecificHelp(ctx, topic);
            }
        } catch (error) {
            console.error('Help command error:', error);
            await ctx.reply('❌ Sorry, there was an error showing help. Please try again later.');
        }
    }
    
    /**
     * /news - News listing with pagination and filtering
     */
    async handleNews(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'news');
            
            const args = ctx.message.text.split(' ').slice(1);
            let category = null;
            let page = 1;
            
            // Parse arguments
            for (const arg of args) {
                if (this.supportedCategories.includes(arg.toLowerCase())) {
                    category = arg.toLowerCase();
                } else if (!isNaN(parseInt(arg))) {
                    page = Math.max(1, parseInt(arg));
                }
            }
            
            const filter = category ? { category: category } : {};
            const skip = (page - 1) * this.itemsPerPage;
            
            const [articles, totalCount] = await Promise.all([
                this.db.collection('news_articles')
                    .find(filter)
                    .sort({ published_date: -1 })
                    .skip(skip)
                    .limit(this.itemsPerPage)
                    .toArray(),
                this.db.collection('news_articles').countDocuments(filter)
            ]);
            
            if (articles.length === 0) {
                const emptyMessage = category 
                    ? `📭 No ${category} news available right now.`
                    : `📭 No news available right now.`;
                
                return ctx.reply(
                    emptyMessage + '\n\n' +
                    'Try:\n' +
                    '• /categories - Browse all categories\n' +
                    '• /search - Search for specific topics'
                );
            }
            
            const totalPages = Math.ceil(totalCount / this.itemsPerPage);
            const categoryText = category ? ` - ${category.toUpperCase()}` : '';
            
            let newsMessage = `📰 *Adelaide Zone News${categoryText}*\n\n`;
            newsMessage += `📄 Page ${page} of ${totalPages} (${totalCount} articles)\n\n`;
            
            for (let i = 0; i < articles.length; i++) {
                const article = articles[i];
                const reactions = this.formatReactionCount(article.total_reactions);
                const timeAgo = this.getTimeAgo(article.published_date);
                
                newsMessage += `*${i + 1}. ${this.truncate(article.title, 60)}*\n`;
                newsMessage += `📅 ${timeAgo}`;
                if (article.category) {
                    newsMessage += ` • 🏷️ ${article.category}`;
                }
                if (reactions) {
                    newsMessage += ` • ${reactions}`;
                }
                newsMessage += `\n\n`;
            }
            
            // Create pagination keyboard
            const keyboard = this.createNewsKeyboard(page, totalPages, category, articles);
            
            await ctx.reply(newsMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
            
        } catch (error) {
            console.error('News command error:', error);
            await ctx.reply('❌ Sorry, there was an error fetching news. Please try again later.');
        }
    }
    
    /**
     * /subscribe - Category subscription management
     */
    async handleSubscribe(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'subscribe');
            
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                // Show subscription management interface
                const user = await this.db.collection('users').findOne({ user_id: ctx.from.id });
                const subscribedCategories = user?.subscription_categories || [];
                
                const keyboard = {
                    inline_keyboard: this.supportedCategories.map(cat => {
                        const isSubscribed = subscribedCategories.includes(cat);
                        return [{
                            text: `${isSubscribed ? '✅' : '⬜'} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
                            callback_data: `subscribe:toggle:${cat}`
                        }];
                    })
                };
                
                keyboard.inline_keyboard.push([
                    { text: '✅ Subscribe All', callback_data: 'subscribe:all' },
                    { text: '❌ Unsubscribe All', callback_data: 'subscribe:none' }
                ]);
                
                await ctx.reply(
                    `📬 *Subscription Management*\n\n` +
                    `Currently subscribed to: ${subscribedCategories.length} categories\n\n` +
                    `Toggle categories to customize your news feed:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    }
                );
            } else {
                // Subscribe to specific categories
                const categoriesToAdd = args.filter(cat => 
                    this.supportedCategories.includes(cat.toLowerCase())
                ).map(cat => cat.toLowerCase());
                
                if (categoriesToAdd.length === 0) {
                    return ctx.reply(
                        '❌ Invalid category. Available categories:\n\n' +
                        this.supportedCategories.join(', ')
                    );
                }
                
                await this.db.collection('users').updateOne(
                    { user_id: ctx.from.id },
                    { $addToSet: { subscription_categories: { $each: categoriesToAdd } } }
                );
                
                await ctx.reply(
                    `✅ Successfully subscribed to: ${categoriesToAdd.join(', ')}\n\n` +
                    'Use /news to see your personalized feed!'
                );
            }
        } catch (error) {
            console.error('Subscribe command error:', error);
            await ctx.reply('❌ Sorry, there was an error managing subscriptions. Please try again later.');
        }
    }
    
    /**
     * /unsubscribe - Remove category subscriptions
     */
    async handleUnsubscribe(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'unsubscribe');
            
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                return ctx.reply(
                    '📬 *Unsubscribe from Categories*\n\n' +
                    'Usage: `/unsubscribe category1 category2`\n\n' +
                    'Or use /subscribe to manage all subscriptions',
                    { parse_mode: 'Markdown' }
                );
            }
            
            const categoriesToRemove = args.filter(cat => 
                this.supportedCategories.includes(cat.toLowerCase())
            ).map(cat => cat.toLowerCase());
            
            if (categoriesToRemove.length === 0) {
                return ctx.reply(
                    '❌ Invalid category. Available categories:\n\n' +
                    this.supportedCategories.join(', ')
                );
            }
            
            await this.db.collection('users').updateOne(
                { user_id: ctx.from.id },
                { $pull: { subscription_categories: { $in: categoriesToRemove } } }
            );
            
            await ctx.reply(
                `✅ Successfully unsubscribed from: ${categoriesToRemove.join(', ')}`
            );
            
        } catch (error) {
            console.error('Unsubscribe command error:', error);
            await ctx.reply('❌ Sorry, there was an error managing subscriptions. Please try again later.');
        }
    }
    
    /**
     * /mystats - User activity statistics
     */
    async handleMyStats(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'mystats');
            
            const user = await this.db.collection('users').findOne({ user_id: ctx.from.id });
            if (!user) {
                return ctx.reply('❌ User profile not found. Try using a command first!');
            }
            
            const [
                totalReactions,
                savedCount,
                recentActivity,
                favoriteCategories,
                searchCount
            ] = await Promise.all([
                this.db.collection('user_reactions').countDocuments({ user_id: ctx.from.id }),
                this.db.collection('users').findOne(
                    { user_id: ctx.from.id },
                    { projection: { saved_articles: 1 } }
                ),
                this.db.collection('command_usage')
                    .find({ user_id: ctx.from.id })
                    .sort({ timestamp: -1 })
                    .limit(10)
                    .toArray(),
                this.db.collection('user_reactions')
                    .aggregate([
                        { $match: { user_id: ctx.from.id } },
                        { $lookup: {
                            from: 'news_articles',
                            localField: 'article_id',
                            foreignField: '_id',
                            as: 'article'
                        }},
                        { $unwind: '$article' },
                        { $group: {
                            _id: '$article.category',
                            count: { $sum: 1 }
                        }},
                        { $sort: { count: -1 } },
                        { $limit: 3 }
                    ])
                    .toArray(),
                this.db.collection('command_usage').countDocuments({ 
                    user_id: ctx.from.id, 
                    command: 'search' 
                })
            ]);
            
            const joinDate = user.created_at ? this.formatDate(user.created_at) : 'Unknown';
            const lastActive = this.getTimeAgo(user.last_active);
            const subscriptions = user.subscription_categories?.length || 0;
            const savedArticles = savedCount?.saved_articles?.length || 0;
            const stats = user.stats || {};
            
            let statsMessage = `📊 *Your Adelaide Zone News Stats*\n\n`;
            statsMessage += `👤 *Profile:*\n`;
            statsMessage += `• Joined: ${joinDate}\n`;
            statsMessage += `• Last Active: ${lastActive}\n`;
            statsMessage += `• Subscriptions: ${subscriptions} categories\n\n`;
            
            statsMessage += `📈 *Activity:*\n`;
            statsMessage += `• Articles Read: ${stats.articles_read || 0}\n`;
            statsMessage += `• Reactions Given: ${totalReactions}\n`;
            statsMessage += `• Saved Articles: ${savedArticles}\n`;
            statsMessage += `• Searches: ${searchCount}\n`;
            statsMessage += `• Commands Used: ${stats.commands_used || 0}\n\n`;
            
            if (favoriteCategories.length > 0) {
                statsMessage += `🏷️ *Favorite Categories:*\n`;
                favoriteCategories.forEach((cat, i) => {
                    statsMessage += `${i + 1}. ${cat._id} (${cat.count} reactions)\n`;
                });
                statsMessage += '\n';
            }
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 Detailed Stats', callback_data: 'mystats:detailed' },
                        { text: '📈 Activity Graph', callback_data: 'mystats:graph' }
                    ],
                    [
                        { text: '⚙️ Privacy Settings', callback_data: 'mystats:privacy' },
                        { text: '🔄 Refresh', callback_data: 'mystats:refresh' }
                    ]
                ]
            };
            
            await ctx.reply(statsMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('MyStats command error:', error);
            await ctx.reply('❌ Sorry, there was an error retrieving your stats. Please try again later.');
        }
    }
    
    /**
     * /settings - User preferences and configuration
     */
    async handleSettings(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'settings');
            
            const user = await this.db.collection('users').findOne({ user_id: ctx.from.id });
            const preferences = user?.preferences || {};
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: `🔔 Notifications: ${preferences.notifications ? 'ON' : 'OFF'}`, callback_data: 'settings:notifications' },
                        { text: `🌐 Language: ${(preferences.language || 'EN').toUpperCase()}`, callback_data: 'settings:language' }
                    ],
                    [
                        { text: `⏰ Timezone: ${preferences.timezone || 'Australia/Adelaide'}`, callback_data: 'settings:timezone' },
                        { text: '📱 Display: Compact', callback_data: 'settings:display' }
                    ],
                    [
                        { text: '📬 Manage Subscriptions', callback_data: 'settings:subscriptions' },
                        { text: '🔒 Privacy Options', callback_data: 'settings:privacy' }
                    ],
                    [
                        { text: '📥 Export Data', callback_data: 'settings:export' },
                        { text: '🗑️ Delete Account', callback_data: 'settings:delete' }
                    ],
                    [
                        { text: '🔄 Reset to Defaults', callback_data: 'settings:reset' }
                    ]
                ]
            };
            
            await ctx.reply(
                `⚙️ *Settings & Preferences*\n\n` +
                `Customize your Adelaide Zone News experience:\n\n` +
                `*Current Settings:*\n` +
                `• Notifications: ${preferences.notifications ? '✅ Enabled' : '❌ Disabled'}\n` +
                `• Language: ${preferences.language || 'English'}\n` +
                `• Timezone: ${preferences.timezone || 'Australia/Adelaide'}\n` +
                `• Subscriptions: ${user?.subscription_categories?.length || 0} categories`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
            
        } catch (error) {
            console.error('Settings command error:', error);
            await ctx.reply('❌ Sorry, there was an error loading settings. Please try again later.');
        }
    }
    
    /**
     * /about - Bot information and features
     */
    async handleAbout(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'about');
            
            const [userCount, articleCount, totalReactions] = await Promise.all([
                this.db.collection('users').countDocuments(),
                this.db.collection('news_articles').countDocuments(),
                this.db.collection('user_reactions').countDocuments()
            ]);
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📰 Latest News', callback_data: 'about:news' },
                        { text: '🔍 Search News', callback_data: 'about:search' }
                    ],
                    [
                        { text: '📊 Bot Statistics', callback_data: 'about:stats' },
                        { text: '💡 Feature Guide', callback_data: 'about:features' }
                    ],
                    [
                        { text: '🤝 Support', callback_data: 'about:support' },
                        { text: '📝 Privacy Policy', callback_data: 'about:privacy' }
                    ]
                ]
            };
            
            await ctx.reply(
                `🤖 *Adelaide Zone News Bot*\n\n` +
                `Your personal news assistant for Adelaide and surrounding areas.\n\n` +
                `*🌟 Key Features:*\n` +
                `• Real-time Adelaide news updates\n` +
                `• Category-based news filtering\n` +
                `• Advanced search capabilities\n` +
                `• Trending articles discovery\n` +
                `• Personal article bookmarking\n` +
                `• Interactive reactions and sharing\n` +
                `• Customizable notifications\n` +
                `• Detailed reading statistics\n\n` +
                `*📊 Community Stats:*\n` +
                `• Active Users: ${userCount.toLocaleString()}\n` +
                `• News Articles: ${articleCount.toLocaleString()}\n` +
                `• Total Reactions: ${totalReactions.toLocaleString()}\n\n` +
                `*📱 Getting Started:*\n` +
                `• Type /help for detailed commands\n` +
                `• Use /news to browse latest articles\n` +
                `• Try /subscribe to customize your feed\n\n` +
                `Built with ❤️ for the Adelaide community`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
            
        } catch (error) {
            console.error('About command error:', error);
            await ctx.reply('❌ Sorry, there was an error loading information. Please try again later.');
        }
    }
    
    /**
     * /categories - Browse news categories
     */
    async handleCategories(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'categories');
            
            // Get article counts per category
            const categoryCounts = await this.db.collection('news_articles')
                .aggregate([
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ])
                .toArray();
            
            const user = await this.db.collection('users').findOne({ user_id: ctx.from.id });
            const subscribedCategories = user?.subscription_categories || [];
            
            let categoriesMessage = `🏷️ *News Categories*\n\n`;
            categoriesMessage += `Browse news by category. Tap to view articles:\n\n`;
            
            const keyboard = { inline_keyboard: [] };
            
            // Create category buttons in rows of 2
            for (let i = 0; i < this.supportedCategories.length; i += 2) {
                const row = [];
                
                for (let j = 0; j < 2 && i + j < this.supportedCategories.length; j++) {
                    const category = this.supportedCategories[i + j];
                    const categoryCount = categoryCounts.find(c => c._id === category)?.count || 0;
                    const isSubscribed = subscribedCategories.includes(category);
                    const emoji = this.getCategoryEmoji(category);
                    
                    categoriesMessage += `${emoji} *${category.charAt(0).toUpperCase() + category.slice(1)}*: ${categoryCount} articles ${isSubscribed ? '✅' : ''}\n`;
                    
                    row.push({
                        text: `${emoji} ${category.charAt(0).toUpperCase() + category.slice(1)} (${categoryCount})`,
                        callback_data: `categories:view:${category}`
                    });
                }
                
                keyboard.inline_keyboard.push(row);
            }
            
            // Add management buttons
            keyboard.inline_keyboard.push([
                { text: '📬 Manage Subscriptions', callback_data: 'categories:manage' },
                { text: '🔄 Refresh Counts', callback_data: 'categories:refresh' }
            ]);
            
            await ctx.reply(categoriesMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Categories command error:', error);
            await ctx.reply('❌ Sorry, there was an error loading categories. Please try again later.');
        }
    }
    
    /**
     * /search - Advanced article search
     */
    async handleSearch(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'search');
            
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📅 Recent Articles', callback_data: 'search:recent' },
                            { text: '🔥 Popular Today', callback_data: 'search:popular' }
                        ],
                        [
                            { text: '🏷️ By Category', callback_data: 'search:category' },
                            { text: '📰 By Source', callback_data: 'search:source' }
                        ],
                        [
                            { text: '📍 Location-based', callback_data: 'search:location' },
                            { text: '⏰ Time Range', callback_data: 'search:timerange' }
                        ]
                    ]
                };
                
                return ctx.reply(
                    `🔍 *Search Adelaide News*\n\n` +
                    `*Usage:*\n` +
                    `• \`/search keyword\` - Search for specific terms\n` +
                    `• \`/search "exact phrase"\` - Search exact phrase\n` +
                    `• \`/search keyword category:politics\` - Filter by category\n` +
                    `• \`/search keyword date:today\` - Recent articles only\n\n` +
                    `Or use the quick search options below:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    }
                );
            }
            
            // Parse search parameters
            const searchText = args.join(' ');
            const searchFilters = this.parseSearchFilters(searchText);
            
            // Build MongoDB query
            const query = {};
            
            if (searchFilters.text) {
                query.$text = { $search: searchFilters.text };
            }
            
            if (searchFilters.category) {
                query.category = searchFilters.category;
            }
            
            if (searchFilters.dateFilter) {
                query.published_date = searchFilters.dateFilter;
            }
            
            const articles = await this.db.collection('news_articles')
                .find(query)
                .sort(searchFilters.text ? { score: { $meta: 'textScore' } } : { published_date: -1 })
                .limit(this.maxSearchResults)
                .toArray();
            
            // Update search stats
            await this.db.collection('users').updateOne(
                { user_id: ctx.from.id },
                { $inc: { 'stats.searches_performed': 1 } }
            );
            
            if (articles.length === 0) {
                return ctx.reply(
                    `🔍 *No Results Found*\n\n` +
                    `No articles found for: "${searchText}"\n\n` +
                    `*Try:*\n` +
                    `• Different keywords\n` +
                    `• Broader search terms\n` +
                    `• Remove category filters\n` +
                    `• Check spelling\n\n` +
                    `Use /trending to see what's popular!`
                );
            }
            
            let searchMessage = `🔍 *Search Results*\n\n`;
            searchMessage += `Found ${articles.length} articles for: "${searchText}"\n\n`;
            
            articles.slice(0, 5).forEach((article, i) => {
                const reactions = this.formatReactionCount(article.total_reactions);
                const timeAgo = this.getTimeAgo(article.published_date);
                
                searchMessage += `*${i + 1}. ${this.truncate(article.title, 50)}*\n`;
                searchMessage += `📅 ${timeAgo}`;
                if (article.category) {
                    searchMessage += ` • 🏷️ ${article.category}`;
                }
                if (reactions) {
                    searchMessage += ` • ${reactions}`;
                }
                searchMessage += `\n\n`;
            });
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📖 Read Article', callback_data: `article:read:${articles[0]._id}` },
                        { text: '💾 Save Article', callback_data: `article:save:${articles[0]._id}` }
                    ],
                    [
                        { text: '🔍 Refine Search', callback_data: 'search:refine' },
                        { text: '📊 More Results', callback_data: `search:more:${encodeURIComponent(searchText)}` }
                    ]
                ]
            };
            
            if (articles.length > 5) {
                searchMessage += `\n... and ${articles.length - 5} more results`;
            }
            
            await ctx.reply(searchMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
            
        } catch (error) {
            console.error('Search command error:', error);
            await ctx.reply('❌ Sorry, there was an error performing the search. Please try again later.');
        }
    }
    
    /**
     * /trending - Popular and trending articles
     */
    async handleTrending(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'trending');
            
            const now = new Date();
            const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            const [dailyTrending, weeklyTrending, mostReacted] = await Promise.all([
                // Trending today
                this.db.collection('news_articles')
                    .find({ published_date: { $gte: last24Hours } })
                    .sort({ 
                        'total_reactions.like': -1,
                        'total_reactions.love': -1,
                        'total_reactions.fire': -1
                    })
                    .limit(5)
                    .toArray(),
                
                // Trending this week
                this.db.collection('news_articles')
                    .find({ published_date: { $gte: lastWeek } })
                    .sort({ 
                        'total_reactions.like': -1,
                        'total_reactions.love': -1,
                        'total_reactions.fire': -1
                    })
                    .limit(5)
                    .toArray(),
                
                // Most reacted articles
                this.db.collection('news_articles')
                    .aggregate([
                        {
                            $project: {
                                title: 1,
                                category: 1,
                                published_date: 1,
                                total_reactions: 1,
                                reaction_score: {
                                    $add: [
                                        { $ifNull: ['$total_reactions.like', 0] },
                                        { $multiply: [{ $ifNull: ['$total_reactions.love', 0] }, 2] },
                                        { $multiply: [{ $ifNull: ['$total_reactions.fire', 0] }, 3] }
                                    ]
                                }
                            }
                        },
                        { $sort: { reaction_score: -1 } },
                        { $limit: 5 }
                    ])
                    .toArray()
            ]);
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📅 Today', callback_data: 'trending:today' },
                        { text: '📆 This Week', callback_data: 'trending:week' }
                    ],
                    [
                        { text: '🔥 Most Reacted', callback_data: 'trending:reacted' },
                        { text: '👀 Most Read', callback_data: 'trending:read' }
                    ],
                    [
                        { text: '🏷️ By Category', callback_data: 'trending:category' },
                        { text: '🔄 Refresh', callback_data: 'trending:refresh' }
                    ]
                ]
            };
            
            let trendingMessage = `🔥 *Trending Adelaide News*\n\n`;
            
            if (dailyTrending.length > 0) {
                trendingMessage += `*📅 Trending Today:*\n`;
                dailyTrending.slice(0, 3).forEach((article, i) => {
                    const reactions = this.formatReactionCount(article.total_reactions);
                    trendingMessage += `${i + 1}. ${this.truncate(article.title, 45)}\n`;
                    if (reactions) {
                        trendingMessage += `   ${reactions}\n`;
                    }
                });
                trendingMessage += '\n';
            }
            
            if (weeklyTrending.length > 0) {
                trendingMessage += `*📆 Trending This Week:*\n`;
                weeklyTrending.slice(0, 3).forEach((article, i) => {
                    const reactions = this.formatReactionCount(article.total_reactions);
                    trendingMessage += `${i + 1}. ${this.truncate(article.title, 45)}\n`;
                    if (reactions) {
                        trendingMessage += `   ${reactions}\n`;
                    }
                });
                trendingMessage += '\n';
            }
            
            if (dailyTrending.length === 0 && weeklyTrending.length === 0) {
                trendingMessage += `📭 No trending articles at the moment.\n\n`;
                trendingMessage += `Check back later or try:\n`;
                trendingMessage += `• /news - Latest articles\n`;
                trendingMessage += `• /categories - Browse by topic`;
            }
            
            await ctx.reply(trendingMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            
        } catch (error) {
            console.error('Trending command error:', error);
            await ctx.reply('❌ Sorry, there was an error loading trending articles. Please try again later.');
        }
    }
    
    /**
     * /saved - Manage saved/bookmarked articles
     */
    async handleSaved(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'saved');
            
            const user = await this.db.collection('users').findOne({ user_id: ctx.from.id });
            const savedArticleIds = user?.saved_articles || [];
            
            if (savedArticleIds.length === 0) {
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📰 Browse News', callback_data: 'saved:browse' },
                            { text: '🔍 Search Articles', callback_data: 'saved:search' }
                        ],
                        [
                            { text: '🔥 Trending Now', callback_data: 'saved:trending' }
                        ]
                    ]
                };
                
                return ctx.reply(
                    `💾 *Saved Articles*\n\n` +
                    `You haven't saved any articles yet.\n\n` +
                    `*How to save articles:*\n` +
                    `• Use 💾 button on any article\n` +
                    `• Reply to article with "save"\n` +
                    `• Use /save command with article link\n\n` +
                    `Start exploring to build your reading list!`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    }
                );
            }
            
            // Get saved articles with details
            const savedArticles = await this.db.collection('news_articles')
                .find({ _id: { $in: savedArticleIds.map(id => new ObjectId(id)) } })
                .sort({ published_date: -1 })
                .limit(10)
                .toArray();
            
            let savedMessage = `💾 *Your Saved Articles*\n\n`;
            savedMessage += `📚 ${savedArticleIds.length} articles saved\n\n`;
            
            savedArticles.forEach((article, i) => {
                const timeAgo = this.getTimeAgo(article.published_date);
                const reactions = this.formatReactionCount(article.total_reactions);
                
                savedMessage += `*${i + 1}. ${this.truncate(article.title, 50)}*\n`;
                savedMessage += `📅 ${timeAgo}`;
                if (article.category) {
                    savedMessage += ` • 🏷️ ${article.category}`;
                }
                if (reactions) {
                    savedMessage += ` • ${reactions}`;
                }
                savedMessage += `\n\n`;
            });
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📖 Read Article', callback_data: `article:read:${savedArticles[0]?._id}` },
                        { text: '🗑️ Remove Saved', callback_data: `saved:remove:${savedArticles[0]?._id}` }
                    ],
                    [
                        { text: '📊 Sort by Date', callback_data: 'saved:sort:date' },
                        { text: '🏷️ Sort by Category', callback_data: 'saved:sort:category' }
                    ],
                    [
                        { text: '📤 Export List', callback_data: 'saved:export' },
                        { text: '🗑️ Clear All', callback_data: 'saved:clear' }
                    ]
                ]
            };
            
            if (savedArticleIds.length > 10) {
                savedMessage += `\n... and ${savedArticleIds.length - 10} more saved articles`;
                keyboard.inline_keyboard.push([
                    { text: '📋 Show All', callback_data: 'saved:all' }
                ]);
            }
            
            await ctx.reply(savedMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
            
        } catch (error) {
            console.error('Saved command error:', error);
            await ctx.reply('❌ Sorry, there was an error loading saved articles. Please try again later.');
        }
    }
    
    /**
     * /share - Share articles and generate links
     */
    async handleShare(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'share');
            
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📰 Latest News', callback_data: 'share:latest' },
                            { text: '🔥 Trending', callback_data: 'share:trending' }
                        ],
                        [
                            { text: '💾 My Saved', callback_data: 'share:saved' },
                            { text: '🏷️ By Category', callback_data: 'share:category' }
                        ],
                        [
                            { text: '🤖 Share Bot', callback_data: 'share:bot' }
                        ]
                    ]
                };
                
                return ctx.reply(
                    `📤 *Share Adelaide News*\n\n` +
                    `*Quick Sharing:*\n` +
                    `• Forward any article directly\n` +
                    `• Use 📤 button on articles\n` +
                    `• \`/share article_id\` - Share specific article\n\n` +
                    `*Share Options:*\n` +
                    `• Telegram channels/groups\n` +
                    `• Direct messages\n` +
                    `• External platforms\n\n` +
                    `Choose what to share:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    }
                );
            }
            
            // Handle specific article sharing
            const articleId = args[0];
            if (ObjectId.isValid(articleId)) {
                const article = await this.db.collection('news_articles')
                    .findOne({ _id: new ObjectId(articleId) });
                
                if (!article) {
                    return ctx.reply('❌ Article not found');
                }
                
                const shareText = this.generateShareText(article);
                
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📋 Copy Text', callback_data: `share:copy:${articleId}` },
                            { text: '📤 Forward', switch_inline_query: shareText }
                        ],
                        [
                            { text: '🔗 Generate Link', callback_data: `share:link:${articleId}` },
                            { text: '📱 QR Code', callback_data: `share:qr:${articleId}` }
                        ]
                    ]
                };
                
                await ctx.reply(
                    `📤 *Share Article*\n\n` +
                    `${shareText}\n\n` +
                    `Choose sharing method:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    }
                );
            } else {
                await ctx.reply('❌ Invalid article ID. Use /news to browse articles.');
            }
            
        } catch (error) {
            console.error('Share command error:', error);
            await ctx.reply('❌ Sorry, there was an error preparing the share. Please try again later.');
        }
    }
    
    /**
     * /feedback - User feedback system
     */
    async handleFeedback(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'feedback');
            
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '⭐ Rate Experience', callback_data: 'feedback:rate' },
                            { text: '🐛 Report Bug', callback_data: 'feedback:bug' }
                        ],
                        [
                            { text: '💡 Suggest Feature', callback_data: 'feedback:feature' },
                            { text: '📰 Content Feedback', callback_data: 'feedback:content' }
                        ],
                        [
                            { text: '❓ Ask Question', callback_data: 'feedback:question' },
                            { text: '📞 Contact Support', callback_data: 'feedback:support' }
                        ]
                    ]
                };
                
                return ctx.reply(
                    `📝 *Feedback & Support*\n\n` +
                    `Help us improve Adelaide Zone News Bot!\n\n` +
                    `*Quick Feedback:*\n` +
                    `• \`/feedback Your message here\`\n` +
                    `• Rate articles with reactions\n` +
                    `• Report issues immediately\n\n` +
                    `*What would you like to do?*`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    }
                );
            }
            
            const feedbackText = args.join(' ');
            
            // Store feedback in database
            await this.db.collection('user_feedback').insertOne({
                user_id: ctx.from.id,
                username: ctx.from.username,
                feedback: feedbackText,
                type: 'general',
                timestamp: new Date(),
                status: 'pending'
            });
            
            // Send confirmation
            await ctx.reply(
                `✅ *Feedback Received*\n\n` +
                `Thank you for your feedback! We've received your message:\n\n` +
                `"${this.truncate(feedbackText, 100)}"\n\n` +
                `Our team will review it and respond if needed. Your input helps make Adelaide Zone News better!`
            );
            
            // Notify admins (if configured)
            const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];
            for (const adminId of adminIds) {
                try {
                    await this.bot.telegram.sendMessage(adminId, 
                        `📝 New Feedback\n` +
                        `From: @${ctx.from.username || ctx.from.first_name} (${ctx.from.id})\n` +
                        `Message: ${feedbackText}`
                    );
                } catch (e) {
                    console.warn('Failed to notify admin about feedback:', {
                        adminId: adminId,
                        userId: ctx.from.id,
                        error: e.message
                    });
                }
            }
            
        } catch (error) {
            console.error('Feedback command error:', error);
            await ctx.reply('❌ Sorry, there was an error submitting your feedback. Please try again later.');
        }
    }
    
    /**
     * /report - Report issues with content or bot
     */
    async handleReport(ctx) {
        try {
            await this.updateUserActivity(ctx);
            await this.logCommand(ctx, 'report');
            
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📰 Inappropriate Content', callback_data: 'report:content' },
                            { text: '🐛 Technical Issue', callback_data: 'report:technical' }
                        ],
                        [
                            { text: '🚫 Spam/Abuse', callback_data: 'report:spam' },
                            { text: '📝 Incorrect Information', callback_data: 'report:incorrect' }
                        ],
                        [
                            { text: '⚡ Performance Issue', callback_data: 'report:performance' },
                            { text: '🔒 Privacy Concern', callback_data: 'report:privacy' }
                        ],
                        [
                            { text: '❓ Other Issue', callback_data: 'report:other' }
                        ]
                    ]
                };
                
                return ctx.reply(
                    `🚨 *Report an Issue*\n\n` +
                    `Help keep Adelaide Zone News safe and reliable.\n\n` +
                    `*Report Types:*\n` +
                    `• Content issues (inappropriate, incorrect)\n` +
                    `• Technical problems (bugs, crashes)\n` +
                    `• Spam or abusive behavior\n` +
                    `• Privacy concerns\n\n` +
                    `*Quick Report:*\n` +
                    `\`/report Your issue description\`\n\n` +
                    `Select issue type:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    }
                );
            }
            
            const reportText = args.join(' ');
            
            // Store report in database
            await this.db.collection('user_reports').insertOne({
                user_id: ctx.from.id,
                username: ctx.from.username,
                report: reportText,
                type: 'general',
                priority: 'normal',
                timestamp: new Date(),
                status: 'pending',
                chat_info: {
                    chat_id: ctx.chat.id,
                    chat_type: ctx.chat.type
                }
            });
            
            // Generate report ID
            const reportId = Date.now().toString(36).toUpperCase();
            
            await ctx.reply(
                `🚨 *Report Submitted*\n\n` +
                `Report ID: \`${reportId}\`\n\n` +
                `Your report has been submitted and will be reviewed by our moderation team.\n\n` +
                `Report: "${this.truncate(reportText, 100)}"\n\n` +
                `We take all reports seriously and will investigate promptly. Thank you for helping keep our community safe!`,
                { parse_mode: 'Markdown' }
            );
            
            // High priority notification to admins
            const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];
            for (const adminId of adminIds) {
                try {
                    await this.bot.telegram.sendMessage(adminId, 
                        `🚨 NEW REPORT [${reportId}]\n` +
                        `From: @${ctx.from.username || ctx.from.first_name} (${ctx.from.id})\n` +
                        `Report: ${reportText}\n\n` +
                        `Please review immediately.`
                    );
                } catch (e) {
                    console.error('Failed to notify admin about critical report:', {
                        reportId: reportId,
                        adminId: adminId,
                        userId: ctx.from.id,
                        error: e.message
                    });
                }
            }
            
        } catch (error) {
            console.error('Report command error:', error);
            await ctx.reply('❌ Sorry, there was an error submitting your report. Please try again later.');
        }
    }
    
    // ==================== CALLBACK HANDLERS ====================
    
    registerCallbacks() {
        // Help callbacks
        this.bot.action(/^help:/, async (ctx) => {
            const topic = ctx.callbackQuery.data.split(':')[1];
            await this.showSpecificHelp(ctx, topic);
            await ctx.answerCbQuery();
        });
        
        // News pagination callbacks
        this.bot.action(/^news:/, async (ctx) => {
            const parts = ctx.callbackQuery.data.split(':');
            const action = parts[1];
            
            try {
                if (action === 'page') {
                    const page = parseInt(parts[2]);
                    const category = parts[3] !== 'null' ? parts[3] : null;
                    await this.handleNewsPage(ctx, page, category);
                } else if (action === 'article') {
                    const articleId = parts[2];
                    await this.showArticle(ctx, articleId);
                }
                await ctx.answerCbQuery();
            } catch (error) {
                console.error('News callback error:', error);
                await ctx.answerCbQuery('❌ Error loading news');
            }
        });
        
        // Subscription callbacks
        this.bot.action(/^subscribe:/, async (ctx) => {
            const parts = ctx.callbackQuery.data.split(':');
            const action = parts[1];
            
            try {
                if (action === 'toggle') {
                    const category = parts[2];
                    await this.toggleSubscription(ctx, category);
                } else if (action === 'all') {
                    await this.subscribeToAll(ctx);
                } else if (action === 'none') {
                    await this.unsubscribeFromAll(ctx);
                }
                await ctx.answerCbQuery('✅ Subscription updated!');
            } catch (error) {
                console.error('Subscribe callback error:', error);
                await ctx.answerCbQuery('❌ Error updating subscription');
            }
        });
        
        // Settings callbacks
        this.bot.action(/^settings:/, async (ctx) => {
            const action = ctx.callbackQuery.data.split(':')[1];
            
            try {
                await this.handleSettingUpdate(ctx, action);
                await ctx.answerCbQuery('✅ Setting updated!');
            } catch (error) {
                console.error('Settings callback error:', error);
                await ctx.answerCbQuery('❌ Error updating setting');
            }
        });
        
        // Categories callbacks
        this.bot.action(/^categories:/, async (ctx) => {
            const parts = ctx.callbackQuery.data.split(':');
            const action = parts[1];
            
            try {
                if (action === 'view') {
                    const category = parts[2];
                    await this.showCategoryNews(ctx, category);
                } else if (action === 'manage') {
                    await this.handleSubscribe(ctx);
                    return;
                } else if (action === 'refresh') {
                    await this.handleCategories(ctx);
                    return;
                }
                await ctx.answerCbQuery();
            } catch (error) {
                console.error('Categories callback error:', error);
                await ctx.answerCbQuery('❌ Error loading category');
            }
        });
        
        // Article interaction callbacks
        this.bot.action(/^article:/, async (ctx) => {
            const parts = ctx.callbackQuery.data.split(':');
            const action = parts[1];
            const articleId = parts[2];
            
            try {
                if (action === 'read') {
                    await this.showArticle(ctx, articleId);
                } else if (action === 'save') {
                    await this.saveArticle(ctx, articleId);
                } else if (action === 'react') {
                    const reaction = parts[3];
                    await this.handleReaction(ctx, articleId, reaction);
                }
                await ctx.answerCbQuery();
            } catch (error) {
                console.error('Article callback error:', error);
                await ctx.answerCbQuery('❌ Error processing request');
            }
        });
        
        // Add more callback handlers for other features...
    }
    
    // ==================== HELPER METHODS ====================
    
    /**
     * Show specific help topics
     */
    async showSpecificHelp(ctx, topic) {
        const helpTopics = {
            news: `📰 *News Commands Help*\n\n` +
                  `*Basic Usage:*\n` +
                  `• \`/news\` - Latest news\n` +
                  `• \`/news politics\` - Filter by category\n` +
                  `• \`/news 2\` - Go to page 2\n` +
                  `• \`/news sports 3\` - Sports news, page 3\n\n` +
                  `*Navigation:*\n` +
                  `• Use ◀️ ▶️ buttons for pagination\n` +
                  `• Tap article titles to read\n` +
                  `• Use 💾 to save articles\n` +
                  `• React with 👍 ❤️ 🔥`,
            
            settings: `⚙️ *Settings Help*\n\n` +
                     `*Available Settings:*\n` +
                     `• Notifications (On/Off)\n` +
                     `• Language preference\n` +
                     `• Timezone selection\n` +
                     `• Display mode\n\n` +
                     `*Privacy Options:*\n` +
                     `• Data export\n` +
                     `• Account deletion\n` +
                     `• Activity visibility`,
            
            search: `🔍 *Search Help*\n\n` +
                    `*Search Types:*\n` +
                    `• \`/search keyword\` - Basic search\n` +
                    `• \`/search "exact phrase"\` - Exact match\n` +
                    `• \`/search term category:politics\` - With filter\n` +
                    `• \`/search Adelaide date:today\` - Recent only\n\n` +
                    `*Filters:*\n` +
                    `• category:name - Filter by category\n` +
                    `• date:today/week/month - Time filter\n` +
                    `• source:name - Specific source`,
            
            quickstart: `💡 *Quick Start Guide*\n\n` +
                        `*1. Get Started:*\n` +
                        `• /news - Browse latest news\n` +
                        `• /subscribe - Choose your interests\n\n` +
                        `*2. Explore:*\n` +
                        `• /categories - Browse topics\n` +
                        `• /trending - See what's popular\n` +
                        `• /search - Find specific news\n\n` +
                        `*3. Personalize:*\n` +
                        `• /settings - Customize experience\n` +
                        `• /saved - Manage bookmarks\n` +
                        `• /mystats - View your activity`
        };
        
        const helpText = helpTopics[topic] || `❓ Help topic "${topic}" not found.`;
        
        const keyboard = {
            inline_keyboard: [
                [{ text: '⬅️ Back to Help Menu', callback_data: 'help:main' }]
            ]
        };
        
        try {
            await ctx.editMessageText(helpText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            await ctx.reply(helpText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    }
    
    /**
     * Create news navigation keyboard
     */
    createNewsKeyboard(currentPage, totalPages, category, articles) {
        const keyboard = { inline_keyboard: [] };
        
        // Article interaction buttons
        if (articles.length > 0) {
            const articleRow = [];
            articleRow.push({ 
                text: '📖 Read Article', 
                callback_data: `article:read:${articles[0]._id}` 
            });
            articleRow.push({ 
                text: '💾 Save', 
                callback_data: `article:save:${articles[0]._id}` 
            });
            articleRow.push({ 
                text: '📤 Share', 
                callback_data: `article:share:${articles[0]._id}` 
            });
            keyboard.inline_keyboard.push(articleRow);
            
            // Reaction buttons
            const reactionRow = [];
            reactionRow.push({ 
                text: '👍', 
                callback_data: `article:react:${articles[0]._id}:like` 
            });
            reactionRow.push({ 
                text: '❤️', 
                callback_data: `article:react:${articles[0]._id}:love` 
            });
            reactionRow.push({ 
                text: '🔥', 
                callback_data: `article:react:${articles[0]._id}:fire` 
            });
            keyboard.inline_keyboard.push(reactionRow);
        }
        
        // Pagination buttons
        if (totalPages > 1) {
            const navRow = [];
            if (currentPage > 1) {
                navRow.push({
                    text: '◀️ Previous',
                    callback_data: `news:page:${currentPage - 1}:${category}`
                });
            }
            
            navRow.push({
                text: `${currentPage}/${totalPages}`,
                callback_data: 'news:pageinfo'
            });
            
            if (currentPage < totalPages) {
                navRow.push({
                    text: 'Next ▶️',
                    callback_data: `news:page:${currentPage + 1}:${category}`
                });
            }
            
            keyboard.inline_keyboard.push(navRow);
        }
        
        // Filter and options
        const optionsRow = [];
        optionsRow.push({ text: '🏷️ Categories', callback_data: 'categories:main' });
        optionsRow.push({ text: '🔍 Search', callback_data: 'search:main' });
        optionsRow.push({ text: '🔥 Trending', callback_data: 'trending:main' });
        keyboard.inline_keyboard.push(optionsRow);
        
        return keyboard;
    }
    
    /**
     * Handle news page navigation
     */
    async handleNewsPage(ctx, page, category) {
        const filter = category ? { category: category } : {};
        const skip = (page - 1) * this.itemsPerPage;
        
        const [articles, totalCount] = await Promise.all([
            this.db.collection('news_articles')
                .find(filter)
                .sort({ published_date: -1 })
                .skip(skip)
                .limit(this.itemsPerPage)
                .toArray(),
            this.db.collection('news_articles').countDocuments(filter)
        ]);
        
        if (articles.length === 0) {
            await ctx.answerCbQuery('No articles found');
            return;
        }
        
        const totalPages = Math.ceil(totalCount / this.itemsPerPage);
        const categoryText = category ? ` - ${category.toUpperCase()}` : '';
        
        let newsMessage = `📰 *Adelaide Zone News${categoryText}*\n\n`;
        newsMessage += `📄 Page ${page} of ${totalPages} (${totalCount} articles)\n\n`;
        
        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const reactions = this.formatReactionCount(article.total_reactions);
            const timeAgo = this.getTimeAgo(article.published_date);
            
            newsMessage += `*${i + 1}. ${this.truncate(article.title, 60)}*\n`;
            newsMessage += `📅 ${timeAgo}`;
            if (article.category) {
                newsMessage += ` • 🏷️ ${article.category}`;
            }
            if (reactions) {
                newsMessage += ` • ${reactions}`;
            }
            newsMessage += `\n\n`;
        }
        
        const keyboard = this.createNewsKeyboard(page, totalPages, category, articles);
        
        try {
            await ctx.editMessageText(newsMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
        } catch (error) {
            await ctx.reply(newsMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
        }
    }
    
    /**
     * Show full article details
     */
    async showArticle(ctx, articleId) {
        const article = await this.db.collection('news_articles')
            .findOne({ _id: new ObjectId(articleId) });
        
        if (!article) {
            await ctx.answerCbQuery('Article not found');
            return;
        }
        
        // Update reading stats
        await this.db.collection('users').updateOne(
            { user_id: ctx.from.id },
            { $inc: { 'stats.articles_read': 1 } }
        );
        
        const reactions = this.formatReactionCount(article.total_reactions);
        const timeAgo = this.getTimeAgo(article.published_date);
        
        let articleMessage = `📰 *${article.title}*\n\n`;
        
        if (article.summary) {
            articleMessage += `${article.summary}\n\n`;
        }
        
        articleMessage += `📅 Published: ${timeAgo}\n`;
        if (article.category) {
            articleMessage += `🏷️ Category: ${article.category}\n`;
        }
        if (article.source) {
            articleMessage += `📄 Source: ${article.source}\n`;
        }
        if (reactions) {
            articleMessage += `💬 Reactions: ${reactions}\n`;
        }
        
        if (article.url) {
            articleMessage += `\n🔗 [Read Full Article](${article.url})`;
        }
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '👍', callback_data: `article:react:${articleId}:like` },
                    { text: '❤️', callback_data: `article:react:${articleId}:love` },
                    { text: '🔥', callback_data: `article:react:${articleId}:fire` }
                ],
                [
                    { text: '💾 Save Article', callback_data: `article:save:${articleId}` },
                    { text: '📤 Share', callback_data: `article:share:${articleId}` }
                ],
                [
                    { text: '◀️ Back to News', callback_data: 'news:back' }
                ]
            ]
        };
        
        try {
            await ctx.editMessageText(articleMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: false
            });
        } catch (error) {
            await ctx.reply(articleMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: false
            });
        }
    }
    
    /**
     * Toggle category subscription
     */
    async toggleSubscription(ctx, category) {
        const user = await this.db.collection('users').findOne({ user_id: ctx.from.id });
        const subscribedCategories = user?.subscription_categories || [];
        
        if (subscribedCategories.includes(category)) {
            // Unsubscribe
            await this.db.collection('users').updateOne(
                { user_id: ctx.from.id },
                { $pull: { subscription_categories: category } }
            );
        } else {
            // Subscribe
            await this.db.collection('users').updateOne(
                { user_id: ctx.from.id },
                { $addToSet: { subscription_categories: category } }
            );
        }
        
        // Refresh subscription interface
        await this.handleSubscribe(ctx);
    }
    
    /**
     * Subscribe to all categories
     */
    async subscribeToAll(ctx) {
        await this.db.collection('users').updateOne(
            { user_id: ctx.from.id },
            { $set: { subscription_categories: [...this.supportedCategories] } }
        );
        
        await this.handleSubscribe(ctx);
    }
    
    /**
     * Unsubscribe from all categories
     */
    async unsubscribeFromAll(ctx) {
        await this.db.collection('users').updateOne(
            { user_id: ctx.from.id },
            { $set: { subscription_categories: [] } }
        );
        
        await this.handleSubscribe(ctx);
    }
    
    /**
     * Save article to user's saved list
     */
    async saveArticle(ctx, articleId) {
        await this.db.collection('users').updateOne(
            { user_id: ctx.from.id },
            { $addToSet: { saved_articles: articleId } }
        );
        
        await ctx.answerCbQuery('✅ Article saved!');
    }
    
    /**
     * Handle article reactions
     */
    async handleReaction(ctx, articleId, reaction) {
        // Check if user already reacted
        const existingReaction = await this.db.collection('user_reactions').findOne({
            user_id: ctx.from.id,
            article_id: new ObjectId(articleId)
        });
        
        if (existingReaction) {
            if (existingReaction.reaction === reaction) {
                // Remove reaction
                await this.db.collection('user_reactions').deleteOne({
                    user_id: ctx.from.id,
                    article_id: new ObjectId(articleId)
                });
                
                // Decrease count
                await this.db.collection('news_articles').updateOne(
                    { _id: new ObjectId(articleId) },
                    { $inc: { [`total_reactions.${reaction}`]: -1 } }
                );
                
                await ctx.answerCbQuery('Reaction removed');
            } else {
                // Change reaction
                await this.db.collection('user_reactions').updateOne(
                    {
                        user_id: ctx.from.id,
                        article_id: new ObjectId(articleId)
                    },
                    {
                        $set: { 
                            reaction: reaction,
                            updated_at: new Date()
                        }
                    }
                );
                
                // Update counts
                await this.db.collection('news_articles').updateOne(
                    { _id: new ObjectId(articleId) },
                    { 
                        $inc: { 
                            [`total_reactions.${existingReaction.reaction}`]: -1,
                            [`total_reactions.${reaction}`]: 1
                        } 
                    }
                );
                
                await ctx.answerCbQuery(`Changed to ${reaction === 'like' ? '👍' : reaction === 'love' ? '❤️' : '🔥'}`);
            }
        } else {
            // Add new reaction
            await this.db.collection('user_reactions').insertOne({
                user_id: ctx.from.id,
                username: ctx.from.username,
                article_id: new ObjectId(articleId),
                reaction: reaction,
                created_at: new Date()
            });
            
            // Increase count
            await this.db.collection('news_articles').updateOne(
                { _id: new ObjectId(articleId) },
                { $inc: { [`total_reactions.${reaction}`]: 1 } }
            );
            
            // Update user stats
            await this.db.collection('users').updateOne(
                { user_id: ctx.from.id },
                { $inc: { 'stats.reactions_given': 1 } }
            );
            
            const emoji = reaction === 'like' ? '👍' : reaction === 'love' ? '❤️' : '🔥';
            await ctx.answerCbQuery(`${emoji} Reaction added!`);
        }
    }
    
    /**
     * Handle settings updates
     */
    async handleSettingUpdate(ctx, setting) {
        const user = await this.db.collection('users').findOne({ user_id: ctx.from.id });
        const preferences = user?.preferences || {};
        
        switch (setting) {
            case 'notifications':
                const newNotificationState = !preferences.notifications;
                await this.db.collection('users').updateOne(
                    { user_id: ctx.from.id },
                    { $set: { 'preferences.notifications': newNotificationState } }
                );
                await ctx.editMessageReplyMarkup();
                await this.handleSettings(ctx);
                break;
                
            case 'language':
                // Show language selection
                const languages = [
                    { text: '🇺🇸 English', callback_data: 'settings:lang:en' },
                    { text: '🇦🇺 Australian English', callback_data: 'settings:lang:en-au' }
                ];
                
                const keyboard = { inline_keyboard: [languages] };
                await ctx.editMessageText(
                    '🌐 *Select Language*\n\nChoose your preferred language:',
                    { parse_mode: 'Markdown', reply_markup: keyboard }
                );
                break;
                
            default:
                await ctx.answerCbQuery('Setting not implemented yet');
        }
    }
    
    /**
     * Show category-specific news
     */
    async showCategoryNews(ctx, category) {
        const articles = await this.db.collection('news_articles')
            .find({ category: category })
            .sort({ published_date: -1 })
            .limit(this.itemsPerPage)
            .toArray();
        
        if (articles.length === 0) {
            await ctx.answerCbQuery(`No ${category} articles available`);
            return;
        }
        
        let categoryMessage = `🏷️ *${category.toUpperCase()} News*\n\n`;
        
        articles.forEach((article, i) => {
            const reactions = this.formatReactionCount(article.total_reactions);
            const timeAgo = this.getTimeAgo(article.published_date);
            
            categoryMessage += `*${i + 1}. ${this.truncate(article.title, 50)}*\n`;
            categoryMessage += `📅 ${timeAgo}`;
            if (reactions) {
                categoryMessage += ` • ${reactions}`;
            }
            categoryMessage += `\n\n`;
        });
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📖 Read First', callback_data: `article:read:${articles[0]._id}` },
                    { text: '💾 Save', callback_data: `article:save:${articles[0]._id}` }
                ],
                [
                    { text: '📰 All News', callback_data: 'news:all' },
                    { text: '⬅️ Categories', callback_data: 'categories:main' }
                ]
            ]
        };
        
        try {
            await ctx.editMessageText(categoryMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
        } catch (error) {
            await ctx.reply(categoryMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
        }
    }
    
    /**
     * Parse search filters from search text
     */
    parseSearchFilters(searchText) {
        const filters = {
            text: null,
            category: null,
            dateFilter: null
        };
        
        let cleanText = searchText;
        
        // Extract category filter
        const categoryMatch = searchText.match(/category:(\w+)/i);
        if (categoryMatch) {
            filters.category = categoryMatch[1].toLowerCase();
            cleanText = cleanText.replace(/category:\w+/i, '').trim();
        }
        
        // Extract date filter
        const dateMatch = searchText.match(/date:(today|week|month)/i);
        if (dateMatch) {
            const dateType = dateMatch[1].toLowerCase();
            const now = new Date();
            
            switch (dateType) {
                case 'today':
                    filters.dateFilter = { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
                    break;
                case 'week':
                    filters.dateFilter = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
                    break;
                case 'month':
                    filters.dateFilter = { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
                    break;
            }
            cleanText = cleanText.replace(/date:(today|week|month)/i, '').trim();
        }
        
        if (cleanText) {
            filters.text = cleanText;
        }
        
        return filters;
    }
    
    /**
     * Generate share text for articles
     */
    generateShareText(article) {
        const timeAgo = this.getTimeAgo(article.published_date);
        
        let shareText = `📰 *${article.title}*\n\n`;
        
        if (article.summary) {
            shareText += `${this.truncate(article.summary, 150)}\n\n`;
        }
        
        shareText += `📅 ${timeAgo}`;
        if (article.category) {
            shareText += ` • 🏷️ ${article.category}`;
        }
        
        shareText += `\n\n🤖 Shared via Adelaide Zone News Bot`;
        
        return shareText;
    }
    
    /**
     * Get category emoji
     */
    getCategoryEmoji(category) {
        const emojis = {
            breaking: '🚨',
            politics: '🏛️',
            business: '💼',
            sports: '⚽',
            entertainment: '🎬',
            technology: '💻',
            health: '🏥',
            weather: '🌤️',
            traffic: '🚗',
            local: '🏘️',
            international: '🌍'
        };
        
        return emojis[category] || '📰';
    }
    
    /**
     * Format reaction counts for display
     */
    formatReactionCount(reactions) {
        if (!reactions) return '';
        
        const counts = [];
        if (reactions.like > 0) counts.push(`👍 ${reactions.like}`);
        if (reactions.love > 0) counts.push(`❤️ ${reactions.love}`);
        if (reactions.fire > 0) counts.push(`🔥 ${reactions.fire}`);
        
        return counts.join(' ');
    }
    
    /**
     * Get time ago string
     */
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return new Date(date).toLocaleDateString('en-AU');
        }
    }
    
    /**
     * Format date for display
     */
    formatDate(date) {
        return new Date(date).toLocaleDateString('en-AU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    /**
     * Truncate text to specified length
     */
    truncate(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
}

module.exports = PublicCommands;