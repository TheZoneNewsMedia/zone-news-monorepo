/**
 * Info Commands Module
 * Handles informational commands: help, about, feedback, report
 * 
 * @module InfoCommands
 */

const { Markup } = require('telegraf');
const CommandUtils = require('../utils/command-utils');

class InfoCommands {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
    }

    /**
     * Register all info commands with the bot
     */
    register() {
        // Register main info commands
        this.bot.command('start', this.start.bind(this));
        this.bot.command('help', this.help.bind(this));
        this.bot.command('about', this.about.bind(this));
        this.bot.command('feedback', this.feedback.bind(this));
        this.bot.command('report', this.report.bind(this));
        
        // Register callback queries for interactive features
        this.bot.action(/^help:(.+)$/, (ctx) => {
            const categoryId = ctx.match[1];
            if (categoryId === 'main') {
                return this.help(ctx);
            } else if (categoryId === 'support') {
                return this.feedback(ctx);
            } else {
                return this.showHelpCategory(ctx, categoryId);
            }
        });
        
        this.bot.action(/^feedback:(.+)$/, (ctx) => {
            const category = ctx.match[1];
            if (category === 'start') {
                return this.feedback(ctx);
            } else {
                return this.feedback(ctx, category);
            }
        });
        
        this.bot.action(/^report:(.+)$/, (ctx) => {
            const type = ctx.match[1];
            if (type === 'start') {
                return this.report(ctx);
            } else {
                return this.report(ctx, type);
            }
        });

        // Register start command callback handlers
        this.bot.action('start', this.start.bind(this));
        this.bot.action('news_latest', this.handleNewsLatest.bind(this));
        this.bot.action('how_to_use', this.handleHowToUse.bind(this));
        this.bot.action('info_about', this.about.bind(this));
        this.bot.action('admin_panel', this.handleAdminPanel.bind(this));
    }

    /**
     * Start Command - Welcome message and main menu
     */
    async start(ctx) {
        console.log('🚀 Start command triggered');
        try {
            console.log('  Tracking user...');
            await CommandUtils.trackUser(ctx, this.db);
            console.log('  Logging command...');
            await CommandUtils.logCommand(ctx, this.db, 'start');
            
            const firstName = ctx.from.first_name || 'there';
            const isAdmin = await CommandUtils.isAdmin(ctx, this.db);
            const botUsername = process.env.BOT_USERNAME || 'ZoneNewsBot';
            const miniAppUrl = process.env.MINI_APP_URL || 'http://67.219.107.230/telegram-mini-app';
            
            const message = 
                `👋 Welcome ${firstName}!\n\n` +
                `🏙️ *Zone News Bot* - Adelaide's Premier News Companion\n\n` +
                `📰 Get the latest Adelaide and South Australia news\n` +
                `🔍 Smart search across all articles\n` +
                `📱 Interactive mini-app experience\n` +
                `⚡ Real-time updates and notifications\n` +
                `💬 Engage with reactions and sharing\n\n` +
                `Choose an option below to get started:`;

            console.log('  Building keyboard...');
            
            // Use raw JSON structure directly (more reliable)
            const keyboard = [
                [
                    { text: '➕ Channel management ', url: `https://t.me/${botUsername}?startchannel&admin=post_messages+edit_messages+delete_messages` },
                    { text: '👥 Group management', url: `https://t.me/${botUsername}?startgroup` }
                ],
                [
                    { text: '📰 Latest News', callback_data: 'news_latest' },
                    { text: '📱 Mini App', web_app: { url: miniAppUrl } }
                ],
                [
                    { text: '❓ How to Use', callback_data: 'how_to_use' },
                    { text: 'ℹ️ About', callback_data: 'info_about' }
                ]
            ];

            // Add admin panel button if user is admin
            if (isAdmin) {
                keyboard.push([
                    { text: '👑 Admin Panel', callback_data: 'admin_panel' }
                ]);
            }

            console.log('  Sending response with buttons...');
            
            // Use raw JSON structure for inline keyboard
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            console.log('  ✅ Start command completed');

        } catch (error) {
            console.error('❌ Start command error:', error);
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Help Command - Comprehensive categorized help with navigation
     */
    async help(ctx) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'help');
            
            const isAdmin = await CommandUtils.isAdmin(ctx, this.db);
            const categories = this.getHelpCategories(isAdmin);
            
            const message = 
                `❓ *Zone News Bot Help*\n\n` +
                `Welcome to your Adelaide news companion! Here's what I can do:\n\n` +
                `Choose a category below to explore commands:`;

            // Use raw JSON structure instead of Markup helper
            const keyboard = categories.map(cat => [
                { text: `${cat.emoji} ${cat.name}`, callback_data: `help:${cat.id}` }
            ]);

            keyboard.push([
                { text: '🔄 Refresh', callback_data: 'help:main' },
                { text: '💬 Support', callback_data: 'help:support' }
            ]);

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Show specific help category
     */
    async showHelpCategory(ctx, categoryId) {
        try {
            const isAdmin = await CommandUtils.isAdmin(ctx, this.db);
            const category = this.getHelpCategory(categoryId, isAdmin);
            
            if (!category) {
                return this.help(ctx);
            }

            let message = `${category.emoji} *${category.name} Commands*\n\n`;
            
            category.commands.forEach(cmd => {
                message += `${cmd.command} - ${cmd.description}\n`;
            });

            message += `\n💡 Tip: ${category.tip}`;

            const keyboard = [
                [Markup.button.callback('↩️ Back to Help', 'help:main')],
                [Markup.button.callback('📞 Contact Support', 'help:support')]
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
     * About Command - Bot information and statistics
     */
    async about(ctx) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'about');
            
            const stats = await this.getBotStatistics();
            const version = process.env.BOT_VERSION || '2.1.0';
            const uptime = this.formatUptime(process.uptime());
            
            const message = 
                `ℹ️ *About Zone News Bot*\n\n` +
                `🏙️ *Adelaide's Premier News Bot*\n` +
                `Bringing you the latest news,Post Reactions, Group and Channal Management and more!\n\n`

                `🚀 *Features:*\n` +
                `• Real-time news updates\n` +
                `• Category-based filtering\n` +
                `• Interactive mini-app\n` +
                `• Smart search functionality\n` +
                `• Engagement tracking\n` +
                `• Multi-group broadcasting\n\n` 

            const keyboard = [
                [
                    Markup.button.callback('📰 Latest News', 'news:latest'),
                    Markup.button.callback('❓ Help', 'help:main')
                ],
                [
                    Markup.button.callback('💬 Feedback', 'feedback:start'),
                    Markup.button.callback('📱 Mini App', 'miniapp:open')
                ]
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
     * Feedback Command - User feedback system
     */
    async feedback(ctx, category = null) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'feedback', { category });
            
            if (!category) {
                const message = 
                    `💬 *Feedback & Suggestions*\n\n` +
                    `We value your input! Help us improve Zone News Bot by sharing your thoughts.\n\n` +
                    `What type of feedback would you like to provide?`;

                const keyboard = [
                    [
                        Markup.button.callback('🐛 Report Bug', 'feedback:bug'),
                        Markup.button.callback('💡 Feature Request', 'feedback:feature')
                    ],
                    [
                        Markup.button.callback('⭐ General Feedback', 'feedback:general'),
                        Markup.button.callback('📈 Performance', 'feedback:performance')
                    ],
                    [
                        Markup.button.callback('📝 View My Feedback', 'feedback:history'),
                        Markup.button.callback('↩️ Back', 'help:main')
                    ]
                ];

                return CommandUtils.editOrReply(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard(keyboard)
                });
            }

            // Show feedback form for specific category
            const categoryInfo = this.getFeedbackCategory(category);
            
            const message = 
                `${categoryInfo.emoji} *${categoryInfo.name}*\n\n` +
                `${categoryInfo.description}\n\n` +
                `Please send your message and I'll record it with your user ID for follow-up.\n\n` +
                `📝 *What to include:*\n${categoryInfo.tips.join('\n')}\n\n` +
                `Type your feedback message or use the button below to cancel:`;

            const keyboard = [
                [Markup.button.callback('❌ Cancel', 'feedback:start')]
            ];

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });

            // Set user state for feedback collection
            await this.setUserState(ctx.from.id, 'awaiting_feedback', { category });

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Handle incoming feedback message
     */
    async handleFeedbackMessage(ctx, category) {
        try {
            const message = ctx.message.text;
            const feedbackId = CommandUtils.generateId(8);
            
            const feedbackEntry = {
                feedback_id: feedbackId,
                user_id: ctx.from.id,
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                category,
                message,
                status: 'open',
                created_at: new Date(),
                chat_id: ctx.chat.id
            };

            await this.db.collection('feedback').insertOne(feedbackEntry);
            
            // Clear user state
            await this.clearUserState(ctx.from.id);
            
            const categoryInfo = this.getFeedbackCategory(category);
            const response = 
                `✅ *Feedback Received*\n\n` +
                `Thank you for your ${categoryInfo.name.toLowerCase()}!\n\n` +
                `🎫 Tracking ID: \`${feedbackId}\`\n` +
                `📂 Category: ${categoryInfo.name}\n` +
                `📅 Submitted: ${new Date().toLocaleDateString('en-AU')}\n\n` +
                `Your feedback has been recorded and our team will review it. We may follow up if additional information is needed.\n\n` +
                `You can reference this feedback using the tracking ID above.`;

            const keyboard = [
                [
                    Markup.button.callback('📝 Submit More', 'feedback:start'),
                    Markup.button.callback('📋 My Feedback', 'feedback:history')
                ],
                [Markup.button.callback('↩️ Main Menu', 'start')]
            ];

            await ctx.reply(response, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });

            // Notify admins about new feedback
            await this.notifyAdminsAboutFeedback(feedbackEntry);

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Report Command - Issue reporting with tracking
     */
    async report(ctx, type = null) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'report', { type });

            if (!type) {
                const message = 
                    `🚨 *Issue Reporting*\n\n` +
                    `Found a problem? Report it here and get a tracking number for follow-up.\n\n` +
                    `What type of issue are you experiencing?`;

                const keyboard = [
                    [
                        Markup.button.callback('❌ Service Down', 'report:outage'),
                        Markup.button.callback('⚠️ Error/Bug', 'report:error')
                    ],
                    [
                        Markup.button.callback('🐌 Slow Performance', 'report:performance'),
                        Markup.button.callback('❓ Content Issue', 'report:content')
                    ],
                    [
                        Markup.button.callback('🔒 Security Concern', 'report:security'),
                        Markup.button.callback('📱 Mini App Issue', 'report:miniapp')
                    ],
                    [
                        Markup.button.callback('🎫 My Reports', 'report:history'),
                        Markup.button.callback('↩️ Back', 'help:main')
                    ]
                ];

                return CommandUtils.editOrReply(ctx, message, {
                    parse_mode: 'Markdown',
                    reply_markup: Markup.inlineKeyboard(keyboard)
                });
            }

            const reportInfo = this.getReportType(type);
            const ticketId = this.generateTicketId();
            
            const message = 
                `${reportInfo.emoji} *${reportInfo.name}*\n\n` +
                `🎫 Ticket ID: \`${ticketId}\`\n` +
                `⚡ Priority: ${reportInfo.priority}\n\n` +
                `${reportInfo.description}\n\n` +
                `📝 *Please provide:*\n${reportInfo.requirements.join('\n')}\n\n` +
                `Type your detailed report or use the button below to cancel:`;

            const keyboard = [
                [Markup.button.callback('❌ Cancel', 'report:start')]
            ];

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });

            // Set user state for report collection
            await this.setUserState(ctx.from.id, 'awaiting_report', { type, ticketId });

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Handle incoming report message
     */
    async handleReportMessage(ctx, reportData) {
        try {
            const message = ctx.message.text;
            const { type, ticketId } = reportData;
            const reportInfo = this.getReportType(type);
            
            const reportEntry = {
                ticket_id: ticketId,
                user_id: ctx.from.id,
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                type,
                priority: reportInfo.priority,
                message,
                status: 'open',
                created_at: new Date(),
                chat_id: ctx.chat.id,
                metadata: {
                    bot_version: process.env.BOT_VERSION || '2.1.0',
                    timestamp: Date.now()
                }
            };

            await this.db.collection('reports').insertOne(reportEntry);
            
            // Clear user state
            await this.clearUserState(ctx.from.id);
            
            const response = 
                `✅ *Report Submitted*\n\n` +
                `Your ${reportInfo.name.toLowerCase()} has been recorded.\n\n` +
                `🎫 Ticket ID: \`${ticketId}\`\n` +
                `📂 Type: ${reportInfo.name}\n` +
                `⚡ Priority: ${reportInfo.priority}\n` +
                `📅 Submitted: ${new Date().toLocaleDateString('en-AU')}\n\n` +
                `${reportInfo.followUp}\n\n` +
                `Keep your ticket ID for reference. You'll be notified of any updates.`;

            const keyboard = [
                [
                    Markup.button.callback('🚨 Submit Another', 'report:start'),
                    Markup.button.callback('🎫 My Reports', 'report:history')
                ],
                [Markup.button.callback('↩️ Main Menu', 'start')]
            ];

            await ctx.reply(response, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });

            // Notify admins about new report
            await this.notifyAdminsAboutReport(reportEntry);

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Start Command Callback Handlers
     */

    /**
     * Handle "Latest News" button callback
     */
    async handleNewsLatest(ctx) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'news_latest');
            
            const message = 
                `📰 *Latest News*\n\n` +
                `Loading the most recent Adelaide and South Australia news articles...\n\n` +
                `Please wait while I fetch the latest stories for you.`;

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Back to Menu', 'start')]
                ])
            });

            // This would typically call the news service to display articles
            // For now, just acknowledge the request
            
        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Handle "How to Use" button callback
     */
    async handleHowToUse(ctx) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'how_to_use');
            
            const message = 
                `❓ *How to Use Zone News Bot*\n\n` +
                `🏁 *Getting Started:*\n` +
                `• Use /start to access the main menu\n` +
                `• Browse latest news with the news button\n` +
                `• Try our interactive mini-app\n\n` +
                `📰 *News Features:*\n` +
                `• Latest Adelaide & SA news articles\n` +
                `• Search by keywords or topics\n` +
                `• Filter by categories\n` +
                `• React with emoji to articles\n\n` +
                `👥 *Group Features:*\n` +
                `• Add bot to your channel or group\n` +
                `• Automatic news posting\n` +
                `• Shared engagement tracking\n\n` +
                `📱 *Mini App:*\n` +
                `• Full featured web interface\n` +
                `• Enhanced browsing experience\n` +
                `• Save articles for later\n\n` +
                `⚙️ *Settings:*\n` +
                `• Customise news categories\n` +
                `• Set notification preferences\n` +
                `• Manage your profile\n\n` +
                `Need more help? Use /help for detailed command information.`;

            const keyboard = [
                [
                    Markup.button.callback('📰 Try Latest News', 'news_latest'),
                    Markup.button.callback('❓ Detailed Help', 'help:main')
                ],
                [Markup.button.callback('↩️ Back to Menu', 'start')]
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
     * Handle "Admin Panel" button callback
     */
    async handleAdminPanel(ctx) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'admin_panel');
            
            // Check if user is still admin (double-check)
            const isAdmin = await CommandUtils.isAdmin(ctx, this.db);
            if (!isAdmin) {
                return ctx.answerCbQuery('❌ Access denied: Admin privileges required', { show_alert: true });
            }

            const message = 
                `👑 *Admin Panel*\n\n` +
                `Welcome to the Zone News Bot administration interface.\n\n` +
                `📊 Quick Actions:`;

            const keyboard = [
                [
                    Markup.button.callback('📈 Bot Statistics', 'admin_stats'),
                    Markup.button.callback('👥 User Management', 'admin_users')
                ],
                [
                    Markup.button.callback('📢 Broadcast Message', 'admin_broadcast'),
                    Markup.button.callback('📰 Content Management', 'admin_content')
                ],
                [
                    Markup.button.callback('⚙️ Bot Settings', 'admin_settings'),
                    Markup.button.callback('🔧 System Status', 'admin_system')
                ],
                [Markup.button.callback('↩️ Back to Menu', 'start')]
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
     * Helper Methods
     */

    getHelpCategories(isAdmin) {
        const categories = [
            {
                id: 'basic',
                name: 'Basic Commands',
                emoji: '🏁',
                tip: 'Start with /start to see the main menu and your personalised dashboard.'
            },
            {
                id: 'news',
                name: 'News & Search',
                emoji: '📰',
                tip: 'Use categories to filter news and search for specific topics.'
            },
            {
                id: 'settings',
                name: 'Settings & Profile',
                emoji: '⚙️',
                tip: 'Customise your news preferences and notification settings.'
            }
        ];

        if (isAdmin) {
            categories.push({
                id: 'admin',
                name: 'Admin Commands',
                emoji: '👑',
                tip: 'Admin commands for managing the bot and broadcasting messages.'
            });
        }

        return categories;
    }

    getHelpCategory(categoryId, isAdmin) {
        const categories = {
            basic: {
                emoji: '🏁',
                name: 'Basic Commands',
                commands: [
                    { command: '/start', description: 'Main menu and dashboard' },
                    { command: '/help', description: 'Show this help guide' },
                    { command: '/about', description: 'Bot info and statistics' }
                ],
                tip: 'Use /start anytime to return to the main menu.'
            },
            news: {
                emoji: '📰',
                name: 'News & Search',
                commands: [
                    { command: '/news', description: 'Browse latest news articles' },
                    { command: '/search [query]', description: 'Search news articles' },
                    { command: '/trending', description: 'View trending stories' },
                    { command: '/categories', description: 'Manage news categories' }
                ],
                tip: 'Search supports keywords, phrases, and category filtering.'
            },
            settings: {
                emoji: '⚙️',
                name: 'Settings & Profile',
                commands: [
                    { command: '/settings', description: 'Manage preferences' },
                    { command: '/notifications', description: 'Toggle notifications' },
                    { command: '/city', description: 'Change your city' },
                    { command: '/timezone', description: 'Set timezone' }
                ],
                tip: 'Your settings sync across all chats where you use the bot.'
            }
        };

        if (isAdmin) {
            categories.admin = {
                emoji: '👑',
                name: 'Admin Commands',
                commands: [
                    { command: '/post', description: 'Broadcast to channels' },
                    { command: '/stats', description: 'Bot usage statistics' },
                    { command: '/users', description: 'User management' },
                    { command: '/backup', description: 'System backups' }
                ],
                tip: 'Admin commands require special permissions and are logged.'
            };
        }

        return categories[categoryId];
    }

    getFeedbackCategory(category) {
        const categories = {
            bug: {
                emoji: '🐛',
                name: 'Bug Report',
                description: 'Report technical issues, errors, or unexpected behaviour.',
                tips: [
                    '• What were you trying to do?',
                    '• What happened instead?',
                    '• Any error messages?',
                    '• Steps to reproduce the issue'
                ]
            },
            feature: {
                emoji: '💡',
                name: 'Feature Request',
                description: 'Suggest new features or improvements.',
                tips: [
                    '• Describe the feature clearly',
                    '• Explain how it would help',
                    '• Any examples from other apps?',
                    '• Priority level (nice-to-have vs essential)'
                ]
            },
            general: {
                emoji: '⭐',
                name: 'General Feedback',
                description: 'Share your thoughts about the bot experience.',
                tips: [
                    '• What do you like most?',
                    '• What could be better?',
                    '• Overall rating?',
                    '• Any suggestions?'
                ]
            },
            performance: {
                emoji: '📈',
                name: 'Performance Feedback',
                description: 'Report slow responses or performance issues.',
                tips: [
                    '• Which commands are slow?',
                    '• Time of day when issues occur?',
                    '• Your location/timezone',
                    '• Device type (mobile/desktop)'
                ]
            }
        };

        return categories[category] || categories.general;
    }

    getReportType(type) {
        const types = {
            outage: {
                emoji: '❌',
                name: 'Service Outage',
                priority: 'HIGH',
                description: 'Report when the bot is completely down or unresponsive.',
                requirements: [
                    '• Time when you first noticed the issue',
                    '• Which features are not working?',
                    '• Any error messages received?'
                ],
                followUp: 'High priority reports are reviewed within 1 hour during business hours.'
            },
            error: {
                emoji: '⚠️',
                name: 'Error/Bug',
                priority: 'MEDIUM',
                description: 'Report specific errors, crashes, or bugs.',
                requirements: [
                    '• Command or action that caused the error',
                    '• Exact error message (if any)',
                    '• Steps to reproduce the problem'
                ],
                followUp: 'We will investigate and may contact you for additional details.'
            },
            performance: {
                emoji: '🐌',
                name: 'Performance Issue',
                priority: 'MEDIUM',
                description: 'Report slow responses or timeout issues.',
                requirements: [
                    '• Which commands are slow?',
                    '• Approximate response time',
                    '• Time of day when issues occur'
                ],
                followUp: 'Performance reports help us optimise the service.'
            },
            content: {
                emoji: '❓',
                name: 'Content Issue',
                priority: 'LOW',
                description: 'Report incorrect, missing, or outdated news content.',
                requirements: [
                    '• Link to the problematic article',
                    '• Description of what\'s wrong',
                    '• Correct information (if known)'
                ],
                followUp: 'Content issues are typically resolved within 24 hours.'
            },
            security: {
                emoji: '🔒',
                name: 'Security Concern',
                priority: 'HIGH',
                description: 'Report potential security vulnerabilities.',
                requirements: [
                    '• Description of the security concern',
                    '• Steps to reproduce (if safe)',
                    '• Potential impact assessment'
                ],
                followUp: 'Security reports are treated with high priority and confidentiality.'
            },
            miniapp: {
                emoji: '📱',
                name: 'Mini App Issue',
                priority: 'MEDIUM',
                description: 'Report issues specific to the Mini App interface.',
                requirements: [
                    '• Which section of the Mini App?',
                    '• Your device type and browser',
                    '• Screenshot (if possible)'
                ],
                followUp: 'Mini App issues are forwarded to our frontend team.'
            }
        };

        return types[type] || types.error;
    }

    async getBotStatistics() {
        try {
            const [activeUsers, articlesCount, commandsCount, dailyStats] = await Promise.all([
                this.db.collection('users').countDocuments({ 
                    last_active: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }),
                this.db.collection('articles').countDocuments(),
                this.db.collection('command_usage').countDocuments(),
                this.db.collection('command_usage').countDocuments({
                    timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                })
            ]);

            return {
                activeUsers,
                articlesServed: articlesCount,
                commandsProcessed: commandsCount,
                dailyUpdates: dailyStats
            };
        } catch (error) {
            console.error('Error getting bot statistics:', error);
            return {
                activeUsers: 0,
                articlesServed: 0,
                commandsProcessed: 0,
                dailyUpdates: 0
            };
        }
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    generateTicketId() {
        const prefix = 'ZN';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substr(2, 3).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }

    async setUserState(userId, state, data = {}) {
        await this.db.collection('user_states').updateOne(
            { user_id: userId },
            { $set: { state, data, updated_at: new Date() } },
            { upsert: true }
        );
    }

    async clearUserState(userId) {
        await this.db.collection('user_states').deleteOne({ user_id: userId });
    }

    async notifyAdminsAboutFeedback(feedback) {
        // Implementation would notify admins about new feedback
        console.log('New feedback received:', feedback.feedback_id);
    }

    async notifyAdminsAboutReport(report) {
        // Implementation would notify admins about new reports
        console.log('New report received:', report.ticket_id);
    }
}

module.exports = InfoCommands;