/**
 * Start Command Handler
 */

const { Markup } = require('telegraf');

class StartCommand {
    constructor(bot, db, setupWizard) {
        this.bot = bot;
        this.db = db;
        this.setupWizard = setupWizard;
    }
    
    async handle(ctx) {
        const userId = ctx.from.id;
        const isPrivateChat = ctx.chat.type === 'private';
        
        if (!isPrivateChat) {
            return ctx.reply('👋 Hi! Please start me in a private chat for the full experience.');
        }
        
        // Check if user needs setup
        const needsSetup = await this.setupWizard.needsSetup(userId);
        
        if (needsSetup) {
            // Start onboarding wizard
            return this.setupWizard.startWizard(ctx);
        }
        
        // Get user preferences
        const user = await this.db.collection('users').findOne({ user_id: userId });
        const firstName = ctx.from.first_name || 'there';
        
        const welcomeMessage = 
            `👋 Welcome back, ${firstName}!\n\n` +
            `*Zone News Bot* - Your Adelaide News Companion\n\n` +
            `📰 Latest news from your preferred categories\n` +
            `🔍 Smart search across all articles\n` +
            `📊 Track engagement with reactions\n` +
            `⚡ Real-time updates\n\n` +
            `Current Settings:\n` +
            `📍 City: ${user?.city || 'Adelaide'}\n` +
            `📂 Categories: ${user?.categories?.join(', ') || 'All'}\n` +
            `🔔 Notifications: ${user?.notifications || 'Enabled'}\n\n` +
            `What would you like to do?`;
        
        const keyboard = [
            [
                Markup.button.callback('📰 Latest News', 'news:latest'),
                Markup.button.callback('🔍 Search', 'search:start')
            ],
            [
                Markup.button.callback('🎯 Discover', 'discover:trending'),
                Markup.button.callback('⚙️ Settings', 'settings:main')
            ],
            [
                Markup.button.callback('📱 Mini App', 'miniapp:open'),
                Markup.button.callback('❓ Help', 'help:commands')
            ]
        ];
        
        // Add admin button if user is admin
        const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];
        if (adminIds.includes(userId)) {
            keyboard.push([
                Markup.button.callback('👑 Admin Panel', 'admin:panel')
            ]);
        }
        
        await ctx.reply(welcomeMessage, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
        // Update last active
        await this.db.collection('users').updateOne(
            { user_id: userId },
            { $set: { last_active: new Date() } }
        );
    }
}

module.exports = StartCommand;
