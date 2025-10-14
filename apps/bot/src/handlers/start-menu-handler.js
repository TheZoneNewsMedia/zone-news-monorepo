/**
 * Start Menu Handler - Handle /start command and main menu interactions
 */

const HandlerImplementations = require('./handler-implementations');

class StartMenuHandler {
    constructor(bot, db, services) {
        this.bot = bot;
        this.db = db;
        this.services = services;
        this.implementations = new HandlerImplementations(bot, db, services);
    }

    /**
     * Setup start command and main menu
     */
    setupStartCommand() {
        this.bot.command('start', async (ctx) => {
            try {
                const userId = ctx.from.id;
                const username = ctx.from.username || ctx.from.first_name || 'User';
                
                // Update user stats
                if (this.services.stats) {
                    await this.services.stats.trackUser({
                        userId: userId,
                        username: username,
                        firstName: ctx.from.first_name,
                        lastName: ctx.from.last_name,
                        lastActive: new Date()
                    });
                }
                
                await this.showMainMenu(ctx);
            } catch (error) {
                console.error('Start command error:', error);
                await ctx.reply('❌ Welcome! Something went wrong, but I\'m still here to help.');
            }
        });
    }

    /**
     * Show enhanced main menu with dynamic content
     */
    async showMainMenu(ctx) {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name || 'User';
        
        // Get user context and statistics
        const userStats = await this.getUserStats(userId);
        const recentActivity = await this.getRecentActivity(userId);
        
        // Create personalized welcome message
        const welcomeMessage = await this.createWelcomeMessage(username, userStats, recentActivity);
        
        // Generate smart keyboard based on user context
        const keyboard = await this.createSmartKeyboard(userStats, recentActivity);
        
        if (ctx.callbackQuery) {
            await ctx.editMessageText(welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await ctx.reply(welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    }
    
    /**
     * Get user statistics and context
     */
    async getUserStats(userId) {
        try {
            const [drafts, published, totalViews] = await Promise.all([
                this.db.collection('news_articles').countDocuments({ 
                    author_id: userId, 
                    status: 'draft' 
                }),
                this.db.collection('news_articles').countDocuments({ 
                    author_id: userId, 
                    status: 'published' 
                }),
                this.db.collection('news_articles').aggregate([
                    { $match: { author_id: userId } },
                    { $group: { _id: null, totalViews: { $sum: '$views' } } }
                ]).toArray()
            ]);
            
            return {
                drafts,
                published,
                totalViews: totalViews[0]?.totalViews || 0,
                isNewUser: drafts === 0 && published === 0
            };
        } catch (error) {
            console.error('Error fetching user stats:', error);
            return { drafts: 0, published: 0, totalViews: 0, isNewUser: true };
        }
    }
    
    /**
     * Get recent user activity
     */
    async getRecentActivity(userId) {
        try {
            const recentDraft = await this.db.collection('news_articles')
                .findOne({ 
                    author_id: userId, 
                    status: 'draft' 
                }, { 
                    sort: { updated_at: -1 } 
                });
                
            const lastPost = await this.db.collection('posted_to_zone_news')
                .findOne({ userId }, { sort: { timestamp: -1 } });
                
            return {
                recentDraft,
                lastPost,
                hasRecentActivity: !!recentDraft || !!lastPost
            };
        } catch (error) {
            console.error('Error fetching recent activity:', error);
            return { hasRecentActivity: false };
        }
    }
    
    /**
     * Create personalized welcome message
     */
    async createWelcomeMessage(username, userStats, recentActivity) {
        const timeOfDay = this.getTimeOfDay();
        let welcomeMessage = `${timeOfDay} **${username}!** 👋\n\n`;
        
        if (userStats.isNewUser) {
            welcomeMessage += `🌟 **Welcome to Zone News Bot!**\n` +
                            `Your journey in content creation starts here.\n\n` +
                            `💡 **Quick Start Guide:**\n` +
                            `1️⃣ Create your first article\n` +
                            `2️⃣ Publish to channels\n` +
                            `3️⃣ Track engagement\n\n`;
        } else {
            welcomeMessage += `📊 **Your Content Dashboard**\n`;
            
            if (userStats.drafts > 0) {
                welcomeMessage += `📝 ${userStats.drafts} draft${userStats.drafts > 1 ? 's' : ''} waiting\n`;
            }
            
            if (userStats.published > 0) {
                welcomeMessage += `📰 ${userStats.published} article${userStats.published > 1 ? 's' : ''} published\n`;
            }
            
            if (userStats.totalViews > 0) {
                welcomeMessage += `👁️ ${userStats.totalViews.toLocaleString()} total views\n`;
            }
            
            if (recentActivity.recentDraft) {
                const draftTitle = recentActivity.recentDraft.title.substring(0, 30);
                welcomeMessage += `\n🔄 **Continue**: "${draftTitle}${recentActivity.recentDraft.title.length > 30 ? '...' : ''}"\n`;
            }
            
            welcomeMessage += `\n`;
        }
        
        welcomeMessage += `🚀 **What would you like to do?**`;
        
        return welcomeMessage;
    }
    
    /**
     * Create smart keyboard based on user context
     */
    async createSmartKeyboard(userStats, recentActivity) {
        const keyboard = { inline_keyboard: [] };
        
        // Row 1: Primary actions (dynamic based on user)
        const primaryRow = [];
        
        if (userStats.isNewUser) {
            primaryRow.push({ text: '🌟 Get Started', callback_data: 'quick_start_new' });
            primaryRow.push({ text: '✍️ Create Article', callback_data: 'cmd_newarticle' });
        } else if (recentActivity.recentDraft) {
            primaryRow.push({ text: '🔄 Continue Draft', callback_data: `edit_draft:${recentActivity.recentDraft._id}` });
            primaryRow.push({ text: '✍️ New Article', callback_data: 'cmd_newarticle' });
        } else {
            primaryRow.push({ text: '⚡ Quick Start', callback_data: 'quick_start' });
            primaryRow.push({ text: '✍️ Create Article', callback_data: 'cmd_newarticle' });
        }
        keyboard.inline_keyboard.push(primaryRow);
        
        // Row 2: Content management (with counters)
        const contentRow = [];
        const draftsText = userStats.drafts > 0 ? `📝 My Drafts (${userStats.drafts})` : '📝 My Drafts';
        contentRow.push({ text: draftsText, callback_data: 'cmd_drafts' });
        contentRow.push({ text: '📤 Post Article', callback_data: 'quick_post' });
        keyboard.inline_keyboard.push(contentRow);
        
        // Row 3: Discovery and analytics
        const discoveryRow = [];
        discoveryRow.push({ text: '🔍 Search Articles', callback_data: 'cmd_search' });
        discoveryRow.push({ text: '📊 Trending Now', callback_data: 'cmd_trending' });
        keyboard.inline_keyboard.push(discoveryRow);
        
        // Row 4: Management (only for active users)
        if (!userStats.isNewUser || userStats.published > 0) {
            const managementRow = [];
            managementRow.push({ text: '📢 Channels', callback_data: 'channel_mgmt' });
            managementRow.push({ text: '📈 Analytics', callback_data: 'user_analytics' });
            keyboard.inline_keyboard.push(managementRow);
        }
        
        // Row 5: Support and settings
        const supportRow = [];
        supportRow.push({ text: '⚙️ Settings', callback_data: 'user_settings' });
        supportRow.push({ text: '❓ Help', callback_data: 'help_menu' });
        keyboard.inline_keyboard.push(supportRow);
        
        return keyboard;
    }
    
    /**
     * Get time-appropriate greeting
     */
    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 12) return '🌅 Good morning';
        if (hour < 17) return '☀️ Good afternoon';
        if (hour < 21) return '🌆 Good evening';
        return '🌙 Good night';
    }

    /**
     * Handle main menu callbacks
     */
    async handleMainMenuCallback(ctx, action) {
        try {
            switch (action) {
                case 'quick_start_new':
                    await ctx.answerCbQuery();
                    await ctx.reply(
                        '🌟 **Welcome to Zone News!** Let\'s get you started.\n\n' +
                        '**Step 1: Create Your First Article**\n' +
                        'Click "Create Article" to begin the guided workflow.\n\n' +
                        '**Step 2: Add Content**\n' +
                        'Write your headline and content with our interactive editor.\n\n' +
                        '**Step 3: Publish & Share**\n' +
                        'Post to Zone News and TBC channels instantly.\n\n' +
                        '🎯 **Ready to start creating?**',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '✍️ Create My First Article', callback_data: 'cmd_newarticle' }],
                                    [{ text: '📖 Learn More', callback_data: 'features_menu' }],
                                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                                ]
                            }
                        }
                    );
                    break;
                    
                case 'quick_start':
                    await ctx.answerCbQuery();
                    const userId = ctx.from.id;
                    const userStats = await this.getUserStats(userId);
                    
                    let quickStartMessage = '⚡ **Quick Actions for You**\n\n';
                    const quickActions = [];
                    
                    if (userStats.drafts > 0) {
                        quickStartMessage += `📝 You have ${userStats.drafts} draft${userStats.drafts > 1 ? 's' : ''} ready to publish\n`;
                        quickActions.push([{ text: `📝 Edit Drafts (${userStats.drafts})`, callback_data: 'cmd_drafts' }]);
                    }
                    
                    if (userStats.published > 0) {
                        quickStartMessage += `📤 Post your latest article to channels\n`;
                        quickActions.push([{ text: '📤 Post Article', callback_data: 'quick_post' }]);
                    }
                    
                    quickStartMessage += `✍️ Create new content\n`;
                    quickStartMessage += `📊 Check what's trending\n\n`;
                    quickStartMessage += `🎯 **What would you like to do?**`;
                    
                    quickActions.push([
                        { text: '✍️ New Article', callback_data: 'cmd_newarticle' },
                        { text: '📊 Trending', callback_data: 'cmd_trending' }
                    ]);
                    quickActions.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]);
                    
                    await ctx.reply(quickStartMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: quickActions }
                    });
                    break;
                    
                case 'quick_post':
                    await ctx.answerCbQuery();
                    await ctx.reply(
                        '📤 **Quick Post**\n\n' +
                        'Select an article to post to your channels:\n\n' +
                        '🎯 **Available Options:**\n' +
                        '• Post to Zone News Channel\n' +
                        '• Post to TBC Channel\n' +
                        '• Schedule for later\n' +
                        '• Multi-channel posting',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '📰 Zone News', callback_data: 'post_zone_news' }],
                                    [{ text: '📺 TBC Channel', callback_data: 'post_tbc' }],
                                    [{ text: '📅 Schedule Post', callback_data: 'schedule_post' }],
                                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                                ]
                            }
                        }
                    );
                    break;
                    
                case 'user_analytics':
                    await ctx.answerCbQuery();
                    const stats = await this.getUserStats(ctx.from.id);
                    
                    await ctx.reply(
                        `📈 **Your Analytics Dashboard**\n\n` +
                        `📝 **Content Created:**\n` +
                        `• ${stats.published} published articles\n` +
                        `• ${stats.drafts} drafts in progress\n\n` +
                        `👁️ **Engagement:**\n` +
                        `• ${stats.totalViews.toLocaleString()} total views\n` +
                        `• ${Math.round(stats.totalViews / Math.max(stats.published, 1))} avg views per article\n\n` +
                        `📊 **Performance Insights:**\n` +
                        `• ${stats.published > 0 ? 'Active creator' : 'Getting started'}\n` +
                        `• ${stats.totalViews > 100 ? 'Growing audience' : 'Building audience'}`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '📊 Detailed Stats', callback_data: 'detailed_analytics' }],
                                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                                ]
                            }
                        }
                    );
                    break;
                    
                case 'user_settings':
                    await ctx.answerCbQuery();
                    await ctx.reply(
                        '⚙️ **User Settings**\n\n' +
                        '🔧 **Customize Your Experience:**\n' +
                        '• Notification preferences\n' +
                        '• Default posting channels\n' +
                        '• Interface language\n' +
                        '• Privacy settings\n\n' +
                        '📱 **Quick Settings:**',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '🔔 Notifications', callback_data: 'settings_notifications' },
                                        { text: '📢 Channels', callback_data: 'settings_channels' }
                                    ],
                                    [
                                        { text: '🎨 Interface', callback_data: 'settings_interface' },
                                        { text: '🔒 Privacy', callback_data: 'settings_privacy' }
                                    ],
                                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                                ]
                            }
                        }
                    );
                    break;
                    
                case 'features_menu':
                    await ctx.answerCbQuery();
                    await ctx.reply(
                        '🎯 **Zone News Bot Features**\n\n' +
                        '📝 **Content Creation:**\n' +
                        '• Article creation wizard\n' +
                        '• Draft editing system\n' +
                        '• Professional templates\n\n' +
                        '🔍 **Discovery Tools:**\n' +
                        '• Advanced search filters\n' +
                        '• Trending content\n' +
                        '• Category browsing\n\n' +
                        '📢 **Distribution:**\n' +
                        '• Multi-channel posting\n' +
                        '• Scheduled publishing\n' +
                        '• Analytics tracking\n\n' +
                        '🎨 **User Experience:**\n' +
                        '• Interactive menus\n' +
                        '• Real-time previews\n' +
                        '• Mobile-optimized interface',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '✍️ Try Creating Article', callback_data: 'cmd_newarticle' }],
                                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                                ]
                            }
                        }
                    );
                    break;

                case 'help_menu':
                    await ctx.answerCbQuery();
                    await ctx.reply(
                        '❓ **Help & Support**\n\n' +
                        '**📚 Available Commands:**\n' +
                        '• `/start` - Main menu\n' +
                        '• `/newarticle` - Create article\n' +
                        '• `/drafts` - Edit drafts\n' +
                        '• `/search [query]` - Quick search\n' +
                        '• `/find` - Advanced search\n' +
                        '• `/trending` - Popular articles\n' +
                        '• `/post` - Post to channels\n' +
                        '• `/help` - Command reference\n\n' +
                        '**🎯 Quick Start:**\n' +
                        '1. Create your first article\n' +
                        '2. Edit and refine in drafts\n' +
                        '3. Publish to your channels\n' +
                        '4. Discover trending content\n\n' +
                        '📞 **Support:** @TheZoneNews',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '🚀 Quick Start', callback_data: 'cmd_newarticle' },
                                        { text: '💡 Examples', callback_data: 'search_help' }
                                    ],
                                    [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                                ]
                            }
                        }
                    );
                    break;

                case 'back_to_start':
                    await ctx.answerCbQuery();
                    await this.showMainMenu(ctx);
                    break;
                
                // Delegated implementations
                case 'detailed_analytics':
                    await this.implementations.handleDetailedAnalytics(ctx);
                    break;
                    
                case 'settings_notifications':
                    await this.implementations.handleNotificationSettings(ctx);
                    break;
                    
                case 'settings_channels':
                    await this.implementations.handleChannelSettings(ctx);
                    break;
                    
                case 'post_zone_news':
                    await this.implementations.handlePostToZoneNews(ctx);
                    break;
                    
                case 'post_tbc':
                    await this.implementations.handlePostToTBC(ctx);
                    break;
                    
                case 'schedule_post':
                    await this.implementations.handleSchedulePost(ctx);
                    break;
                    
                case 'settings_interface':
                case 'settings_privacy':
                    await ctx.answerCbQuery();
                    const settingType = action.replace('settings_', '');
                    await ctx.reply(
                        `⚙️ **${settingType.charAt(0).toUpperCase() + settingType.slice(1)} Settings**\n\n` +
                        'Configuration options coming soon!',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '🔙 Back to Settings', callback_data: 'user_settings' }]
                                ]
                            }
                        }
                    );
                    break;

                default:
                    await ctx.answerCbQuery('Feature coming soon!');
            }
        } catch (error) {
            console.error('Main menu callback error:', error);
            await ctx.answerCbQuery('❌ Error processing request');
        }
    }
}

module.exports = StartMenuHandler;