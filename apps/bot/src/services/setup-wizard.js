/**
 * Comprehensive Setup Wizard - Advanced User Onboarding System
 * 
 * Production-ready onboarding flow for Zone News Telegram Bot
 * Features: Welcome flow, preferences, notifications, channels, tutorials
 * 
 * @author Zone News Bot Team
 * @version 2.0.0
 */

const { Markup } = require('telegraf');

/**
 * Main Setup Wizard class
 * Handles complete user onboarding experience with persistent state
 */
class SetupWizard {
    /**
     * Initialize Setup Wizard
     * 
     * @param {Object} bot - Telegraf bot instance
     * @param {Object} db - MongoDB database instance
     */
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.sessions = new Map();
        this.WIZARD_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        this.SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de'];
        
        // Start cleanup timer
        this.startSessionCleanup();
        
        // Setup callback handlers
        this.setupCallbackHandlers();
    }
    
    /**
     * Setup callback query handlers for wizard navigation
     */
    setupCallbackHandlers() {
        // Main wizard navigation
        this.bot.action(/^wizard:(.+)$/, (ctx) => this.handleWizardCallback(ctx));
        
        // Category toggles
        this.bot.action(/^toggle_cat:(.+)$/, (ctx) => this.toggleCategory(ctx));
        
        // Channel management
        this.bot.action(/^channel:(.+)$/, (ctx) => this.handleChannelCallback(ctx));
        
        // Tutorial navigation
        this.bot.action(/^tutorial:(.+)$/, (ctx) => this.handleTutorialCallback(ctx));
        
        // Time preference selections
        this.bot.action(/^time_pref:(.+)$/, (ctx) => this.handleTimePreference(ctx));
    }
    
    /**
     * Start the complete setup wizard for new users
     * 
     * @param {Object} ctx - Telegraf context
     * @param {boolean} isReturning - Whether user is returning to continue setup
     */
    async startWizard(ctx, isReturning = false) {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || ctx.from.username || 'Friend';
        
        try {
            // Check if user has incomplete setup
            if (isReturning) {
                const existingSession = await this.loadExistingSession(userId);
                if (existingSession) {
                    this.sessions.set(userId, existingSession);
                    return await this.resumeWizard(ctx);
                }
            }
            
            // Initialize new wizard session
            await this.initializeWizardSession(ctx);
            
            // Check if user wants to skip (experienced users)
            if (await this.isExperiencedUser(userId)) {
                return await this.showWelcomeWithSkip(ctx, userName);
            }
            
            // Show comprehensive welcome
            await this.showWelcome(ctx, userName);
            
        } catch (error) {
            console.error('Setup Wizard Error:', error);
            await ctx.reply(
                '❌ Sorry, there was an error starting the setup. Please try again with /start',
                this.getErrorKeyboard()
            );
        }
    }
    
    /**
     * Initialize wizard session with user data
     * 
     * @param {Object} ctx - Telegraf context
     */
    async initializeWizardSession(ctx) {
        const userId = ctx.from.id;
        const session = {
            userId,
            step: 'welcome',
            startedAt: new Date(),
            lastActivity: new Date(),
            progress: 0,
            data: {
                user_id: userId,
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                language_code: ctx.from.language_code || 'en',
                setup_started: new Date(),
                categories: [],
                channels: [],
                notifications: {
                    enabled: true,
                    digest_time: 'morning',
                    breaking_news: true,
                    quiet_hours: { start: '22:00', end: '07:00' },
                    frequency: 'daily'
                },
                preferences: {
                    city: null,
                    timezone: null,
                    language: 'en'
                }
            }
        };
        
        this.sessions.set(userId, session);
        await this.saveSessionToDatabase(session);
    }
    
    /**
     * Display personalized welcome message with bot introduction
     * 
     * @param {Object} ctx - Telegraf context
     * @param {string} userName - User's name
     */
    async showWelcome(ctx, userName) {
        const welcomeMessage = `
🎉 *Welcome to Zone News Bot, ${userName}!*

I'm your personal news assistant, ready to keep you informed with:

📰 *Latest News Updates* - Real-time articles from trusted sources
🎯 *Personalised Content* - News tailored to your interests  
🔔 *Smart Notifications* - Breaking news when it matters
🌍 *Local Focus* - City-specific news coverage
📱 *Mini App* - Rich interactive news experience
⚡ *Instant Search* - Find any article quickly

*Let's set up your preferences in just 3-4 minutes!*
        `.trim();
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Let\'s Get Started!', 'wizard:begin')],
            [Markup.button.callback('📖 Quick Tutorial First', 'wizard:tutorial')],
            [Markup.button.callback('⏭️ Skip Setup', 'wizard:skip_confirm')]
        ]);
        
        await ctx.reply(welcomeMessage, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        
        await this.updateWizardProgress(ctx.from.id, 10);
    }
    
    /**
     * Show welcome with skip option for experienced users
     * 
     * @param {Object} ctx - Telegraf context
     * @param {string} userName - User's name
     */
    async showWelcomeWithSkip(ctx, userName) {
        const message = `
👋 *Welcome back, ${userName}!*

I see you might be familiar with Telegram bots. 

Would you like to:
        `.trim();
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ Quick Setup (2 mins)', 'wizard:quick_setup')],
            [Markup.button.callback('🎯 Full Setup', 'wizard:begin')],
            [Markup.button.callback('⏭️ Skip & Explore', 'wizard:skip_final')]
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    
    /**
     * Handle wizard callback queries and route to appropriate step
     * 
     * @param {Object} ctx - Telegraf context
     */
    async handleWizardCallback(ctx) {
        const action = ctx.match[1];
        const userId = ctx.from.id;
        const session = this.sessions.get(userId);
        
        if (!session) {
            return ctx.answerCbQuery('⚠️ Session expired. Please /start again.');
        }
        
        try {
            await ctx.answerCbQuery();
            session.lastActivity = new Date();
            
            switch (action) {
                case 'begin':
                    await this.stepLanguageSelection(ctx);
                    break;
                case 'quick_setup':
                    await this.stepQuickSetup(ctx);
                    break;
                case 'tutorial':
                    await this.startTutorial(ctx);
                    break;
                case 'skip_confirm':
                    await this.confirmSkip(ctx);
                    break;
                case 'skip_final':
                    await this.skipSetup(ctx);
                    break;
                case 'language_next':
                    await this.stepCitySelection(ctx);
                    break;
                case 'city_next':
                    await this.stepCategorySelection(ctx);
                    break;
                case 'categories_next':
                    await this.stepNotificationPreferences(ctx);
                    break;
                case 'notifications_next':
                    await this.stepChannelSetup(ctx);
                    break;
                case 'channels_next':
                    await this.stepTutorialOffer(ctx);
                    break;
                case 'tutorial_complete':
                    await this.completeSetup(ctx);
                    break;
                case 'back':
                    await this.navigateBack(ctx);
                    break;
                default:
                    console.warn(`Unhandled wizard action: ${action}`);
            }
            
            await this.saveSessionToDatabase(session);
            
        } catch (error) {
            console.error('Wizard Callback Error:', error);
            await ctx.reply('❌ Something went wrong. Please try again.');
        }
    }
    
    /**
     * Step 1: Language Selection
     * 
     * @param {Object} ctx - Telegraf context
     */
    async stepLanguageSelection(ctx) {
        const session = this.sessions.get(ctx.from.id);
        session.step = 'language';
        
        const languages = [
            ['🇬🇧 English', 'en'],
            ['🇪🇸 Español', 'es'],
            ['🇫🇷 Français', 'fr'],
            ['🇩🇪 Deutsch', 'de']
        ];
        
        const keyboard = languages.map(([label, code]) =>
            [Markup.button.callback(label, `wizard:set_language:${code}`)]
        );
        keyboard.push([Markup.button.callback('➡️ Continue in English', 'wizard:language_next')]);
        
        const message = `
🌍 *Step 1/5: Language Preference*

*Progress: ███▫▫▫▫▫ 20%*

Select your preferred language for news content:
        `.trim();
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
        await this.updateWizardProgress(ctx.from.id, 20);
    }
    
    /**
     * Step 2: City Selection with Smart Suggestions
     * 
     * @param {Object} ctx - Telegraf context
     */
    async stepCitySelection(ctx) {
        const session = this.sessions.get(ctx.from.id);
        session.step = 'city';
        
        const popularCities = [
            ['🏙️ Adelaide', 'adelaide'],
            ['🌉 Sydney', 'sydney'],
            ['☕ Melbourne', 'melbourne'],
            ['🌴 Brisbane', 'brisbane']
        ];
        
        const moreCities = [
            ['🏖️ Perth', 'perth'],
            ['🌊 Hobart', 'hobart'],
            ['🏛️ Canberra', 'canberra'],
            ['🌺 Darwin', 'darwin']
        ];
        
        const keyboard = [];
        
        // Popular cities (2 per row)
        for (let i = 0; i < popularCities.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, popularCities.length); j++) {
                const [label, code] = popularCities[j];
                row.push(Markup.button.callback(label, `wizard:set_city:${code}`));
            }
            keyboard.push(row);
        }
        
        // More cities (2 per row)
        for (let i = 0; i < moreCities.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, moreCities.length); j++) {
                const [label, code] = moreCities[j];
                row.push(Markup.button.callback(label, `wizard:set_city:${code}`));
            }
            keyboard.push(row);
        }
        
        keyboard.push([
            Markup.button.callback('🌏 All Australia', 'wizard:set_city:all'),
            Markup.button.callback('🌍 Global News', 'wizard:set_city:global')
        ]);
        keyboard.push([Markup.button.callback('⬅️ Back', 'wizard:back')]);
        
        const message = `
📍 *Step 2/5: Location Preference*

*Progress: ██████▫▫▫ 40%*

Choose your preferred location for local news coverage:

*Popular Choices:*
        `.trim();
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
        await this.updateWizardProgress(ctx.from.id, 40);
    }
    
    /**
     * Step 3: Category Selection with Smart Recommendations
     * 
     * @param {Object} ctx - Telegraf context
     */
    async stepCategorySelection(ctx) {
        const session = this.sessions.get(ctx.from.id);
        session.step = 'categories';
        
        const categories = [
            { emoji: '📰', name: 'General News', id: 'general', popular: true },
            { emoji: '💼', name: 'Business', id: 'business', popular: true },
            { emoji: '🏥', name: 'Health', id: 'health', popular: true },
            { emoji: '⚽', name: 'Sports', id: 'sports', popular: false },
            { emoji: '💻', name: 'Technology', id: 'technology', popular: true },
            { emoji: '🎬', name: 'Entertainment', id: 'entertainment', popular: false },
            { emoji: '🌍', name: 'Environment', id: 'environment', popular: false },
            { emoji: '🏛️', name: 'Politics', id: 'politics', popular: false },
            { emoji: '💰', name: 'Crypto', id: 'crypto', popular: true },
            { emoji: '🚗', name: 'Automotive', id: 'automotive', popular: false }
        ];
        
        const keyboard = [];
        
        // Popular categories first (2 per row)
        const popularCategories = categories.filter(c => c.popular);
        for (let i = 0; i < popularCategories.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, popularCategories.length); j++) {
                const cat = popularCategories[j];
                const isSelected = session.data.categories.includes(cat.id);
                const icon = isSelected ? '✅' : '⚪';
                row.push(Markup.button.callback(
                    `${icon} ${cat.emoji} ${cat.name}`,
                    `toggle_cat:${cat.id}`
                ));
            }
            keyboard.push(row);
        }
        
        // Add divider
        keyboard.push([Markup.button.callback('━━━━━ More Categories ━━━━━', 'wizard:show_more_cats')]);
        
        // Other categories (2 per row)
        const otherCategories = categories.filter(c => !c.popular);
        for (let i = 0; i < otherCategories.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, otherCategories.length); j++) {
                const cat = otherCategories[j];
                const isSelected = session.data.categories.includes(cat.id);
                const icon = isSelected ? '✅' : '⚪';
                row.push(Markup.button.callback(
                    `${icon} ${cat.emoji} ${cat.name}`,
                    `toggle_cat:${cat.id}`
                ));
            }
            keyboard.push(row);
        }
        
        // Action buttons
        keyboard.push([
            Markup.button.callback('🎯 Select Popular', 'wizard:select_popular'),
            Markup.button.callback('✨ Select All', 'wizard:select_all_cats')
        ]);
        
        keyboard.push([
            Markup.button.callback('⬅️ Back', 'wizard:back'),
            Markup.button.callback(`➡️ Continue (${session.data.categories.length})`, 'wizard:categories_next')
        ]);
        
        const selectedText = session.data.categories.length > 0 
            ? `\n*Selected:* ${session.data.categories.length} categories` 
            : '';
        
        const message = `
📂 *Step 3/5: News Categories*

*Progress: █████████▫ 60%*

Select the news categories you're interested in:
${selectedText}

*✨ Popular categories are highlighted*
        `.trim();
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
        await this.updateWizardProgress(ctx.from.id, 60);
    }
    
    /**
     * Step 4: Comprehensive Notification Preferences
     * 
     * @param {Object} ctx - Telegraf context
     */
    async stepNotificationPreferences(ctx) {
        const session = this.sessions.get(ctx.from.id);
        session.step = 'notifications';
        
        const message = `
🔔 *Step 4/5: Notification Preferences*

*Progress: ████████████ 80%*

Configure how you'd like to receive news updates:

*Current Settings:*
📊 Daily Digest: ${session.data.notifications.digest_time}
🚨 Breaking News: ${session.data.notifications.breaking_news ? 'ON' : 'OFF'}
🌙 Quiet Hours: ${session.data.notifications.quiet_hours.start} - ${session.data.notifications.quiet_hours.end}
📈 Frequency: ${session.data.notifications.frequency}
        `.trim();
        
        const keyboard = [
            [
                Markup.button.callback('🌅 Morning Digest', 'wizard:set_digest:morning'),
                Markup.button.callback('🌆 Evening Digest', 'wizard:set_digest:evening')
            ],
            [
                Markup.button.callback('⚡ Breaking News: ON', 'wizard:toggle_breaking'),
                Markup.button.callback('🌙 Set Quiet Hours', 'wizard:set_quiet_hours')
            ],
            [
                Markup.button.callback('📊 Daily Updates', 'wizard:set_freq:daily'),
                Markup.button.callback('📈 Hourly Updates', 'wizard:set_freq:hourly')
            ],
            [
                Markup.button.callback('🔕 Minimal Notifications', 'wizard:set_minimal'),
                Markup.button.callback('🔔 All Notifications', 'wizard:set_all_notifs')
            ],
            [
                Markup.button.callback('⬅️ Back', 'wizard:back'),
                Markup.button.callback('➡️ Continue', 'wizard:notifications_next')
            ]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
        await this.updateWizardProgress(ctx.from.id, 80);
    }
    
    /**
     * Step 5: Channel and Group Setup Guide
     * 
     * @param {Object} ctx - Telegraf context
     */
    async stepChannelSetup(ctx) {
        const session = this.sessions.get(ctx.from.id);
        session.step = 'channels';
        
        const message = `
📢 *Step 5/5: Channel & Group Setup*

*Progress: ██████████████ 95%*

Want to add me to your channels or groups? Here's how:

*For Channels:*
1️⃣ Add me as admin to your channel
2️⃣ I'll auto-detect and show options below

*For Groups:*
1️⃣ Add me to your group chat
2️⃣ Make me admin (optional, for posting)
3️⃣ I'll appear in your destinations

*Current Destinations:* ${session.data.channels.length} configured
        `.trim();
        
        const keyboard = [
            [Markup.button.callback('📱 Test Channel Posting', 'wizard:test_posting')],
            [Markup.button.callback('🔍 Detect Channels', 'wizard:detect_channels')],
            [Markup.button.callback('📚 Channel Setup Guide', 'wizard:channel_guide')],
            [
                Markup.button.callback('⏭️ Skip This Step', 'wizard:skip_channels'),
                Markup.button.callback('✅ I\'m Done', 'wizard:channels_next')
            ],
            [Markup.button.callback('⬅️ Back', 'wizard:back')]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
        
        await this.updateWizardProgress(ctx.from.id, 95);
    }
    
    /**
     * Offer tutorial walkthrough
     * 
     * @param {Object} ctx - Telegraf context
     */
    async stepTutorialOffer(ctx) {
        const session = this.sessions.get(ctx.from.id);
        session.step = 'tutorial_offer';
        
        const message = `
🎓 *Almost Done!*

*Progress: ████████████████ 100%*

Would you like a quick interactive tutorial to explore the bot's features?

*Tutorial includes:*
📰 Browse latest news
🔍 Search articles
👍 Use reactions
📱 Mini-app demo
⚙️ Settings overview
        `.trim();
        
        const keyboard = [
            [Markup.button.callback('🎓 Yes, Show Me Around!', 'wizard:start_tutorial')],
            [Markup.button.callback('📰 Skip to News', 'wizard:tutorial_complete')],
            [Markup.button.callback('⚙️ Review My Settings', 'wizard:review_settings')]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }
    
    /**
     * Start interactive tutorial
     * 
     * @param {Object} ctx - Telegraf context
     */
    async startTutorial(ctx) {
        const message = `
🎓 *Interactive Tutorial*

Let's explore what I can do for you!

*Available Commands:*
/news - Latest news articles
/search - Search for specific topics  
/settings - Modify your preferences
/help - Complete command list

*Try this:* Type /news to see your personalised news feed!
        `.trim();
        
        const keyboard = [
            [Markup.button.callback('📰 Try /news Command', 'tutorial:news')],
            [Markup.button.callback('🔍 Try Search', 'tutorial:search')],
            [Markup.button.callback('📱 Open Mini-App', 'tutorial:miniapp')],
            [Markup.button.callback('⏭️ Skip Tutorial', 'wizard:tutorial_complete')]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }
    
    /**
     * Handle tutorial interactions
     * 
     * @param {Object} ctx - Telegraf context
     */
    async handleTutorialCallback(ctx) {
        const action = ctx.match[1];
        await ctx.answerCbQuery();
        
        switch (action) {
            case 'news':
                await ctx.reply('🎯 Great! Now try typing: /news');
                await ctx.reply('This will show you the latest news based on your preferences!');
                break;
            case 'search':
                await ctx.reply('🔍 Excellent! Try typing: /search bitcoin');
                await ctx.reply('This will search for articles containing "bitcoin"');
                break;
            case 'miniapp':
                await ctx.reply('📱 Amazing! The mini-app provides a rich interactive experience:');
                await ctx.reply('http://67.219.107.230/telegram-mini-app', {
                    reply_markup: Markup.inlineKeyboard([
                        [Markup.button.url('📱 Open Mini-App', 'http://67.219.107.230/telegram-mini-app')]
                    ])
                });
                break;
        }
        
        setTimeout(async () => {
            await this.completeSetup(ctx);
        }, 3000);
    }
    
    /**
     * Toggle category selection
     * 
     * @param {Object} ctx - Telegraf context
     */
    async toggleCategory(ctx) {
        const categoryId = ctx.match[1];
        const userId = ctx.from.id;
        const session = this.sessions.get(userId);
        
        if (!session) return ctx.answerCbQuery('Session expired');
        
        const categories = session.data.categories;
        const index = categories.indexOf(categoryId);
        
        if (index > -1) {
            categories.splice(index, 1);
            await ctx.answerCbQuery(`❌ Removed ${categoryId}`);
        } else {
            categories.push(categoryId);
            await ctx.answerCbQuery(`✅ Added ${categoryId}`);
        }
        
        // Refresh the category selection view
        await this.stepCategorySelection(ctx);
    }
    
    /**
     * Complete the setup wizard
     * 
     * @param {Object} ctx - Telegraf context
     */
    async completeSetup(ctx) {
        const userId = ctx.from.id;
        const session = this.sessions.get(userId);
        
        if (!session) return;
        
        try {
            // Save complete user profile to database
            const userProfile = {
                ...session.data,
                setup_complete: true,
                setup_completed_at: new Date(),
                last_active: new Date(),
                wizard_version: '2.0.0',
                completion_time: Date.now() - session.startedAt.getTime()
            };
            
            await this.db.collection('users').updateOne(
                { user_id: userId },
                { $set: userProfile },
                { upsert: true }
            );
            
            // Clean up session
            this.sessions.delete(userId);
            await this.removeSessionFromDatabase(userId);
            
            // Award completion badge
            await this.awardCompletionBadge(userId);
            
            // Send comprehensive completion message
            const completionMessage = `
🎉 *Setup Complete! Welcome to Zone News!*

*Your Profile:*
📍 Location: ${session.data.preferences.city || 'Global'}
📂 Categories: ${session.data.categories.length} selected
🔔 Notifications: ${session.data.notifications.frequency}
🌐 Language: ${session.data.preferences.language}

*🏆 Achievement Unlocked: Setup Master!*

*Quick Start:*
📰 /news - Your personalised feed
🔍 /search - Find specific topics
📱 Mini-App - Rich experience
⚙️ /settings - Update preferences anytime

*Ready to stay informed? Let's go!*
            `.trim();
            
            const keyboard = [
                [Markup.button.callback('📰 Get My First News', 'news:personalised')],
                [Markup.button.callback('📱 Open Mini-App', 'miniapp:open')],
                [Markup.button.callback('🔍 Try Search', 'search:demo')]
            ];
            
            await ctx.editMessageText(completionMessage, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });
            
            // Send welcome follow-up after 2 seconds
            setTimeout(async () => {
                await ctx.reply(
                    '💡 *Pro Tip:* You can change any of these settings anytime with /settings\n\n' +
                    'Questions? Type /help for the complete guide! 🚀'
                );
            }, 2000);
            
        } catch (error) {
            console.error('Setup Completion Error:', error);
            await ctx.reply('✅ Setup completed, but there was a minor issue saving some preferences.');
        }
    }
    
    /**
     * Skip setup with minimal user data
     * 
     * @param {Object} ctx - Telegraf context
     */
    async skipSetup(ctx) {
        const userId = ctx.from.id;
        
        try {
            // Save minimal user data
            await this.db.collection('users').updateOne(
                { user_id: userId },
                {
                    $set: {
                        user_id: userId,
                        username: ctx.from.username,
                        first_name: ctx.from.first_name,
                        language_code: ctx.from.language_code || 'en',
                        setup_complete: false,
                        setup_skipped: true,
                        created_at: new Date(),
                        categories: ['general'], // Default category
                        notifications: { enabled: false }
                    }
                },
                { upsert: true }
            );
            
            // Clean up session
            this.sessions.delete(userId);
            
            const message = `
👍 *No worries!*

You can explore right away with default settings.

*Quick Commands:*
📰 /news - Latest news
🔍 /search - Find articles  
📱 Mini-App - Rich experience
⚙️ /settings - Setup anytime

*Ready to explore?*
            `.trim();
            
            const keyboard = [
                [Markup.button.callback('📰 Show Me News', 'news:latest')],
                [Markup.button.callback('📱 Open Mini-App', 'miniapp:open')],
                [Markup.button.callback('⚙️ Setup Later', 'settings:open')]
            ];
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });
            
        } catch (error) {
            console.error('Skip Setup Error:', error);
            await ctx.reply('✅ Setup skipped. You can use /settings anytime to configure preferences.');
        }
    }
    
    /**
     * Show confirmation dialog for skipping setup
     * 
     * @param {Object} ctx - Telegraf context
     */
    async confirmSkip(ctx) {
        const message = `
⚠️ *Skip Setup?*

You'll miss out on:
• Personalised news categories
• Location-based content  
• Custom notification preferences
• Channel setup guide

You can always configure these later with /settings

*Are you sure?*
        `.trim();
        
        const keyboard = [
            [
                Markup.button.callback('❌ No, Continue Setup', 'wizard:begin'),
                Markup.button.callback('✅ Yes, Skip', 'wizard:skip_final')
            ]
        ];
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }
    
    /**
     * Navigate back to previous step
     * 
     * @param {Object} ctx - Telegraf context
     */
    async navigateBack(ctx) {
        const session = this.sessions.get(ctx.from.id);
        if (!session) return;
        
        const stepOrder = ['welcome', 'language', 'city', 'categories', 'notifications', 'channels', 'tutorial_offer'];
        const currentIndex = stepOrder.indexOf(session.step);
        
        if (currentIndex > 0) {
            const previousStep = stepOrder[currentIndex - 1];
            session.step = previousStep;
            
            // Navigate to previous step
            switch (previousStep) {
                case 'language':
                    await this.stepLanguageSelection(ctx);
                    break;
                case 'city':
                    await this.stepCitySelection(ctx);
                    break;
                case 'categories':
                    await this.stepCategorySelection(ctx);
                    break;
                case 'notifications':
                    await this.stepNotificationPreferences(ctx);
                    break;
                case 'channels':
                    await this.stepChannelSetup(ctx);
                    break;
                default:
                    await this.showWelcome(ctx, ctx.from.first_name);
            }
        }
    }
    
    /**
     * Update wizard progress for the user
     * 
     * @param {number} userId - Telegram user ID
     * @param {number} progress - Progress percentage (0-100)
     */
    async updateWizardProgress(userId, progress) {
        const session = this.sessions.get(userId);
        if (session) {
            session.progress = progress;
            await this.saveSessionToDatabase(session);
        }
    }
    
    /**
     * Save wizard session to database for persistence
     * 
     * @param {Object} session - Wizard session data
     */
    async saveSessionToDatabase(session) {
        try {
            await this.db.collection('wizard_sessions').updateOne(
                { userId: session.userId },
                { 
                    $set: { 
                        ...session, 
                        lastSaved: new Date() 
                    } 
                },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error saving wizard session:', error);
        }
    }
    
    /**
     * Load existing wizard session from database
     * 
     * @param {number} userId - Telegram user ID
     * @returns {Object|null} - Session data or null if not found
     */
    async loadExistingSession(userId) {
        try {
            return await this.db.collection('wizard_sessions').findOne({ userId });
        } catch (error) {
            console.error('Error loading wizard session:', error);
            return null;
        }
    }
    
    /**
     * Remove session from database
     * 
     * @param {number} userId - Telegram user ID
     */
    async removeSessionFromDatabase(userId) {
        try {
            await this.db.collection('wizard_sessions').deleteOne({ userId });
        } catch (error) {
            console.error('Error removing wizard session:', error);
        }
    }
    
    /**
     * Check if user needs setup
     * 
     * @param {number} userId - Telegram user ID
     * @returns {boolean} - Whether user needs setup
     */
    async needsSetup(userId) {
        try {
            const user = await this.db.collection('users').findOne({ user_id: userId });
            return !user || (!user.setup_complete && !user.setup_skipped);
        } catch (error) {
            console.error('Error checking setup status:', error);
            return true; // Default to needing setup
        }
    }
    
    /**
     * Check if user is experienced (has used other Telegram bots)
     * 
     * @param {number} userId - Telegram user ID
     * @returns {boolean} - Whether user might be experienced
     */
    async isExperiencedUser(userId) {
        // Simple heuristic: users with usernames and English language code
        // might be more experienced
        const session = this.sessions.get(userId);
        if (!session) return false;
        
        const hasUsername = !!session.data.username;
        const englishLang = session.data.language_code === 'en';
        
        return hasUsername && englishLang;
    }
    
    /**
     * Resume wizard from where user left off
     * 
     * @param {Object} ctx - Telegraf context
     */
    async resumeWizard(ctx) {
        const session = this.sessions.get(ctx.from.id);
        if (!session) return;
        
        await ctx.reply(`
👋 *Welcome back!*

I see you started setup earlier. Would you like to continue where you left off?

*Progress: ${this.getProgressBar(session.progress)} ${session.progress}%*
*Next step: ${this.getStepDescription(session.step)}*
        `.trim(), {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✅ Continue Setup', `wizard:${session.step}`)],
                [Markup.button.callback('🔄 Start Over', 'wizard:restart')],
                [Markup.button.callback('⏭️ Skip Setup', 'wizard:skip_confirm')]
            ])
        });
    }
    
    /**
     * Award completion badge to user
     * 
     * @param {number} userId - Telegram user ID
     */
    async awardCompletionBadge(userId) {
        try {
            await this.db.collection('user_achievements').insertOne({
                user_id: userId,
                achievement_id: 'setup_master',
                title: 'Setup Master',
                description: 'Completed the full setup wizard',
                icon: '🏆',
                earned_at: new Date(),
                points: 100
            });
        } catch (error) {
            console.error('Error awarding badge:', error);
        }
    }
    
    /**
     * Get progress bar visualization
     * 
     * @param {number} progress - Progress percentage
     * @returns {string} - Progress bar string
     */
    getProgressBar(progress) {
        const blocks = Math.floor(progress / 10);
        const filled = '█'.repeat(blocks);
        const empty = '▫'.repeat(10 - blocks);
        return filled + empty;
    }
    
    /**
     * Get human-readable step description
     * 
     * @param {string} step - Step name
     * @returns {string} - Step description
     */
    getStepDescription(step) {
        const descriptions = {
            'welcome': 'Getting Started',
            'language': 'Language Selection',
            'city': 'Location Preference',
            'categories': 'News Categories',
            'notifications': 'Notification Settings',
            'channels': 'Channel Setup',
            'tutorial_offer': 'Tutorial Walkthrough'
        };
        
        return descriptions[step] || 'Unknown Step';
    }
    
    /**
     * Get error recovery keyboard
     * 
     * @returns {Object} - Telegraf keyboard markup
     */
    getErrorKeyboard() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', 'wizard:restart')],
            [Markup.button.callback('💬 Get Help', 'support:contact')]
        ]);
    }
    
    /**
     * Start periodic session cleanup
     */
    startSessionCleanup() {
        setInterval(() => {
            this.cleanupSessions();
        }, 10 * 60 * 1000); // Every 10 minutes
    }
    
    /**
     * Clean up expired wizard sessions
     */
    async cleanupSessions() {
        const now = Date.now();
        const expiredSessions = [];
        
        for (const [userId, session] of this.sessions.entries()) {
            const sessionAge = now - session.lastActivity.getTime();
            if (sessionAge > this.WIZARD_TIMEOUT) {
                expiredSessions.push(userId);
            }
        }
        
        // Remove expired sessions
        for (const userId of expiredSessions) {
            this.sessions.delete(userId);
            console.log(`Cleaned up expired wizard session for user ${userId}`);
        }
        
        // Also cleanup database sessions
        try {
            const cutoffTime = new Date(now - this.WIZARD_TIMEOUT);
            await this.db.collection('wizard_sessions').deleteMany({
                lastActivity: { $lt: cutoffTime }
            });
        } catch (error) {
            console.error('Error cleaning up database sessions:', error);
        }
    }
    
    /**
     * Get wizard statistics for admin monitoring
     * 
     * @returns {Object} - Wizard usage statistics
     */
    async getWizardStatistics() {
        try {
            const stats = await this.db.collection('users').aggregate([
                {
                    $group: {
                        _id: null,
                        total_users: { $sum: 1 },
                        completed_setup: { $sum: { $cond: ['$setup_complete', 1, 0] } },
                        skipped_setup: { $sum: { $cond: ['$setup_skipped', 1, 0] } },
                        avg_completion_time: { $avg: '$completion_time' }
                    }
                }
            ]).toArray();
            
            return stats[0] || {
                total_users: 0,
                completed_setup: 0,
                skipped_setup: 0,
                avg_completion_time: 0
            };
        } catch (error) {
            console.error('Error getting wizard statistics:', error);
            return { error: 'Failed to get statistics' };
        }
    }
}

module.exports = SetupWizard;