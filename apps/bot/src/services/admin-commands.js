/**
 * Admin Commands Module
 * Comprehensive admin functionality
 */

const { ObjectId } = require('mongodb');

class AdminCommands {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
    }
    
    register() {
        // /admin - Admin panel
        this.bot.command('admin', this.handleAdminPanel.bind(this));
        
        // /broadcast - Send message to all users
        this.bot.command('broadcast', this.handleBroadcast.bind(this));
        
        // /stats - Bot statistics
        this.bot.command('stats', this.handleStats.bind(this));
        
        // /users - User management
        this.bot.command('users', this.handleUsers.bind(this));
        
        // /post - Post to channels/groups
        this.bot.command('post', this.handlePost.bind(this));
        
        // /add - Add destination
        this.bot.command('add', this.handleAddDestination.bind(this));
        
        // /remove - Remove destination
        this.bot.command('remove', this.handleRemoveDestination.bind(this));
        
        // /list - List destinations
        this.bot.command('list', this.handleListDestinations.bind(this));
        
        // /channels - Manage channels
        this.bot.command('channels', this.handleChannels.bind(this));
        
        // /groups - Manage groups
        this.bot.command('groups', this.handleGroups.bind(this));
        
        // /backup - Backup database
        this.bot.command('backup', this.handleBackup.bind(this));
        
        // /logs - View bot logs
        this.bot.command('logs', this.handleLogs.bind(this));
        
        // /restart - Restart bot
        this.bot.command('restart', this.handleRestart.bind(this));
        
        // /analytics - View analytics
        this.bot.command('analytics', this.handleAnalytics.bind(this));
        
        // /schedule - Schedule posts
        this.bot.command('schedule', this.handleSchedule.bind(this));
        
        // Register callback handlers
        this.registerCallbacks();
    }
    
    async isAdmin(ctx) {
        const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];
        return adminIds.includes(ctx.from.id);
    }
    
    async handleAdminPanel(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const [
            userCount,
            articleCount,
            destinationCount,
            reactionCount,
            scheduleCount
        ] = await Promise.all([
            this.db.collection('users').countDocuments(),
            this.db.collection('news_articles').countDocuments(),
            this.db.collection('destinations').countDocuments({ active: true }),
            this.db.collection('user_reactions').countDocuments(),
            this.db.collection('schedules').countDocuments({ active: true })
        ]);
        
        const adminMenu = `
👑 *Admin Panel*

📊 *Statistics:*
👥 Users: ${userCount}
📰 Articles: ${articleCount}
📍 Destinations: ${destinationCount}
💬 Reactions: ${reactionCount}
⏰ Schedules: ${scheduleCount}

*Quick Actions:*`;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📤 Post Article', callback_data: 'admin:post' },
                    { text: '📢 Broadcast', callback_data: 'admin:broadcast' }
                ],
                [
                    { text: '📊 Analytics', callback_data: 'admin:analytics' },
                    { text: '👥 Users', callback_data: 'admin:users' }
                ],
                [
                    { text: '📍 Destinations', callback_data: 'admin:destinations' },
                    { text: '⏰ Schedules', callback_data: 'admin:schedules' }
                ],
                [
                    { text: '🔄 Refresh Stats', callback_data: 'admin:refresh' },
                    { text: '⚙️ Settings', callback_data: 'admin:settings' }
                ],
                [
                    { text: '📥 Backup', callback_data: 'admin:backup' },
                    { text: '📜 Logs', callback_data: 'admin:logs' }
                ]
            ]
        };
        
        await ctx.reply(adminMenu, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    async handleBroadcast(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) {
            return ctx.reply(
                '📢 *Broadcast Usage:*\n\n' +
                '`/broadcast Your message here`\n\n' +
                'Options:\n' +
                '`/broadcast -test Message` - Test mode (5 users)\n' +
                '`/broadcast -all Message` - All users\n' +
                '`/broadcast -active Message` - Active users only',
                { parse_mode: 'Markdown' }
            );
        }
        
        let message = args.join(' ');
        let filter = {};
        let testMode = false;
        
        // Parse options
        if (args[0] === '-test') {
            testMode = true;
            message = args.slice(1).join(' ');
        } else if (args[0] === '-active') {
            filter = { last_active: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } };
            message = args.slice(1).join(' ');
        } else if (args[0] === '-all') {
            message = args.slice(1).join(' ');
        }
        
        // Get users
        const users = await this.db.collection('users')
            .find(filter)
            .limit(testMode ? 5 : 0)
            .toArray();
        
        if (users.length === 0) {
            return ctx.reply('📭 No users found');
        }
        
        // Confirmation
        const confirmKeyboard = {
            inline_keyboard: [[
                { text: '✅ Confirm', callback_data: `broadcast:confirm:${Date.now()}` },
                { text: '❌ Cancel', callback_data: 'broadcast:cancel' }
            ]]
        };
        
        await ctx.reply(
            `📢 *Broadcast Confirmation*\n\n` +
            `Recipients: ${users.length} users${testMode ? ' (TEST MODE)' : ''}\n` +
            `Message:\n${message}\n\n` +
            `Send this message?`,
            {
                parse_mode: 'Markdown',
                reply_markup: confirmKeyboard
            }
        );
        
        // Store broadcast data temporarily
        await this.db.collection('pending_broadcasts').insertOne({
            admin_id: ctx.from.id,
            message,
            users: users.map(u => u.user_id),
            test_mode: testMode,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
        });
    }
    
    async handleStats(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        // Gather comprehensive statistics
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const [
            totalUsers,
            todayUsers,
            weekUsers,
            monthUsers,
            totalArticles,
            todayArticles,
            totalReactions,
            todayReactions,
            topReactions,
            activeChannels,
            activeGroups
        ] = await Promise.all([
            this.db.collection('users').countDocuments(),
            this.db.collection('users').countDocuments({ created_at: { $gte: today } }),
            this.db.collection('users').countDocuments({ created_at: { $gte: thisWeek } }),
            this.db.collection('users').countDocuments({ created_at: { $gte: thisMonth } }),
            this.db.collection('news_articles').countDocuments(),
            this.db.collection('news_articles').countDocuments({ published_date: { $gte: today } }),
            this.db.collection('user_reactions').countDocuments(),
            this.db.collection('user_reactions').countDocuments({ created_at: { $gte: today } }),
            this.db.collection('news_articles')
                .find({ 'total_reactions.like': { $gt: 0 } })
                .sort({ 'total_reactions.like': -1 })
                .limit(3)
                .toArray(),
            this.db.collection('destinations').countDocuments({ type: 'channel', active: true }),
            this.db.collection('destinations').countDocuments({ type: { $in: ['group', 'supergroup'] }, active: true })
        ]);
        
        let statsMessage = `
📊 *Bot Statistics*

👥 *Users:*
• Total: ${totalUsers}
• Today: +${todayUsers}
• This Week: +${weekUsers}
• This Month: +${monthUsers}

📰 *Articles:*
• Total: ${totalArticles}
• Today: ${todayArticles}

💬 *Engagement:*
• Total Reactions: ${totalReactions}
• Today: ${todayReactions}

📍 *Destinations:*
• Active Channels: ${activeChannels}
• Active Groups: ${activeGroups}

🔥 *Top Articles:*`;
        
        topReactions.forEach((article, i) => {
            const total = (article.total_reactions?.like || 0) + 
                         (article.total_reactions?.love || 0) + 
                         (article.total_reactions?.fire || 0);
            statsMessage += `\n${i + 1}. ${article.title?.substring(0, 30)}... (${total} reactions)`;
        });
        
        statsMessage += `\n\n⏰ Updated: ${now.toLocaleString('en-AU')}`;
        
        await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
    }
    
    async handleUsers(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const args = ctx.message.text.split(' ').slice(1);
        
        if (args.length === 0) {
            // Show user management menu
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 List All', callback_data: 'users:list' },
                        { text: '🔍 Search', callback_data: 'users:search' }
                    ],
                    [
                        { text: '📊 Active Users', callback_data: 'users:active' },
                        { text: '💤 Inactive Users', callback_data: 'users:inactive' }
                    ],
                    [
                        { text: '🚫 Banned Users', callback_data: 'users:banned' },
                        { text: '➕ Add Admin', callback_data: 'users:add_admin' }
                    ],
                    [
                        { text: '📥 Export CSV', callback_data: 'users:export' },
                        { text: '🔄 Refresh', callback_data: 'users:refresh' }
                    ]
                ]
            };
            
            const userCount = await this.db.collection('users').countDocuments();
            const activeCount = await this.db.collection('users').countDocuments({
                last_active: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            });
            
            await ctx.reply(
                `👥 *User Management*\n\n` +
                `Total Users: ${userCount}\n` +
                `Active (30d): ${activeCount}\n` +
                `Inactive: ${userCount - activeCount}\n\n` +
                `Select an action:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        }
    }
    
    async handlePost(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        // Get latest articles
        const articles = await this.db.collection('news_articles')
            .find({})
            .sort({ published_date: -1 })
            .limit(10)
            .toArray();
        
        if (articles.length === 0) {
            return ctx.reply('📭 No articles available to post');
        }
        
        // Get destinations
        const destinations = await this.db.collection('destinations')
            .find({ active: true })
            .toArray();
        
        if (destinations.length === 0) {
            return ctx.reply(
                '📭 No destinations configured\n\n' +
                'Add destinations with:\n' +
                '/add @channel_username\n' +
                '/add -100123456789'
            );
        }
        
        // Store session
        await this.db.collection('post_sessions').insertOne({
            admin_id: ctx.from.id,
            articles: articles.map(a => ({
                _id: a._id,
                title: a.title,
                category: a.category,
                published_date: a.published_date
            })),
            destinations: destinations.map(d => ({
                _id: d._id,
                name: d.name || d.username || d.id,
                type: d.type
            })),
            created_at: new Date(),
            expires_at: new Date(Date.now() + 30 * 60 * 1000)
        });
        
        // Show article selection
        const keyboard = articles.map((article, i) => [{
            text: `${i + 1}. ${this.truncate(article.title, 50)}`,
            callback_data: `post:article:${article._id}`
        }]);
        
        keyboard.push([
            { text: '📝 Custom Post', callback_data: 'post:custom' },
            { text: '❌ Cancel', callback_data: 'post:cancel' }
        ]);
        
        await ctx.reply(
            '📰 *Select Article to Post*\n\n' +
            'Choose from recent articles:',
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            }
        );
    }
    
    async handleAddDestination(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const args = ctx.message.text.split(' ').slice(1);
        
        if (args.length === 0) {
            return ctx.reply(
                '➕ *Add Destination*\n\n' +
                'Usage:\n' +
                '`/add @channel_username`\n' +
                '`/add -100123456789` (group/channel ID)\n\n' +
                'Or forward a message from the channel/group',
                { parse_mode: 'Markdown' }
            );
        }
        
        const input = args[0];
        let destination = {};
        
        if (input.startsWith('@')) {
            // Channel username
            destination.username = input;
            destination.id = input;
            destination.type = 'channel';
        } else if (input.startsWith('-100')) {
            // Group/Supergroup/Channel ID
            destination.id = input;
            destination.type = 'group'; // Will be updated when bot checks
        } else {
            return ctx.reply('❌ Invalid format. Use @username or chat ID');
        }
        
        try {
            // Try to get chat info
            const chat = await this.bot.telegram.getChat(destination.id);
            
            destination = {
                id: chat.id.toString(),
                type: chat.type,
                title: chat.title,
                username: chat.username,
                active: true,
                added_by: ctx.from.id,
                added_at: new Date()
            };
            
            // Check if already exists
            const existing = await this.db.collection('destinations').findOne({ id: destination.id });
            if (existing) {
                return ctx.reply('⚠️ This destination already exists');
            }
            
            // Add to database
            await this.db.collection('destinations').insertOne(destination);
            
            await ctx.reply(
                `✅ *Destination Added*\n\n` +
                `Type: ${destination.type}\n` +
                `Name: ${destination.title || destination.username}\n` +
                `ID: ${destination.id}`,
                { parse_mode: 'Markdown' }
            );
            
        } catch (error) {
            await ctx.reply(
                '❌ Failed to add destination\n\n' +
                'Make sure:\n' +
                '• Bot is member of the group/channel\n' +
                '• Bot has admin rights (for groups)\n' +
                '• Username/ID is correct'
            );
        }
    }
    
    async handleRemoveDestination(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const destinations = await this.db.collection('destinations')
            .find({ active: true })
            .toArray();
        
        if (destinations.length === 0) {
            return ctx.reply('📭 No destinations to remove');
        }
        
        const keyboard = destinations.map(dest => [{
            text: `❌ ${dest.title || dest.username || dest.id}`,
            callback_data: `remove:dest:${dest._id}`
        }]);
        
        keyboard.push([{ text: '❌ Cancel', callback_data: 'remove:cancel' }]);
        
        await ctx.reply(
            '🗑️ *Remove Destination*\n\n' +
            'Select destination to remove:',
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            }
        );
    }
    
    async handleListDestinations(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const destinations = await this.db.collection('destinations')
            .find({})
            .toArray();
        
        if (destinations.length === 0) {
            return ctx.reply('📭 No destinations configured');
        }
        
        let message = '📍 *Destinations*\n\n';
        
        const channels = destinations.filter(d => d.type === 'channel');
        const groups = destinations.filter(d => d.type !== 'channel');
        
        if (channels.length > 0) {
            message += '*Channels:*\n';
            channels.forEach(ch => {
                const status = ch.active ? '✅' : '❌';
                message += `${status} ${ch.title || ch.username || ch.id}\n`;
            });
        }
        
        if (groups.length > 0) {
            message += '\n*Groups:*\n';
            groups.forEach(gr => {
                const status = gr.active ? '✅' : '❌';
                message += `${status} ${gr.title || gr.id}\n`;
            });
        }
        
        message += `\n📊 Total: ${destinations.length}`;
        message += `\n✅ Active: ${destinations.filter(d => d.active).length}`;
        message += `\n❌ Inactive: ${destinations.filter(d => !d.active).length}`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
    async handleChannels(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const channels = await this.db.collection('destinations')
            .find({ type: 'channel' })
            .toArray();
        
        if (channels.length === 0) {
            return ctx.reply('📭 No channels configured');
        }
        
        const keyboard = {
            inline_keyboard: channels.map(ch => [{
                text: `${ch.active ? '✅' : '❌'} ${ch.title || ch.username}`,
                callback_data: `channel:toggle:${ch._id}`
            }])
        };
        
        keyboard.inline_keyboard.push([
            { text: '➕ Add Channel', callback_data: 'channel:add' },
            { text: '🔄 Refresh', callback_data: 'channel:refresh' }
        ]);
        
        await ctx.reply(
            '📢 *Channel Management*\n\n' +
            'Tap to enable/disable:',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    }
    
    async handleGroups(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const groups = await this.db.collection('destinations')
            .find({ type: { $in: ['group', 'supergroup'] } })
            .toArray();
        
        if (groups.length === 0) {
            return ctx.reply('📭 No groups configured');
        }
        
        const keyboard = {
            inline_keyboard: groups.map(gr => [{
                text: `${gr.active ? '✅' : '❌'} ${gr.title || gr.id}`,
                callback_data: `group:toggle:${gr._id}`
            }])
        };
        
        keyboard.inline_keyboard.push([
            { text: '➕ Add Group', callback_data: 'group:add' },
            { text: '🔄 Refresh', callback_data: 'group:refresh' }
        ]);
        
        await ctx.reply(
            '👥 *Group Management*\n\n' +
            'Tap to enable/disable:',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    }
    
    async handleBackup(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        await ctx.reply('📥 Creating backup...');
        
        try {
            // Export collections
            const collections = ['users', 'news_articles', 'destinations', 'schedules', 'user_reactions'];
            const backup = {};
            
            for (const collection of collections) {
                const data = await this.db.collection(collection).find({}).toArray();
                backup[collection] = data;
            }
            
            // Create backup file
            const backupData = JSON.stringify(backup, null, 2);
            const fileName = `backup_${Date.now()}.json`;
            
            // Send as document
            await ctx.replyWithDocument({
                source: Buffer.from(backupData),
                filename: fileName
            });
            
            await ctx.reply(
                `✅ *Backup Complete*\n\n` +
                `File: ${fileName}\n` +
                `Size: ${(backupData.length / 1024).toFixed(2)} KB\n` +
                `Collections: ${collections.join(', ')}`,
                { parse_mode: 'Markdown' }
            );
            
        } catch (error) {
            await ctx.reply(`❌ Backup failed: ${error.message}`);
        }
    }
    
    async handleLogs(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📜 Bot Logs', callback_data: 'logs:bot' },
                    { text: '❌ Error Logs', callback_data: 'logs:error' }
                ],
                [
                    { text: '📊 Access Logs', callback_data: 'logs:access' },
                    { text: '🔄 System Logs', callback_data: 'logs:system' }
                ],
                [
                    { text: '📥 Download All', callback_data: 'logs:download' },
                    { text: '🗑️ Clear Old', callback_data: 'logs:clear' }
                ]
            ]
        };
        
        await ctx.reply(
            '📜 *Log Viewer*\n\n' +
            'Select log type to view:',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );
    }
    
    async handleRestart(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        await ctx.reply('🔄 Restarting bot...');
        
        // Log restart
        await this.db.collection('admin_logs').insertOne({
            action: 'restart',
            admin_id: ctx.from.id,
            timestamp: new Date()
        });
        
        // Graceful restart
        setTimeout(() => {
            process.exit(0); // PM2 will auto-restart
        }, 1000);
    }
    
    async handleAnalytics(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        // Get analytics data
        const [
            dailyActiveUsers,
            weeklyActiveUsers,
            topArticles,
            reactionStats,
            commandUsage
        ] = await Promise.all([
            this.db.collection('users').countDocuments({
                last_active: { $gte: today }
            }),
            this.db.collection('users').countDocuments({
                last_active: { $gte: thisWeek }
            }),
            this.db.collection('news_articles')
                .aggregate([
                    {
                        $project: {
                            title: 1,
                            total_engagement: {
                                $add: [
                                    { $ifNull: ['$total_reactions.like', 0] },
                                    { $ifNull: ['$total_reactions.love', 0] },
                                    { $ifNull: ['$total_reactions.fire', 0] }
                                ]
                            }
                        }
                    },
                    { $sort: { total_engagement: -1 } },
                    { $limit: 5 }
                ])
                .toArray(),
            this.db.collection('user_reactions')
                .aggregate([
                    {
                        $group: {
                            _id: '$reaction',
                            count: { $sum: 1 }
                        }
                    }
                ])
                .toArray(),
            this.db.collection('command_usage')
                .aggregate([
                    { $match: { timestamp: { $gte: today } } },
                    {
                        $group: {
                            _id: '$command',
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: 5 }
                ])
                .toArray()
        ]);
        
        let analyticsMessage = `
📊 *Analytics Dashboard*

👥 *User Activity:*
• Daily Active: ${dailyActiveUsers}
• Weekly Active: ${weeklyActiveUsers}

🔥 *Top Articles:*`;
        
        topArticles.forEach((article, i) => {
            analyticsMessage += `\n${i + 1}. ${this.truncate(article.title, 40)} (${article.total_engagement} reactions)`;
        });
        
        analyticsMessage += '\n\n💬 *Reaction Distribution:*';
        reactionStats.forEach(stat => {
            const emoji = stat._id === 'like' ? '👍' : stat._id === 'love' ? '❤️' : '🔥';
            analyticsMessage += `\n${emoji} ${stat._id}: ${stat.count}`;
        });
        
        if (commandUsage.length > 0) {
            analyticsMessage += '\n\n📱 *Top Commands Today:*';
            commandUsage.forEach(cmd => {
                analyticsMessage += `\n/${cmd._id}: ${cmd.count} uses`;
            });
        }
        
        await ctx.reply(analyticsMessage, { parse_mode: 'Markdown' });
    }
    
    async handleSchedule(ctx) {
        if (!await this.isAdmin(ctx)) {
            return ctx.reply('❌ Admin access required');
        }
        
        const schedules = await this.db.collection('schedules')
            .find({ active: true })
            .toArray();
        
        if (schedules.length === 0) {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '➕ Create Schedule', callback_data: 'schedule:create' }]
                ]
            };
            
            return ctx.reply(
                '⏰ *No Active Schedules*\n\n' +
                'Create a schedule to automate posting',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        }
        
        let message = '⏰ *Active Schedules*\n\n';
        
        schedules.forEach((schedule, i) => {
            message += `${i + 1}. *${schedule.name}*\n`;
            message += `   Time: ${schedule.time}\n`;
            message += `   Frequency: ${schedule.frequency}\n`;
            message += `   Destinations: ${schedule.destinations?.length || 0}\n\n`;
        });
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '➕ Add Schedule', callback_data: 'schedule:add' },
                    { text: '✏️ Edit', callback_data: 'schedule:edit' }
                ],
                [
                    { text: '🗑️ Delete', callback_data: 'schedule:delete' },
                    { text: '🔄 Refresh', callback_data: 'schedule:refresh' }
                ]
            ]
        };
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    registerCallbacks() {
        // Admin panel callbacks
        this.bot.action(/^admin:/, async (ctx) => {
            if (!await this.isAdmin(ctx)) {
                return ctx.answerCbQuery('❌ Admin access required', { show_alert: true });
            }
            
            const action = ctx.callbackQuery.data.split(':')[1];
            
            switch (action) {
                case 'refresh':
                    await ctx.deleteMessage();
                    await this.handleAdminPanel(ctx);
                    break;
                case 'post':
                    await this.handlePost(ctx);
                    break;
                case 'broadcast':
                    await ctx.reply('Use /broadcast command');
                    break;
                case 'analytics':
                    await this.handleAnalytics(ctx);
                    break;
                case 'users':
                    await this.handleUsers(ctx);
                    break;
                case 'destinations':
                    await this.handleListDestinations(ctx);
                    break;
                case 'schedules':
                    await this.handleSchedule(ctx);
                    break;
                case 'backup':
                    await this.handleBackup(ctx);
                    break;
                case 'logs':
                    await this.handleLogs(ctx);
                    break;
                case 'settings':
                    await ctx.reply('⚙️ Settings coming soon!');
                    break;
            }
            
            await ctx.answerCbQuery();
        });
        
        // Post callbacks
        this.bot.action(/^post:/, async (ctx) => {
            if (!await this.isAdmin(ctx)) {
                return ctx.answerCbQuery('❌ Admin access required', { show_alert: true });
            }
            
            const parts = ctx.callbackQuery.data.split(':');
            const action = parts[1];
            
            // Handle post actions...
            await ctx.answerCbQuery();
        });
        
        // More callback handlers...
    }
    
    truncate(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
}

module.exports = AdminCommands;