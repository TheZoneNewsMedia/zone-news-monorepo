const CommandUtils = require('../utils/command-utils');

class GeneralCallbacks {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.helpSections = {
            'basics': 'Basic Commands',
            'news': 'News Features', 
            'settings': 'Settings & Preferences',
            'advanced': 'Advanced Features'
        };
    }

    /**
     * Register all general callback handlers with specific actions
     */
    register() {
        // How to use actions
        this.bot.action('how_to_use', this.handleHowToUse.bind(this));
        this.bot.action(/^how_to_use:.+$/, this.handleHowToUse.bind(this));
        
        // News coming soon action
        this.bot.action('news_coming_soon', this.handleNewsComingSoon.bind(this));
        
        // Help category actions
        this.bot.action(/^help:category:.+$/, this.handleHelpCategory.bind(this));
        
        // About features action
        this.bot.action('about:features', this.handleAboutFeatures.bind(this));
        
        // Feedback actions
        this.bot.action('feedback:submit', this.handleFeedback.bind(this));
        this.bot.action('feedback:compose', this.handleFeedback.bind(this));
        this.bot.action('feedback:rate', this.handleFeedback.bind(this));
        this.bot.action('feedback:bug', this.handleFeedback.bind(this));
        
        // Notification actions
        this.bot.action(/^notify:.+$/, this.handleNotificationRequest.bind(this));
        
        // Stats and updates actions
        this.bot.action('stats:general', this.handleBotStats.bind(this));
        this.bot.action('updates:check', this.handleCheckUpdates.bind(this));
        
        // Admin actions
        this.bot.action(/^admin:.+$/, this.handleAdminCallback.bind(this));
        
        // Main menu action
        this.bot.action('main_menu', this.handleMainMenu.bind(this));
    }

    /**
     * Handle how to use callbacks
     */
    async handleHowToUse(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('how_to_use')) return;

        try {
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'how_to_use');

            if (data === 'how_to_use') {
                await this.showHowToUseMenu(callbackQuery);
            } else {
                const section = data.split(':')[1];
                await this.showHowToUseSection(callbackQuery, section);
            }

        } catch (error) {
            console.error('How to use error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to load guide',
                show_alert: true
            });
        }
    }

    /**
     * Handle news coming soon callback
     */
    async handleNewsComingSoon(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (data !== 'news_coming_soon') return;

        try {
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'news_coming_soon');

            const message = `🚧 <b>Coming Soon!</b>\n\n` +
                          `This feature is currently being developed and will be available shortly.\n\n` +
                          `📅 Expected release: Within the next update\n\n` +
                          `Stay tuned for:\n` +
                          `• Real-time news updates\n` +
                          `• Custom news categories\n` +
                          `• Breaking news alerts\n` +
                          `• Personalised news feed\n\n` +
                          `Thank you for your patience! 🙏`;

            const keyboard = [
                [{ text: '🔔 Notify Me', callback_data: 'notify:news_ready' }],
                [{ text: '↩️ Back', callback_data: 'main_menu' }]
            ];

            await this.bot.editMessageText(message, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '🚧 Feature coming soon!',
                show_alert: false
            });

        } catch (error) {
            console.error('News coming soon error:', error);
            await CommandUtils.handleError({ from, callbackQuery }, error);
        }
    }

    /**
     * Handle help category callbacks
     */
    async handleHelpCategory(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('help:category:')) return;

        try {
            const category = data.split(':')[2];
            
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'help_category', { category });

            const helpContent = this.getHelpContent(category);
            
            if (!helpContent) {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Help section not found',
                    show_alert: true
                });
                return;
            }

            const keyboard = [
                [{ text: '📚 All Help Topics', callback_data: 'help:category:all' }],
                [{ text: '↩️ Back to Menu', callback_data: 'main_menu' }]
            ];

            await this.bot.editMessageText(helpContent, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard },
                disable_web_page_preview: true
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: `📖 ${this.helpSections[category] || 'Help'}`,
                show_alert: false
            });

        } catch (error) {
            console.error('Help category error:', error);
            await CommandUtils.handleError({ from, callbackQuery }, error);
        }
    }

    /**
     * Handle about features callback
     */
    async handleAboutFeatures(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (data !== 'about:features') return;

        try {
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'about_features');

            const featuresText = `🤖 <b>Zone News Bot Features</b>\n\n` +
                               `📰 <b>News Feed</b>\n` +
                               `• Latest Adelaide news updates\n` +
                               `• Multiple news categories\n` +
                               `• Search and filter articles\n\n` +
                               
                               `⚙️ <b>Personalisation</b>\n` +
                               `• Custom notification settings\n` +
                               `• Language preferences\n` +
                               `• Timezone configuration\n\n` +
                               
                               `🔍 <b>Smart Features</b>\n` +
                               `• Article summarisation\n` +
                               `• Save articles for later\n` +
                               `• Share with others\n\n` +
                               
                               `🎯 <b>Upcoming Features</b>\n` +
                               `• Breaking news alerts\n` +
                               `• Weather integration\n` +
                               `• Community discussions\n` +
                               `• Premium subscriptions\n\n` +
                               
                               `Made with ❤️ for Adelaide`;

            const keyboard = [
                [
                    { text: '📊 Bot Stats', callback_data: 'stats:general' },
                    { text: '🔄 Check Updates', callback_data: 'updates:check' }
                ],
                [
                    { text: '💬 Send Feedback', callback_data: 'feedback:submit' }
                ],
                [
                    { text: '↩️ Back', callback_data: 'main_menu' }
                ]
            ];

            await this.bot.editMessageText(featuresText, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '✨ Bot features overview',
                show_alert: false
            });

        } catch (error) {
            console.error('About features error:', error);
            await CommandUtils.handleError({ from, callbackQuery }, error);
        }
    }

    /**
     * Handle feedback submission callback
     */
    async handleFeedback(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (data !== 'feedback:submit') return;

        try {
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'feedback_submit');

            const feedbackText = `💬 <b>Send Your Feedback</b>\n\n` +
                               `We value your input! Help us improve the Zone News Bot.\n\n` +
                               `<b>How to send feedback:</b>\n` +
                               `1. Click "Write Feedback" below\n` +
                               `2. Send us a message describing:\n` +
                               `   • What you like\n` +
                               `   • What could be better\n` +
                               `   • Feature requests\n` +
                               `   • Bug reports\n\n` +
                               `Your feedback helps make this bot better for everyone! 🚀`;

            const keyboard = [
                [{ text: '✍️ Write Feedback', callback_data: 'feedback:compose' }],
                [
                    { text: '⭐ Rate Bot', callback_data: 'feedback:rate' },
                    { text: '🐛 Report Bug', callback_data: 'feedback:bug' }
                ],
                [{ text: '↩️ Back', callback_data: 'about:features' }]
            ];

            await this.bot.editMessageText(feedbackText, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '💬 Ready to receive your feedback!',
                show_alert: false
            });

        } catch (error) {
            console.error('Feedback error:', error);
            await CommandUtils.handleError({ from, callbackQuery }, error);
        }
    }

    /**
     * Handle admin-specific callbacks
     */
    async handleAdminCallback(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('admin:')) return;

        try {
            const isAdmin = await CommandUtils.isAdmin({ from }, this.db);
            
            if (!isAdmin) {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '🚫 Admin access required',
                    show_alert: true
                });
                return;
            }

            const action = data.split(':')[1];
            
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'admin_action', { action });

            switch (action) {
                case 'stats':
                    await this.showAdminStats(callbackQuery);
                    break;
                case 'broadcast':
                    await this.showBroadcastMenu(callbackQuery);
                    break;
                case 'users':
                    await this.showUserManagement(callbackQuery);
                    break;
                case 'logs':
                    await this.showSystemLogs(callbackQuery);
                    break;
                default:
                    await this.bot.answerCallbackQuery(callbackQuery.id, {
                        text: '❌ Unknown admin action',
                        show_alert: true
                    });
            }

        } catch (error) {
            console.error('Admin callback error:', error);
            await CommandUtils.handleError({ from, callbackQuery }, error);
        }
    }

    /**
     * Show how to use menu
     */
    async showHowToUseMenu(callbackQuery) {
        const menuText = `📚 <b>How to Use Zone News Bot</b>\n\n` +
                        `Select a topic below to learn more about using the bot effectively:\n\n` +
                        `Choose from the categories below:`;

        const keyboard = [
            [
                { text: '🔰 Basics', callback_data: 'how_to_use:basics' },
                { text: '📰 News', callback_data: 'how_to_use:news' }
            ],
            [
                { text: '⚙️ Settings', callback_data: 'how_to_use:settings' },
                { text: '🚀 Advanced', callback_data: 'how_to_use:advanced' }
            ],
            [
                { text: '❓ FAQ', callback_data: 'how_to_use:faq' }
            ],
            [
                { text: '↩️ Back', callback_data: 'main_menu' }
            ]
        ];

        await this.bot.editMessageText(menuText, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    /**
     * Show specific how to use section
     */
    async showHowToUseSection(callbackQuery, section) {
        const content = this.getHowToUseContent(section);
        
        const keyboard = [
            [{ text: '📚 All Topics', callback_data: 'how_to_use' }],
            [{ text: '↩️ Back to Menu', callback_data: 'main_menu' }]
        ];

        await this.bot.editMessageText(content, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });

        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: `📖 ${this.helpSections[section] || 'Guide'}`,
            show_alert: false
        });
    }

    /**
     * Get how to use content for specific section
     */
    getHowToUseContent(section) {
        const content = {
            'basics': `🔰 <b>Basic Commands</b>\n\n` +
                     `<b>Getting Started:</b>\n` +
                     `• /start - Start the bot\n` +
                     `• /help - Show help menu\n` +
                     `• /news - Get latest news\n` +
                     `• /settings - Configure preferences\n\n` +
                     
                     `<b>Navigation:</b>\n` +
                     `• Use inline buttons to navigate\n` +
                     `• Press ↩️ Back to return\n` +
                     `• Main menu is always accessible\n\n` +
                     
                     `<b>Quick Tips:</b>\n` +
                     `• Bot remembers your preferences\n` +
                     `• Use /cancel to stop any operation\n` +
                     `• Type /status to check bot health`,

            'news': `📰 <b>News Features</b>\n\n` +
                   `<b>Reading News:</b>\n` +
                   `• Browse latest articles\n` +
                   `• Use pagination to see more\n` +
                   `• Click "Read More" for full articles\n\n` +
                   
                   `<b>Filtering:</b>\n` +
                   `• Select specific categories\n` +
                   `• Use search function\n` +
                   `• Save articles for later\n\n` +
                   
                   `<b>Engagement:</b>\n` +
                   `• React with emoji\n` +
                   `• Share interesting articles\n` +
                   `• Track your reading history`,

            'settings': `⚙️ <b>Settings & Preferences</b>\n\n` +
                       `<b>Notifications:</b>\n` +
                       `• Enable/disable news alerts\n` +
                       `• Choose notification frequency\n` +
                       `• Set quiet hours\n\n` +
                       
                       `<b>Personalisation:</b>\n` +
                       `• Select preferred language\n` +
                       `• Set your timezone\n` +
                       `• Choose news categories\n\n` +
                       
                       `<b>Advanced Options:</b>\n` +
                       `• Export your data\n` +
                       `• Reset to defaults\n` +
                       `• Manage subscriptions`,

            'advanced': `🚀 <b>Advanced Features</b>\n\n` +
                       `<b>Power User Tips:</b>\n` +
                       `• Use keyboard shortcuts\n` +
                       `• Set up automatic searches\n` +
                       `• Create custom alerts\n\n` +
                       
                       `<b>Integration:</b>\n` +
                       `• Connect with other apps\n` +
                       `• Export to reading apps\n` +
                       `• Share to social media\n\n` +
                       
                       `<b>Analytics:</b>\n` +
                       `• View your reading stats\n` +
                       `• Track news preferences\n` +
                       `• See trending topics`,

            'faq': `❓ <b>Frequently Asked Questions</b>\n\n` +
                  `<b>Q: Is the bot free to use?</b>\n` +
                  `A: Yes! Basic features are completely free.\n\n` +
                  
                  `<b>Q: How often is news updated?</b>\n` +
                  `A: News is updated every 15-30 minutes.\n\n` +
                  
                  `<b>Q: Can I suggest new features?</b>\n` +
                  `A: Absolutely! Use the feedback option.\n\n` +
                  
                  `<b>Q: Is my data secure?</b>\n` +
                  `A: Yes, we follow strict privacy policies.\n\n` +
                  
                  `<b>Q: How do I report issues?</b>\n` +
                  `A: Use /support or the feedback feature.`
        };

        return content[section] || 'Content not available';
    }

    /**
     * Get help content for categories
     */
    getHelpContent(category) {
        return this.getHowToUseContent(category);
    }

    /**
     * Show admin statistics (admin only)
     */
    async showAdminStats(callbackQuery) {
        const stats = await this.getSystemStats();
        
        const statsText = `📊 <b>Admin Statistics</b>\n\n` +
                         `👥 <b>Users:</b> ${stats.totalUsers}\n` +
                         `📰 <b>Articles:</b> ${stats.totalArticles}\n` +
                         `💬 <b>Commands Today:</b> ${stats.commandsToday}\n` +
                         `🔄 <b>Active Sessions:</b> ${stats.activeSessions}\n` +
                         `📈 <b>Growth Rate:</b> ${stats.growthRate}%\n\n` +
                         `<i>Last updated: ${new Date().toLocaleString()}</i>`;

        const keyboard = [
            [
                { text: '📈 Detailed Stats', callback_data: 'admin:detailed_stats' },
                { text: '📋 Export Data', callback_data: 'admin:export' }
            ],
            [{ text: '↩️ Back', callback_data: 'admin:menu' }]
        ];

        await this.bot.editMessageText(statsText, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    /**
     * Get system statistics
     */
    async getSystemStats() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const [totalUsers, totalArticles, commandsToday] = await Promise.all([
                this.db.collection('users').countDocuments(),
                this.db.collection('articles').countDocuments(),
                this.db.collection('command_usage').countDocuments({ 
                    timestamp: { $gte: new Date(today) }
                })
            ]);

            return {
                totalUsers,
                totalArticles,
                commandsToday,
                activeSessions: this.processingUsers?.size || 0,
                growthRate: 12.5 // Mock growth rate
            };
        } catch (error) {
            console.error('Error fetching stats:', error);
            return {
                totalUsers: 0,
                totalArticles: 0,
                commandsToday: 0,
                activeSessions: 0,
                growthRate: 0
            };
        }
    }

    /**
     * Show broadcast menu (admin only)
     */
    async showBroadcastMenu(callbackQuery) {
        const broadcastText = `📢 <b>Broadcast Message</b>\n\n` +
                             `Send a message to all bot users.\n\n` +
                             `<b>Warning:</b> Use responsibly. Mass messages should be:\n` +
                             `• Important announcements\n` +
                             `• Feature updates\n` +
                             `• Critical information only`;

        const keyboard = [
            [{ text: '✍️ Compose Message', callback_data: 'admin:compose_broadcast' }],
            [{ text: '📋 Message Templates', callback_data: 'admin:broadcast_templates' }],
            [{ text: '↩️ Back', callback_data: 'admin:menu' }]
        ];

        await this.bot.editMessageText(broadcastText, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    /**
     * Show user management (admin only)
     */
    async showUserManagement(callbackQuery) {
        const managementText = `👥 <b>User Management</b>\n\n` +
                              `Manage bot users and their permissions.\n\n` +
                              `Available actions:`;

        const keyboard = [
            [
                { text: '👤 User Lookup', callback_data: 'admin:user_lookup' },
                { text: '🚫 Ban User', callback_data: 'admin:ban_user' }
            ],
            [
                { text: '📊 User Analytics', callback_data: 'admin:user_analytics' },
                { text: '📧 Export Users', callback_data: 'admin:export_users' }
            ],
            [{ text: '↩️ Back', callback_data: 'admin:menu' }]
        ];

        await this.bot.editMessageText(managementText, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    /**
     * Show system logs (admin only)
     */
    async showSystemLogs(callbackQuery) {
        const logsText = `📋 <b>System Logs</b>\n\n` +
                        `View system activity and error logs.\n\n` +
                        `Select log type to view:`;

        const keyboard = [
            [
                { text: '⚠️ Error Logs', callback_data: 'admin:logs:errors' },
                { text: '📈 Activity Logs', callback_data: 'admin:logs:activity' }
            ],
            [
                { text: '🔧 System Logs', callback_data: 'admin:logs:system' },
                { text: '💾 Database Logs', callback_data: 'admin:logs:database' }
            ],
            [{ text: '↩️ Back', callback_data: 'admin:menu' }]
        ];

        await this.bot.editMessageText(logsText, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    /**
     * Handle notification request callbacks
     */
    async handleNotificationRequest(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        try {
            const notificationType = data.split(':')[1];
            
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'notification_request', { type: notificationType });
            
            // Save notification preference
            await this.db.collection('notification_requests').insertOne({
                userId: from.id,
                type: notificationType,
                requestedAt: new Date(),
                status: 'active'
            });
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '🔔 You\'ll be notified when this feature is ready!',
                show_alert: false
            });
            
        } catch (error) {
            console.error('Notification request error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to save notification request',
                show_alert: true
            });
        }
    }

    /**
     * Handle bot statistics display
     */
    async handleBotStats(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { from } = callbackQuery;
        
        try {
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'bot_stats');
            
            const stats = await this.getSystemStats();
            
            const statsText = `📊 <b>Bot Statistics</b>\n\n` +
                             `👥 <b>Total Users:</b> ${stats.totalUsers}\n` +
                             `📰 <b>Articles Available:</b> ${stats.totalArticles}\n` +
                             `💬 <b>Commands Today:</b> ${stats.commandsToday}\n` +
                             `🕐 <b>Uptime:</b> ${this.getUptime()}\n\n` +
                             `<i>Statistics updated in real-time</i>`;

            const keyboard = [
                [{ text: '📈 Detailed Stats', callback_data: 'stats:detailed' }],
                [{ text: '↩️ Back', callback_data: 'about:features' }]
            ];

            await this.bot.editMessageText(statsText, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '📊 Bot statistics loaded',
                show_alert: false
            });
            
        } catch (error) {
            console.error('Bot stats error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to load statistics',
                show_alert: true
            });
        }
    }

    /**
     * Handle check for updates
     */
    async handleCheckUpdates(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { from } = callbackQuery;
        
        try {
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'check_updates');
            
            const updateInfo = {
                version: '2.1.0',
                lastUpdate: new Date('2024-01-15').toLocaleDateString(),
                features: [
                    '✨ Improved news categorization',
                    '🔔 Better notification system',
                    '🐛 Bug fixes and optimizations'
                ]
            };
            
            const updatesText = `🔄 <b>Bot Updates</b>\n\n` +
                               `📱 <b>Current Version:</b> ${updateInfo.version}\n` +
                               `📅 <b>Last Update:</b> ${updateInfo.lastUpdate}\n\n` +
                               `<b>Recent Changes:</b>\n` +
                               updateInfo.features.map(feature => `• ${feature}`).join('\n') +
                               `\n\n<i>The bot is automatically updated with the latest features!</i>`;

            const keyboard = [
                [{ text: '📋 View Changelog', callback_data: 'updates:changelog' }],
                [{ text: '↩️ Back', callback_data: 'about:features' }]
            ];

            await this.bot.editMessageText(updatesText, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '✅ Bot is up to date!',
                show_alert: false
            });
            
        } catch (error) {
            console.error('Check updates error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to check for updates',
                show_alert: true
            });
        }
    }

    /**
     * Handle main menu navigation
     */
    async handleMainMenu(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { from } = callbackQuery;
        
        try {
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'main_menu');
            
            const welcomeText = `🤖 <b>Zone News Bot</b>\n\n` +
                               `Welcome back! What would you like to do?\n\n` +
                               `📰 Get the latest Adelaide news\n` +
                               `⚙️ Configure your preferences\n` +
                               `📚 Learn how to use the bot`;

            const keyboard = [
                [
                    { text: '📰 Latest News', callback_data: 'news:page:1' },
                    { text: '🔥 Trending', callback_data: 'trending:more' }
                ],
                [
                    { text: '⚙️ Settings', callback_data: 'settings:menu' },
                    { text: '🔍 Search', callback_data: 'search:refine:' }
                ],
                [
                    { text: '📚 How to Use', callback_data: 'how_to_use' },
                    { text: '💡 About', callback_data: 'about:features' }
                ],
                [
                    { text: '💾 Saved Articles', callback_data: 'saved:articles' }
                ]
            ];

            await this.bot.editMessageText(welcomeText, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '🏠 Back to main menu',
                show_alert: false
            });
            
        } catch (error) {
            console.error('Main menu error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to load main menu',
                show_alert: true
            });
        }
    }

    /**
     * Get bot uptime string
     */
    getUptime() {
        if (!this.startTime) {
            this.startTime = new Date();
        }
        
        const uptime = Date.now() - this.startTime.getTime();
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}h ${minutes}m`;
    }
}

module.exports = GeneralCallbacks;