/**
 * Post Commands - Bot command handlers for post management
 */

const { Markup } = require('telegraf');
const { ObjectId } = require('mongodb');

class PostCommands {
    constructor(bot, postManager, db) {
        this.bot = bot;
        this.postManager = postManager;
        this.db = db;
        this.userStates = new Map();
        
        this.registerCommands();
        this.registerCallbacks();
    }
    
    /**
     * Register all post-related commands
     */
    registerCommands() {
        // Main posting commands
        this.bot.command('post', (ctx) => this.handlePostCommand(ctx));
        this.bot.command('schedule', (ctx) => this.handleScheduleCommand(ctx));
        this.bot.command('bulk', (ctx) => this.handleBulkCommand(ctx));
        this.bot.command('template', (ctx) => this.handleTemplateCommand(ctx));
        
        // Analytics and management
        this.bot.command('stats', (ctx) => this.handleStatsCommand(ctx));
        this.bot.command('queue', (ctx) => this.handleQueueCommand(ctx));
        this.bot.command('scheduled', (ctx) => this.handleScheduledCommand(ctx));
        this.bot.command('autopost', (ctx) => this.handleAutoPostCommand(ctx));
        
        // Quick actions
        this.bot.command('repost', (ctx) => this.handleRepostCommand(ctx));
        this.bot.command('cancel', (ctx) => this.handleCancelCommand(ctx));
    }
    
    /**
     * Register callback query handlers
     */
    registerCallbacks() {
        // Post selection callbacks
        this.bot.action(/^select_article:(.+)$/, (ctx) => this.handleArticleSelection(ctx));
        this.bot.action(/^select_dest:(.+)$/, (ctx) => this.handleDestinationSelection(ctx));
        this.bot.action(/^confirm_post:(.+)$/, (ctx) => this.handlePostConfirmation(ctx));
        
        // Template callbacks
        this.bot.action(/^apply_template:(.+)$/, (ctx) => this.handleApplyTemplate(ctx));
        this.bot.action(/^save_template:(.+)$/, (ctx) => this.handleSaveTemplate(ctx));
        
        // Schedule callbacks
        this.bot.action(/^set_schedule:(.+)$/, (ctx) => this.handleSetSchedule(ctx));
        this.bot.action(/^cancel_scheduled:(.+)$/, (ctx) => this.handleCancelScheduled(ctx));
        
        // Auto-post callbacks
        this.bot.action(/^toggle_autopost:(.+)$/, (ctx) => this.handleToggleAutoPost(ctx));
        this.bot.action(/^config_autopost:(.+)$/, (ctx) => this.handleConfigAutoPost(ctx));
    }
    
    // ==================== Main Commands ====================
    
    /**
     * Handle /post command - Interactive post creation
     */
    async handlePostCommand(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Check if user has destinations
            const destinations = await this.db.collection('destinations')
                .find({ user_id: userId, active: true })
                .toArray();
            
            if (destinations.length === 0) {
                return ctx.reply(
                    '📌 No destinations found!\n\n' +
                    'First, add a channel or group where you want to post:\n' +
                    '• /addchannel @channelname\n' +
                    '• /addgroup (use in a group)'
                );
            }
            
            // Get recent articles
            const articles = await this.db.collection('news_articles')
                .find({})
                .sort({ published_date: -1 })
                .limit(10)
                .toArray();
            
            if (articles.length === 0) {
                return ctx.reply('📰 No articles available to post.');
            }
            
            // Create article selection menu
            const keyboard = [];
            articles.forEach((article, index) => {
                const title = article.title.length > 50 ? 
                    article.title.substring(0, 47) + '...' : 
                    article.title;
                keyboard.push([
                    Markup.button.callback(
                        `${index + 1}. ${title}`,
                        `select_article:${article._id}`
                    )
                ]);
            });
            
            keyboard.push([
                Markup.button.callback('❌ Cancel', 'cancel_post')
            ]);
            
            // Store user state
            this.userStates.set(userId, {
                action: 'posting',
                step: 'select_article'
            });
            
            await ctx.reply(
                '📰 *Select an article to post:*\n\n' +
                'Choose from the latest articles below:',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(keyboard)
                }
            );
        } catch (error) {
            console.error('Post command error:', error);
            ctx.reply('❌ Error starting post process. Please try again.');
        }
    }
    
    /**
     * Handle /schedule command - Schedule posts
     */
    async handleScheduleCommand(ctx) {
        try {
            const userId = ctx.from.id;
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length < 1) {
                return ctx.reply(
                    '📅 *Schedule a Post*\n\n' +
                    'Usage: `/schedule HH:MM [date]`\n\n' +
                    'Examples:\n' +
                    '• `/schedule 14:30` - Today at 14:30\n' +
                    '• `/schedule 09:00 tomorrow` - Tomorrow at 09:00\n' +
                    '• `/schedule 18:00 2024-12-25` - Specific date\n\n' +
                    'Or use /post and select schedule option',
                    { parse_mode: 'Markdown' }
                );
            }
            
            // Parse schedule time
            const timeStr = args[0];
            const dateStr = args[1] || 'today';
            
            const scheduleTime = this.parseScheduleTime(timeStr, dateStr);
            if (!scheduleTime) {
                return ctx.reply('❌ Invalid time format. Use HH:MM');
            }
            
            // Store schedule preference and start post flow
            this.userStates.set(userId, {
                action: 'scheduling',
                scheduleTime,
                step: 'select_article'
            });
            
            // Redirect to post flow
            await this.handlePostCommand(ctx);
        } catch (error) {
            console.error('Schedule command error:', error);
            ctx.reply('❌ Error scheduling post. Please try again.');
        }
    }
    
    /**
     * Handle /bulk command - Bulk posting
     */
    async handleBulkCommand(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Get all active destinations
            const destinations = await this.db.collection('destinations')
                .find({ user_id: userId, active: true })
                .toArray();
            
            if (destinations.length < 2) {
                return ctx.reply(
                    '📢 *Bulk Posting*\n\n' +
                    'You need at least 2 active destinations for bulk posting.\n' +
                    'Add more channels/groups first.',
                    { parse_mode: 'Markdown' }
                );
            }
            
            // Store bulk mode
            this.userStates.set(userId, {
                action: 'bulk_posting',
                destinations: destinations.map(d => d._id),
                step: 'select_article'
            });
            
            await ctx.reply(
                `📢 *Bulk Mode Active*\n\n` +
                `Will post to ${destinations.length} destinations:\n` +
                destinations.map(d => `• ${d.name || d.id}`).join('\n') +
                '\n\nNow select an article:',
                { parse_mode: 'Markdown' }
            );
            
            // Redirect to article selection
            await this.handlePostCommand(ctx);
        } catch (error) {
            console.error('Bulk command error:', error);
            ctx.reply('❌ Error starting bulk post. Please try again.');
        }
    }
    
    /**
     * Handle /template command - Template management
     */
    async handleTemplateCommand(ctx) {
        try {
            const userId = ctx.from.id;
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                // Show template menu
                const templates = await this.db.collection('post_templates')
                    .find({ user_id: userId })
                    .toArray();
                
                const keyboard = [];
                
                if (templates.length > 0) {
                    templates.forEach(template => {
                        keyboard.push([
                            Markup.button.callback(
                                `📝 ${template.name}`,
                                `apply_template:${template._id}`
                            )
                        ]);
                    });
                }
                
                keyboard.push([
                    Markup.button.callback('➕ Create New Template', 'create_template'),
                    Markup.button.callback('❌ Cancel', 'cancel')
                ]);
                
                await ctx.reply(
                    '📝 *Post Templates*\n\n' +
                    'Select a template to apply or create a new one:',
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard(keyboard)
                    }
                );
            } else if (args[0] === 'create') {
                // Start template creation
                this.userStates.set(userId, {
                    action: 'creating_template',
                    step: 'enter_name'
                });
                
                await ctx.reply(
                    '📝 *Create Template*\n\n' +
                    'Enter a name for your template:',
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            console.error('Template command error:', error);
            ctx.reply('❌ Error managing templates. Please try again.');
        }
    }
    
    // ==================== Analytics Commands ====================
    
    /**
     * Handle /stats command - Show posting statistics
     */
    async handleStatsCommand(ctx) {
        try {
            const userId = ctx.from.id;
            const args = ctx.message.text.split(' ').slice(1);
            const timeRange = args[0] || 'week';
            
            const stats = await this.postManager.getPostingStats(userId, timeRange);
            
            if (!stats) {
                return ctx.reply('❌ Error fetching statistics.');
            }
            
            let message = `📊 *Posting Statistics (${stats.period})*\n\n`;
            message += `📤 Total Posted: ${stats.total_posted}\n`;
            message += `⏰ Scheduled: ${stats.total_scheduled}\n`;
            message += `❤️ Total Reactions: ${stats.total_reactions}\n`;
            message += `📈 Avg Reactions: ${stats.average_reactions}\n\n`;
            
            if (stats.posting_times?.best_hours?.length > 0) {
                message += '*Best Posting Times:*\n';
                stats.posting_times.best_hours.forEach(hour => {
                    message += `• ${hour.hour}:00 - ${hour.average_reactions} avg reactions\n`;
                });
                message += '\n';
            }
            
            if (stats.top_posts?.length > 0) {
                message += '*Top Performing Posts:*\n';
                stats.top_posts.slice(0, 3).forEach((post, index) => {
                    const reactions = (post.reactions?.like || 0) + 
                                    (post.reactions?.love || 0) + 
                                    (post.reactions?.fire || 0);
                    message += `${index + 1}. ${reactions} reactions\n`;
                });
            }
            
            const keyboard = [
                [
                    Markup.button.callback('📅 Day', 'stats:day'),
                    Markup.button.callback('📅 Week', 'stats:week'),
                    Markup.button.callback('📅 Month', 'stats:month')
                ]
            ];
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            });
        } catch (error) {
            console.error('Stats command error:', error);
            ctx.reply('❌ Error fetching statistics. Please try again.');
        }
    }
    
    /**
     * Handle /queue command - Show posting queue
     */
    async handleQueueCommand(ctx) {
        try {
            const queue = this.postManager.postQueue;
            
            if (queue.length === 0) {
                return ctx.reply('📭 Posting queue is empty.');
            }
            
            let message = `📬 *Posting Queue (${queue.length} items)*\n\n`;
            
            for (let i = 0; i < Math.min(10, queue.length); i++) {
                const item = queue[i];
                message += `${i + 1}. Priority: ${item.priority}\n`;
                message += `   Added: ${new Date(item.added_at).toLocaleTimeString()}\n`;
                if (item.attempts > 0) {
                    message += `   Retries: ${item.attempts}\n`;
                }
                message += '\n';
            }
            
            if (queue.length > 10) {
                message += `... and ${queue.length - 10} more items`;
            }
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Queue command error:', error);
            ctx.reply('❌ Error fetching queue. Please try again.');
        }
    }
    
    /**
     * Handle /scheduled command - Show scheduled posts
     */
    async handleScheduledCommand(ctx) {
        try {
            const userId = ctx.from.id;
            
            const scheduled = await this.db.collection('scheduled_posts')
                .find({
                    scheduled_by: userId,
                    status: 'scheduled'
                })
                .sort({ scheduled_time: 1 })
                .limit(10)
                .toArray();
            
            if (scheduled.length === 0) {
                return ctx.reply('📅 No scheduled posts.');
            }
            
            let message = `📅 *Scheduled Posts (${scheduled.length})*\n\n`;
            const keyboard = [];
            
            for (const post of scheduled) {
                const article = await this.db.collection('news_articles')
                    .findOne({ _id: post.article_id });
                
                const destination = await this.db.collection('destinations')
                    .findOne({ _id: post.destination_id });
                
                const scheduleTime = new Date(post.scheduled_time);
                const title = article?.title?.substring(0, 30) || 'Unknown';
                
                message += `📰 ${title}...\n`;
                message += `📍 ${destination?.name || 'Unknown'}\n`;
                message += `⏰ ${scheduleTime.toLocaleString()}\n\n`;
                
                keyboard.push([
                    Markup.button.callback(
                        `❌ Cancel ${title.substring(0, 20)}`,
                        `cancel_scheduled:${post._id}`
                    )
                ]);
            }
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            });
        } catch (error) {
            console.error('Scheduled command error:', error);
            ctx.reply('❌ Error fetching scheduled posts. Please try again.');
        }
    }
    
    /**
     * Handle /autopost command - Auto-posting configuration
     */
    async handleAutoPostCommand(ctx) {
        try {
            const userId = ctx.from.id;
            
            const autoPosts = await this.db.collection('auto_posting')
                .find({ user_id: userId })
                .toArray();
            
            if (autoPosts.length === 0) {
                const destinations = await this.db.collection('destinations')
                    .find({ user_id: userId, active: true })
                    .toArray();
                
                if (destinations.length === 0) {
                    return ctx.reply(
                        '🤖 *Auto-Posting*\n\n' +
                        'Add destinations first before setting up auto-posting.',
                        { parse_mode: 'Markdown' }
                    );
                }
                
                const keyboard = destinations.map(dest => [
                    Markup.button.callback(
                        `Setup for ${dest.name || dest.id}`,
                        `setup_autopost:${dest._id}`
                    )
                ]);
                
                keyboard.push([
                    Markup.button.callback('❌ Cancel', 'cancel')
                ]);
                
                return ctx.reply(
                    '🤖 *Setup Auto-Posting*\n\n' +
                    'Select a destination to configure:',
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard(keyboard)
                    }
                );
            }
            
            // Show existing auto-post configs
            let message = '🤖 *Auto-Posting Configurations*\n\n';
            const keyboard = [];
            
            for (const auto of autoPosts) {
                const dest = await this.db.collection('destinations')
                    .findOne({ _id: auto.destination_id });
                
                message += `📍 *${dest?.name || 'Unknown'}*\n`;
                message += `• Status: ${auto.enabled ? '✅ Active' : '❌ Inactive'}\n`;
                message += `• Frequency: ${auto.config.frequency}\n`;
                message += `• Times: ${auto.config.times?.join(', ') || 'N/A'}\n`;
                message += `• Last posted: ${auto.last_posted ? 
                    new Date(auto.last_posted).toLocaleString() : 'Never'}\n\n`;
                
                keyboard.push([
                    Markup.button.callback(
                        auto.enabled ? '⏸ Pause' : '▶️ Resume',
                        `toggle_autopost:${auto._id}`
                    ),
                    Markup.button.callback(
                        '⚙️ Configure',
                        `config_autopost:${auto._id}`
                    )
                ]);
            }
            
            keyboard.push([
                Markup.button.callback('➕ Add New', 'new_autopost'),
                Markup.button.callback('❌ Close', 'cancel')
            ]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            });
        } catch (error) {
            console.error('AutoPost command error:', error);
            ctx.reply('❌ Error managing auto-posting. Please try again.');
        }
    }
    
    // ==================== Callback Handlers ====================
    
    /**
     * Handle article selection
     */
    async handleArticleSelection(ctx) {
        try {
            const userId = ctx.from.id;
            const articleId = ctx.match[1];
            const state = this.userStates.get(userId);
            
            if (!state) {
                return ctx.answerCbQuery('Session expired. Please start again.');
            }
            
            // Store selected article
            state.articleId = articleId;
            state.step = 'select_destination';
            
            // Get article details
            const article = await this.db.collection('news_articles')
                .findOne({ _id: new ObjectId(articleId) });
            
            if (!article) {
                return ctx.answerCbQuery('Article not found.');
            }
            
            // Show article preview
            await ctx.editMessageText(
                `✅ *Article Selected*\n\n` +
                `📰 ${article.title}\n\n` +
                `${article.summary?.substring(0, 200)}...\n\n` +
                `Now select destination:`,
                { parse_mode: 'Markdown' }
            );
            
            // If bulk mode, skip destination selection
            if (state.action === 'bulk_posting') {
                return this.confirmBulkPost(ctx, state);
            }
            
            // Show destination selection
            const destinations = await this.db.collection('destinations')
                .find({ user_id: userId, active: true })
                .toArray();
            
            const keyboard = destinations.map(dest => [
                Markup.button.callback(
                    dest.name || dest.id,
                    `select_dest:${dest._id}`
                )
            ]);
            
            keyboard.push([
                Markup.button.callback('❌ Cancel', 'cancel_post')
            ]);
            
            await ctx.reply(
                '📍 Select destination:',
                Markup.inlineKeyboard(keyboard)
            );
            
            await ctx.answerCbQuery('Article selected');
        } catch (error) {
            console.error('Article selection error:', error);
            ctx.answerCbQuery('Error selecting article');
        }
    }
    
    /**
     * Handle destination selection
     */
    async handleDestinationSelection(ctx) {
        try {
            const userId = ctx.from.id;
            const destinationId = ctx.match[1];
            const state = this.userStates.get(userId);
            
            if (!state) {
                return ctx.answerCbQuery('Session expired. Please start again.');
            }
            
            state.destinationId = destinationId;
            
            // Get destination details
            const destination = await this.db.collection('destinations')
                .findOne({ _id: new ObjectId(destinationId) });
            
            if (!destination) {
                return ctx.answerCbQuery('Destination not found.');
            }
            
            // Show confirmation
            const article = await this.db.collection('news_articles')
                .findOne({ _id: new ObjectId(state.articleId) });
            
            const keyboard = [
                [
                    Markup.button.callback('✅ Confirm', `confirm_post:${state.articleId}`),
                    Markup.button.callback('📝 Use Template', 'select_template'),
                    Markup.button.callback('❌ Cancel', 'cancel_post')
                ]
            ];
            
            if (state.action === 'scheduling') {
                keyboard[0].splice(1, 0, 
                    Markup.button.callback('📅 Set Time', 'set_schedule_time')
                );
            }
            
            await ctx.editMessageText(
                `📋 *Post Confirmation*\n\n` +
                `📰 *Article:* ${article.title}\n` +
                `📍 *Destination:* ${destination.name || destination.id}\n` +
                `${state.scheduleTime ? 
                    `⏰ *Schedule:* ${new Date(state.scheduleTime).toLocaleString()}\n` : ''}\n` +
                `Ready to post?`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(keyboard)
                }
            );
            
            await ctx.answerCbQuery('Destination selected');
        } catch (error) {
            console.error('Destination selection error:', error);
            ctx.answerCbQuery('Error selecting destination');
        }
    }
    
    /**
     * Handle post confirmation
     */
    async handlePostConfirmation(ctx) {
        try {
            const userId = ctx.from.id;
            const state = this.userStates.get(userId);
            
            if (!state) {
                return ctx.answerCbQuery('Session expired. Please start again.');
            }
            
            await ctx.answerCbQuery('Processing...');
            
            if (state.action === 'scheduling' && state.scheduleTime) {
                // Schedule the post
                const result = await this.postManager.schedulePost(
                    state.articleId,
                    state.destinationId,
                    state.scheduleTime,
                    userId
                );
                
                if (result.success) {
                    await ctx.editMessageText(
                        '✅ *Post Scheduled Successfully!*\n\n' +
                        `Post ID: ${result.postId}\n` +
                        `Scheduled for: ${new Date(state.scheduleTime).toLocaleString()}`,
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    await ctx.editMessageText(
                        `❌ Failed to schedule post: ${result.error}`,
                        { parse_mode: 'Markdown' }
                    );
                }
            } else if (state.action === 'bulk_posting') {
                // Bulk post
                const result = await this.postManager.bulkPost(
                    state.articleId,
                    state.destinations,
                    userId
                );
                
                await ctx.editMessageText(
                    '✅ *Bulk Post Queued!*\n\n' +
                    `Success: ${result.success.length} destinations\n` +
                    `Failed: ${result.failed.length} destinations\n\n` +
                    'Posts are being processed...',
                    { parse_mode: 'Markdown' }
                );
            } else {
                // Regular post
                const result = await this.postManager.addToQueue(
                    state.articleId,
                    state.destinationId,
                    userId
                );
                
                if (result) {
                    await ctx.editMessageText(
                        '✅ *Post Added to Queue!*\n\n' +
                        'Your post will be published shortly.\n' +
                        'Use /queue to check status.',
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    await ctx.editMessageText(
                        '❌ Failed to add post to queue. Please try again.',
                        { parse_mode: 'Markdown' }
                    );
                }
            }
            
            // Clear user state
            this.userStates.delete(userId);
        } catch (error) {
            console.error('Post confirmation error:', error);
            ctx.answerCbQuery('Error confirming post');
            ctx.reply('❌ Error processing post. Please try again.');
        }
    }
    
    // ==================== Helper Methods ====================
    
    /**
     * Parse schedule time from string
     */
    parseScheduleTime(timeStr, dateStr) {
        try {
            const [hours, minutes] = timeStr.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return null;
            
            const date = new Date();
            
            if (dateStr === 'tomorrow') {
                date.setDate(date.getDate() + 1);
            } else if (dateStr !== 'today') {
                const parsed = new Date(dateStr);
                if (!isNaN(parsed)) {
                    date.setFullYear(parsed.getFullYear());
                    date.setMonth(parsed.getMonth());
                    date.setDate(parsed.getDate());
                }
            }
            
            date.setHours(hours, minutes, 0, 0);
            return date;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Confirm bulk posting
     */
    async confirmBulkPost(ctx, state) {
        const article = await this.db.collection('news_articles')
            .findOne({ _id: new ObjectId(state.articleId) });
        
        const keyboard = [
            [
                Markup.button.callback('✅ Confirm Bulk Post', `confirm_post:${state.articleId}`),
                Markup.button.callback('❌ Cancel', 'cancel_post')
            ]
        ];
        
        await ctx.reply(
            `📢 *Bulk Post Confirmation*\n\n` +
            `📰 *Article:* ${article.title}\n` +
            `📍 *Destinations:* ${state.destinations.length} channels/groups\n\n` +
            `This will post to all your active destinations.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            }
        );
    }
}

module.exports = PostCommands;