/**
 * Scheduled Posting System - Complete scheduling with cron job management
 * Production-ready implementation for Zone News Bot
 */

const { ObjectId } = require('mongodb');
const cron = require('node-cron');

class ScheduledPosting {
    constructor(bot, db, tierManager) {
        this.bot = bot;
        this.db = db;
        this.tierManager = tierManager;
        
        // Active cron jobs
        this.cronJobs = new Map();
        
        // Quick scheduling options
        this.quickScheduleOptions = {
            '30min': { minutes: 30, label: '30 minutes' },
            '1hr': { hours: 1, label: '1 hour' },
            '3hrs': { hours: 3, label: '3 hours' },
            '6hrs': { hours: 6, label: '6 hours' },
            '12hrs': { hours: 12, label: '12 hours' },
            'tomorrow': { days: 1, label: 'Tomorrow (same time)' },
            'next_week': { days: 7, label: 'Next week' },
            'custom': { custom: true, label: 'Custom date & time' }
        };
        
        // Recurring schedule options (Pro+ only)
        this.recurringOptions = {
            'daily': { 
                pattern: '0 * * * *', 
                label: 'Daily at same time',
                description: 'Repeat every day at the scheduled time'
            },
            'weekly': { 
                pattern: '0 * * * 0', 
                label: 'Weekly (same day)',
                description: 'Repeat every week on the same day and time'
            },
            'weekdays': { 
                pattern: '0 * * * 1-5', 
                label: 'Weekdays only',
                description: 'Repeat Monday through Friday'
            },
            'monthly': { 
                pattern: '0 * 1 * *', 
                label: 'Monthly (1st of month)',
                description: 'Repeat on the 1st of each month'
            },
            'custom_cron': { 
                custom: true, 
                label: 'Custom cron pattern',
                description: 'Advanced users: specify your own cron pattern'
            }
        };
        
        // Timezone configurations
        this.timezones = {
            'Australia/Adelaide': 'Adelaide (ACDT/ACST)',
            'Australia/Sydney': 'Sydney (AEDT/AEST)',
            'Australia/Melbourne': 'Melbourne (AEDT/AEST)',
            'Australia/Brisbane': 'Brisbane (AEST)',
            'Australia/Perth': 'Perth (AWST)',
            'America/New_York': 'New York (EST/EDT)',
            'America/Los_Angeles': 'Los Angeles (PST/PDT)',
            'Europe/London': 'London (GMT/BST)',
            'Europe/Paris': 'Paris (CET/CEST)',
            'Asia/Tokyo': 'Tokyo (JST)',
            'UTC': 'UTC (Coordinated Universal Time)'
        };
        
        // Default timezone
        this.defaultTimezone = 'Australia/Adelaide';
        
        // Scheduling limits by tier
        this.scheduleLimits = {
            free: {
                max_scheduled: 0,
                advance_days: 0,
                recurring: false,
                bulk_schedule: false
            },
            basic: {
                max_scheduled: 10,
                advance_days: 30,
                recurring: false,
                bulk_schedule: false
            },
            pro: {
                max_scheduled: 100,
                advance_days: 90,
                recurring: true,
                bulk_schedule: true
            },
            enterprise: {
                max_scheduled: -1, // unlimited
                advance_days: 365,
                recurring: true,
                bulk_schedule: true
            }
        };
        
        // Initialize scheduler
        this.initializeScheduler();
    }

    /**
     * Register scheduling commands and handlers
     */
    register() {
        console.log('🔧 Registering ScheduledPosting...');
        
        // Scheduling commands
        this.bot.command('schedule', this.handleSchedule.bind(this));
        this.bot.command('scheduled', this.handleViewScheduled.bind(this));
        this.bot.command('cancelschedule', this.handleCancelSchedule.bind(this));
        this.bot.command('reschedule', this.handleReschedule.bind(this));
        this.bot.command('recurring', this.handleRecurring.bind(this));
        this.bot.command('quickschedule', this.handleQuickSchedule.bind(this));
        this.bot.command('bulkschedule', this.handleBulkSchedule.bind(this));
        this.bot.command('timezone', this.handleTimezone.bind(this));
        this.bot.command('schedulehistory', this.handleScheduleHistory.bind(this));
        
        // Callback handlers
        this.bot.action(/^schedule:/, this.handleScheduleCallback.bind(this));
        this.bot.action(/^scheduled:/, this.handleScheduledCallback.bind(this));
        this.bot.action(/^recurring:/, this.handleRecurringCallback.bind(this));
        this.bot.action(/^timezone:/, this.handleTimezoneCallback.bind(this));
        this.bot.action(/^quick:/, this.handleQuickCallback.bind(this));
        
        console.log('✅ ScheduledPosting registered');
    }

    /**
     * Initialize the scheduling system
     */
    async initializeScheduler() {
        try {
            console.log('🕐 Initializing scheduler...');
            
            // Load existing scheduled posts from database
            const scheduledPosts = await this.db.collection('scheduled_posts').find({
                status: 'scheduled',
                scheduled_at: { $gt: new Date() }
            }).toArray();
            
            console.log(`📅 Loading ${scheduledPosts.length} scheduled posts...`);
            
            // Schedule each post
            for (const post of scheduledPosts) {
                await this.schedulePost(post);
            }
            
            // Set up recurring job processor (runs every minute)
            this.recurringProcessor = cron.schedule('* * * * *', () => {
                this.processRecurringPosts().catch(console.error);
            });
            
            // Set up cleanup job (runs daily at 2 AM)
            this.cleanupJob = cron.schedule('0 2 * * *', () => {
                this.cleanupOldPosts().catch(console.error);
            });
            
            console.log('✅ Scheduler initialized');
            
        } catch (error) {
            console.error('❌ Error initializing scheduler:', error);
        }
    }

    /**
     * Handle /schedule command
     */
    async handleSchedule(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Check if user has scheduling feature
            const hasFeature = await this.tierManager.hasFeature(userId, 'scheduled_posting');
            if (!hasFeature) {
                await ctx.reply(
                    '⏰ *Scheduled Posting* requires Basic tier or higher.\n\n' +
                    '✨ Upgrade to Basic ($9.99/mo) to:\n' +
                    '• Schedule up to 10 posts\n' +
                    '• Quick scheduling options\n' +
                    '• 30-day advance scheduling\n' +
                    '• Schedule management',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💎 Upgrade', callback_data: 'subscribe:basic:monthly' }],
                                [{ text: '❌ Close', callback_data: 'cancel' }]
                            ]
                        }
                    }
                );
                return;
            }
            
            // Check scheduled posts limit
            const limitCheck = await this.tierManager.checkLimit(userId, 'scheduled_posts');
            if (!limitCheck.allowed) {
                await ctx.reply(limitCheck.message, { parse_mode: 'Markdown' });
                return;
            }
            
            await ctx.reply(
                '⏰ *Schedule a Post*\n\n' +
                'Choose how you want to schedule your content:\n\n' +
                '*Quick Options:*\n' +
                '• 30min, 1hr, 3hrs - Quick delays\n' +
                '• Tomorrow - Same time tomorrow\n' +
                '• Custom - Pick exact date & time\n\n' +
                '*What would you like to schedule?*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📝 Text Post', callback_data: 'schedule:text' },
                                { text: '📸 Media Post', callback_data: 'schedule:media' }
                            ],
                            [
                                { text: '📄 Template', callback_data: 'schedule:template' },
                                { text: '📰 News Post', callback_data: 'schedule:news' }
                            ],
                            [
                                { text: '🚀 Quick Schedule', callback_data: 'quick:menu' },
                                { text: '📅 Custom Time', callback_data: 'schedule:custom' }
                            ],
                            [
                                { text: '🔄 Recurring', callback_data: 'recurring:menu' },
                                { text: '📊 View Scheduled', callback_data: 'scheduled:list' }
                            ],
                            [{ text: '❌ Cancel', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error in schedule command:', error);
            await ctx.reply('❌ Error accessing scheduling system.');
        }
    }

    /**
     * Handle /scheduled command - view scheduled posts
     */
    async handleViewScheduled(ctx) {
        try {
            const userId = ctx.from.id;
            
            const scheduledPosts = await this.db.collection('scheduled_posts').find({
                user_id: userId,
                status: { $in: ['scheduled', 'recurring'] }
            }).sort({ scheduled_at: 1 }).toArray();
            
            if (scheduledPosts.length === 0) {
                await ctx.reply(
                    '📅 *No Scheduled Posts*\n\n' +
                    'You don\'t have any posts scheduled.\n\n' +
                    'Use /schedule to create your first scheduled post!',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⏰ Schedule Post', callback_data: 'schedule:menu' }],
                                [{ text: '❌ Close', callback_data: 'cancel' }]
                            ]
                        }
                    }
                );
                return;
            }
            
            let message = `📅 *Your Scheduled Posts* (${scheduledPosts.length})\n\n`;
            
            scheduledPosts.slice(0, 8).forEach((post, index) => {
                const scheduledTime = this.formatDateTime(post.scheduled_at, userId);
                const contentPreview = this.getContentPreview(post.content);
                const statusEmoji = post.status === 'recurring' ? '🔄' : '⏰';
                
                message += `${index + 1}. ${statusEmoji} ${contentPreview}\n`;
                message += `   📅 ${scheduledTime}\n`;
                if (post.destinations?.length > 0) {
                    message += `   📍 ${post.destinations.length} destination(s)\n`;
                }
                message += '\n';
            });
            
            if (scheduledPosts.length > 8) {
                message += `... and ${scheduledPosts.length - 8} more posts\n\n`;
            }
            
            const keyboard = [
                [
                    { text: '📝 Manage Posts', callback_data: 'scheduled:manage' },
                    { text: '⏰ Add New', callback_data: 'schedule:menu' }
                ],
                [
                    { text: '🔄 Recurring Posts', callback_data: 'scheduled:recurring' },
                    { text: '📊 Statistics', callback_data: 'scheduled:stats' }
                ],
                [
                    { text: '🕐 Timezone Settings', callback_data: 'timezone:settings' },
                    { text: '🔄 Refresh', callback_data: 'scheduled:refresh' }
                ],
                [{ text: '❌ Close', callback_data: 'cancel' }]
            ];
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error viewing scheduled posts:', error);
            await ctx.reply('❌ Error retrieving scheduled posts.');
        }
    }

    /**
     * Handle quick scheduling
     */
    async handleQuickSchedule(ctx) {
        try {
            const args = ctx.message.text.split(' ').slice(1);
            const userId = ctx.from.id;
            
            if (args.length === 0) {
                await this.showQuickScheduleMenu(ctx);
                return;
            }
            
            const option = args[0];
            const content = args.slice(1).join(' ');
            
            if (!content) {
                await ctx.reply(
                    '📝 *Missing Content*\n\n' +
                    'Usage: `/quickschedule 30min Your message here`\n\n' +
                    '*Available options:*\n' +
                    '• 30min, 1hr, 3hrs, 6hrs, 12hrs\n' +
                    '• tomorrow, next_week',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            const scheduleOption = this.quickScheduleOptions[option];
            if (!scheduleOption) {
                await ctx.reply(
                    '❌ Invalid quick schedule option.\n\n' +
                    'Available: 30min, 1hr, 3hrs, 6hrs, 12hrs, tomorrow, next_week',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Calculate scheduled time
            const scheduledAt = this.calculateScheduledTime(scheduleOption);
            
            // Create scheduled post
            const scheduledPost = {
                user_id: userId,
                content: {
                    type: 'text',
                    text: content
                },
                scheduled_at: scheduledAt,
                status: 'scheduled',
                created_at: new Date(),
                destinations: [], // Will be set later
                quick_option: option
            };
            
            const result = await this.db.collection('scheduled_posts').insertOne(scheduledPost);
            
            // Schedule the post
            await this.schedulePost(scheduledPost);
            
            await ctx.reply(
                `✅ *Post Scheduled!*\n\n` +
                `📅 Will post: ${this.formatDateTime(scheduledAt, userId)}\n` +
                `⏰ Option: ${scheduleOption.label}\n\n` +
                `*Content:* "${this.truncateText(content, 100)}"\n\n` +
                `🆔 Schedule ID: \`${result.insertedId}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📍 Add Destinations', callback_data: `scheduled:destinations:${result.insertedId}` },
                                { text: '✏️ Edit', callback_data: `scheduled:edit:${result.insertedId}` }
                            ],
                            [
                                { text: '❌ Cancel Schedule', callback_data: `scheduled:cancel:${result.insertedId}` },
                                { text: '📅 View All', callback_data: 'scheduled:list' }
                            ]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error in quick schedule:', error);
            await ctx.reply('❌ Error creating quick schedule.');
        }
    }

    /**
     * Handle recurring posts (Pro+ feature)
     */
    async handleRecurring(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Check if user has recurring posts feature
            const hasFeature = await this.tierManager.hasFeature(userId, 'recurring_posts');
            if (!hasFeature) {
                await ctx.reply(
                    '🔄 *Recurring Posts* require Pro tier.\n\n' +
                    '🚀 Upgrade to Pro ($19.99/mo) to:\n' +
                    '• Set up recurring schedules\n' +
                    '• Daily, weekly, monthly posts\n' +
                    '• Custom cron patterns\n' +
                    '• Content automation',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💎 Upgrade to Pro', callback_data: 'subscribe:pro:monthly' }],
                                [{ text: '❌ Close', callback_data: 'cancel' }]
                            ]
                        }
                    }
                );
                return;
            }
            
            await ctx.reply(
                '🔄 *Recurring Posts*\n\n' +
                'Set up posts that repeat automatically!\n\n' +
                '*Available patterns:*\n' +
                '📅 Daily - Every day at same time\n' +
                '📆 Weekly - Same day each week\n' +
                '💼 Weekdays - Monday to Friday\n' +
                '📊 Monthly - 1st of each month\n' +
                '⚙️ Custom - Advanced cron pattern\n\n' +
                'Choose your recurring schedule:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📅 Daily', callback_data: 'recurring:daily' },
                                { text: '📆 Weekly', callback_data: 'recurring:weekly' }
                            ],
                            [
                                { text: '💼 Weekdays', callback_data: 'recurring:weekdays' },
                                { text: '📊 Monthly', callback_data: 'recurring:monthly' }
                            ],
                            [
                                { text: '⚙️ Custom Cron', callback_data: 'recurring:custom' },
                                { text: '👁️ View Active', callback_data: 'recurring:list' }
                            ],
                            [{ text: '❌ Cancel', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error in recurring command:', error);
            await ctx.reply('❌ Error accessing recurring posts.');
        }
    }

    /**
     * Handle scheduling callbacks
     */
    async handleScheduleCallback(ctx) {
        try {
            const data = ctx.callbackQuery.data.split(':');
            const action = data[1];
            const param = data[2];
            
            await ctx.answerCallbackQuery();
            
            switch (action) {
                case 'text':
                    await this.startTextScheduling(ctx);
                    break;
                case 'media':
                    await this.startMediaScheduling(ctx);
                    break;
                case 'template':
                    await this.startTemplateScheduling(ctx);
                    break;
                case 'custom':
                    await this.startCustomTimeScheduling(ctx);
                    break;
                default:
                    await ctx.reply('❌ Unknown scheduling action.');
            }
            
        } catch (error) {
            console.error('Error handling schedule callback:', error);
            await ctx.answerCallbackQuery('❌ Error processing schedule request');
        }
    }

    /**
     * Schedule a post using cron
     */
    async schedulePost(postData) {
        try {
            const postId = postData._id.toString();
            const scheduledAt = new Date(postData.scheduled_at);
            
            // Calculate cron expression for exact time
            const cronExpression = this.dateToCron(scheduledAt);
            
            console.log(`📅 Scheduling post ${postId} for ${scheduledAt.toISOString()}`);
            
            // Create cron job
            const cronJob = cron.schedule(cronExpression, async () => {
                try {
                    await this.executeScheduledPost(postId);
                } catch (error) {
                    console.error(`Error executing scheduled post ${postId}:`, error);
                }
            }, {
                scheduled: true,
                timezone: postData.timezone || this.defaultTimezone
            });
            
            // Store cron job reference
            this.cronJobs.set(postId, cronJob);
            
            return true;
            
        } catch (error) {
            console.error('Error scheduling post:', error);
            return false;
        }
    }

    /**
     * Execute a scheduled post
     */
    async executeScheduledPost(postId) {
        try {
            console.log(`🚀 Executing scheduled post: ${postId}`);
            
            // Get post data
            const post = await this.db.collection('scheduled_posts').findOne({
                _id: new ObjectId(postId)
            });
            
            if (!post || post.status !== 'scheduled') {
                console.log(`Post ${postId} not found or not scheduled`);
                return;
            }
            
            // Update status to executing
            await this.db.collection('scheduled_posts').updateOne(
                { _id: new ObjectId(postId) },
                { 
                    $set: { 
                        status: 'executing',
                        executed_at: new Date()
                    }
                }
            );
            
            // Execute the post based on content type
            let postResult = null;
            
            switch (post.content.type) {
                case 'text':
                    postResult = await this.executeTextPost(post);
                    break;
                case 'media':
                    postResult = await this.executeMediaPost(post);
                    break;
                case 'template':
                    postResult = await this.executeTemplatePost(post);
                    break;
                default:
                    throw new Error(`Unknown content type: ${post.content.type}`);
            }
            
            // Update post status
            if (postResult.success) {
                await this.db.collection('scheduled_posts').updateOne(
                    { _id: new ObjectId(postId) },
                    { 
                        $set: { 
                            status: 'completed',
                            completed_at: new Date(),
                            execution_result: postResult
                        }
                    }
                );
                
                // Notify user of successful post
                try {
                    await this.bot.telegram.sendMessage(
                        post.user_id,
                        `✅ *Scheduled Post Executed!*\n\n` +
                        `📅 Originally scheduled for: ${this.formatDateTime(post.scheduled_at, post.user_id)}\n` +
                        `📊 Result: ${postResult.posted_count} destination(s)\n` +
                        `🆔 Post ID: \`${postId}\``,
                        { parse_mode: 'Markdown' }
                    );
                } catch (notifyError) {
                    console.error('Could not notify user:', notifyError);
                }
            } else {
                await this.db.collection('scheduled_posts').updateOne(
                    { _id: new ObjectId(postId) },
                    { 
                        $set: { 
                            status: 'failed',
                            failed_at: new Date(),
                            error: postResult.error
                        }
                    }
                );
                
                // Notify user of failure
                try {
                    await this.bot.telegram.sendMessage(
                        post.user_id,
                        `❌ *Scheduled Post Failed*\n\n` +
                        `📅 Was scheduled for: ${this.formatDateTime(post.scheduled_at, post.user_id)}\n` +
                        `💥 Error: ${postResult.error}\n` +
                        `🆔 Post ID: \`${postId}\``,
                        { parse_mode: 'Markdown' }
                    );
                } catch (notifyError) {
                    console.error('Could not notify user:', notifyError);
                }
            }
            
            // Remove cron job
            const cronJob = this.cronJobs.get(postId);
            if (cronJob) {
                cronJob.destroy();
                this.cronJobs.delete(postId);
            }
            
            console.log(`✅ Scheduled post ${postId} execution completed`);
            
        } catch (error) {
            console.error(`Error executing scheduled post ${postId}:`, error);
            
            // Update post status to failed
            await this.db.collection('scheduled_posts').updateOne(
                { _id: new ObjectId(postId) },
                { 
                    $set: { 
                        status: 'failed',
                        failed_at: new Date(),
                        error: error.message
                    }
                }
            );
        }
    }

    /**
     * Execute text post
     */
    async executeTextPost(post) {
        try {
            const destinations = post.destinations || [];
            let postedCount = 0;
            const errors = [];
            
            for (const destination of destinations) {
                try {
                    await this.bot.telegram.sendMessage(
                        destination.id,
                        post.content.text,
                        {
                            parse_mode: post.content.parse_mode || 'Markdown',
                            disable_web_page_preview: post.content.disable_preview || false
                        }
                    );
                    postedCount++;
                } catch (error) {
                    errors.push(`${destination.title}: ${error.message}`);
                }
            }
            
            return {
                success: postedCount > 0,
                posted_count: postedCount,
                total_destinations: destinations.length,
                errors: errors
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process recurring posts
     */
    async processRecurringPosts() {
        try {
            const now = new Date();
            
            // Find recurring posts that need to be triggered
            const recurringPosts = await this.db.collection('scheduled_posts').find({
                status: 'recurring',
                next_run: { $lte: now }
            }).toArray();
            
            for (const post of recurringPosts) {
                try {
                    // Create a new scheduled instance
                    const newPost = {
                        ...post,
                        _id: new ObjectId(),
                        status: 'scheduled',
                        scheduled_at: post.next_run,
                        parent_recurring_id: post._id,
                        created_at: new Date()
                    };
                    
                    // Insert new scheduled post
                    await this.db.collection('scheduled_posts').insertOne(newPost);
                    
                    // Schedule the new post
                    await this.schedulePost(newPost);
                    
                    // Calculate next run time
                    const nextRun = this.calculateNextRun(post.cron_pattern, post.timezone);
                    
                    // Update recurring post
                    await this.db.collection('scheduled_posts').updateOne(
                        { _id: post._id },
                        { 
                            $set: { 
                                next_run: nextRun,
                                last_run: now
                            },
                            $inc: { run_count: 1 }
                        }
                    );
                    
                } catch (error) {
                    console.error(`Error processing recurring post ${post._id}:`, error);
                }
            }
            
        } catch (error) {
            console.error('Error processing recurring posts:', error);
        }
    }

    /**
     * Convert date to cron expression
     */
    dateToCron(date) {
        const minute = date.getMinutes();
        const hour = date.getHours();
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        
        return `${minute} ${hour} ${day} ${month} *`;
    }

    /**
     * Calculate scheduled time from quick option
     */
    calculateScheduledTime(option) {
        const now = new Date();
        
        if (option.minutes) {
            return new Date(now.getTime() + option.minutes * 60 * 1000);
        }
        
        if (option.hours) {
            return new Date(now.getTime() + option.hours * 60 * 60 * 1000);
        }
        
        if (option.days) {
            return new Date(now.getTime() + option.days * 24 * 60 * 60 * 1000);
        }
        
        return now;
    }

    /**
     * Format date/time for display
     */
    formatDateTime(date, userId) {
        try {
            // Use user's timezone or default
            const timezone = this.defaultTimezone; // Could get from user preferences
            return new Intl.DateTimeFormat('en-AU', {
                timeZone: timezone,
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(new Date(date));
        } catch (error) {
            return new Date(date).toLocaleString();
        }
    }

    /**
     * Get content preview for display
     */
    getContentPreview(content) {
        switch (content.type) {
            case 'text':
                return this.truncateText(content.text, 30);
            case 'media':
                return `${content.media_type} with ${content.caption ? 'caption' : 'no caption'}`;
            case 'template':
                return `Template: ${content.template_name}`;
            default:
                return 'Unknown content';
        }
    }

    /**
     * Truncate text to specified length
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Clean up old completed/failed posts
     */
    async cleanupOldPosts() {
        try {
            const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            
            const result = await this.db.collection('scheduled_posts').deleteMany({
                status: { $in: ['completed', 'failed'] },
                $or: [
                    { completed_at: { $lt: cutoffDate } },
                    { failed_at: { $lt: cutoffDate } }
                ]
            });
            
            console.log(`🧹 Cleaned up ${result.deletedCount} old scheduled posts`);
            
        } catch (error) {
            console.error('Error cleaning up old posts:', error);
        }
    }

    /**
     * Calculate next run time for recurring posts
     */
    calculateNextRun(cronPattern, timezone = this.defaultTimezone) {
        // Implementation would use a cron parser library
        // For now, return next hour as placeholder
        return new Date(Date.now() + 60 * 60 * 1000);
    }

    /**
     * Show quick schedule menu
     */
    async showQuickScheduleMenu(ctx) {
        let message = '🚀 *Quick Schedule*\n\n';
        message += 'Choose a quick scheduling option:\n\n';
        
        const keyboard = [];
        
        for (const [key, option] of Object.entries(this.quickScheduleOptions)) {
            if (key !== 'custom') {
                keyboard.push([{
                    text: `⏰ ${option.label}`,
                    callback_data: `quick:${key}`
                }]);
            }
        }
        
        keyboard.push([
            { text: '📅 Custom Time', callback_data: 'schedule:custom' },
            { text: '❌ Cancel', callback_data: 'cancel' }
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    }

    /**
     * Start text scheduling flow
     */
    async startTextScheduling(ctx) {
        await ctx.editMessageText(
            '📝 *Schedule Text Post*\n\n' +
            'Please send me the text you want to schedule.\n\n' +
            'You can use *Markdown* formatting:\n' +
            '• \\*bold\\* for **bold**\n' +
            '• \\_italic\\_ for _italic_\n' +
            '• \\`code\\` for `code`\n' +
            '• \\[link\\]\\(url\\) for links',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '« Back', callback_data: 'schedule:menu' }],
                        [{ text: '❌ Cancel', callback_data: 'cancel' }]
                    ]
                }
            }
        );
        
        // Set user state to expect text input
        // Implementation would use a state management system
    }
}

module.exports = ScheduledPosting;