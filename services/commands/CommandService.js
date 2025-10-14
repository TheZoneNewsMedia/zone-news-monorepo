/**
 * CommandService - Handles all bot commands
 * Single Responsibility: Process and route bot commands
 */

class CommandService {
    constructor(database, postingService) {
        this.bot = null;
        this.db = database;
        this.postingService = postingService;
        this.wizardState = new Map();
        this.adminIds = (process.env.ADMIN_IDS || '7802629063').split(',').map(id => parseInt(id));
    }

    setBot(bot) {
        this.bot = bot;
        this.registerCommands();
        this.registerCallbacks();
    }

    async initialize() {
        console.log('  📝 Commands registered');
    }

    /**
     * Register all bot commands
     */
    registerCommands() {
        // Public commands
        this.bot.command('start', (ctx) => this.handleStart(ctx));
        this.bot.command('help', (ctx) => this.handleHelp(ctx));
        this.bot.command('stats', (ctx) => this.handleStats(ctx));
        
        // Admin commands
        this.bot.command('post', (ctx) => this.handleInteractivePost(ctx));
        this.bot.command('admin', (ctx) => this.handleAdmin(ctx));
        this.bot.command('autopost', (ctx) => this.handleAutoPost(ctx));
    }

    /**
     * Register callback handlers
     */
    registerCallbacks() {
        // Interactive posting callbacks
        this.bot.action(/^select_channel_(.+)$/, (ctx) => this.handleChannelSelection(ctx));
        this.bot.action('select_all', (ctx) => this.handleSelectAll(ctx));
        this.bot.action('confirm_post', (ctx) => this.handleConfirmPost(ctx));
        this.bot.action('cancel_post', (ctx) => this.handleCancelPost(ctx));
    }

    /**
     * /start command
     */
    async handleStart(ctx) {
        const welcome = `
🎯 Welcome to Zone News Bot!

Your premier news distribution system for Adelaide.

📝 Commands:
/help - Show all commands
/stats - View statistics
/post - Post news (admin only)

🤖 Powered by modular microservices architecture
        `;
        await ctx.reply(welcome);
    }

    /**
     * /help command
     */
    async handleHelp(ctx) {
        const isAdmin = this.adminIds.includes(ctx.from.id);
        
        let helpText = `
📚 Zone News Bot Commands

📊 Public Commands:
/start - Welcome message
/help - This help menu
/stats - Bot statistics
        `;
        
        if (isAdmin) {
            helpText += `
👨‍💼 Admin Commands:
/post - Interactive posting wizard
/admin - Admin dashboard
/autopost [on/off] - Toggle auto-posting
            `;
        }
        
        await ctx.reply(helpText);
    }

    /**
     * /stats command
     */
    async handleStats(ctx) {
        if (!this.db) {
            return ctx.reply('❌ Database not connected');
        }

        const stats = await this.db.collection('news_articles').aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    posted: { $sum: { $cond: ['$posted_to_channel', 1, 0] } }
                }
            }
        ]).toArray();

        const stat = stats[0] || { total: 0, posted: 0 };
        const reactions = await this.db.collection('reactions').countDocuments();
        
        await ctx.reply(
            `📊 Bot Statistics\n\n` +
            `📰 Total Articles: ${stat.total}\n` +
            `✅ Posted: ${stat.posted}\n` +
            `⏳ Pending: ${stat.total - stat.posted}\n` +
            `👍 Total Reactions: ${reactions}\n\n` +
            `🤖 Bot: @${ctx.botInfo.username}`
        );
    }

    /**
     * /post command - Interactive posting wizard
     */
    async handleInteractivePost(ctx) {
        const userId = ctx.from.id;
        
        if (!this.adminIds.includes(userId)) {
            return ctx.reply('❌ You are not authorized to use this command.');
        }

        // Get unposted article
        const article = await this.db.collection('news_articles')
            .findOne({ posted_to_channel: { $ne: true } });
        
        if (!article) {
            return ctx.reply('❌ No articles available to post.');
        }

        // Initialize wizard state
        this.wizardState.set(userId, {
            article: article,
            selectedChannels: new Set()
        });

        // Build channel selection keyboard
        const channels = [
            { id: '@ZoneNewsAdl', name: 'Zone News Adelaide' }
        ];

        const keyboard = {
            inline_keyboard: [
                [{ text: '📢 SELECT ALL', callback_data: 'select_all' }],
                ...channels.map(ch => [{
                    text: `📢 ${ch.name}`,
                    callback_data: `select_channel_${ch.id}`
                }]),
                [
                    { text: '✅ Confirm', callback_data: 'confirm_post' },
                    { text: '❌ Cancel', callback_data: 'cancel_post' }
                ]
            ]
        };

        const preview = this.postingService.formatArticle(article);
        
        await ctx.reply(
            `📝 Article Preview:\n\n${preview}\n\n` +
            `Select channels to post to:`,
            { 
                reply_markup: keyboard,
                parse_mode: 'HTML'
            }
        );
    }

    /**
     * Handle channel selection
     */
    async handleChannelSelection(ctx) {
        const userId = ctx.from.id;
        const state = this.wizardState.get(userId);
        
        if (!state) {
            return ctx.answerCbQuery('Session expired. Use /post again.');
        }

        const channelId = ctx.match[1];
        
        if (state.selectedChannels.has(channelId)) {
            state.selectedChannels.delete(channelId);
            await ctx.answerCbQuery('❌ Deselected');
        } else {
            state.selectedChannels.add(channelId);
            await ctx.answerCbQuery('✅ Selected');
        }
    }

    /**
     * Handle select all
     */
    async handleSelectAll(ctx) {
        const userId = ctx.from.id;
        const state = this.wizardState.get(userId);
        
        if (!state) {
            return ctx.answerCbQuery('Session expired.');
        }

        state.selectedChannels.add('@ZoneNewsAdl');
        await ctx.answerCbQuery('✅ All selected');
    }

    /**
     * Handle confirm post
     */
    async handleConfirmPost(ctx) {
        const userId = ctx.from.id;
        const state = this.wizardState.get(userId);
        
        if (!state) {
            return ctx.answerCbQuery('Session expired.');
        }

        if (state.selectedChannels.size === 0) {
            return ctx.answerCbQuery('⚠️ Select at least one channel');
        }

        // Post to selected channels
        const channels = Array.from(state.selectedChannels);
        const results = await this.postingService.postToMultipleChannels(
            channels,
            state.article
        );

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        await ctx.editMessageText(
            `✅ Posting complete!\n\n` +
            `Success: ${successful}\n` +
            `Failed: ${failed}`
        );

        this.wizardState.delete(userId);
    }

    /**
     * Handle cancel post
     */
    async handleCancelPost(ctx) {
        const userId = ctx.from.id;
        this.wizardState.delete(userId);
        await ctx.editMessageText('❌ Post cancelled.');
    }

    /**
     * /admin command
     */
    async handleAdmin(ctx) {
        if (!this.adminIds.includes(ctx.from.id)) {
            return ctx.reply('❌ Admin access only.');
        }

        const adminPanel = `
👨‍💼 Admin Dashboard

📊 Services Status:
• Bot: ✅ Running
• Database: ${this.db ? '✅ Connected' : '❌ Disconnected'}
• Auto-posting: ${this.postingService.isAutoPosting ? '✅ Active' : '⏸ Inactive'}

🛠 Commands:
/post - Interactive posting
/autopost [on/off] - Toggle auto-posting
/stats - View statistics

👥 Admins: ${this.adminIds.join(', ')}
        `;
        
        await ctx.reply(adminPanel);
    }

    /**
     * /autopost command
     */
    async handleAutoPost(ctx) {
        if (!this.adminIds.includes(ctx.from.id)) {
            return ctx.reply('❌ Admin access only.');
        }

        const args = ctx.message.text.split(' ')[1];
        
        if (args === 'on') {
            this.postingService.startAutoPosting();
            await ctx.reply('✅ Auto-posting enabled');
        } else if (args === 'off') {
            this.postingService.stopAutoPosting();
            await ctx.reply('⏸ Auto-posting disabled');
        } else {
            const status = this.postingService.isAutoPosting ? 'ON' : 'OFF';
            await ctx.reply(`Auto-posting is currently ${status}\n\nUsage: /autopost [on/off]`);
        }
    }
}

module.exports = CommandService;