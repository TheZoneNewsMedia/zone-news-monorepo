/**
 * Start Menu Handler - Simplified version without database queries
 */

const HandlerImplementations = require('./handler-implementations');

class StartMenuHandler {
    constructor(bot, db, services) {
        this.bot = bot;
        this.db = db;
        this.services = services;
        this.implementations = new HandlerImplementations(bot, db, services);
    }

    setupStartCommand() {
        this.bot.command('start', async (ctx) => {
            try {
                const userId = ctx.from.id;
                const username = ctx.from.username || ctx.from.first_name || 'User';

                // Track user stats if available
                if (this.services && this.services.stats) {
                    try {
                        await this.services.stats.trackUser({
                            userId: userId,
                            username: username,
                            firstName: ctx.from.first_name,
                            lastName: ctx.from.last_name,
                            lastActive: new Date()
                        });
                    } catch (err) {
                        console.log('Stats tracking unavailable:', err.message);
                    }
                }

                await this.showMainMenu(ctx);
            } catch (error) {
                console.error('Start command error:', error);
                await ctx.reply('Welcome! Something went wrong, but I am still here to help.');
            }
        });
    }

    async showMainMenu(ctx) {
        const username = ctx.from.username || ctx.from.first_name || 'User';
        const welcomeMessage = this.createSimpleWelcomeMessage(username);
        const keyboard = this.createMainKeyboard();

        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(welcomeMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (err) {
                await ctx.reply(welcomeMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        } else {
            await ctx.reply(welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    }

    createSimpleWelcomeMessage(username) {
        return `🌟 *Welcome to Zone News Bot, ${username}!*

📰 Your Complete News Management Platform

*Quick Actions:*
• 📝 Create and manage articles
• 🔗 Submit articles via link
• 🚀 Post to @ZoneNewsAdl
• 📊 Track performance
• 🔔 Manage notifications

Choose an option below to get started:`.trim();
    }

    createMainKeyboard() {
        return {
            inline_keyboard: [
                [
                    { text: '📝 Create Article', callback_data: 'menu_create_article' },
                    { text: '📰 My Articles', callback_data: 'menu_my_articles' }
                ],
                [
                    { text: '🚀 Post to Channel', callback_data: 'menu_post_channel' },
                    { text: '📊 Analytics', callback_data: 'menu_analytics' }
                ],
                [
                    { text: '🔔 Notifications', callback_data: 'menu_notifications' },
                    { text: '⚙️ Settings', callback_data: 'menu_settings' }
                ],
                [
                    { text: 'ℹ️ Help', callback_data: 'menu_help' }
                ]
            ]
        };
    }

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