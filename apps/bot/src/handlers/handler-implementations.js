/**
 * Enhanced Handler Implementations
 * Provides missing functionality for interactive buttons and callbacks
 */

const { EMOJI_CONFIG, getReactionButtons, getBackButton } = require('../config/emoji.config');
const { COMMANDS, getHelpMenu } = require('../config/commands.config');

class HandlerImplementations {
    constructor(bot, db, services) {
        this.bot = bot;
        this.db = db;
        this.services = services;
        
        // Use centralized cache service if available
        this.cache = services?.cache || null;
        this.localCache = new Map(); // Fallback local cache
        this.cacheTimeout = 60000; // 1 minute cache
    }
    
    /**
     * Handle detailed analytics with caching
     */
    async handleDetailedAnalytics(ctx) {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        const cacheKey = `analytics:${userId}:detailed`;
        
        // Check cache service first
        if (this.cache) {
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                return ctx.editMessageText(cached.text, {
                    parse_mode: 'Markdown',
                    reply_markup: cached.reply_markup
                });
            }
        }
        
        try {
            // Optimized single aggregation query
            const [stats] = await this.db.collection('news_articles').aggregate([
                { $match: { author_id: userId } },
                {
                    $facet: {
                        overview: [
                            {
                                $group: {
                                    _id: null,
                                    totalArticles: { $sum: 1 },
                                    totalViews: { $sum: '$views' },
                                    totalReactions: { 
                                        $sum: { 
                                            $add: [
                                                { $ifNull: ['$reactions.like', 0] },
                                                { $ifNull: ['$reactions.love', 0] },
                                                { $ifNull: ['$reactions.fire', 0] }
                                            ]
                                        }
                                    },
                                    avgViews: { $avg: '$views' }
                                }
                            }
                        ],
                        byCategory: [
                            {
                                $group: {
                                    _id: '$category',
                                    count: { $sum: 1 },
                                    views: { $sum: '$views' }
                                }
                            },
                            { $sort: { views: -1 } },
                            { $limit: 5 }
                        ],
                        topPerformers: [
                            { $sort: { views: -1 } },
                            { $limit: 3 },
                            {
                                $project: {
                                    title: 1,
                                    views: 1,
                                    category: 1,
                                    published_date: 1
                                }
                            }
                        ],
                        recentActivity: [
                            { $sort: { published_date: -1 } },
                            { $limit: 5 },
                            {
                                $project: {
                                    title: 1,
                                    status: 1,
                                    published_date: 1
                                }
                            }
                        ]
                    }
                }
            ]).toArray();
            
            const overview = stats.overview[0] || { totalArticles: 0, totalViews: 0, totalReactions: 0, avgViews: 0 };
            
            let analyticsText = `📊 **Detailed Analytics**\n\n`;
            analyticsText += `📈 **Overall Performance:**\n`;
            analyticsText += `• Total Articles: ${overview.totalArticles}\n`;
            analyticsText += `• Total Views: ${overview.totalViews.toLocaleString()}\n`;
            analyticsText += `• Total Reactions: ${overview.totalReactions}\n`;
            analyticsText += `• Average Views: ${Math.round(overview.avgViews)}\n\n`;
            
            if (stats.byCategory.length > 0) {
                analyticsText += `📂 **Top Categories:**\n`;
                stats.byCategory.forEach((cat, idx) => {
                    analyticsText += `${idx + 1}. ${cat._id}: ${cat.count} articles (${cat.views} views)\n`;
                });
                analyticsText += '\n';
            }
            
            if (stats.topPerformers.length > 0) {
                analyticsText += `🏆 **Top Performing Articles:**\n`;
                stats.topPerformers.forEach((article, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                    analyticsText += `${medal} ${article.title.substring(0, 30)}... (${article.views} views)\n`;
                });
            }
            
            const response = {
                text: analyticsText,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📥 Export Data', callback_data: 'export_analytics' },
                            { text: '📅 Date Range', callback_data: 'analytics_daterange' }
                        ],
                        [
                            { text: '📊 Charts', callback_data: 'analytics_charts' },
                            { text: '🎯 Goals', callback_data: 'analytics_goals' }
                        ],
                        [getBackButton('user_analytics')]
                    ]
                }
            };
            
            // Cache the response
            if (this.cache) {
                await this.cache.set(cacheKey, response, 300); // 5 minutes TTL
            } else {
                this.setLocalCache(cacheKey, response);
            }
            
            await ctx.editMessageText(response.text, {
                parse_mode: response.parse_mode,
                reply_markup: response.reply_markup
            });
            
        } catch (error) {
            console.error('Error loading detailed analytics:', error);
            await ctx.editMessageText(
                '❌ **Error Loading Analytics**\n\nPlease try again later.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[getBackButton('user_analytics')]]
                    }
                }
            );
        }
    }
    
    /**
     * Handle notification settings
     */
    async handleNotificationSettings(ctx) {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        
        try {
            // Get current settings
            const settings = await this.db.collection('user_settings').findOne({ user_id: userId }) || {};
            const notifications = settings.notifications || { enabled: true, types: [] };
            
            await ctx.editMessageText(
                `🔔 **Notification Settings**\n\n` +
                `**Current Status:** ${notifications.enabled ? '✅ Enabled' : '🔕 Disabled'}\n\n` +
                `**Notification Types:**\n` +
                `${notifications.types.includes('replies') ? '✅' : '⬜'} Reply notifications\n` +
                `${notifications.types.includes('mentions') ? '✅' : '⬜'} Mention alerts\n` +
                `${notifications.types.includes('trending') ? '✅' : '⬜'} Trending updates\n` +
                `${notifications.types.includes('scheduled') ? '✅' : '⬜'} Scheduled reminders\n\n` +
                `Tap to toggle settings:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ 
                                text: notifications.enabled ? '🔕 Disable All' : '🔔 Enable All', 
                                callback_data: `toggle_notifications:${!notifications.enabled}` 
                            }],
                            [
                                { text: '💬 Replies', callback_data: 'toggle_notif:replies' },
                                { text: '📢 Mentions', callback_data: 'toggle_notif:mentions' }
                            ],
                            [
                                { text: '📈 Trending', callback_data: 'toggle_notif:trending' },
                                { text: '⏰ Scheduled', callback_data: 'toggle_notif:scheduled' }
                            ],
                            [getBackButton('user_settings')]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error loading notification settings:', error);
            await ctx.editMessageText('❌ Error loading settings. Please try again.');
        }
    }
    
    /**
     * Handle channel settings
     */
    async handleChannelSettings(ctx) {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        
        try {
            // Get user's channels
            const channels = await this.db.collection('user_channels').find({ 
                user_id: userId 
            }).toArray();
            
            let channelText = '📢 **Channel Settings**\n\n';
            
            if (channels.length > 0) {
                channelText += '**Your Channels:**\n';
                channels.forEach((channel, idx) => {
                    const status = channel.active ? '✅' : '🔕';
                    channelText += `${idx + 1}. ${status} ${channel.name} (@${channel.username})\n`;
                });
                channelText += '\n';
            } else {
                channelText += '_No channels configured yet._\n\n';
            }
            
            channelText += '**Quick Actions:**';
            
            await ctx.editMessageText(channelText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Add Channel', callback_data: 'add_channel' }],
                        [{ text: '📝 Edit Channels', callback_data: 'edit_channels' }],
                        [{ text: '🔄 Sync Status', callback_data: 'sync_channel_status' }],
                        [getBackButton('user_settings')]
                    ]
                }
            });
        } catch (error) {
            console.error('Error loading channel settings:', error);
            await ctx.editMessageText('❌ Error loading channels. Please try again.');
        }
    }
    
    /**
     * Handle post to TBC (restricted to owner and Duke only)
     */
    async handlePostToTBC(ctx) {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        const username = ctx.from.username;
        
        // Only allow owner (georgesimbe) and Duke
        const allowedUsers = [
            'georgesimbe',  // Owner
            'duke_exxotic', // Duke
            'Duke_Exxotic'  // Duke alternate
        ];
        
        if (!username || !allowedUsers.includes(username)) {
            return ctx.editMessageText(
                '🔒 **Restricted Access**\n\n' +
                '🌙 TBC posting is only available for:\n' +
                '• @georgesimbe (Owner)\n' +
                '• @Duke_Exxotic (Duke)\n\n' +
                'Contact owner for access.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[getBackButton('back_to_start')]]
                    }
                }
            );
        }
        
        try {
            // Get drafts ready for TBC
            const drafts = await this.db.collection('news_articles').find({
                author_id: userId,
                status: 'draft',
                ready_to_post: true
            }).limit(5).toArray();
            
            if (drafts.length === 0) {
                return ctx.editMessageText(
                    '🌙 **Post to TBC (The Brothers Creatives)**\n\n' +
                    '📭 No drafts ready for posting.\n\n' +
                    'Create and prepare articles first.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Create Article', callback_data: 'cmd_newarticle' }],
                                [getBackButton('back_to_start')]
                            ]
                        }
                    }
                );
            }
            
            await ctx.editMessageText(
                '🌙 **Post to TBC (The Brothers Creatives)**\n\n' +
                '🌌 Night News Channel\n\n' +
                '**Select content to post:**',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            ...drafts.map(draft => [{
                                text: `🌙 ${draft.title.substring(0, 40)}...`,
                                callback_data: `post_article:tbc:${draft._id}`
                            }]),
                            [{ text: '📝 Create New', callback_data: 'cmd_newarticle' }],
                            [getBackButton('back_to_start')]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error in post to TBC:', error);
            await ctx.editMessageText('❌ Error loading drafts. Please try again.');
        }
    }
    
    /**
     * Handle post to Zone News
     */
    async handlePostToZoneNews(ctx) {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        
        // Check if user has permission
        const isAdmin = await this.checkAdminPermission(userId);
        if (!isAdmin) {
            return ctx.editMessageText(
                '🔒 **Admin Access Required**\n\n' +
                'You need admin permissions to post to Zone News.\n' +
                'Contact @TheZoneNews for access.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[getBackButton('back_to_start')]]
                    }
                }
            );
        }
        
        try {
            // Get user's drafts that can be posted
            const drafts = await this.db.collection('news_articles').find({
                author_id: userId,
                status: 'draft',
                ready_to_post: true
            }).limit(5).toArray();
            
            if (drafts.length === 0) {
                return ctx.editMessageText(
                    '📭 **No Drafts Ready**\n\n' +
                    'Create and prepare articles first before posting.\n\n' +
                    'Use /newarticle to start creating content.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Create Article', callback_data: 'cmd_newarticle' }],
                                [getBackButton('back_to_start')]
                            ]
                        }
                    }
                );
            }
            
            await ctx.editMessageText(
                '📢 **Post to Zone News**\n\n' +
                '**Select an article to post:**',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            ...drafts.map(draft => [{
                                text: `📄 ${draft.title.substring(0, 40)}...`,
                                callback_data: `post_article:zonenews:${draft._id}`
                            }]),
                            [{ text: '📝 Create New', callback_data: 'cmd_newarticle' }],
                            [getBackButton('back_to_start')]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error('Error in post to Zone News:', error);
            await ctx.editMessageText('❌ Error loading drafts. Please try again.');
        }
    }
    
    /**
     * Handle scheduled post
     */
    async handleSchedulePost(ctx) {
        await ctx.answerCbQuery();
        
        await ctx.editMessageText(
            '📅 **Schedule Post**\n\n' +
            '**Select scheduling option:**\n\n' +
            '⏰ Available time slots:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🌅 Morning (8 AM)', callback_data: 'schedule:morning' },
                            { text: '☀️ Noon (12 PM)', callback_data: 'schedule:noon' }
                        ],
                        [
                            { text: '🌆 Evening (6 PM)', callback_data: 'schedule:evening' },
                            { text: '🌙 Night (10 PM)', callback_data: 'schedule:night' }
                        ],
                        [{ text: '📆 Custom Time', callback_data: 'schedule:custom' }],
                        [{ text: '📋 View Scheduled', callback_data: 'view_scheduled' }],
                        [getBackButton('back_to_start')]
                    ]
                }
            }
        );
    }
    
    /**
     * Cache management utilities
     */
    setLocalCache(key, value) {
        this.localCache.set(key, {
            value,
            timestamp: Date.now()
        });
    }
    
    getFromLocalCache(key) {
        const cached = this.localCache.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.localCache.delete(key);
            return null;
        }
        
        return cached.value;
    }
    
    async clearCache(pattern = null) {
        if (this.cache) {
            await this.cache.clearPattern(pattern || '*');
        } else {
            if (!pattern) {
                this.localCache.clear();
            } else {
                for (const key of this.localCache.keys()) {
                    if (key.includes(pattern)) {
                        this.localCache.delete(key);
                    }
                }
            }
        }
    }
    
    /**
     * Check admin permission
     */
    async checkAdminPermission(userId) {
        const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];
        return adminIds.includes(userId);
    }
    
    /**
     * Handle pagination for lists
     */
    createPagination(items, page = 1, perPage = 5) {
        const totalPages = Math.ceil(items.length / perPage);
        const start = (page - 1) * perPage;
        const end = start + perPage;
        const pageItems = items.slice(start, end);
        
        const buttons = [];
        if (page > 1) {
            buttons.push({ text: '⬅️ Previous', callback_data: `page:${page - 1}` });
        }
        if (page < totalPages) {
            buttons.push({ text: 'Next ➡️', callback_data: `page:${page + 1}` });
        }
        
        return {
            items: pageItems,
            pagination: buttons,
            currentPage: page,
            totalPages
        };
    }
}

module.exports = HandlerImplementations;