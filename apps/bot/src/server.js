/**
 * Zone Bot Service - Telegram Bot with Webhook Only
 * No polling to prevent conflicts
 */

require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient, ObjectId } = require('mongodb');
const InteractivePostWizard = require('./interactive-post-wizard');
const AISummarizer = require('./ai-summarizer');
const { UserRepository } = require('./repositories/UserRepository');
const { TierService } = require('./tiers/TierService');

class ZoneBotService {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3002;
        this.bot = null;
        this.db = null;
        this.isReady = false;
        this.postWizard = null;
        this.summarizer = new AISummarizer();
        this.userRepo = null;
        this.tierService = new TierService();
    }

    async initialize() {
        try {
            console.log('🚀 Starting Zone Bot Service (Webhook Mode)...');
            
            // Set up Express middleware and routes FIRST
            this.setupExpress();
            
            // Start server EARLY to accept webhook requests
            await this.startServer();
            
            // Connect to MongoDB
            await this.connectDatabase();
            
            // Initialize repositories with tier support
            this.userRepo = new UserRepository(this.db, this.tierService);
            console.log('✅ User repository initialized with tier support');
            
            // Initialize bot in webhook mode ONLY
            await this.initializeBot();
            
            // Initialize post wizard with shared DB and user repo
            this.postWizard = new InteractivePostWizard(this.bot);
            this.postWizard.db = this.db;
            this.postWizard.userRepo = this.userRepo;
            console.log('✅ Interactive Post Wizard initialized with tier support');
            
            // Register bot commands
            await this.registerCommands();
            
            // Set webhook URL
            await this.setupWebhook();
            
            this.isReady = true;
            console.log('✅ Zone Bot Service ready!');
        } catch (error) {
            console.error('❌ Failed to initialize Zone Bot Service:', error);
            process.exit(1);
        }
    }

    async connectDatabase() {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        const client = new MongoClient(mongoUri);
        await client.connect();
        this.db = client.db();
        console.log('✅ Connected to MongoDB');
    }

    async initializeBot() {
        // IMPORTANT: webHook: false means bot won't start internal webhook server
        // We handle webhook through Express instead
        this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
            webHook: false,
            polling: false  // NEVER use polling
        });

        // Set up message handlers
        this.setupHandlers();
        console.log('✅ Bot initialized in webhook mode');
    }

    setupExpress() {
        // Parse JSON bodies
        this.app.use(express.json());

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                service: 'zone-bot-service',
                status: this.isReady ? 'healthy' : 'starting',
                mode: 'webhook',
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });

        // Webhook endpoint
        this.app.post('/webhook', async (req, res) => {
            try {
                console.log('📨 Webhook received:', new Date().toISOString());
                
                // Verify webhook secret (optional - only if configured)
                const secret = req.headers['x-telegram-bot-api-secret-token'];
                if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
                    console.warn('⚠️ Invalid webhook secret received');
                    return res.status(401).json({ error: 'Unauthorized' });
                }

                // Process update
                await this.bot.processUpdate(req.body);
                res.sendStatus(200);
            } catch (error) {
                console.error('Webhook error:', error);
                res.sendStatus(500);
            }
        });

        // Status endpoint
        this.app.get('/status', async (req, res) => {
            const stats = await this.getStats();
            res.json(stats);
        });
    }

    setupHandlers() {
        // Command handlers
        this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
        this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
        this.bot.onText(/\/news/, (msg) => this.handleNews(msg));
        this.bot.onText(/\/post/, (msg) => this.handlePost(msg));
        this.bot.onText(/\/channels/, (msg) => this.handleChannels(msg));
        this.bot.onText(/\/setchannel (.+)/, (msg, match) => this.handleSetChannel(msg, match));
        this.bot.onText(/\/miniapp/, (msg) => this.handleMiniApp(msg));
        this.bot.onText(/\/settings/, (msg) => this.handleSettings(msg));
        this.bot.onText(/\/mytier/, (msg) => this.handleMyTier(msg));
        this.bot.onText(/\/upgrade/, (msg) => this.handleUpgrade(msg));

        // Callback query handler for reactions, wizard, and tiers
        this.bot.on('callback_query', async (query) => {
            if (query.data.startsWith('wizard_')) {
                await this.postWizard.handleCallback(query);
            } else if (query.data.startsWith('tier_')) {
                await this.handleTierCallback(query);
            } else if (query.data === 'get_news') {
                // Handle news callback like /news command
                await this.handleNewsCallback(query);
            } else {
                await this.handleReaction(query);
            }
        });
        
        // Handle text messages for wizard input
        this.bot.on('message', async (msg) => {
            if (msg.text && !msg.text.startsWith('/')) {
                const session = this.postWizard.sessions.get(msg.from.id);
                if (session && (session.step === 'waiting_custom_content' || session.step === 'waiting_url')) {
                    await this.handleWizardTextInput(msg, session);
                }
            }
        });
    }

    async registerCommands() {
        const commands = [
            { command: 'start', description: 'Start the bot' },
            { command: 'help', description: 'Show help message' },
            { command: 'news', description: 'Get latest news' },
            { command: 'mytier', description: 'View your subscription tier' },
            { command: 'upgrade', description: 'Upgrade your account' },
            { command: 'post', description: 'Post to channels' },
            { command: 'channels', description: 'List available channels' },
            { command: 'setchannel', description: 'Set default channel' },
            { command: 'miniapp', description: 'Open Mini App' },
            { command: 'settings', description: 'Bot settings' }
        ];

        await this.bot.setMyCommands(commands);
        console.log('✅ Bot commands registered');
    }

    async setupWebhook() {
        const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || `https://bot.thezonenews.com/webhook`;
        const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

        // Delete any existing webhook first
        await this.bot.deleteWebHook();
        
        // Set new webhook
        await this.bot.setWebHook(webhookUrl, {
            secret_token: webhookSecret,
            allowed_updates: ['message', 'callback_query', 'inline_query'],
            drop_pending_updates: true
        });

        console.log(`✅ Webhook set to: ${webhookUrl}`);
    }

    // Command Handlers
    async handleStart(msg) {
        try {
            // Get or create user to show their tier
            const userData = {
                id: msg.from.id,
                username: msg.from.username,
                first_name: msg.from.first_name,
                last_name: msg.from.last_name
            };
            
            const user = await this.userRepo.findOrCreateUser(userData);
            const tierData = this.tierService.tiers[user.subscription.tier];
            const isNewUser = user.createdAt && (new Date() - user.createdAt) < 60000; // Less than 1 minute old

            let welcomeText = `🎉 ${isNewUser ? 'Welcome' : 'Welcome back'} to Zone News Bot!\n\n`;
            
            if (isNewUser) {
                welcomeText += `🌟 <b>Account Created</b>\n`;
                welcomeText += `👤 <b>Name:</b> ${user.fullName || msg.from.first_name}\n`;
            } else {
                welcomeText += `👤 <b>${user.fullName || msg.from.first_name}</b>\n`;
            }
            
            welcomeText += `🎯 <b>Your Tier:</b> ${tierData.name}\n`;
            welcomeText += `📅 <b>Status:</b> ${user.subscription.status}\n\n`;
            
            welcomeText += `🤖 Your AI-powered news companion for Adelaide and beyond.\n\n`;
            
            welcomeText += `📱 <b>Available Commands:</b>\n`;
            welcomeText += `/news - Get latest news\n`;
            welcomeText += `/mytier - View your subscription tier\n`;
            
            // Show tier-specific commands
            if (this.tierService.hasFeature(user.subscription.tier, 'channel_posting')) {
                welcomeText += `/post - Post to channels\n`;
                welcomeText += `/channels - View channels\n`;
            }
            
            welcomeText += `/miniapp - Open Mini App\n`;
            welcomeText += `/help - Show all commands\n\n`;
            
            // Show upgrade option if not at max tier
            if (user.subscription.tier === 'free') {
                welcomeText += `💎 <b>Want more features?</b>\n`;
                welcomeText += `Use /upgrade to unlock channel posting, group management, and more!\n\n`;
            }
            
            welcomeText += `🔔 Stay updated with breaking news and trending stories!`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📰 Latest News', callback_data: 'get_news' },
                        { text: '🎯 My Tier', callback_data: 'tier_my_tier' }
                    ]
                ]
            };

            // Add upgrade button for free users
            if (user.subscription.tier === 'free') {
                keyboard.inline_keyboard.push([
                    { text: '💎 Upgrade Account', callback_data: 'tier_upgrade' }
                ]);
            }

            await this.bot.sendMessage(msg.chat.id, welcomeText, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleStart:', error);
            // Fallback to simple welcome message
            const fallbackText = `🎉 Welcome to Zone News Bot!\n\nYour AI-powered news companion for Adelaide and beyond.\n\n📱 Use /help to see available commands.`;
            await this.bot.sendMessage(msg.chat.id, fallbackText);
        }
    }

    async handleHelp(msg) {
        const helpText = `
📚 <b>Zone News Bot Commands</b>

<b>📰 News Commands:</b>
/news - Get latest news articles
/trending - View trending stories

<b>📢 Channel Management:</b>
/channels - List available channels
/setchannel [name] - Set default channel
/post - Post to your channel

<b>⚙️ Settings:</b>
/settings - Configure preferences
/miniapp - Open Telegram Mini App

<b>ℹ️ Information:</b>
/help - Show this help message
/about - About Zone News
        `;

        await this.bot.sendMessage(msg.chat.id, helpText, {
            parse_mode: 'HTML'
        });
    }

    async handleNews(msg) {
        try {
            // Fetch latest articles from database
            const articles = await this.db.collection('news_articles')
                .find({})
                .sort({ published_date: -1 })
                .limit(5)
                .toArray();

            if (articles.length === 0) {
                await this.bot.sendMessage(msg.chat.id, '📭 No news articles available at the moment.');
                return;
            }

            // Send each article with reactions
            for (const article of articles) {
                const message = this.formatArticle(article);
                const keyboard = this.getReactionKeyboard(article);
                
                await this.bot.sendMessage(msg.chat.id, message, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                    disable_web_page_preview: false
                });
            }
        } catch (error) {
            console.error('Error fetching news:', error);
            await this.bot.sendMessage(msg.chat.id, '❌ Error fetching news. Please try again later.');
        }
    }

    async handleReaction(query) {
        try {
            const [action, articleId] = query.data.split('_');
            
            // Update reaction count in database
            const result = await this.db.collection('news_articles').findOneAndUpdate(
                { _id: ObjectId.isValid(articleId) ? new ObjectId(articleId) : articleId },
                { $inc: { [`reactions.${action}`]: 1 } },
                { returnDocument: 'after' }
            );

            if (!result.value) {
                await this.bot.answerCallbackQuery(query.id, {
                    text: 'Article not found',
                    show_alert: false
                });
                return;
            }

            // Update inline keyboard with new counts
            const updatedKeyboard = this.getReactionKeyboard(result.value);
            
            await this.bot.editMessageReplyMarkup(updatedKeyboard, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });

            // Send feedback
            const emojis = {
                like: '👍',
                love: '❤️',
                fire: '🔥',
                wow: '😮',
                sad: '😢'
            };

            await this.bot.answerCallbackQuery(query.id, {
                text: `${emojis[action]} +1`,
                show_alert: false
            });
        } catch (error) {
            console.error('Reaction error:', error);
            await this.bot.answerCallbackQuery(query.id, {
                text: 'Failed to record reaction',
                show_alert: true
            });
        }
    }

    formatArticle(article) {
        return `
📰 <b>${article.title}</b>

${article.content ? article.content.substring(0, 300) + '...' : article.summary}

📅 ${new Date(article.published_date).toLocaleDateString()}
🏷 ${article.category || 'General'}
${article.url ? `\n🔗 <a href="${article.url}">Read more</a>` : ''}
        `;
    }

    getReactionKeyboard(article) {
        const reactions = article.reactions || {};
        const likes = reactions.like || 0;
        const loves = reactions.love || 0;
        const fires = reactions.fire || 0;
        const wows = reactions.wow || 0;
        const sads = reactions.sad || 0;
        
        return {
            inline_keyboard: [[
                { text: `👍 ${likes > 0 ? likes : ''}`.trim() || '👍', callback_data: `like_${article._id}` },
                { text: `❤️ ${loves > 0 ? loves : ''}`.trim() || '❤️', callback_data: `love_${article._id}` },
                { text: `🔥 ${fires > 0 ? fires : ''}`.trim() || '🔥', callback_data: `fire_${article._id}` },
                { text: `😮 ${wows > 0 ? wows : ''}`.trim() || '😮', callback_data: `wow_${article._id}` },
                { text: `😢 ${sads > 0 ? sads : ''}`.trim() || '😢', callback_data: `sad_${article._id}` }
            ]]
        };
    }

    async handleChannels(msg) {
        const channels = {
            main: '@ZoneNewsAdl',
            test: '@ZoneNewsTest',
            tbc: '@TheBiggerConversation'
        };

        const text = `
📢 <b>Available Channels:</b>

🔸 <b>Main:</b> ${channels.main}
🔸 <b>Test:</b> ${channels.test}
🔸 <b>TBC Forum:</b> ${channels.tbc}

Use /setchannel [name] to set your default channel.
        `;

        await this.bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
    }

    async handleSetChannel(msg, match) {
        const channelName = match[1].toLowerCase();
        // Implementation for setting channel
        await this.bot.sendMessage(msg.chat.id, `✅ Default channel set to: ${channelName}`);
    }

    async handlePost(msg) {
        try {
            console.log(`Post command from user ${msg.from.id} (${msg.from.username})`);
            
            // Check tier permission for posting
            const canPost = await this.userRepo.canUseCommand(msg.from.id, 'post');
            
            if (!canPost.allowed) {
                await this.bot.sendMessage(msg.chat.id, 
                    `❌ ${canPost.message}\n\n💎 Upgrade to ${canPost.requiredTier} or higher to post to channels!`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '💎 Upgrade Now', callback_data: 'tier_upgrade' }
                            ]]
                        }
                    }
                );
                return;
            }

            // Start interactive post wizard
            if (this.postWizard) {
                await this.postWizard.startWizard(msg.chat.id, msg.from.id);
            } else {
                console.error('Post wizard not initialized');
                await this.bot.sendMessage(msg.chat.id, '⚠️ Post wizard is being initialized, please try again in a moment.');
            }
        } catch (error) {
            console.error('Error in handlePost:', error);
            await this.bot.sendMessage(msg.chat.id, '❌ Error starting post wizard. Please try again.');
        }
    }
    
    async handleWizardTextInput(msg, session) {
        if (session.step === 'waiting_custom_content') {
            session.content = [{
                title: 'Custom Post',
                content: msg.text,
                _id: 'custom_' + Date.now()
            }];
            session.step = 'select_destinations';
            
            // Show destination selection
            await this.postWizard.showDestinationSelection({
                from: msg.from,
                message: msg
            }, session);
        } else if (session.step === 'waiting_url') {
            // Handle URL input (fetch content from URL)
            await this.bot.sendMessage(msg.chat.id, '🔗 Fetching content from URL...');
            // Implementation for URL fetching would go here
        }
    }

    async handleMiniApp(msg) {
        const miniAppUrl = 'https://thezonenews.com/miniapp';
        await this.bot.sendMessage(msg.chat.id, '📱 Open Zone News Mini App:', {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🚀 Open Mini App',
                        web_app: { url: miniAppUrl }
                    }
                ]]
            }
        });
    }

    async handleSettings(msg) {
        await this.bot.sendMessage(msg.chat.id, '⚙️ Settings coming soon!');
    }

    async handleMyTier(msg) {
        try {
            // Get or create user to ensure they exist
            const userData = {
                id: msg.from.id,
                username: msg.from.username,
                first_name: msg.from.first_name,
                last_name: msg.from.last_name
            };
            
            const user = await this.userRepo.findOrCreateUser(userData);
            if (!user) {
                await this.bot.sendMessage(msg.chat.id, '❌ Unable to load your profile. Please try again.');
                return;
            }

            const tierData = this.tierService.tiers[user.subscription.tier];
            const limits = this.tierService.getLimits(user.subscription.tier);
            
            // Get current usage statistics
            const stats = await this.userRepo.getUserStats(msg.from.id);
            
            let tierInfo = `👤 <b>${user.fullName || msg.from.first_name}</b>\n\n`;
            tierInfo += `🎯 <b>Current Tier:</b> ${tierData.name}\n`;
            tierInfo += `📅 <b>Status:</b> ${user.subscription.status}\n\n`;
            
            tierInfo += `📊 <b>Your Limits & Usage:</b>\n`;
            tierInfo += `• Channels: ${stats.usage.channels.used}/${limits.maxChannels === -1 ? '∞' : limits.maxChannels}\n`;
            tierInfo += `• Groups: ${stats.usage.groups.used}/${limits.maxGroups === -1 ? '∞' : limits.maxGroups}\n`;
            tierInfo += `• Posts/Day: ${stats.usage.postsToday}/${limits.maxPostsPerDay === -1 ? '∞' : limits.maxPostsPerDay}\n`;
            tierInfo += `• Scheduled Posts: 0/${limits.maxScheduledPosts === -1 ? '∞' : limits.maxScheduledPosts}\n\n`;
            
            tierInfo += `✨ <b>Your Features:</b>\n`;
            const features = Object.keys(limits.features).filter(f => limits.features[f]);
            features.forEach(feature => {
                const emoji = this.getFeatureEmoji(feature);
                tierInfo += `${emoji} ${feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n`;
            });
            
            // Add upgrade button if not at max tier
            const keyboard = {
                inline_keyboard: []
            };
            
            if (user.subscription.tier !== 'enterprise' && user.subscription.tier !== 'admin') {
                keyboard.inline_keyboard.push([
                    { text: '💎 Upgrade Tier', callback_data: 'tier_upgrade' }
                ]);
            }
            
            keyboard.inline_keyboard.push([
                { text: '📈 View All Tiers', callback_data: 'tier_view_all' }
            ]);

            await this.bot.sendMessage(msg.chat.id, tierInfo, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleMyTier:', error);
            await this.bot.sendMessage(msg.chat.id, '❌ Error loading your tier information. Please try again.');
        }
    }

    async handleUpgrade(msg) {
        try {
            // Get or create user
            const userData = {
                id: msg.from.id,
                username: msg.from.username,
                first_name: msg.from.first_name,
                last_name: msg.from.last_name
            };
            
            const user = await this.userRepo.findOrCreateUser(userData);
            if (!user) {
                await this.bot.sendMessage(msg.chat.id, '❌ Unable to load your profile. Please try again.');
                return;
            }

            const currentTier = user.subscription.tier;
            const comparison = this.tierService.getTierComparison(currentTier);
            
            if (!comparison) {
                await this.bot.sendMessage(msg.chat.id, '🎉 You already have access to the highest available tier!');
                return;
            }

            let upgradeText = `🚀 <b>Upgrade Your Experience</b>\n\n`;
            upgradeText += `📊 <b>Current:</b> ${comparison.current.name}\n`;
            upgradeText += `🎯 <b>Next Tier:</b> ${comparison.next.name}\n\n`;
            
            upgradeText += `✨ <b>New Features You'll Get:</b>\n`;
            comparison.next.newFeatures.forEach(feature => {
                const emoji = this.getFeatureEmoji(feature);
                upgradeText += `${emoji} ${feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n`;
            });
            
            upgradeText += `\n📈 <b>Improved Limits:</b>\n`;
            const currentLimits = comparison.current.limits;
            const nextLimits = comparison.next.limits;
            
            if (nextLimits.maxChannels > currentLimits.maxChannels) {
                upgradeText += `• Channels: ${currentLimits.maxChannels} → ${nextLimits.maxChannels === -1 ? '∞' : nextLimits.maxChannels}\n`;
            }
            if (nextLimits.maxGroups > currentLimits.maxGroups) {
                upgradeText += `• Groups: ${currentLimits.maxGroups} → ${nextLimits.maxGroups === -1 ? '∞' : nextLimits.maxGroups}\n`;
            }
            if (nextLimits.maxPostsPerDay > currentLimits.maxPostsPerDay) {
                upgradeText += `• Posts/Day: ${currentLimits.maxPostsPerDay} → ${nextLimits.maxPostsPerDay === -1 ? '∞' : nextLimits.maxPostsPerDay}\n`;
            }
            if (nextLimits.maxScheduledPosts > currentLimits.maxScheduledPosts) {
                upgradeText += `• Scheduled Posts: ${currentLimits.maxScheduledPosts} → ${nextLimits.maxScheduledPosts === -1 ? '∞' : nextLimits.maxScheduledPosts}\n`;
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '💎 Upgrade Now', callback_data: `tier_select_${comparison.next.name.toLowerCase().replace(' ', '_')}` },
                        { text: '📋 View All Tiers', callback_data: 'tier_view_all' }
                    ],
                    [
                        { text: '⬅️ Back to My Tier', callback_data: 'tier_my_tier' }
                    ]
                ]
            };

            await this.bot.sendMessage(msg.chat.id, upgradeText, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleUpgrade:', error);
            await this.bot.sendMessage(msg.chat.id, '❌ Error loading upgrade options. Please try again.');
        }
    }

    async handleTierCallback(query) {
        try {
            const [action, ...params] = query.data.split('_');
            const param = params.join('_');
            
            // Get or create user
            const userData = {
                id: query.from.id,
                username: query.from.username,
                first_name: query.from.first_name,
                last_name: query.from.last_name
            };
            
            const user = await this.userRepo.findOrCreateUser(userData);

            switch (action) {
                case 'tier':
                    if (param === 'upgrade') {
                        // Show upgrade options
                        await this.handleUpgradeCallback(query, user);
                    } else if (param === 'view_all') {
                        // Show all tiers comparison
                        await this.handleViewAllTiersCallback(query, user);
                    } else if (param === 'my_tier') {
                        // Show current tier info
                        await this.handleMyTierCallback(query, user);
                    } else if (param.startsWith('select_')) {
                        // Handle tier selection
                        const selectedTier = param.replace('select_', '');
                        await this.handleTierSelectionCallback(query, user, selectedTier);
                    }
                    break;
                
                default:
                    await this.bot.answerCallbackQuery(query.id, {
                        text: 'Unknown tier action',
                        show_alert: false
                    });
            }
        } catch (error) {
            console.error('Error in handleTierCallback:', error);
            await this.bot.answerCallbackQuery(query.id, {
                text: 'Error processing tier action',
                show_alert: true
            });
        }
    }

    async handleUpgradeCallback(query, user) {
        const comparison = this.tierService.getTierComparison(user.subscription.tier);
        
        if (!comparison) {
            await this.bot.answerCallbackQuery(query.id, {
                text: 'You already have the highest tier!',
                show_alert: false
            });
            return;
        }

        // Same logic as handleUpgrade but for callback
        let upgradeText = `🚀 <b>Upgrade to ${comparison.next.name}</b>\n\n`;
        upgradeText += `✨ <b>New Features:</b>\n`;
        comparison.next.newFeatures.forEach(feature => {
            const emoji = this.getFeatureEmoji(feature);
            upgradeText += `${emoji} ${feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n`;
        });

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Confirm Upgrade', callback_data: `tier_select_${comparison.next.name.toLowerCase().replace(' ', '_')}` }
                ],
                [
                    { text: '📋 View All Tiers', callback_data: 'tier_view_all' },
                    { text: '❌ Cancel', callback_data: 'tier_my_tier' }
                ]
            ]
        };

        await this.bot.editMessageText(upgradeText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

        await this.bot.answerCallbackQuery(query.id);
    }

    async handleViewAllTiersCallback(query, user) {
        const allTiersInfo = this.tierService.getAllTiersInfo();
        const currentTier = user.subscription.tier;
        
        let tiersText = `📋 <b>All Available Tiers</b>\n\n`;
        tiersText += `<i>Your current tier: ${this.tierService.tiers[currentTier].name}</i>\n\n`;
        
        const tierHierarchy = ['free', 'group_admin', 'business', 'enterprise'];
        tierHierarchy.forEach(tier => {
            const tierData = this.tierService.tiers[tier];
            const isCurrentTier = tier === currentTier;
            
            tiersText += `${isCurrentTier ? '👉 ' : ''}`;
            tiersText += `<b>${tierData.name}</b>${isCurrentTier ? ' (Current)' : ''}\n`;
            
            // Show key features for each tier
            const keyFeatures = this.getKeyFeaturesForTier(tier);
            keyFeatures.forEach(feature => {
                tiersText += `  • ${feature}\n`;
            });
            
            tiersText += '\n';
        });

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💎 Upgrade Options', callback_data: 'tier_upgrade' },
                    { text: '👤 My Tier', callback_data: 'tier_my_tier' }
                ]
            ]
        };

        await this.bot.editMessageText(tiersText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

        await this.bot.answerCallbackQuery(query.id);
    }

    async handleMyTierCallback(query, user) {
        // Similar to handleMyTier but for callback
        const tierData = this.tierService.tiers[user.subscription.tier];
        const limits = this.tierService.getLimits(user.subscription.tier);
        const stats = await this.userRepo.getUserStats(query.from.id);
        
        let tierInfo = `👤 <b>${user.fullName || query.from.first_name}</b>\n\n`;
        tierInfo += `🎯 <b>Current Tier:</b> ${tierData.name}\n`;
        tierInfo += `📅 <b>Status:</b> ${user.subscription.status}\n\n`;
        
        tierInfo += `📊 <b>Usage:</b>\n`;
        tierInfo += `• Channels: ${stats.usage.channels.used}/${limits.maxChannels === -1 ? '∞' : limits.maxChannels}\n`;
        tierInfo += `• Groups: ${stats.usage.groups.used}/${limits.maxGroups === -1 ? '∞' : limits.maxGroups}\n`;
        tierInfo += `• Posts Today: ${stats.usage.postsToday}/${limits.maxPostsPerDay === -1 ? '∞' : limits.maxPostsPerDay}\n\n`;

        const keyboard = {
            inline_keyboard: []
        };
        
        if (user.subscription.tier !== 'enterprise' && user.subscription.tier !== 'admin') {
            keyboard.inline_keyboard.push([
                { text: '💎 Upgrade', callback_data: 'tier_upgrade' }
            ]);
        }
        
        keyboard.inline_keyboard.push([
            { text: '📋 All Tiers', callback_data: 'tier_view_all' }
        ]);

        await this.bot.editMessageText(tierInfo, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

        await this.bot.answerCallbackQuery(query.id);
    }

    async handleTierSelectionCallback(query, user, selectedTier) {
        try {
            // Validate tier selection
            const tierMap = {
                'group_admin': 'group_admin',
                'business': 'business',
                'enterprise': 'enterprise'
            };
            
            const newTier = tierMap[selectedTier];
            if (!newTier) {
                await this.bot.answerCallbackQuery(query.id, {
                    text: 'Invalid tier selection',
                    show_alert: true
                });
                return;
            }

            // Check if upgrade is valid
            const canChange = this.tierService.canChangeTier(user.subscription.tier, newTier);
            
            if (!canChange.allowed) {
                await this.bot.answerCallbackQuery(query.id, {
                    text: canChange.message,
                    show_alert: true
                });
                return;
            }

            // For now, show upgrade info (in production, this would integrate with payment)
            const tierData = this.tierService.tiers[newTier];
            
            let upgradeText = `💎 <b>Tier Upgrade Request</b>\n\n`;
            upgradeText += `🎯 <b>Selected Tier:</b> ${tierData.name}\n`;
            upgradeText += `📈 <b>Current Tier:</b> ${this.tierService.tiers[user.subscription.tier].name}\n\n`;
            
            upgradeText += `💰 <b>Pricing:</b>\n`;
            upgradeText += `• Group Admin: $9.99/month\n`;
            upgradeText += `• Business: $19.99/month\n`;
            upgradeText += `• Enterprise: $49.99/month\n\n`;
            
            upgradeText += `🚧 <b>Note:</b> Payment integration coming soon!\n`;
            upgradeText += `Contact support to manually upgrade your account.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📞 Contact Support', url: 'https://t.me/ZoneNewsSupport' }
                    ],
                    [
                        { text: '⬅️ Back', callback_data: 'tier_upgrade' }
                    ]
                ]
            };

            await this.bot.editMessageText(upgradeText, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: keyboard
            });

            await this.bot.answerCallbackQuery(query.id, {
                text: `${tierData.name} tier selected! Contact support to complete upgrade.`,
                show_alert: false
            });
        } catch (error) {
            console.error('Error in handleTierSelectionCallback:', error);
            await this.bot.answerCallbackQuery(query.id, {
                text: 'Error processing tier selection',
                show_alert: true
            });
        }
    }

    getFeatureEmoji(feature) {
        const emojis = {
            'basic_commands': '🤖',
            'news_reading': '📰',
            'reactions': '❤️',
            'url_summary': '🔗',
            'ai_summary': '🧠',
            'channel_posting': '📢',
            'group_management': '👥',
            'scheduling': '⏰',
            'analytics': '📊',
            'tbc_access': '🎯',
            'mtproto_access': '🔧',
            'business_posting': '💼',
            'api_access': '🔌',
            'custom_reactions': '💫',
            'bulk_posting': '📦',
            'advanced_analytics': '📈',
            'webhook_integration': '🔗',
            'priority_support': '⚡',
            'admin_commands': '👑',
            'user_management': '👤',
            'system_config': '⚙️',
            'debug_mode': '🐛',
            'bypass_limits': '🚀'
        };
        
        return emojis[feature] || '✅';
    }

    getKeyFeaturesForTier(tier) {
        const keyFeatures = {
            'free': ['Basic commands', 'News reading', 'Reactions'],
            'group_admin': ['Channel posting', 'Group management', 'AI summaries', 'Scheduling'],
            'business': ['TBC access', 'MTProto scraping', 'Bulk posting', 'Advanced analytics'],
            'enterprise': ['Webhook integration', 'Unlimited channels', 'Priority support']
        };
        
        return keyFeatures[tier] || [];
    }

    async handleNewsCallback(query) {
        try {
            // Same logic as handleNews but for callback
            const articles = await this.db.collection('news_articles')
                .find({})
                .sort({ published_date: -1 })
                .limit(3)
                .toArray();

            if (articles.length === 0) {
                await this.bot.answerCallbackQuery(query.id, {
                    text: 'No news articles available at the moment',
                    show_alert: false
                });
                return;
            }

            // Answer the callback first
            await this.bot.answerCallbackQuery(query.id, {
                text: `Loading ${articles.length} latest articles...`,
                show_alert: false
            });

            // Send each article with reactions
            for (const article of articles) {
                const message = this.formatArticle(article);
                const keyboard = this.getReactionKeyboard(article);
                
                await this.bot.sendMessage(query.message.chat.id, message, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                    disable_web_page_preview: false
                });
            }
        } catch (error) {
            console.error('Error in handleNewsCallback:', error);
            await this.bot.answerCallbackQuery(query.id, {
                text: 'Error fetching news. Please try again later.',
                show_alert: true
            });
        }
    }

    async checkAdmin(userId) {
        // Include both admin IDs
        const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];
        
        // Add your actual admin ID (8123893898)
        const knownAdmins = [7802629063, 8123893898];
        knownAdmins.forEach(id => {
            if (!adminIds.includes(id)) {
                adminIds.push(id);
            }
        });
        
        console.log(`Checking admin for user ${userId}, admins: ${adminIds}`);
        return adminIds.includes(userId);
    }

    async getStats() {
        const userCount = await this.db.collection('users').countDocuments();
        const articleCount = await this.db.collection('news_articles').countDocuments();
        
        return {
            service: 'zone-bot-service',
            stats: {
                users: userCount,
                articles: articleCount,
                uptime: process.uptime(),
                mode: 'webhook'
            }
        };
    }

    async startServer() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`✅ Zone Bot Service listening on port ${this.port}`);
                resolve();
            });
        });
    }

    async shutdown() {
        console.log('Shutting down Zone Bot Service...');
        
        // Delete webhook
        await this.bot.deleteWebHook();
        
        // Close server
        if (this.server) {
            this.server.close();
        }
        
        // Close database
        if (this.db) {
            await this.db.client.close();
        }
        
        console.log('Zone Bot Service shut down complete');
        process.exit(0);
    }
}

// Start the service
const service = new ZoneBotService();

service.initialize().catch(error => {
    console.error('Failed to start Zone Bot Service:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => service.shutdown());
process.on('SIGINT', () => service.shutdown());