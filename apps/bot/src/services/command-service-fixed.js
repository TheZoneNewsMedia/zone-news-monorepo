/**
 * Command Service - Handles all bot commands
 */

const config = require('../config');

class CommandService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
    }
    
    async register() {
        // Middleware
        this.bot.use(async (ctx, next) => {
            if (ctx.from) {
                ctx.isAdmin = config.adminIds.includes(ctx.from.id);
            }
            await next();
        });
        
        // Register commands with Telegram
        await this.registerBotCommands();
        
        // Public commands
        this.registerPublicCommands();
        
        // Admin commands
        this.registerAdminCommands();
        
        // Callback handlers
        this.registerCallbackHandlers();
        
        // Text handler
        this.registerTextHandler();
        
        // Error handler
        this.bot.catch((err, ctx) => {
            console.error('Bot error:', err);
            ctx.reply('❌ An error occurred').catch((replyError) => {
                console.error('Failed to send error message:', replyError);
            });
        });
    }
    
    async registerBotCommands() {
        try {
            // Set bot commands visible in menu
            const commands = [
                { command: 'start', description: 'Welcome message' },
                { command: 'help', description: 'Show all commands' },
                { command: 'news', description: 'Latest news' },
                { command: 'status', description: 'Bot status' },
                { command: 'search', description: 'Search articles' },
                { command: 'miniapp', description: 'Open Mini App' },
                { command: 'settings', description: 'User settings' },
                { command: 'cancel', description: 'Cancel operation' }
            ];
            
            // Admin commands (only visible to admins)
            const adminCommands = [
                ...commands,
                { command: 'post', description: 'Post to channels' },
                { command: 'destinations', description: 'Manage destinations' },
                { command: 'addchannel', description: 'Add channel' },
                { command: 'addgroup', description: 'Add group' },
                { command: 'removedestination', description: 'Remove destination' },
                { command: 'setup', description: 'Setup wizard' },
                { command: 'discover', description: 'Discover channels' },
                { command: 'schedule', description: 'Schedule posts' },
                { command: 'broadcast', description: 'Broadcast message' },
                { command: 'addtopic', description: 'Add forum topic' },
                { command: 'listtopics', description: 'List forum topics' },
                { command: 'posttotopic', description: 'Post to topic' }
            ];
            
            // Set default commands for all users
            await this.bot.telegram.setMyCommands(commands);
            
            // Set admin commands for admin users
            for (const adminId of config.adminIds) {
                await this.bot.telegram.setMyCommands(adminCommands, {
                    scope: { type: 'chat', chat_id: adminId }
                });
            }
            
            console.log('✅ Bot commands registered with Telegram');
        } catch (error) {
            console.error('Failed to register commands:', error);
        }
    }
    
    registerPublicCommands() {
        // /start
        this.bot.command('start', async (ctx) => {
            // Check admin status
            ctx.isAdmin = config.adminIds.includes(ctx.from.id);
            
            // Track user
            await this.db.collection('users').updateOne(
                { user_id: ctx.from.id },
                {
                    $set: {
                        username: ctx.from.username,
                        first_name: ctx.from.first_name,
                        last_name: ctx.from.last_name,
                        language_code: ctx.from.language_code,
                        last_active: new Date()
                    },
                    $setOnInsert: {
                        user_id: ctx.from.id,
                        created_at: new Date()
                    }
                },
                { upsert: true }
            );
            
            const welcomeMessage = 
                '🎯 *Welcome to Zone News Bot!*\n\n' +
                'Your premier automated news distribution system\n\n' +
                '🚀 *Features:*\n' +
                '• Auto-post to multiple channels\n' +
                '• Smart content scheduling\n' +
                '• Native Telegram reactions\n' +
                '• Analytics & insights\n' +
                '• Forward from any channel to add';
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { 
                            text: '➕ Add to Channel', 
                            url: `https://t.me/${ctx.botInfo.username}?startchannel=true` 
                        },
                        { 
                            text: '➕ Add to Group', 
                            url: `https://t.me/${ctx.botInfo.username}?startgroup=true` 
                        }
                    ],
                    [
                        { text: '📰 Latest News (Coming Soon)', callback_data: 'news_coming_soon' },
                        { text: '📱 Mini App', web_app: { url: 'https://thezonenews.com/miniapp' } }
                    ],
                    [
                        { text: '📖 How to Use', callback_data: 'how_to_use' },
                        { text: '💬 Support', url: 'https://t.me/ZoneNewsSupport' }
                    ],
                    ctx.isAdmin ? [{ text: '👑 Admin Panel', callback_data: 'admin' }] : []
                ].filter(row => row.length > 0)
            };
            
            await ctx.reply(welcomeMessage, { 
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        });
        
        // /help
        this.bot.command('start', async (ctx) => {
            // Get statistics
            const [totalUsers, totalChannels, totalGroups, totalArticles] = await Promise.all([
                this.db.collection('users').countDocuments(),
                this.db.collection('destinations').countDocuments({ type: 'channel' }),
                this.db.collection('destinations').countDocuments({ type: { $in: ['group', 'forum'] } }),
                this.db.collection('news_articles').countDocuments()
            ]);
            
            // Calculate monthly active users (simplified - users who interacted in last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const monthlyUsers = await this.db.collection('user_activity').countDocuments({
                last_active: { $gte: thirtyDaysAgo }
            }) || 3; // Default to 3 if no data
            
            const welcomeMessage = 
                '🎯 *Welcome to Zone News Bot!*\n\n' +
                'Your premier automated news distribution system\n\n' +
                '🚀 *Features:*\n' +
                '• Auto-post to multiple channels\n' +
                '• Smart content scheduling\n' +
                '• Native Telegram reactions\n' +
                '• Analytics & insights\n' +
                '• Forward from any channel to add';
            
            await ctx.reply(welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { 
                                text: '➕ Add to Channel', 
                                url: `https://t.me/${ctx.botInfo.username}?startchannel=true`
                            },
                            { 
                                text: '➕ Add to Group', 
                                url: `https://t.me/${ctx.botInfo.username}?startgroup=true`
                            }
                        ],
                        [
                            { text: '📰 Latest News (Coming Soon)', callback_data: 'news_coming_soon' },
                            { text: '📱 Mini App', web_app: { url: 'https://thezonenews.com/miniapp' } }
                        ],
                        [
                            { text: '📖 How to Use', callback_data: 'how_to_use' },
                            { text: '💬 Support', url: 'https://t.me/ZoneNewsSupport' }
                        ],
                        ctx.isAdmin ? [{ text: '👑 Admin Panel', callback_data: 'admin' }] : []
                    ].filter(row => row.length > 0)
                }
            });

            if (data === 'news') {
                await this.sendLatestNews(ctx);
            } else if (data === 'search') {
                await ctx.reply('Enter your search term:');
                // Set state for search
                this.bot.context?.botService?.setState(ctx.from.id, { 
                    action: 'search',
                    step: 'waiting_for_term'
                });
            } else if (data === 'admin' && ctx.isAdmin) {
                await this.showAdminPanel(ctx);
            } else if (data === 'close') {
                await ctx.deleteMessage();
            } else if (data === 'post' && ctx.isAdmin) {
                // Start post workflow
                await this.startPostWorkflow(ctx);
            } else if (data === 'destinations' && ctx.isAdmin) {
                // Show destinations
                const destinations = await this.getDestinations();
                if (destinations.length === 0) {
                    await ctx.editMessageText('No destinations configured. Use /addchannel or /addgroup first.');
                } else {
                    const list = destinations.map((dest, i) => 
                        `${i + 1}. ${dest.type === 'channel' ? '📢' : '👥'} ${dest.name || dest.id}`
                    ).join('\n');
                    await ctx.editMessageText(`📋 *Destinations:*\n\n${list}`, { parse_mode: 'Markdown' });
                }
            }
            
            // Setup callbacks
            else if (data === 'setup_channels') {
                await ctx.editMessageText(
                    '📢 *Add Channels*\n\n' +
                    'To add a channel:\n' +
                    '1. Add the bot as admin to your channel\n' +
                    '2. Use /addchannel @channelname\n\n' +
                    'Or use /discover to auto-find channels',
                    { parse_mode: 'Markdown' }
                );
            } else if (data === 'setup_admins') {
                await ctx.editMessageText(
                    '👥 *Manage Admins*\n\n' +
                    'Current admin commands:\n' +
                    '• /addchannel - Add a channel\n' +
                    '• /addgroup - Add a group\n' +
                    '• /removedestination - Remove destination\n' +
                    '• /broadcast - Send to all destinations',
                    { parse_mode: 'Markdown' }
                );
            } else if (data === 'setup_schedules') {
                await ctx.editMessageText(
                    '⏰ *Configure Schedules*\n\n' +
                    '/schedule [time] [destination]\n\n' +
                    'Examples:\n' +
                    '• /schedule daily 09:00 @channel\n' +
                    '• /schedule tomorrow 14:30 @channel',
                    { parse_mode: 'Markdown' }
                );
            } else if (data === 'setup_discover') {
                await ctx.editMessageText(
                    '🔍 *Channel Discovery*\n\n' +
                    'Use /discover to find channels where the bot is admin',
                    { parse_mode: 'Markdown' }
                );
            }
            
            // Posting mode selection
            else if (data === 'post_single') {
                const destinations = await this.getDestinations();
                await ctx.editMessageText('Select destination:', {
                    reply_markup: {
                        inline_keyboard: destinations.map(dest => [{
                            text: `${dest.type === 'channel' ? '📢' : '👥'} ${dest.name || dest.id}`,
                            callback_data: `dest:${dest._id}`
                        }])
                    }
                });
            }
            
            else if (data === 'post_linked') {
                const destinations = await this.getDestinations();
                const channels = destinations.filter(d => d.type === 'channel');
                
                if (channels.length === 0) {
                    await ctx.editMessageText('No channels configured. Add a channel first with /addchannel');
                    return;
                }
                
                await ctx.editMessageText(
                    '🔗 *Linked Posting*\n\n' +
                    'This will:\n' +
                    '1. Post to a channel\n' +
                    '2. Forward to selected groups\n' +
                    '3. Add "Join Channel" button\n\n' +
                    'Select primary channel:',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: channels.map(ch => [{
                                text: `📢 ${ch.name || ch.id}`,
                                callback_data: `linked_channel:${ch._id}`
                            }])
                        }
                    }
                );
            }
            
            else if (data.startsWith('linked_channel:')) {
                const channelId = data.split(':')[1];
                // Store channel and show group selection
                if (this.bot.context?.botService) {
                    this.bot.context.botService.setState(ctx.from.id, {
                        action: 'linked_post',
                        channel_id: channelId,
                        step: 'select_groups'
                    });
                }
                
                const destinations = await this.getDestinations();
                const groups = destinations.filter(d => d.type === 'group' || d.type === 'forum');
                
                await ctx.editMessageText(
                    '👥 Select groups to forward to:',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                ...groups.map(g => [{
                                    text: `☐ ${g.name || g.id}`,
                                    callback_data: `toggle_group:${g._id}`
                                }]),
                                [{ text: '✅ Continue', callback_data: 'linked_continue' }],
                                [{ text: '❌ Cancel', callback_data: 'close' }]
                            ]
                        }
                    }
                );
            }
            
            else if (data.startsWith('toggle_group:')) {
                const groupId = data.split(':')[1];
                const state = this.bot.context?.botService?.getState(ctx.from.id);
                
                if (state) {
                    state.selected_groups = state.selected_groups || [];
                    const index = state.selected_groups.indexOf(groupId);
                    
                    if (index > -1) {
                        state.selected_groups.splice(index, 1);
                    } else {
                        state.selected_groups.push(groupId);
                    }
                    
                    // Update keyboard to show selection
                    const destinations = await this.getDestinations();
                    const groups = destinations.filter(d => d.type === 'group' || d.type === 'forum');
                    
                    await ctx.editMessageReplyMarkup({
                        inline_keyboard: [
                            ...groups.map(g => [{
                                text: `${state.selected_groups.includes(g._id.toString()) ? '☑' : '☐'} ${g.name || g.id}`,
                                callback_data: `toggle_group:${g._id}`
                            }]),
                            [{ text: '✅ Continue', callback_data: 'linked_continue' }],
                            [{ text: '❌ Cancel', callback_data: 'close' }]
                        ]
                    });
                }
            }
            
            else if (data === 'linked_continue') {
                const state = this.bot.context?.botService?.getState(ctx.from.id);
                if (state && state.selected_groups?.length > 0) {
                    // Show article selection
                    await this.showArticleSelectionForLinked(ctx, state);
                } else {
                    await ctx.answerCbQuery('Please select at least one group', { show_alert: true });
                }
            }
            
            // Destination selection for posting
            else if (data.startsWith('dest:')) {
                const destId = data.split(':')[1];
                // Show article selection
                await this.showArticleSelection(ctx, destId);
            }
            
            // Linked article selection
            else if (data.startsWith('linked_article:')) {
                const articleId = data.split(':')[1];
                const state = this.bot.context?.botService?.getState(ctx.from.id);
                
                if (state && state.channel_id && state.selected_groups) {
                    await ctx.editMessageText('🔄 Posting to channel and forwarding to groups...');
                    await this.postLinkedContent(ctx, articleId, state.channel_id, state.selected_groups);
                    this.bot.context.botService.clearState(ctx.from.id);
                }
            }
            
            // Article selection for posting
            else if (data.startsWith('post_article:')) {
                const [, destId, articleId] = data.split(':');
                await this.postArticleToDestination(ctx, destId, articleId);
            }
            
            // Post latest news
            else if (data.startsWith('post_latest:')) {
                const destId = data.split(':')[1];
                await this.postLatestToDestination(ctx, destId);
            }
            
            // Post custom message
            else if (data.startsWith('post_custom:')) {
                const destId = data.split(':')[1];
                await ctx.editMessageText('📝 Enter your custom message:');
                // Set state for custom message
                if (this.bot.context?.botService) {
                    this.bot.context.botService.setState(ctx.from.id, {
                        action: 'post_custom',
                        destination_id: destId,
                        step: 'waiting_for_message'
                    });
                }
            }
            
            // Destination removal
            else if (data.startsWith('remove_dest:')) {
                const destId = data.split(':')[1];
                try {
                    const { ObjectId } = require('mongodb');
                    await this.db.collection('destinations').deleteOne({
                        _id: new ObjectId(destId)
                    });
                    await ctx.editMessageText('✅ Destination removed successfully');
                } catch (err) {
                    await ctx.editMessageText('❌ Failed to remove destination');
                }
            }
            
            // Reaction callbacks
            else if (data.startsWith('like_') || data.startsWith('love_') || data.startsWith('fire_')) {
                const [reaction, articleId, currentCount] = data.split('_');
                const newCount = parseInt(currentCount) + 1;
                
                // Update reaction count in database
                await this.db.collection('article_reactions').updateOne(
                    { article_id: articleId, reaction: reaction },
                    { 
                        $inc: { count: 1 },
                        $addToSet: { users: ctx.from.id }
                    },
                    { upsert: true }
                );
                
                // Update button text
                const keyboard = ctx.callbackQuery.message.reply_markup;
                if (keyboard && keyboard.inline_keyboard) {
                    for (const row of keyboard.inline_keyboard) {
                        for (const button of row) {
                            if (button.callback_data === data) {
                                const emoji = reaction === 'like' ? '👍' : reaction === 'love' ? '❤️' : '🔥';
                                button.text = `${emoji} ${newCount}`;
                                button.callback_data = `${reaction}_${articleId}_${newCount}`;
                            }
                        }
                    }
                    
                    await ctx.editMessageReplyMarkup(keyboard);
                }
                
                await ctx.answerCbQuery(`You ${reaction}d this article!`);
                return; // Don't continue to other handlers
            }
            
            // Settings callbacks
            else if (data === 'settings_menu') {
                const settings = await this.getUserSettings(ctx.from.id);
                
                const text = 
                    '⚙️ *Settings*\n\n' +
                    `🔔 Notifications: ${settings?.notifications ? 'On' : 'Off'}\n` +
                    `🌐 Language: ${settings?.language || 'English'}\n` +
                    `📰 Categories: ${settings?.categories?.join(', ') || 'All'}\n\n` +
                    'Select an option to change:';
                
                const keyboard = {
                    inline_keyboard: [
                        [{ text: settings?.notifications ? '🔕 Disable Notifications' : '🔔 Enable Notifications', 
                           callback_data: 'toggle_notifications' }],
                        [{ text: '📂 Select Categories', callback_data: 'select_categories' }],
                        [{ text: '📱 Mini App Settings', web_app: { url: 'https://thezonenews.com/telegram-mini-app' } }],
                        [{ text: '❌ Close', callback_data: 'close' }]
                    ]
                };
                
                await ctx.editMessageText(text, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
            else if (data === 'toggle_notifications') {
                const userId = ctx.from.id;
                const settings = await this.getUserSettings(userId);
                await this.db.collection('user_settings').updateOne(
                    { user_id: userId },
                    { $set: { notifications: !settings?.notifications } },
                    { upsert: true }
                );
                await ctx.answerCbQuery('✅ Settings updated');
                // Refresh settings display
                ctx.callbackQuery.message.text = '/settings';
                await this.bot.handleUpdate(ctx.update);
            } else if (data === 'select_categories') {
                await ctx.editMessageText(
                    '📂 *Select Categories*\n\n' +
                    'Feature coming soon!',
                    { parse_mode: 'Markdown' }
                );
            }
        });
    }
    
    registerTextHandler() {
        // Handle text for interactive flows
        this.bot.on('text', async (ctx) => {
            if (!ctx.from) return;
            
            // Check if it's a channel/group link or username
            const text = ctx.message.text;
            const channelRegex = /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)|@([a-zA-Z0-9_]+)/;
            const match = text.match(channelRegex);
            
            if (match && ctx.isAdmin) {
                const username = match[1] || match[2];
                await this.handleQuickAdd(ctx, username);
                return;
            }
            
            if (!this.bot.context?.botService) return;
            
            const state = this.bot.context.botService.getState(ctx.from.id);
            if (!state) return;
            
            // Handle search
            if (state.action === 'search' && state.step === 'waiting_for_term') {
                await this.performSearch(ctx, ctx.message.text);
                this.bot.context.botService.clearState(ctx.from.id);
            }
            
            // Handle custom post message
            else if (state.action === 'post_custom' && state.step === 'waiting_for_message') {
                const destination = await this.db.collection('destinations').findOne({
                    _id: new (require('mongodb').ObjectId)(state.destination_id)
                });
                
                if (destination) {
                    try {
                        await this.bot.telegram.sendMessage(destination.id, ctx.message.text, {
                            parse_mode: 'Markdown'
                        });
                        await ctx.reply('✅ Message posted successfully!');
                    } catch (err) {
                        await ctx.reply(`❌ Failed to post: ${err.message}`);
                    }
                }
                
                this.bot.context.botService.clearState(ctx.from.id);
            }
        });
        
        // Handle forwarded messages for auto-detection
        this.bot.on('forward_date', async (ctx) => {
            if (!ctx.isAdmin) return;
            
            const forwardFrom = ctx.message.forward_from_chat;
            if (!forwardFrom) return;
            
            await this.handleForwardedChannel(ctx, forwardFrom);
        });
    }
    
    // Helper methods
    async sendLatestNews(ctx) {
        try {
            const articles = await this.db.collection('news_articles')
                .find({})
                .sort({ published_date: -1 })
                .limit(5)
                .toArray();
            
            if (articles.length === 0) {
                return ctx.reply('📰 No news articles available');
            }
            
            for (const article of articles) {
                const text = this.formatArticle(article);
                
                // Create inline keyboard with reactions and actions
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👍 0', callback_data: `like_${article._id}_0` },
                            { text: '❤️ 0', callback_data: `love_${article._id}_0` },
                            { text: '🔥 0', callback_data: `fire_${article._id}_0` }
                        ],
                        [
                            { text: '📖 Read More', url: article.url || `https://thezonenews.com/article/${article._id}` },
                            { text: '🔗 Share', url: `https://t.me/share/url?url=${encodeURIComponent(article.url || 'https://thezonenews.com')}` }
                        ]
                    ]
                };
                
                // Get existing reaction counts
                const reactions = await this.db.collection('article_reactions')
                    .find({ article_id: article._id.toString() })
                    .toArray();
                
                // Update reaction counts in keyboard
                for (const reaction of reactions) {
                    const buttonIndex = reaction.reaction === 'like' ? 0 : reaction.reaction === 'love' ? 1 : 2;
                    const emoji = reaction.reaction === 'like' ? '👍' : reaction.reaction === 'love' ? '❤️' : '🔥';
                    keyboard.inline_keyboard[0][buttonIndex].text = `${emoji} ${reaction.count || 0}`;
                    keyboard.inline_keyboard[0][buttonIndex].callback_data = `${reaction.reaction}_${article._id}_${reaction.count || 0}`;
                }
                
                await ctx.reply(text, { 
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
            
            // Add navigation buttons at the end
            const navKeyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh News', callback_data: 'news_coming_soon' },
                        { text: '📱 Open Mini App', web_app: { url: 'https://thezonenews.com/telegram-mini-app' } }
                    ],
                    [
                        { text: '🔍 Search Articles', callback_data: 'search' },
                        { text: '⚙️ Settings', callback_data: 'settings_menu' }
                    ]
                ]
            };
            
            await ctx.reply('📰 *More options:*', {
                parse_mode: 'Markdown',
                reply_markup: navKeyboard
            });
            
        } catch (error) {
            console.error('Error fetching news:', error);
            await ctx.reply('❌ Failed to fetch news');
        }
    }
    
    async performSearch(ctx, searchTerm) {
        try {
            const articles = await this.db.collection('news_articles')
                .find({
                    $or: [
                        { title: { $regex: searchTerm, $options: 'i' } },
                        { content: { $regex: searchTerm, $options: 'i' } }
                    ]
                })
                .limit(5)
                .toArray();
            
            if (articles.length === 0) {
                return ctx.reply(`No articles found for "${searchTerm}"`);
            }
            
            let resultsText = `🔍 *Search Results:*\n\n`;
            articles.forEach((article, i) => {
                resultsText += `${i + 1}. ${article.title}\n`;
            });
            
            await ctx.reply(resultsText, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Search error:', error);
            await ctx.reply('❌ Search failed');
        }
    }
    
    async showAdminPanel(ctx) {
        const text = '👑 *Admin Panel*\n\nSelect an action:';
        
        const keyboard = {
            inline_keyboard: [
                [{ text: '📝 Post Article', callback_data: 'post' }],
                [{ text: '📢 Destinations', callback_data: 'destinations' }],
                [{ text: '❌ Close', callback_data: 'close' }]
            ]
        };
        
        await ctx.reply(text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    async getDestinations() {
        return await this.db.collection('destinations').find({}).toArray();
    }
    
    async startPostWorkflow(ctx) {
        const destinations = await this.getDestinations();
        
        if (destinations.length === 0) {
            return ctx.editMessageText('No destinations configured. Use /addchannel or /addgroup first.');
        }
        
        const keyboard = {
            inline_keyboard: destinations.map(dest => [{
                text: `${dest.type === 'channel' ? '📢' : '👥'} ${dest.name || dest.id}`,
                callback_data: `dest:${dest._id}`
            }])
        };
        
        keyboard.inline_keyboard.push([{ text: '❌ Cancel', callback_data: 'close' }]);
        
        await ctx.editMessageText('📮 Select destination for posting:', {
            reply_markup: keyboard
        });
    }
    
    async showArticleSelection(ctx, destId) {
        // Get latest articles
        const articles = await this.db.collection('news_articles')
            .find({})
            .sort({ published_date: -1 })
            .limit(5)
            .toArray();
        
        if (articles.length === 0) {
            return ctx.editMessageText('No articles available to post');
        }
        
        const keyboard = {
            inline_keyboard: [
                [{ 
                    text: '📰 Post Latest Article', 
                    callback_data: `post_latest:${destId}` 
                }],
                ...articles.slice(0, 3).map(article => [{
                    text: `📄 ${article.title.substring(0, 30)}...`,
                    callback_data: `post_article:${destId}:${article._id}`
                }]),
                [{ 
                    text: '✏️ Custom Message', 
                    callback_data: `post_custom:${destId}` 
                }],
                [{ text: '❌ Cancel', callback_data: 'close' }]
            ]
        };
        
        await ctx.editMessageText('📝 Select what to post:', {
            reply_markup: keyboard
        });
    }
    
    async postArticleToDestination(ctx, destId, articleId) {
        try {
            const { ObjectId } = require('mongodb');
            
            const destination = await this.db.collection('destinations').findOne({
                _id: new ObjectId(destId)
            });
            
            const article = await this.db.collection('news_articles').findOne({
                _id: new ObjectId(articleId)
            });
            
            if (!destination || !article) {
                return ctx.editMessageText('❌ Destination or article not found');
            }
            
            const message = this.formatArticle(article);
            const options = { parse_mode: 'Markdown' };
            
            // Handle forum topics
            if (destination.is_forum && destination.default_thread_id) {
                options.message_thread_id = destination.default_thread_id;
            }
            
            await this.bot.telegram.sendMessage(destination.id, message, options);
            
            await ctx.editMessageText(
                `✅ Posted successfully!\n\n` +
                `📰 Article: ${article.title}\n` +
                `📍 Destination: ${destination.name || destination.id}`
            );
            
        } catch (error) {
            await ctx.editMessageText(`❌ Failed to post: ${error.message}`);
        }
    }
    
    async postLatestToDestination(ctx, destId) {
        try {
            const { ObjectId } = require('mongodb');
            
            const destination = await this.db.collection('destinations').findOne({
                _id: new ObjectId(destId)
            });
            
            const article = await this.db.collection('news_articles')
                .findOne({}, { sort: { published_date: -1 } });
            
            if (!destination || !article) {
                return ctx.editMessageText('❌ No articles available or destination not found');
            }
            
            const message = this.formatArticle(article);
            const options = { parse_mode: 'Markdown' };
            
            // Handle forum topics
            if (destination.is_forum && destination.default_thread_id) {
                options.message_thread_id = destination.default_thread_id;
            }
            
            await this.bot.telegram.sendMessage(destination.id, message, options);
            
            await ctx.editMessageText(
                `✅ Latest article posted!\n\n` +
                `📰 ${article.title}\n` +
                `📍 ${destination.name || destination.id}`
            );
            
        } catch (error) {
            await ctx.editMessageText(`❌ Failed to post: ${error.message}`);
        }
    }
    
    async getUserSettings(userId) {
        return await this.db.collection('user_settings').findOne({ user_id: userId });
    }
    
    formatArticle(article) {
        const date = new Date(article.published_date).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short'
        });
        
        return `📰 *${article.title}*\n\n` +
               `${article.summary || article.content?.substring(0, 200)}...\n\n` +
               `📅 ${date} | 📂 ${article.category || 'General'}\n` +
               `👁 ${article.views || 0} views`;
    }
    
    async handleReaction(ctx, reactionType, articleId) {
        const userId = ctx.from.id;
        
        try {
            // Check if user already reacted
            const existingReaction = await this.db.collection('user_reactions').findOne({
                user_id: userId,
                article_id: articleId,
                reaction: reactionType
            });
            
            if (existingReaction) {
                // Remove reaction
                await this.db.collection('user_reactions').deleteOne({
                    user_id: userId,
                    article_id: articleId,
                    reaction: reactionType
                });
                
                // Decrement count
                await this.db.collection('news_articles').updateOne(
                    { _id: new (require('mongodb').ObjectId)(articleId) },
                    { $inc: { [`reactions.${reactionType}`]: -1 } }
                );
                
                await ctx.answerCbQuery(`Removed ${reactionType} reaction`);
            } else {
                // Add reaction
                await this.db.collection('user_reactions').insertOne({
                    user_id: userId,
                    article_id: articleId,
                    reaction: reactionType,
                    created_at: new Date()
                });
                
                // Increment count
                await this.db.collection('news_articles').updateOne(
                    { _id: new (require('mongodb').ObjectId)(articleId) },
                    { $inc: { [`reactions.${reactionType}`]: 1 } }
                );
                
                await ctx.answerCbQuery(`Added ${reactionType} reaction!`);
            }
            
            // Update the message with new counts
            await this.updateReactionButtons(ctx, articleId);
        } catch (error) {
            console.error('Error handling reaction:', error);
            await ctx.answerCbQuery('Failed to update reaction', { show_alert: true });
        }
    }
    
    async handleSave(ctx, articleId) {
        const userId = ctx.from.id;
        
        try {
            // Check if already saved
            const saved = await this.db.collection('saved_articles').findOne({
                user_id: userId,
                article_id: articleId
            });
            
            if (saved) {
                await this.db.collection('saved_articles').deleteOne({
                    user_id: userId,
                    article_id: articleId
                });
                await ctx.answerCbQuery('Removed from saved articles');
            } else {
                await this.db.collection('saved_articles').insertOne({
                    user_id: userId,
                    article_id: articleId,
                    saved_at: new Date()
                });
                await ctx.answerCbQuery('✅ Article saved!');
            }
        } catch (error) {
            console.error('Error saving article:', error);
            await ctx.answerCbQuery('Failed to save article', { show_alert: true });
        }
    }
    
    async handleShare(ctx, articleId) {
        const shareUrl = `https://thezonenews.com/article/${articleId}`;
        await ctx.answerCbQuery();
        await ctx.reply(
            `🔗 Share this article:\n${shareUrl}\n\n` +
            `Or use the button below:`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { 
                            text: '📤 Share on Telegram', 
                            url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}` 
                        }
                    ]]
                }
            }
        );
    }
    
    async updateReactionButtons(ctx, articleId) {
        try {
            // Get updated article with reaction counts
            const article = await this.db.collection('news_articles').findOne({
                _id: new (require('mongodb').ObjectId)(articleId)
            });
            
            if (!article) return;
            
            const reactions = article.reactions || {};
            const likes = reactions.like || 0;
            const loves = reactions.love || 0;
            const fires = reactions.fire || 0;
            
            // Update inline keyboard
            const newKeyboard = {
                inline_keyboard: [
                    [
                        { text: `👍 ${likes}`, callback_data: `react:like:${articleId}` },
                        { text: `❤️ ${loves}`, callback_data: `react:love:${articleId}` },
                        { text: `🔥 ${fires}`, callback_data: `react:fire:${articleId}` }
                    ],
                    [
                        { text: '💬 Comment', callback_data: `comment:${articleId}` },
                        { text: '💾 Save', callback_data: `save:${articleId}` },
                        { text: '🔗 Share', callback_data: `share:${articleId}` }
                    ]
                ]
            };
            
            await ctx.editMessageReplyMarkup(newKeyboard);
        } catch (error) {
            console.error('Error updating reaction buttons:', error);
        }
    }
    
    async showArticleSelectionForLinked(ctx, state) {
        // Get latest articles
        const articles = await this.db.collection('news_articles')
            .find({})
            .sort({ published_date: -1 })
            .limit(5)
            .toArray();
        
        if (articles.length === 0) {
            return ctx.editMessageText('No articles available to post');
        }
        
        await ctx.editMessageText(
            '📰 Select article to post:',
            {
                reply_markup: {
                    inline_keyboard: articles.map(article => [{
                        text: `📄 ${article.title.substring(0, 40)}...`,
                        callback_data: `linked_article:${article._id}`
                    }])
                }
            }
        );
    }
    
    async handleQuickAdd(ctx, username) {
        // Send processing message
        const processingMsg = await ctx.reply(
            '🔍 Detecting channel/group...\n\n' +
            `Looking up: @${username}`
        );
        
        try {
            // Try to get chat info
            const chat = await ctx.telegram.getChat('@' + username);
            
            // Check if already exists
            const existing = await this.db.collection('destinations').findOne({
                $or: [
                    { id: chat.id.toString() },
                    { username: '@' + username }
                ]
            });
            
            if (existing) {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    processingMsg.message_id,
                    null,
                    `✅ *Already Added*\n\n` +
                    `${chat.type === 'channel' ? '📢' : '👥'} ${chat.title}\n` +
                    `Username: @${username}\n` +
                    `Type: ${chat.type}`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Add inline keyboard for confirmation
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                processingMsg.message_id,
                null,
                `🔍 *Found ${chat.type === 'channel' ? 'Channel' : 'Group'}*\n\n` +
                `📌 Name: ${chat.title}\n` +
                `👤 Username: @${username}\n` +
                `🆔 ID: \`${chat.id}\`\n` +
                `📝 Type: ${chat.type}\n` +
                `${chat.description ? `📄 Description: ${chat.description.substring(0, 100)}...\n` : ''}\n` +
                `Would you like to add this ${chat.type}?`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Add', callback_data: `quick_add:${chat.id}:${chat.type}` },
                                { text: '❌ Cancel', callback_data: 'close' }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                processingMsg.message_id,
                null,
                `❌ Could not find @${username}\n\n` +
                `Make sure:\n` +
                `• The username is correct\n` +
                `• It's a public channel/group\n` +
                `• Or use /addchannel with chat ID`
            );
        }
    }
    
    async handleForwardedChannel(ctx, forwardFrom) {
        // Check if already exists
        const existing = await this.db.collection('destinations').findOne({
            id: forwardFrom.id.toString()
        });
        
        if (existing) {
            await ctx.reply(
                `✅ *Already Added*\n\n` +
                `${forwardFrom.type === 'channel' ? '📢' : '👥'} ${forwardFrom.title}\n` +
                `Type: ${forwardFrom.type}\n` +
                `Added: ${new Date(existing.added_at).toLocaleDateString('en-AU')}`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        // Show info with add button
        await ctx.reply(
            `🎯 *Auto-Detected from Forward*\n\n` +
            `${forwardFrom.type === 'channel' ? '📢 Channel' : '👥 Group'}: ${forwardFrom.title}\n` +
            `🆔 ID: \`${forwardFrom.id}\`\n` +
            `${forwardFrom.username ? `👤 @${forwardFrom.username}\n` : ''}\n` +
            `Would you like to add this ${forwardFrom.type}?`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Add to Bot', callback_data: `auto_add:${forwardFrom.id}:${forwardFrom.type}:${forwardFrom.title}` }
                        ],
                        [
                            { text: '🔍 Check Bot Status', callback_data: `check_status:${forwardFrom.id}` }
                        ],
                        [
                            { text: '❌ Cancel', callback_data: 'close' }
                        ]
                    ]
                }
            }
        );
    }
    
    async postLinkedContent(ctx, articleId, channelDestId, groupDestIds) {
        try {
            const article = await this.db.collection('news_articles').findOne({
                _id: new (require('mongodb').ObjectId)(articleId)
            });
            
            if (!article) {
                await ctx.reply('Article not found');
                return;
            }
            
            // Get channel destination
            const channel = await this.db.collection('destinations').findOne({
                _id: new (require('mongodb').ObjectId)(channelDestId)
            });
            
            if (!channel) {
                await ctx.reply('Channel not found');
                return;
            }
            
            // Format the message
            const message = this.formatArticle(article);
            
            // Create keyboard with reactions and join button
            const channelUsername = channel.username || channel.id;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: `👍 0`, callback_data: `react:like:${articleId}` },
                        { text: `❤️ 0`, callback_data: `react:love:${articleId}` },
                        { text: `🔥 0`, callback_data: `react:fire:${articleId}` }
                    ],
                    [
                        { text: '📢 Join Channel', url: `https://t.me/${channelUsername.replace('@', '')}` },
                        { text: '💬 Discuss', url: `https://t.me/${channelUsername.replace('@', '')}` }
                    ],
                    [
                        { text: '🔗 Share', callback_data: `share:${articleId}` },
                        { text: '💾 Save', callback_data: `save:${articleId}` }
                    ]
                ]
            };
            
            // Post to channel first
            const channelPost = await ctx.telegram.sendMessage(
                channel.id,
                message + '\n\n👁 Views: Will update with native Telegram counter',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
            
            // Forward to each selected group
            for (const groupId of groupDestIds) {
                const group = await this.db.collection('destinations').findOne({
                    _id: new (require('mongodb').ObjectId)(groupId)
                });
                
                if (group) {
                    try {
                        // Forward the message to preserve views counter
                        await ctx.telegram.forwardMessage(
                            group.id,
                            channel.id,
                            channelPost.message_id
                        );
                        
                        // Send a follow-up with interactive buttons
                        await ctx.telegram.sendMessage(
                            group.id,
                            `💬 *Discussion for above post*\n\n` +
                            `React and discuss here!`,
                            {
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: `👍 Like`, callback_data: `react:like:${articleId}` },
                                            { text: `❤️ Love`, callback_data: `react:love:${articleId}` },
                                            { text: `🔥 Fire`, callback_data: `react:fire:${articleId}` }
                                        ],
                                        [
                                            { text: '📢 Join Channel', url: `https://t.me/${channelUsername.replace('@', '')}` },
                                            { text: '🔗 Share', url: `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${channelUsername.replace('@', '')}/${channelPost.message_id}`)}` }
                                        ]
                                    ]
                                }
                            }
                        );
                    } catch (error) {
                        console.error(`Failed to forward to group ${group.name}:`, error.message);
                    }
                }
            }
            
            // Store posting record
            await this.db.collection('posted_articles').insertOne({
                article_id: articleId,
                channel_id: channelDestId,
                channel_message_id: channelPost.message_id,
                forwarded_to: groupDestIds,
                posted_at: new Date(),
                posted_by: ctx.from.id
            });
            
            await ctx.reply(
                `✅ *Posted Successfully!*\n\n` +
                `📢 Channel: ${channel.name}\n` +
                `👥 Forwarded to: ${groupDestIds.length} groups\n` +
                `👁 Native Telegram views enabled\n` +
                `💬 Discussion links added`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Error in linked posting:', error);
            await ctx.reply(`❌ Failed to post: ${error.message}`);
        }
    }
    
    async quickAddDestination(ctx, chatId, chatType) {
        try {
            await this.db.collection('destinations').insertOne({
                id: chatId,
                type: chatType,
                verified: true,
                added_at: new Date(),
                added_by: ctx.from.id,
                added_via: 'quick_add'
            });
            
            await ctx.editMessageText(
                `✅ Successfully added ${chatType}!\n\n` +
                `Use /destinations to view all destinations\n` +
                `Use /post to start posting`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            await ctx.editMessageText(`❌ Failed to add: ${error.message}`);
        }
    }
    
    async autoAddDestination(ctx, chatId, chatType, title) {
        try {
            await this.db.collection('destinations').insertOne({
                id: chatId,
                type: chatType,
                name: title,
                verified: true,
                added_at: new Date(),
                added_by: ctx.from.id,
                added_via: 'forward'
            });
            
            await ctx.editMessageText(
                `✅ *Successfully Added!*\n\n` +
                `${chatType === 'channel' ? '📢' : '👥'} ${title}\n` +
                `🆔 ID: \`${chatId}\`\n\n` +
                `You can now post to this ${chatType} using /post`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            await ctx.editMessageText(`❌ Failed to add: ${error.message}`);
        }
    }
    
    async checkBotStatus(ctx, chatId) {
        try {
            const member = await ctx.telegram.getChatMember(chatId, ctx.botInfo.id);
            const statusEmoji = member.status === 'administrator' ? '✅' : '⚠️';
            
            await ctx.answerCbQuery(
                `${statusEmoji} Bot is ${member.status} in this chat`,
                { show_alert: true }
            );
        } catch (error) {
            await ctx.answerCbQuery(
                '❌ Bot is not in this chat',
                { show_alert: true }
            );
        }
        
        // Handle coming soon callback
        this.bot.action('news_coming_soon', async (ctx) => {
            await ctx.answerCbQuery('📰 News feature coming soon! Stay tuned.', { show_alert: true });
        });
    }
}

module.exports = CommandService;
