/**
 * User Commands Module
 * Handles user-specific commands: mystats, settings, saved, share
 * 
 * @module UserCommands
 */

const { Markup } = require('telegraf');
const CommandUtils = require('../utils/command-utils');

class UserCommands {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
    }

    /**
     * Register all user commands with the bot
     */
    register() {
        // Register main user commands
        this.bot.command('mystats', this.mystats.bind(this));
        this.bot.command('settings', (ctx) => this.settings(ctx));
        this.bot.command('saved', (ctx) => this.saved(ctx));
        this.bot.command('share', (ctx) => this.share(ctx));
        
        // Register callback queries for interactive features
        this.bot.action(/^stats:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action.startsWith('weekly:')) {
                const userId = action.split(':')[1];
                return this.showWeeklyStats(ctx, userId);
            } else if (action.startsWith('achievements:')) {
                const userId = action.split(':')[1];
                return this.showAchievements(ctx, userId);
            } else if (action.startsWith('detailed:')) {
                const userId = action.split(':')[1];
                return this.showDetailedStats(ctx, userId);
            }
        });
        
        this.bot.action(/^settings:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action === 'main') {
                return this.settings(ctx);
            } else if (action === 'notifications') {
                return this.settings(ctx, 'notifications');
            } else if (action === 'city') {
                return this.settings(ctx, 'city');
            } else if (action === 'categories') {
                return this.settings(ctx, 'categories');
            } else if (action.startsWith('setcity:')) {
                const city = action.split(':')[1];
                return this.handleCityChange(ctx, city);
            }
        });
        
        this.bot.action(/^saved:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action.startsWith('page:')) {
                const page = parseInt(action.split(':')[1]);
                return this.saved(ctx, null, page);
            } else if (action.startsWith('read:')) {
                const page = parseInt(action.split(':')[1]);
                return this.handleSavedRead(ctx, page);
            } else if (action.startsWith('remove:')) {
                const page = parseInt(action.split(':')[1]);
                return this.handleSavedRemove(ctx, page);
            } else if (action.startsWith('share:')) {
                const userId = action.split(':')[1];
                return this.share(ctx, 'saved', userId);
            }
        });
        
        this.bot.action(/^share:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action === 'bot') {
                return this.share(ctx, 'bot');
            } else if (action === 'article') {
                return this.share(ctx, 'article');
            } else if (action === 'saved') {
                return this.share(ctx, 'saved');
            } else if (action === 'custom') {
                return this.share(ctx, 'custom');
            } else if (action.startsWith('history:')) {
                const userId = action.split(':')[1];
                return this.showShareHistory(ctx, userId);
            } else if (action.startsWith('referrals:')) {
                const userId = action.split(':')[1];
                return this.showReferralStats(ctx, userId);
            } else if (action.startsWith('track:')) {
                const trackingId = action.split(':')[1];
                return this.showShareTracking(ctx, trackingId);
            }
        });
    }

    /**
     * Handle city change setting
     */
    async handleCityChange(ctx, city) {
        try {
            await CommandUtils.saveUserPreference(ctx.from.id, 'city', city, this.db);
            await ctx.answerCbQuery(`✅ City changed to ${city}`);
            return this.settings(ctx);
        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Handle saved article reading
     */
    async handleSavedRead(ctx, page) {
        // Implementation would show saved articles for reading
        await ctx.answerCbQuery('📖 Opening saved articles...');
        return this.saved(ctx, 'read', page);
    }

    /**
     * Handle saved article removal
     */
    async handleSavedRemove(ctx, page) {
        // Implementation would show removal interface
        await ctx.answerCbQuery('🗑️ Select articles to remove...');
        return this.saved(ctx, 'remove', page);
    }

    /**
     * Show weekly statistics
     */
    async showWeeklyStats(ctx, userId) {
        // Implementation would show detailed weekly stats
        await ctx.answerCbQuery('📈 Loading weekly stats...');
        // Redirect to main stats for now
        return this.mystats(ctx);
    }

    /**
     * Show user achievements
     */
    async showAchievements(ctx, userId) {
        // Implementation would show achievement system
        await ctx.answerCbQuery('🏆 Loading achievements...');
        // Redirect to main stats for now
        return this.mystats(ctx);
    }

    /**
     * Show detailed statistics
     */
    async showDetailedStats(ctx, userId) {
        // Implementation would show comprehensive stats
        await ctx.answerCbQuery('📊 Loading detailed stats...');
        // Redirect to main stats for now
        return this.mystats(ctx);
    }

    /**
     * Show share history
     */
    async showShareHistory(ctx, userId) {
        // Implementation would show user's sharing history
        await ctx.answerCbQuery('📊 Loading share history...');
        return this.share(ctx);
    }

    /**
     * Show referral statistics
     */
    async showReferralStats(ctx, userId) {
        // Implementation would show referral tracking
        await ctx.answerCbQuery('🏆 Loading referral stats...');
        return this.share(ctx);
    }

    /**
     * Show share tracking details
     */
    async showShareTracking(ctx, trackingId) {
        // Implementation would show tracking details for a specific share
        await ctx.answerCbQuery('📈 Loading tracking data...');
        return this.share(ctx);
    }

    /**
     * My Stats Command - Show detailed user statistics and engagement metrics
     */
    async mystats(ctx) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'mystats');

            const userId = ctx.from.id;
            const stats = await this.getUserStatistics(userId);
            const subscription = await CommandUtils.hasSubscription(userId, this.db);
            
            const message = 
                `📊 *Your Zone News Statistics*\n\n` +
                `👤 *Profile:*\n` +
                `${ctx.from.first_name}${ctx.from.username ? ` (@${ctx.from.username})` : ''}\n` +
                `📅 Member since: ${CommandUtils.formatDate(stats.memberSince)}\n` +
                `⭐ Subscription: ${subscription.tier.toUpperCase()}\n\n` +
                `📰 *Reading Activity:*\n` +
                `📖 Articles read: ${stats.articlesRead.toLocaleString()}\n` +
                `⏱️ Reading time: ${stats.readingTime}\n` +
                `🏆 Daily streak: ${stats.dailyStreak} days\n` +
                `📈 This week: ${stats.weeklyReads} articles\n\n` +
                `💫 *Engagement:*\n` +
                `❤️ Reactions given: ${stats.reactionsGiven.toLocaleString()}\n` +
                `📤 Articles shared: ${stats.articlesShared.toLocaleString()}\n` +
                `💾 Articles saved: ${stats.articlesSaved.toLocaleString()}\n` +
                `🔍 Searches performed: ${stats.searchesPerformed.toLocaleString()}\n\n` +
                `🎯 *Preferences:*\n` +
                `🏙️ City: ${stats.preferences.city}\n` +
                `📂 Favourite categories: ${stats.favouriteCategories.join(', ')}\n` +
                `🔔 Notifications: ${stats.preferences.notifications ? '✅ On' : '❌ Off'}\n\n` +
                `${this.generateActivityGraph(stats.weeklyActivity)}`;

            const keyboard = [
                [
                    Markup.button.callback('📈 Weekly Report', `stats:weekly:${userId}`),
                    Markup.button.callback('🏆 Achievements', `stats:achievements:${userId}`)
                ],
                [
                    Markup.button.callback('📊 Detailed Stats', `stats:detailed:${userId}`),
                    Markup.button.callback('⚙️ Settings', 'settings:main')
                ],
                [Markup.button.callback('🔄 Refresh', 'mystats')]
            ];

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Settings Command - User preferences with interactive toggles
     */
    async settings(ctx, section = null) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'settings', { section });

            const userId = ctx.from.id;
            const preferences = await CommandUtils.getUserPreferences(userId, this.db);

            if (!section) {
                const message = 
                    `⚙️ *Settings & Preferences*\n\n` +
                    `Customise your Zone News experience:\n\n` +
                    `🔔 *Notifications:* ${preferences.notifications ? '✅ Enabled' : '❌ Disabled'}\n` +
                    `🌐 *Language:* ${this.getLanguageName(preferences.language)}\n` +
                    `⏰ *Timezone:* ${preferences.timezone}\n` +
                    `🏙️ *City:* ${preferences.city}\n` +
                    `📂 *Categories:* ${preferences.categories.join(', ')}\n\n` +
                    `Select a setting to modify:`;

                const keyboard = [
                    [
                        Markup.button.callback(
                            `🔔 Notifications ${preferences.notifications ? '✅' : '❌'}`,
                            'settings:notifications'
                        )
                    ],
                    [
                        Markup.button.callback('🌐 Language', 'settings:language'),
                        Markup.button.callback('⏰ Timezone', 'settings:timezone')
                    ],
                    [
                        Markup.button.callback('🏙️ City', 'settings:city'),
                        Markup.button.callback('📂 Categories', 'settings:categories')
                    ],
                    [
                        Markup.button.callback('🎨 Theme', 'settings:theme'),
                        Markup.button.callback('📊 Privacy', 'settings:privacy')
                    ],
                    [
                        Markup.button.callback('💾 Export Data', 'settings:export'),
                        Markup.button.callback('🗑️ Reset All', 'settings:reset')
                    ],
                    [Markup.button.callback('↩️ Back', 'start')]
                ];

                return CommandUtils.editOrReply(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard(keyboard)
                });
            }

            await this.handleSettingsSection(ctx, section, preferences);

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Saved Articles Command - View and manage bookmarked articles
     */
    async saved(ctx, action = null, page = 1) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'saved', { action, page });

            const userId = ctx.from.id;
            const limit = 5;
            const skip = (page - 1) * limit;

            const totalSaved = await this.db.collection('saved_articles').countDocuments({ user_id: userId });
            
            if (totalSaved === 0) {
                const message = 
                    `💾 *Your Saved Articles*\n\n` +
                    `📭 You haven't saved any articles yet.\n\n` +
                    `💡 Tip: Use the 💾 Save button on any article to bookmark it for later reading!`;

                const keyboard = [
                    [
                        Markup.button.callback('📰 Browse News', 'news:latest'),
                        Markup.button.callback('🔍 Search', 'search:start')
                    ],
                    [Markup.button.callback('↩️ Back', 'start')]
                ];

                return CommandUtils.editOrReply(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard(keyboard)
                });
            }

            const savedArticles = await this.db.collection('saved_articles').aggregate([
                { $match: { user_id: userId } },
                { $sort: { saved_at: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $lookup: {
                        from: 'articles',
                        localField: 'article_id',
                        foreignField: '_id',
                        as: 'article'
                    }
                },
                { $unwind: '$article' }
            ]).toArray();

            let message = `💾 *Your Saved Articles* (${totalSaved})\n\n`;

            savedArticles.forEach((saved, index) => {
                const article = saved.article;
                const savedDate = CommandUtils.formatDateRelative(saved.saved_at);
                
                message += `${skip + index + 1}. **${CommandUtils.truncateText(article.title, 60)}**\n`;
                message += `📅 ${CommandUtils.formatDate(article.published_date)} • 💾 ${savedDate}\n`;
                message += `📂 ${article.category || 'General'}\n\n`;
            });

            const pagination = CommandUtils.getPaginationData(page, limit, totalSaved);
            const keyboard = [];

            // Article management buttons
            keyboard.push([
                Markup.button.callback('📖 Read Selected', `saved:read:${page}`),
                Markup.button.callback('🗑️ Remove', `saved:remove:${page}`)
            ]);

            // Pagination
            if (pagination.totalPages > 1) {
                keyboard.push(CommandUtils.buildPagination(page, pagination.totalPages, 'saved:page')[0]);
            }

            // Management options
            keyboard.push([
                Markup.button.callback('🔄 Refresh', 'saved'),
                Markup.button.callback('📤 Share List', `saved:share:${userId}`)
            ]);

            keyboard.push([Markup.button.callback('↩️ Back', 'start')]);

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Share Command - Share bot or articles with tracking
     */
    async share(ctx, type = null, id = null) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'share', { type, id });

            const userId = ctx.from.id;

            if (!type) {
                const message = 
                    `📤 *Share Zone News*\n\n` +
                    `Spread the word about Adelaide's premier news bot!\n\n` +
                    `What would you like to share?`;

                const keyboard = [
                    [
                        Markup.button.callback('🤖 Share Bot', 'share:bot'),
                        Markup.button.callback('📰 Share Article', 'share:article')
                    ],
                    [
                        Markup.button.callback('💾 Share Saved List', 'share:saved'),
                        Markup.button.callback('🎯 Custom Link', 'share:custom')
                    ],
                    [
                        Markup.button.callback('📊 My Shares', `share:history:${userId}`),
                        Markup.button.callback('🏆 Referral Stats', `share:referrals:${userId}`)
                    ],
                    [Markup.button.callback('↩️ Back', 'start')]
                ];

                return CommandUtils.editOrReply(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard(keyboard)
                });
            }

            await this.handleShare(ctx, type, id, userId);

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Helper Methods
     */

    async getUserStatistics(userId) {
        try {
            const user = await this.db.collection('users').findOne({ user_id: userId });
            const currentDate = new Date();
            const weekAgo = new Date(currentDate - 7 * 24 * 60 * 60 * 1000);
            const monthAgo = new Date(currentDate - 30 * 24 * 60 * 60 * 1000);

            const [
                articlesRead,
                reactionsGiven,
                articlesShared,
                articlesSaved,
                searchesPerformed,
                weeklyReads,
                weeklyActivity
            ] = await Promise.all([
                this.db.collection('user_article_views').countDocuments({ user_id: userId }),
                this.db.collection('user_reactions').countDocuments({ user_id: userId }),
                this.db.collection('share_tracking').countDocuments({ shared_by: userId }),
                this.db.collection('saved_articles').countDocuments({ user_id: userId }),
                this.db.collection('command_usage').countDocuments({ 
                    user_id: userId, 
                    command: { $in: ['search', 'news'] }
                }),
                this.db.collection('user_article_views').countDocuments({ 
                    user_id: userId,
                    viewed_at: { $gte: weekAgo }
                }),
                this.getWeeklyActivity(userId)
            ]);

            const readingTime = Math.floor(articlesRead * 2.5); // Estimate 2.5 minutes per article
            const dailyStreak = await this.calculateDailyStreak(userId);
            const favouriteCategories = await this.getFavouriteCategories(userId);

            return {
                memberSince: user?.created_at || new Date(),
                articlesRead,
                readingTime: this.formatReadingTime(readingTime),
                dailyStreak,
                weeklyReads,
                reactionsGiven,
                articlesShared,
                articlesSaved,
                searchesPerformed,
                favouriteCategories,
                preferences: {
                    city: user?.city || 'Adelaide',
                    notifications: user?.preferences?.notifications !== false
                },
                weeklyActivity
            };
        } catch (error) {
            console.error('Error getting user statistics:', error);
            return this.getDefaultStats();
        }
    }

    async getWeeklyActivity(userId) {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            
            const count = await this.db.collection('user_article_views').countDocuments({
                user_id: userId,
                viewed_at: { $gte: date, $lt: nextDate }
            });
            
            days.push(count);
        }
        return days;
    }

    generateActivityGraph(weeklyActivity) {
        const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        const max = Math.max(...weeklyActivity, 1);
        
        let graph = '📈 *7-Day Activity:*\n```\n';
        
        // Create bars
        for (let i = 0; i < weeklyActivity.length; i++) {
            const height = Math.ceil((weeklyActivity[i] / max) * 5);
            const bar = '▓'.repeat(height) + '░'.repeat(5 - height);
            graph += `${days[i]} ${bar} ${weeklyActivity[i]}\n`;
        }
        
        graph += '```';
        return graph;
    }

    async calculateDailyStreak(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let streak = 0;
        let currentDate = new Date(today);
        
        while (streak < 365) { // Max reasonable streak check
            const nextDate = new Date(currentDate);
            nextDate.setDate(nextDate.getDate() + 1);
            
            const hasActivity = await this.db.collection('user_article_views').findOne({
                user_id: userId,
                viewed_at: { $gte: currentDate, $lt: nextDate }
            });
            
            if (!hasActivity) break;
            
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
        }
        
        return streak;
    }

    async getFavouriteCategories(userId) {
        try {
            const result = await this.db.collection('user_article_views').aggregate([
                { $match: { user_id: userId } },
                {
                    $lookup: {
                        from: 'articles',
                        localField: 'article_id',
                        foreignField: '_id',
                        as: 'article'
                    }
                },
                { $unwind: '$article' },
                {
                    $group: {
                        _id: '$article.category',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 3 }
            ]).toArray();

            return result.map(r => r._id || 'General').filter(Boolean);
        } catch (error) {
            return ['General'];
        }
    }

    formatReadingTime(minutes) {
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    }

    getDefaultStats() {
        return {
            memberSince: new Date(),
            articlesRead: 0,
            readingTime: '0m',
            dailyStreak: 0,
            weeklyReads: 0,
            reactionsGiven: 0,
            articlesShared: 0,
            articlesSaved: 0,
            searchesPerformed: 0,
            favouriteCategories: ['General'],
            preferences: {
                city: 'Adelaide',
                notifications: true
            },
            weeklyActivity: [0, 0, 0, 0, 0, 0, 0]
        };
    }

    async handleSettingsSection(ctx, section, preferences) {
        switch (section) {
            case 'notifications':
                await this.toggleNotifications(ctx, preferences);
                break;
            case 'city':
                await this.changeCitySettings(ctx);
                break;
            case 'categories':
                await this.manageCategoriesSettings(ctx);
                break;
            default:
                await this.settings(ctx);
        }
    }

    async toggleNotifications(ctx, preferences) {
        const newValue = !preferences.notifications;
        await CommandUtils.saveUserPreference(ctx.from.id, 'notifications', newValue, this.db);
        
        const message = 
            `🔔 *Notifications ${newValue ? 'Enabled' : 'Disabled'}*\n\n` +
            `${newValue ? '✅ You will now receive news updates and alerts.' : '❌ You will no longer receive automatic notifications.'}\n\n` +
            `You can change this setting anytime.`;

        const keyboard = [
            [Markup.button.callback('⚙️ Back to Settings', 'settings:main')],
            [Markup.button.callback('🏠 Main Menu', 'start')]
        ];

        await CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    async changeCitySettings(ctx) {
        const cities = ['Adelaide', 'Melbourne', 'Sydney', 'Brisbane', 'Perth', 'Darwin', 'Hobart', 'Canberra'];
        
        const message = 
            `🏙️ *Select Your City*\n\n` +
            `Choose your city to get localised news and weather updates:`;

        const keyboard = [];
        for (let i = 0; i < cities.length; i += 2) {
            const row = [Markup.button.callback(cities[i], `settings:setcity:${cities[i]}`)];
            if (cities[i + 1]) {
                row.push(Markup.button.callback(cities[i + 1], `settings:setcity:${cities[i + 1]}`));
            }
            keyboard.push(row);
        }
        
        keyboard.push([Markup.button.callback('↩️ Back', 'settings:main')]);

        await CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    async manageCategoriesSettings(ctx) {
        const categories = [
            'General', 'Politics', 'Business', 'Technology', 'Sports',
            'Entertainment', 'Health', 'Environment', 'Education', 'Crime'
        ];
        
        const preferences = await CommandUtils.getUserPreferences(ctx.from.id, this.db);
        
        const message = 
            `📂 *News Categories*\n\n` +
            `Select categories you're interested in:`;

        const keyboard = CommandUtils.buildCategoryKeyboard(
            categories.map(cat => ({ id: cat, name: cat })),
            preferences.categories
        );
        
        keyboard.push([Markup.button.callback('✅ Save Changes', 'settings:savecategories')]);
        keyboard.push([Markup.button.callback('↩️ Back', 'settings:main')]);

        await CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    async handleShare(ctx, type, id, userId) {
        const trackingId = CommandUtils.generateId(10);
        
        const shareEntry = {
            tracking_id: trackingId,
            shared_by: userId,
            share_type: type,
            item_id: id,
            created_at: new Date(),
            clicks: 0,
            referrals: 0
        };

        await this.db.collection('share_tracking').insertOne(shareEntry);

        let shareUrl, message;

        switch (type) {
            case 'bot':
                shareUrl = `https://t.me/ZoneNewsBot?start=${trackingId}`;
                message = 
                    `🤖 *Share Zone News Bot*\n\n` +
                    `📱 Telegram: [Zone News Bot](${shareUrl})\n` +
                    `🌐 Web: https://thezonenews.com\n\n` +
                    `📊 Track clicks and referrals with ID: \`${trackingId}\``;
                break;
            
            default:
                shareUrl = `https://t.me/ZoneNewsBot?start=share_${trackingId}`;
                message = `📤 Share link created: ${shareUrl}`;
        }

        const keyboard = [
            [Markup.button.callback('📊 Track Shares', `share:track:${trackingId}`)],
            [Markup.button.callback('↩️ Back', 'share')]
        ];

        await CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    getLanguageName(code) {
        const languages = {
            en: 'English',
            es: 'Español',
            fr: 'Français',
            de: 'Deutsch'
        };
        return languages[code] || 'English';
    }
}

module.exports = UserCommands;