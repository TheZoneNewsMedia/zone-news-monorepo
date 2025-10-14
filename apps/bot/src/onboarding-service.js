/**
 * Zone News Onboarding Service
 * Interactive walkthrough for new admins to set up posting
 */

class OnboardingService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.adminIds = [8123893898]; // @TheZoneNews
        this.onboardingStates = new Map();
        this.setupHandlers();
    }

    setupHandlers() {
        // /setup command - Start onboarding
        this.bot.command('setup', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check if admin
            if (!this.adminIds.includes(userId)) {
                return ctx.reply(
                    '🔒 *Admin Setup*\n\n' +
                    'This setup wizard is only for administrators.\n\n' +
                    'Regular users can:\n' +
                    '• View news with /news\n' +
                    '• Check status with /status\n' +
                    '• Get help with /help\n\n' +
                    '💎 For admin access, contact @TheZoneNews',
                    { parse_mode: 'Markdown' }
                );
            }
            
            // Check if already set up
            const userConfig = await this.getUserConfig(userId);
            
            if (userConfig?.completedSetup) {
                return ctx.reply(
                    '✅ *Setup Already Complete!*\n\n' +
                    'You have already completed the setup.\n\n' +
                    '*Your commands:*\n' +
                    '• /post - Post articles\n' +
                    '• /mydestinations - View destinations\n' +
                    '• /addchannel - Add channel\n' +
                    '• /addgroup - Add group\n' +
                    '• /addtopic - Add forum topic\n\n' +
                    'To reset and start over: /resetsetup',
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Post Now', callback_data: 'quick_post' }],
                                [{ text: '📍 View Destinations', callback_data: 'view_destinations' }]
                            ]
                        }
                    }
                );
            }
            
            // Start onboarding
            this.onboardingStates.set(userId, { step: 'welcome' });
            
            await ctx.reply(
                '👋 *Welcome to Zone News Admin Setup!*\n\n' +
                'I\'ll walk you through setting up your posting destinations.\n\n' +
                '📚 *What we\'ll cover:*\n' +
                '1️⃣ Understanding destination types\n' +
                '2️⃣ Adding your first destination\n' +
                '3️⃣ Testing your first post\n' +
                '4️⃣ Learning advanced features\n\n' +
                'This takes about 3 minutes.\n\n' +
                'Ready to begin?',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Let\'s Start!', callback_data: 'onboard_start' }],
                            [{ text: '⏭️ Skip Setup', callback_data: 'onboard_skip' }]
                        ]
                    }
                }
            );
        });

        // Handle onboarding callbacks
        this.bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            const userId = ctx.from.id;
            
            if (!data.startsWith('onboard_')) return;
            
            // Admin check
            if (!this.adminIds.includes(userId)) {
                return ctx.answerCbQuery('❌ Admin only');
            }
            
            const action = data.replace('onboard_', '');
            
            switch(action) {
                case 'start':
                    await this.stepDestinationTypes(ctx);
                    break;
                case 'skip':
                    await this.skipSetup(ctx);
                    break;
                case 'understand_types':
                    await this.stepChooseFirstType(ctx);
                    break;
                case 'add_channel':
                    await this.stepAddChannel(ctx);
                    break;
                case 'add_group':
                    await this.stepAddGroup(ctx);
                    break;
                case 'add_topic':
                    await this.stepAddTopic(ctx);
                    break;
                case 'channel_added':
                    await this.stepTestPost(ctx);
                    break;
                case 'group_added':
                    await this.stepTestPost(ctx);
                    break;
                case 'topic_added':
                    await this.stepTestPost(ctx);
                    break;
                case 'test_now':
                    await this.performTestPost(ctx);
                    break;
                case 'skip_test':
                    await this.stepAdvancedFeatures(ctx);
                    break;
                case 'learn_scheduling':
                    await this.showSchedulingInfo(ctx);
                    break;
                case 'learn_multiple':
                    await this.showMultipleDestinations(ctx);
                    break;
                case 'complete_setup':
                    await this.completeSetup(ctx);
                    break;
            }
            
            await ctx.answerCbQuery();
        });

        // /resetsetup command
        this.bot.command('resetsetup', async (ctx) => {
            const userId = ctx.from.id;
            
            if (!this.adminIds.includes(userId)) {
                return;
            }
            
            await this.db.collection('admin_config').updateOne(
                { telegram_id: userId },
                { $set: { completedSetup: false } }
            );
            
            this.onboardingStates.delete(userId);
            
            await ctx.reply(
                '🔄 *Setup Reset*\n\n' +
                'Your setup has been reset.\n' +
                'Run /setup to start the walkthrough again.',
                { parse_mode: 'Markdown' }
            );
        });
    }

    async stepDestinationTypes(ctx) {
        const userId = ctx.from.id;
        this.onboardingStates.set(userId, { step: 'types' });
        
        await ctx.editMessageText(
            '📚 *Step 1: Understanding Destinations*\n\n' +
            'Zone News bot can post to 3 types of destinations:\n\n' +
            '📢 *Channels*\n' +
            '• Public (@username) or private channels\n' +
            '• Best for: Broadcasting news to subscribers\n' +
            '• Example: @ZoneNewsAdl\n\n' +
            '👥 *Groups*\n' +
            '• Regular or supergroups\n' +
            '• Best for: Discussion and engagement\n' +
            '• Requires group ID (we\'ll show you how)\n\n' +
            '💬 *Forum Topics*\n' +
            '• Specific threads in forum groups\n' +
            '• Best for: Organized discussions by topic\n' +
            '• Requires forum mode enabled\n\n' +
            'Got it?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ I Understand', callback_data: 'onboard_understand_types' }]
                    ]
                }
            }
        );
    }

    async stepChooseFirstType(ctx) {
        const userId = ctx.from.id;
        this.onboardingStates.set(userId, { step: 'choose_type' });
        
        await ctx.editMessageText(
            '🎯 *Step 2: Add Your First Destination*\n\n' +
            'Let\'s add your first posting destination.\n\n' +
            'What type would you like to add first?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📢 Channel', callback_data: 'onboard_add_channel' }],
                        [{ text: '👥 Group', callback_data: 'onboard_add_group' }],
                        [{ text: '💬 Forum Topic', callback_data: 'onboard_add_topic' }],
                        [{ text: '⏭️ Skip This Step', callback_data: 'onboard_skip_test' }]
                    ]
                }
            }
        );
    }

    async stepAddChannel(ctx) {
        const userId = ctx.from.id;
        this.onboardingStates.set(userId, { step: 'add_channel', type: 'channel' });
        
        await ctx.editMessageText(
            '📢 *Adding a Channel*\n\n' +
            '📝 *Instructions:*\n' +
            '1. Make sure the bot is admin in your channel\n' +
            '2. Copy your channel username (with @)\n' +
            '3. Send this command:\n\n' +
            '`/addchannel @yourchannel "Channel Name"`\n\n' +
            '*Example:*\n' +
            '`/addchannel @ZoneNewsAdl "Zone News Adelaide"`\n\n' +
            '⚠️ *Important:* The bot needs admin rights to post!\n\n' +
            'Send the command now, or skip:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ I\'ve Added It', callback_data: 'onboard_channel_added' }],
                        [{ text: '❓ Need Help', url: 'https://t.me/TheZoneNews' }],
                        [{ text: '⏭️ Skip', callback_data: 'onboard_skip_test' }]
                    ]
                }
            }
        );
    }

    async stepAddGroup(ctx) {
        const userId = ctx.from.id;
        this.onboardingStates.set(userId, { step: 'add_group', type: 'group' });
        
        await ctx.editMessageText(
            '👥 *Adding a Group*\n\n' +
            '📝 *Instructions:*\n\n' +
            '1️⃣ *Get your Group ID:*\n' +
            '• Add @getidsbot to your group\n' +
            '• It will show ID like: -1001234567890\n' +
            '• Remove the bot after getting ID\n\n' +
            '2️⃣ *Add Zone News bot to group as admin*\n\n' +
            '3️⃣ *Register the group:*\n' +
            '`/addgroup -1001234567890 "Group Name"`\n\n' +
            '*Example:*\n' +
            '`/addgroup -1001234567890 "Zone News Chat"`\n\n' +
            'Send the command now:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🤖 Get @getidsbot', url: 'https://t.me/getidsbot' }],
                        [{ text: '✅ I\'ve Added It', callback_data: 'onboard_group_added' }],
                        [{ text: '⏭️ Skip', callback_data: 'onboard_skip_test' }]
                    ]
                }
            }
        );
    }

    async stepAddTopic(ctx) {
        const userId = ctx.from.id;
        this.onboardingStates.set(userId, { step: 'add_topic', type: 'topic' });
        
        await ctx.editMessageText(
            '💬 *Adding a Forum Topic*\n\n' +
            '📝 *Instructions:*\n\n' +
            '1️⃣ *Enable Forum Mode:*\n' +
            '• Go to Group Info → Edit\n' +
            '• Enable "Topics" (Forum mode)\n\n' +
            '2️⃣ *Get IDs:*\n' +
            '• Group ID: Use @getidsbot\n' +
            '• Topic ID: Right-click topic → Copy Link\n' +
            '  The number after / is topic ID\n\n' +
            '3️⃣ *Add bot as admin*\n\n' +
            '4️⃣ *Register the topic:*\n' +
            '`/addtopic -groupid topicid "Name"`\n\n' +
            '*Example:*\n' +
            '`/addtopic -1001234567890 42 "News"`\n\n' +
            'Send the command now:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📖 Forum Guide', url: 'https://telegram.org/blog/topics-in-groups-collectible-usernames' }],
                        [{ text: '✅ I\'ve Added It', callback_data: 'onboard_topic_added' }],
                        [{ text: '⏭️ Skip', callback_data: 'onboard_skip_test' }]
                    ]
                }
            }
        );
    }

    async stepTestPost(ctx) {
        const userId = ctx.from.id;
        const state = this.onboardingStates.get(userId);
        
        await ctx.editMessageText(
            '🎉 *Great! Destination Added*\n\n' +
            'Now let\'s test posting to your new destination.\n\n' +
            '📝 *Test Post will:*\n' +
            '• Send a real article from the database\n' +
            '• Include interactive buttons\n' +
            '• Show reaction emojis\n' +
            '• Demonstrate the full posting experience\n\n' +
            'Ready to test?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Test Post Now', callback_data: 'onboard_test_now' }],
                        [{ text: '⏭️ Skip Test', callback_data: 'onboard_skip_test' }]
                    ]
                }
            }
        );
    }

    async performTestPost(ctx) {
        const userId = ctx.from.id;
        
        await ctx.editMessageText(
            '📤 *Sending Test Post...*\n\n' +
            'Use the /post command to select your destination and send a test article.\n\n' +
            'After testing, come back here:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Test Complete', callback_data: 'onboard_learn_scheduling' }],
                        [{ text: '❌ Had Issues', url: 'https://t.me/TheZoneNews' }]
                    ]
                }
            }
        );
        
        // Send /post command instruction
        await ctx.reply('/post');
    }

    async stepAdvancedFeatures(ctx) {
        const userId = ctx.from.id;
        this.onboardingStates.set(userId, { step: 'advanced' });
        
        await ctx.editMessageText(
            '🚀 *Step 3: Advanced Features*\n\n' +
            'Now that you know the basics, here are advanced features:\n\n' +
            '📅 *Scheduling* (Coming Soon)\n' +
            '• Schedule posts for specific times\n' +
            '• Set recurring posts (daily, weekly)\n' +
            '• Manage post queue\n\n' +
            '📊 *Analytics*\n' +
            '• Track engagement rates\n' +
            '• Monitor view counts\n' +
            '• Export reports\n\n' +
            '🔄 *Multiple Destinations*\n' +
            '• Post to multiple places at once\n' +
            '• Different content for different audiences\n' +
            '• Cross-posting automation\n\n' +
            'Want to learn more?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📅 Learn Scheduling', callback_data: 'onboard_learn_scheduling' }],
                        [{ text: '📍 Multiple Destinations', callback_data: 'onboard_learn_multiple' }],
                        [{ text: '✅ Complete Setup', callback_data: 'onboard_complete_setup' }]
                    ]
                }
            }
        );
    }

    async showSchedulingInfo(ctx) {
        await ctx.editMessageText(
            '📅 *Scheduling Posts*\n\n' +
            '⏰ *Coming Soon:*\n' +
            '• Schedule posts for optimal times\n' +
            '• Set up recurring schedules\n' +
            '• Queue management\n' +
            '• Time zone support\n\n' +
            '*Future Commands:*\n' +
            '• /schedule - Set up scheduled posts\n' +
            '• /queue - View pending posts\n' +
            '• /recurring - Set daily/weekly posts\n\n' +
            '📢 This feature is in development.\n' +
            'Contact @TheZoneNews for early access.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Back', callback_data: 'onboard_learn_multiple' }],
                        [{ text: '✅ Complete Setup', callback_data: 'onboard_complete_setup' }]
                    ]
                }
            }
        );
    }

    async showMultipleDestinations(ctx) {
        await ctx.editMessageText(
            '📍 *Multiple Destinations*\n\n' +
            'You can add unlimited destinations!\n\n' +
            '✅ *Already Available:*\n' +
            '• Add multiple channels\n' +
            '• Add multiple groups\n' +
            '• Add multiple topics\n' +
            '• Choose where to post each time\n\n' +
            '*Commands:*\n' +
            '• /addchannel - Add channels\n' +
            '• /addgroup - Add groups\n' +
            '• /addtopic - Add topics\n' +
            '• /mydestinations - View all\n' +
            '• /post - Choose destination\n\n' +
            '💡 *Tip:* Organize content by having different destinations for different types of news!',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📅 Learn Scheduling', callback_data: 'onboard_learn_scheduling' }],
                        [{ text: '✅ Complete Setup', callback_data: 'onboard_complete_setup' }]
                    ]
                }
            }
        );
    }

    async completeSetup(ctx) {
        const userId = ctx.from.id;
        
        // Mark setup as complete
        await this.db.collection('admin_config').updateOne(
            { telegram_id: userId },
            { 
                $set: { 
                    completedSetup: true,
                    setupDate: new Date()
                }
            },
            { upsert: true }
        );
        
        this.onboardingStates.delete(userId);
        
        await ctx.editMessageText(
            '🎉 *Setup Complete!*\n\n' +
            'You\'re all set to start posting!\n\n' +
            '📚 *Your Command Reference:*\n\n' +
            '*Posting:*\n' +
            '• /post - Post articles\n' +
            '• /testpost - Preview only\n\n' +
            '*Managing Destinations:*\n' +
            '• /addchannel @name "Title"\n' +
            '• /addgroup -id "Title"\n' +
            '• /addtopic -id topic "Title"\n' +
            '• /mydestinations - View all\n\n' +
            '*Other:*\n' +
            '• /help - Command help\n' +
            '• /setup - Run setup again\n' +
            '• /resetsetup - Start over\n\n' +
            '💡 *Next Step:* Try /post to send your first article!\n\n' +
            '❓ Need help? Contact @TheZoneNews',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Post Now', callback_data: 'quick_post' }],
                        [{ text: '📍 My Destinations', callback_data: 'view_destinations' }],
                        [{ text: '✅ Done', callback_data: 'close_setup' }]
                    ]
                }
            }
        );
    }

    async skipSetup(ctx) {
        const userId = ctx.from.id;
        
        await this.db.collection('admin_config').updateOne(
            { telegram_id: userId },
            { 
                $set: { 
                    completedSetup: true,
                    skippedSetup: true,
                    setupDate: new Date()
                }
            },
            { upsert: true }
        );
        
        this.onboardingStates.delete(userId);
        
        await ctx.editMessageText(
            '⏭️ *Setup Skipped*\n\n' +
            'You can start using commands directly:\n\n' +
            '• /post - Post articles\n' +
            '• /addchannel - Add channel\n' +
            '• /addgroup - Add group\n' +
            '• /addtopic - Add topic\n' +
            '• /mydestinations - View all\n\n' +
            'Run /setup anytime for the guided walkthrough.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Start Posting', callback_data: 'quick_post' }],
                        [{ text: '✅ Got It', callback_data: 'close_setup' }]
                    ]
                }
            }
        );
    }

    async getUserConfig(userId) {
        return await this.db.collection('admin_config').findOne({ telegram_id: userId });
    }
}

module.exports = OnboardingService;