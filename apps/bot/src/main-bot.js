#!/usr/bin/env node

/**
 * Zone News Bot - Main Consolidated Version
 * Merges all useful features from multiple bot files
 */

const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

// Import command services
const StartCommand = require('./services/commands/start-command');
const PublicCommands = require('./services/public-commands');
const AdminCommands = require('./services/admin-commands');
const SetupWizard = require('./services/setup-wizard');

// Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

// Security check
if (!BOT_TOKEN) {
    console.error('❌ CRITICAL: Bot token not found in environment variables');
    console.error('Please set TELEGRAM_BOT_TOKEN or BOT_TOKEN in your .env file');
    process.exit(1);
}
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const ADMIN_IDS = (process.env.ADMIN_IDS || '7802629063').split(',').map(id => parseInt(id));

// TBC Forum Configuration
const TBC_CHAT_ID = -1002393922251;
const TBC_TOPICS = {
    40149: 'Adelaide Business & Crypto 💼',
    40147: 'Community Events & Lifestyle 🎉'
};

class ZoneNewsBot {
    constructor() {
        this.bot = new Telegraf(BOT_TOKEN);
        this.db = null;
        this.postWizardState = new Map(); // For interactive posting
        
        // Initialize command services
        this.setupWizard = null;
        this.startCommand = null;
        this.publicCommands = null;
        this.adminCommands = null;
        
        this.setupDatabase();
        this.initializeCommands();
        this.setupCallbackHandlers();
    }

    async setupDatabase() {
        try {
            const client = await MongoClient.connect(MONGODB_URI);
            this.db = client.db('zone_news_production');
            console.log('✅ Connected to MongoDB');
        } catch (error) {
            console.error('❌ MongoDB connection failed:', error);
        }
    }

    async initializeCommands() {
        try {
            // Wait for database to be ready
            while (!this.db) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Initialize command services
            this.setupWizard = new SetupWizard(this.bot, this.db);
            this.startCommand = new StartCommand(this.bot, this.db, this.setupWizard);
            this.publicCommands = new PublicCommands(this.bot, this.db);
            this.adminCommands = new AdminCommands(this.bot, this.db);
            
            // Register commands
            this.bot.command('start', (ctx) => this.startCommand.handle(ctx));
            this.publicCommands.register();
            this.adminCommands.register();
            
            // Keep existing admin posting commands for backward compatibility
            this.bot.command('post', (ctx) => this.handleInteractivePost(ctx));
            this.bot.command('posttext', (ctx) => this.handlePostText(ctx));
            this.bot.command('tbcpost', (ctx) => this.handleTBCPost(ctx));
            this.bot.command('tbchelp', (ctx) => this.handleTBCHelp(ctx));
            
            console.log('✅ Command services initialized');
        } catch (error) {
            console.error('❌ Failed to initialize commands:', error);
        }
    }

    setupCallbackHandlers() {
        // Channel/group selection
        this.bot.action(/^select_(channel|group)_(.+)$/, (ctx) => this.handleSelection(ctx));
        this.bot.action('select_all_channels', (ctx) => this.handleSelectAll(ctx, 'channels'));
        this.bot.action('select_all_groups', (ctx) => this.handleSelectAll(ctx, 'groups'));
        this.bot.action('confirm_post', (ctx) => this.handleConfirmPost(ctx));
        this.bot.action('cancel_post', (ctx) => this.handleCancelPost(ctx));
        this.bot.action('edit_text', (ctx) => this.handleEditText(ctx));
        
        // TBC topic selection
        this.bot.action(/^tbc_topic_(\d+)$/, (ctx) => this.handleTBCTopicSelection(ctx));
    }

    // Legacy Command Handlers (for backward compatibility)

    async handleInteractivePost(ctx) {
        const userId = ctx.from.id;
        
        // Check admin permission
        if (!ADMIN_IDS.includes(userId)) {
            return ctx.reply('❌ You are not authorized to use this command.');
        }

        // Initialize wizard state
        this.postWizardState.set(userId, {
            selectedChannels: new Set(),
            selectedGroups: new Set(),
            text: null,
            lastUsed: []
        });

        // Get available channels and groups
        const destinations = await this.getAvailableDestinations();
        
        if (destinations.channels.length === 0 && destinations.groups.length === 0) {
            return ctx.reply('❌ No channels or groups configured. Add the bot as admin to channels/groups first.');
        }

        // Build selection keyboard
        const keyboard = {
            inline_keyboard: []
        };

        // Add channels
        if (destinations.channels.length > 0) {
            keyboard.inline_keyboard.push([{ 
                text: '📢 SELECT ALL CHANNELS', 
                callback_data: 'select_all_channels' 
            }]);
            
            destinations.channels.forEach(channel => {
                keyboard.inline_keyboard.push([{
                    text: `📢 ${channel.title}`,
                    callback_data: `select_channel_${channel.id}`
                }]);
            });
        }

        // Add groups
        if (destinations.groups.length > 0) {
            keyboard.inline_keyboard.push([{ 
                text: '👥 SELECT ALL GROUPS', 
                callback_data: 'select_all_groups' 
            }]);
            
            destinations.groups.forEach(group => {
                keyboard.inline_keyboard.push([{
                    text: `👥 ${group.title}`,
                    callback_data: `select_group_${group.id}`
                }]);
            });
        }

        // Add control buttons
        keyboard.inline_keyboard.push([
            { text: '✅ Confirm Selection', callback_data: 'confirm_post' },
            { text: '❌ Cancel', callback_data: 'cancel_post' }
        ]);

        await ctx.reply(
            '🎯 Select channels/groups for posting:\n\n' +
            '• Tap to select/deselect\n' +
            '• Selected items will show ✅\n' +
            '• Tap "Confirm" when ready',
            { reply_markup: keyboard }
        );
    }

    async handleSelection(ctx) {
        const userId = ctx.from.id;
        const state = this.postWizardState.get(userId);
        
        if (!state) {
            return ctx.answerCbQuery('Session expired. Please use /post again.');
        }

        const [, type, id] = ctx.match;
        const collection = type === 'channel' ? state.selectedChannels : state.selectedGroups;
        
        if (collection.has(id)) {
            collection.delete(id);
            await ctx.answerCbQuery(`❌ Deselected`);
        } else {
            collection.add(id);
            await ctx.answerCbQuery(`✅ Selected`);
        }

        // Update message to show selection count
        const totalSelected = state.selectedChannels.size + state.selectedGroups.size;
        await this.updateSelectionMessage(ctx, totalSelected);
    }

    async handleSelectAll(ctx, type) {
        const userId = ctx.from.id;
        const state = this.postWizardState.get(userId);
        
        if (!state) {
            return ctx.answerCbQuery('Session expired. Please use /post again.');
        }

        const destinations = await this.getAvailableDestinations();
        const items = type === 'channels' ? destinations.channels : destinations.groups;
        const collection = type === 'channels' ? state.selectedChannels : state.selectedGroups;
        
        // Toggle all
        if (collection.size === items.length) {
            collection.clear();
            await ctx.answerCbQuery(`❌ Deselected all ${type}`);
        } else {
            items.forEach(item => collection.add(item.id));
            await ctx.answerCbQuery(`✅ Selected all ${type}`);
        }

        const totalSelected = state.selectedChannels.size + state.selectedGroups.size;
        await this.updateSelectionMessage(ctx, totalSelected);
    }

    async handleConfirmPost(ctx) {
        const userId = ctx.from.id;
        const state = this.postWizardState.get(userId);
        
        if (!state) {
            return ctx.answerCbQuery('Session expired. Please use /post again.');
        }

        const totalSelected = state.selectedChannels.size + state.selectedGroups.size;
        
        if (totalSelected === 0) {
            return ctx.answerCbQuery('⚠️ Please select at least one destination');
        }

        // Get or create post content
        const article = await this.getLatestArticle();
        if (!article) {
            await ctx.editMessageText('❌ No articles available to post.');
            return;
        }

        const postText = state.text || this.formatArticle(article);
        
        // Show preview
        const keyboard = {
            inline_keyboard: [
                [{ text: '✏️ Edit Text', callback_data: 'edit_text' }],
                [
                    { text: '✅ Send Now', callback_data: 'send_post' },
                    { text: '❌ Cancel', callback_data: 'cancel_post' }
                ]
            ]
        };

        await ctx.editMessageText(
            `📝 Preview:\n\n${postText}\n\n` +
            `📍 Will send to ${totalSelected} destination(s)\n` +
            `Channels: ${state.selectedChannels.size} | Groups: ${state.selectedGroups.size}`,
            { reply_markup: keyboard, parse_mode: 'HTML' }
        );
    }

    async handleCancelPost(ctx) {
        const userId = ctx.from.id;
        this.postWizardState.delete(userId);
        await ctx.editMessageText('❌ Post cancelled.');
        await ctx.answerCbQuery('Cancelled');
    }

    async handleEditText(ctx) {
        await ctx.editMessageText(
            '✏️ Send me the new text for the post.\n\n' +
            'Or use: /posttext <your text>'
        );
        await ctx.answerCbQuery('Send the new text');
    }

    async handlePostText(ctx) {
        const userId = ctx.from.id;
        const text = ctx.message.text.replace('/posttext', '').trim();
        
        if (!text) {
            return ctx.reply('Please provide text. Usage: /posttext <your text>');
        }

        if (!this.postWizardState.has(userId)) {
            this.postWizardState.set(userId, {
                selectedChannels: new Set(),
                selectedGroups: new Set(),
                text: null,
                lastUsed: []
            });
        }

        const state = this.postWizardState.get(userId);
        state.text = text;
        
        await ctx.reply('✅ Text updated. Use /post to continue.');
    }

    // TBC Forum Handlers
    async handleTBCPost(ctx) {
        const userId = ctx.from.id;
        
        if (!ADMIN_IDS.includes(userId)) {
            return ctx.reply('❌ You are not authorized to post to TBC.');
        }

        const keyboard = {
            inline_keyboard: Object.entries(TBC_TOPICS).map(([topicId, name]) => [{
                text: name,
                callback_data: `tbc_topic_${topicId}`
            }])
        };

        await ctx.reply('📍 Select TBC topic:', { reply_markup: keyboard });
    }

    async handleTBCTopicSelection(ctx) {
        const topicId = parseInt(ctx.match[1]);
        const topicName = TBC_TOPICS[topicId];
        
        const article = await this.getLatestArticle();
        if (!article) {
            return ctx.answerCbQuery('No articles available');
        }

        try {
            await this.bot.telegram.sendMessage(
                TBC_CHAT_ID,
                this.formatArticle(article),
                {
                    message_thread_id: topicId,
                    parse_mode: 'HTML'
                }
            );
            
            await ctx.editMessageText(`✅ Posted to TBC: ${topicName}`);
            await ctx.answerCbQuery('Posted successfully');
        } catch (error) {
            console.error('TBC post error:', error);
            await ctx.answerCbQuery('Failed to post');
        }
    }

    async handleTBCHelp(ctx) {
        const help = `
🏢 TBC Forum Posting Guide

Available Topics:
${Object.entries(TBC_TOPICS).map(([id, name]) => `• ${name}`).join('\n')}

Commands:
/tbcpost - Select topic and post
/tbchelp - This guide

Note: Only admins can post to TBC.
        `;
        await ctx.reply(help);
    }

    // Stats Handler
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
        
        await ctx.reply(
            `📊 Bot Statistics\n\n` +
            `📰 Total Articles: ${stat.total}\n` +
            `✅ Posted: ${stat.posted}\n` +
            `⏳ Pending: ${stat.total - stat.posted}\n\n` +
            `🤖 Bot: @${ctx.botInfo.username}`
        );
    }

    // Admin Handler
    async handleAdmin(ctx) {
        const userId = ctx.from.id;
        
        if (!ADMIN_IDS.includes(userId)) {
            return ctx.reply('❌ Admin access only.');
        }

        const adminMenu = `
👨‍💼 Admin Panel

Database: ${this.db ? '✅ Connected' : '❌ Disconnected'}
Admins: ${ADMIN_IDS.join(', ')}

Available Commands:
/post - Interactive posting
/stats - View statistics
/tbcpost - Post to TBC forum

Maintenance:
• Check logs: pm2 logs zone-bot
• Restart: pm2 restart zone-bot
• Monitor: pm2 monit
        `;
        
        await ctx.reply(adminMenu);
    }

    // Helper Methods
    async getAvailableDestinations() {
        // In production, this would fetch from database
        // For now, return mock data
        return {
            channels: [
                { id: '@ZoneNewsAdl', title: 'Zone News Adelaide' }
            ],
            groups: [
                { id: '-1001234567890', title: 'Test Group' }
            ]
        };
    }

    async getLatestArticle() {
        if (!this.db) return null;
        
        return await this.db.collection('news_articles')
            .findOne(
                { posted_to_channel: { $ne: true } },
                { sort: { published_date: -1 } }
            );
    }

    formatArticle(article) {
        if (!article) return 'No content available';
        
        return `
📰 <b>${article.title}</b>

${article.content || article.excerpt || ''}

${article.source ? `\n📍 Source: ${article.source}` : ''}
${article.category ? `\n🏷 ${article.category}` : ''}
        `.trim();
    }

    async updateSelectionMessage(ctx, count) {
        try {
            // Update just the first line to show count
            const currentText = ctx.callbackQuery.message.text;
            const lines = currentText.split('\n');
            lines[0] = `🎯 Select channels/groups (${count} selected):`;
            
            // Don't update if text hasn't changed
            if (lines.join('\n') !== currentText) {
                await ctx.editMessageText(lines.join('\n'), {
                    reply_markup: ctx.callbackQuery.message.reply_markup
                });
            }
        } catch (error) {
            // Handle message modification errors (usually "message not modified")
            if (error.message && !error.message.includes('message is not modified')) {
                console.warn('Failed to update selection message:', {
                    userId: userId,
                    error: error.message
                });
            }
        }
    }

    async start() {
        try {
            await this.bot.launch();
            console.log('✅ Zone News Bot started successfully!');
            console.log('Bot ready! Test commands in Telegram: @ZoneNewsBot');
            
            // Graceful shutdown
            process.once('SIGINT', () => this.bot.stop('SIGINT'));
            process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
        } catch (error) {
            console.error('❌ Failed to start bot:', error);
            process.exit(1);
        }
    }
}

// Export the class for testing
module.exports = ZoneNewsBot;

// Start the bot only when run directly (not when imported for testing)
if (require.main === module) {
    const bot = new ZoneNewsBot();
    bot.start();
}
