/**
 * Onboarding Flow - Complete user onboarding with interactive tutorials
 * Production-ready implementation for Zone News Bot
 */

const { ObjectId } = require('mongodb');

class OnboardingFlow {
    constructor(bot, db, tierManager) {
        this.bot = bot;
        this.db = db;
        this.tierManager = tierManager;
        
        // Onboarding steps configuration
        this.onboardingSteps = {
            'welcome': {
                title: 'Welcome to Zone News Bot',
                description: 'Get started with automated news posting',
                icon: '👋',
                required: true,
                order: 1
            },
            'about': {
                title: 'About Zone News',
                description: 'Learn about our mission and features',
                icon: '📰',
                required: false,
                order: 2
            },
            'destinations': {
                title: 'Setup Destinations',
                description: 'Add channels and groups for posting',
                icon: '📍',
                required: true,
                order: 3
            },
            'first_post': {
                title: 'Create Your First Post',
                description: 'Try posting content to your destinations',
                icon: '📝',
                required: true,
                order: 4
            },
            'features': {
                title: 'Explore Features',
                description: 'Discover advanced bot capabilities',
                icon: '🚀',
                required: false,
                order: 5
            },
            'subscription': {
                title: 'Choose Your Plan',
                description: 'Unlock premium features',
                icon: '💎',
                required: false,
                order: 6
            },
            'complete': {
                title: 'Onboarding Complete',
                description: 'You\'re ready to start using Zone News Bot!',
                icon: '✅',
                required: true,
                order: 7
            }
        };
        
        // Interactive tutorials
        this.tutorials = {
            'basic_posting': {
                title: 'Basic Posting Tutorial',
                icon: '📝',
                description: 'Learn how to post content',
                steps: [
                    'Send a text message to the bot',
                    'Choose your destinations',
                    'Confirm and post',
                    'View posting results'
                ],
                estimated_time: '3 minutes'
            },
            'scheduling': {
                title: 'Scheduling Tutorial',
                icon: '⏰',
                description: 'Schedule posts for later',
                steps: [
                    'Use /schedule command',
                    'Enter your content',
                    'Choose schedule time',
                    'Confirm scheduling'
                ],
                estimated_time: '5 minutes',
                min_tier: 'basic'
            },
            'media_posting': {
                title: 'Media Posting Tutorial',
                icon: '📸',
                description: 'Post photos, videos, and documents',
                steps: [
                    'Send media to the bot',
                    'Add caption if needed',
                    'Select destinations',
                    'Post or schedule'
                ],
                estimated_time: '4 minutes',
                min_tier: 'basic'
            },
            'templates': {
                title: 'Templates Tutorial',
                icon: '📄',
                description: 'Create and use templates',
                steps: [
                    'Save your first template',
                    'Add variables to template',
                    'Load and customize template',
                    'Post template content'
                ],
                estimated_time: '6 minutes',
                min_tier: 'basic'
            },
            'bulk_operations': {
                title: 'Bulk Operations Tutorial',
                icon: '📤',
                description: 'Post to multiple destinations',
                steps: [
                    'Set up multiple destinations',
                    'Choose bulk posting',
                    'Select destinations',
                    'Execute bulk operation'
                ],
                estimated_time: '8 minutes',
                min_tier: 'pro'
            }
        };
        
        // Quick start guides
        this.quickStartGuides = {
            'news_channel': {
                title: 'News Channel Setup',
                icon: '📰',
                description: 'Set up automated news posting',
                actions: [
                    'Create or connect your news channel',
                    'Configure news preferences',
                    'Set up posting schedule',
                    'Test with sample news'
                ]
            },
            'business_promotion': {
                title: 'Business Promotion',
                icon: '🎯',
                description: 'Promote your business effectively',
                actions: [
                    'Connect business channels',
                    'Create promotional templates',
                    'Schedule regular posts',
                    'Track engagement'
                ]
            },
            'community_management': {
                title: 'Community Management',
                icon: '👥',
                description: 'Manage multiple groups and channels',
                actions: [
                    'Add multiple destinations',
                    'Set up content categories',
                    'Create posting schedules',
                    'Monitor engagement'
                ]
            }
        };
        
        // Feature discovery prompts
        this.featurePrompts = {
            'affiliate_program': {
                trigger_after_posts: 5,
                message: '💰 Did you know you can earn money with our affiliate program? Refer friends and earn 20.5% commission on their subscriptions!'
            },
            'scheduling': {
                trigger_after_posts: 3,
                message: '⏰ Save time with scheduled posting! Plan your content in advance and let the bot post automatically.',
                min_tier: 'basic'
            },
            'templates': {
                trigger_after_posts: 7,
                message: '📄 Speed up posting with templates! Save frequently used content and variables for quick posting.',
                min_tier: 'basic'
            },
            'analytics': {
                trigger_after_posts: 10,
                message: '📊 Track your success with analytics! See which posts perform best and optimize your content.',
                min_tier: 'basic'
            }
        };
    }

    /**
     * Register onboarding commands and handlers
     */
    register() {
        console.log('🔧 Registering OnboardingFlow...');
        
        // Onboarding commands
        this.bot.command('onboarding', this.handleOnboarding.bind(this));
        this.bot.command('about', this.handleAbout.bind(this));
        this.bot.command('tutorial', this.handleTutorial.bind(this));
        this.bot.command('quickstart', this.handleQuickStart.bind(this));
        this.bot.command('help', this.handleHelp.bind(this));
        this.bot.command('features', this.handleFeatures.bind(this));
        this.bot.command('setup', this.handleSetup.bind(this));
        
        // Callback handlers
        this.bot.action(/^onboard:/, this.handleOnboardingCallback.bind(this));
        this.bot.action(/^tutorial:/, this.handleTutorialCallback.bind(this));
        this.bot.action(/^guide:/, this.handleGuideCallback.bind(this));
        this.bot.action(/^setup:/, this.handleSetupCallback.bind(this));
        this.bot.action(/^discover:/, this.handleDiscoverCallback.bind(this));
        
        console.log('✅ OnboardingFlow registered');
    }

    /**
     * Start onboarding for new users
     */
    async startOnboarding(ctx, skipWelcome = false) {
        try {
            const userId = ctx.from.id;
            
            // Check if user has already completed onboarding
            const user = await this.db.collection('users').findOne({ user_id: userId });
            if (user?.onboarding_completed && !skipWelcome) {
                await this.showOnboardingMenu(ctx);
                return;
            }
            
            // Create or update user record
            await this.db.collection('users').updateOne(
                { user_id: userId },
                {
                    $setOnInsert: {
                        user_id: userId,
                        username: ctx.from.username,
                        first_name: ctx.from.first_name,
                        last_name: ctx.from.last_name,
                        created_at: new Date()
                    },
                    $set: {
                        onboarding_started: new Date(),
                        onboarding_step: 'welcome',
                        last_seen: new Date()
                    }
                },
                { upsert: true }
            );
            
            // Start welcome step
            await this.showWelcomeStep(ctx);
            
        } catch (error) {
            console.error('Error starting onboarding:', error);
            await ctx.reply('❌ Error starting onboarding. Please try again.');
        }
    }

    /**
     * Show welcome step
     */
    async showWelcomeStep(ctx) {
        const welcomeMessage = 
            `👋 *Welcome to Zone News Bot!*\n\n` +
            `🎉 Thanks for joining ${ctx.from.first_name}!\n\n` +
            `🤖 I'm your automated news posting assistant. I can help you:\n\n` +
            `📰 *Share breaking news* to your channels\n` +
            `⏰ *Schedule posts* for optimal timing\n` +
            `📸 *Post media content* with captions\n` +
            `📊 *Track engagement* and analytics\n` +
            `💰 *Earn money* through our affiliate program\n\n` +
            `Let's get you set up in just a few minutes! 🚀`;
        
        await ctx.reply(welcomeMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Start Setup', callback_data: 'onboard:next:welcome' }],
                    [{ text: '📖 Learn More', callback_data: 'onboard:about' }],
                    [{ text: '⏭️ Skip Onboarding', callback_data: 'onboard:skip' }]
                ]
            }
        });
    }

    /**
     * Handle /about command
     */
    async handleAbout(ctx) {
        const aboutMessage = 
            `📰 *About Zone News Bot*\n\n` +
            `🎯 *Our Mission*\n` +
            `To democratize news sharing and help content creators reach their audience efficiently.\n\n` +
            `🌟 *Key Features*\n` +
            `• 🤖 **Automated Posting** - Share content instantly\n` +
            `• ⏰ **Smart Scheduling** - Post at optimal times\n` +
            `• 📊 **Analytics** - Track performance and engagement\n` +
            `• 📱 **Multi-Platform** - Support for channels and groups\n` +
            `• 🎨 **Templates** - Save time with reusable content\n` +
            `• 💰 **Monetization** - Earn through affiliate program\n\n` +
            `🔒 *Privacy & Security*\n` +
            `• End-to-end encryption for sensitive data\n` +
            `• GDPR compliant data handling\n` +
            `• No data sharing with third parties\n` +
            `• Secure payment processing\n\n` +
            `📞 *Support*\n` +
            `• 24/7 community support\n` +
            `• Comprehensive documentation\n` +
            `• Interactive tutorials\n` +
            `• Regular feature updates`;
        
        await ctx.reply(aboutMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🚀 Get Started', callback_data: 'onboard:start' },
                        { text: '📚 Tutorials', callback_data: 'tutorial:menu' }
                    ],
                    [
                        { text: '💎 View Plans', callback_data: 'subscribe:plans' },
                        { text: '🤝 Join Community', url: 'https://t.me/ZoneNewsBot_Community' }
                    ],
                    [{ text: '❌ Close', callback_data: 'cancel' }]
                ]
            }
        });
    }

    /**
     * Handle onboarding callbacks
     */
    async handleOnboardingCallback(ctx) {
        try {
            const data = ctx.callbackQuery.data.split(':');
            const action = data[1];
            const param = data[2];
            
            await ctx.answerCallbackQuery();
            
            switch (action) {
                case 'next':
                    await this.proceedToNextStep(ctx, param);
                    break;
                case 'prev':
                    await this.goToPreviousStep(ctx, param);
                    break;
                case 'skip':
                    await this.skipOnboarding(ctx);
                    break;
                case 'about':
                    await this.handleAbout(ctx);
                    break;
                case 'destinations':
                    await this.setupDestinations(ctx);
                    break;
                case 'firstpost':
                    await this.guideFirstPost(ctx);
                    break;
                case 'complete':
                    await this.completeOnboarding(ctx);
                    break;
                default:
                    await ctx.reply('❌ Unknown onboarding action.');
            }
            
        } catch (error) {
            console.error('Error handling onboarding callback:', error);
            await ctx.answerCallbackQuery('❌ Error processing onboarding step');
        }
    }

    /**
     * Proceed to next onboarding step
     */
    async proceedToNextStep(ctx, currentStep) {
        try {
            const userId = ctx.from.id;
            
            // Update user progress
            await this.db.collection('users').updateOne(
                { user_id: userId },
                { $addToSet: { completed_steps: currentStep } }
            );
            
            switch (currentStep) {
                case 'welcome':
                    await this.showDestinationsStep(ctx);
                    break;
                case 'destinations':
                    await this.showFirstPostStep(ctx);
                    break;
                case 'firstpost':
                    await this.showFeaturesStep(ctx);
                    break;
                case 'features':
                    await this.showSubscriptionStep(ctx);
                    break;
                case 'subscription':
                    await this.showCompletionStep(ctx);
                    break;
                default:
                    await this.completeOnboarding(ctx);
            }
            
        } catch (error) {
            console.error('Error proceeding to next step:', error);
            await ctx.reply('❌ Error proceeding to next step.');
        }
    }

    /**
     * Show destinations setup step
     */
    async showDestinationsStep(ctx) {
        await ctx.editMessageText(
            `📍 *Setup Your Destinations*\n\n` +
            `To start posting, you need to connect channels or groups where your content will be shared.\n\n` +
            `🔹 **Channels** - For broadcasting to followers\n` +
            `🔹 **Groups** - For community discussions\n` +
            `🔹 **Private Groups** - For team collaboration\n\n` +
            `You can add destinations now or skip and do it later.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Add Channel', callback_data: 'setup:channel' }],
                        [{ text: '👥 Add Group', callback_data: 'setup:group' }],
                        [{ text: '📋 View Guide', callback_data: 'guide:destinations' }],
                        [
                            { text: '⏭️ Skip for Now', callback_data: 'onboard:next:destinations' },
                            { text: '« Back', callback_data: 'onboard:prev:destinations' }
                        ]
                    ]
                }
            }
        );
    }

    /**
     * Show first post step
     */
    async showFirstPostStep(ctx) {
        const userId = ctx.from.id;
        const destinations = await this.db.collection('user_destinations').countDocuments({ user_id: userId });
        
        let message = `📝 *Create Your First Post*\n\n`;
        
        if (destinations > 0) {
            message += `Great! You have ${destinations} destination(s) set up.\n\n`;
            message += `Now let's create your first post. You can:\n\n`;
            message += `📝 **Send a text message** - Just type and send\n`;
            message += `📸 **Upload media** - Send photos or videos\n`;
            message += `📄 **Use a template** - Choose from examples\n\n`;
            message += `Try sending me a message to post!`;
            
            const keyboard = [
                [{ text: '📝 Send Text Message', callback_data: 'tutorial:text_input' }],
                [{ text: '📸 Upload Media', callback_data: 'tutorial:media_input' }],
                [{ text: '📄 Use Template', callback_data: 'tutorial:template' }],
                [
                    { text: '⏭️ Skip Tutorial', callback_data: 'onboard:next:firstpost' },
                    { text: '« Back', callback_data: 'onboard:prev:firstpost' }
                ]
            ];
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            message += `You haven't added any destinations yet.\n\n`;
            message += `Would you like to add some destinations first, or skip this step?`;
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📍 Setup Destinations', callback_data: 'onboard:destinations' }],
                        [{ text: '⏭️ Skip for Now', callback_data: 'onboard:next:firstpost' }],
                        [{ text: '« Back', callback_data: 'onboard:prev:firstpost' }]
                    ]
                }
            });
        }
    }

    /**
     * Show features exploration step
     */
    async showFeaturesStep(ctx) {
        await ctx.editMessageText(
            `🚀 *Explore Premium Features*\n\n` +
            `You've mastered the basics! Now discover what else Zone News Bot can do:\n\n` +
            `⏰ **Scheduling** - Plan posts in advance\n` +
            `📊 **Analytics** - Track engagement and performance\n` +
            `📄 **Templates** - Save time with reusable content\n` +
            `📤 **Bulk Operations** - Post to multiple destinations\n` +
            `💰 **Affiliate Program** - Earn money by referring friends\n` +
            `🤖 **API Access** - Integrate with your own systems\n\n` +
            `Most features are available with our affordable premium plans.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📚 View Tutorials', callback_data: 'tutorial:menu' },
                            { text: '🎯 Try Features', callback_data: 'discover:features' }
                        ],
                        [
                            { text: '💎 View Plans', callback_data: 'subscribe:plans' },
                            { text: '💰 Affiliate Info', callback_data: 'affiliate:info' }
                        ],
                        [
                            { text: '⏭️ Continue', callback_data: 'onboard:next:features' },
                            { text: '« Back', callback_data: 'onboard:prev:features' }
                        ]
                    ]
                }
            }
        );
    }

    /**
     * Show subscription step
     */
    async showSubscriptionStep(ctx) {
        const userId = ctx.from.id;
        const currentTier = await this.tierManager.getUserTier(userId);
        
        let message = `💎 *Choose Your Plan*\n\n`;
        
        if (currentTier === 'free') {
            message += `You're currently on the **Free** plan with basic features.\n\n`;
            message += `Upgrade to unlock powerful features:\n\n`;
            message += `✨ **Basic ($9.99/mo)**\n`;
            message += `• 50 posts/day\n`;
            message += `• Scheduling & media posting\n`;
            message += `• 5 templates & analytics\n\n`;
            message += `🚀 **Pro ($19.99/mo)**\n`;
            message += `• 500 posts/day\n`;
            message += `• Bulk operations & API access\n`;
            message += `• Advanced features & templates\n\n`;
            message += `💼 **Enterprise ($49.99/mo)**\n`;
            message += `• Unlimited everything\n`;
            message += `• White-label & team features\n`;
            message += `• Priority support\n\n`;
            message += `You can upgrade anytime or continue with the free plan.`;
        } else {
            message += `You're already subscribed to the **${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}** plan!\n\n`;
            message += `Thanks for supporting Zone News Bot. You have access to premium features.`;
        }
        
        const keyboard = [];
        
        if (currentTier === 'free') {
            keyboard.push([
                { text: '💎 View Plans', callback_data: 'subscribe:plans' },
                { text: '💰 Affiliate Program', callback_data: 'affiliate:info' }
            ]);
        }
        
        keyboard.push([
            { text: '⏭️ Continue', callback_data: 'onboard:next:subscription' },
            { text: '« Back', callback_data: 'onboard:prev:subscription' }
        ]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    /**
     * Show completion step
     */
    async showCompletionStep(ctx) {
        const userId = ctx.from.id;
        
        // Mark onboarding as completed
        await this.db.collection('users').updateOne(
            { user_id: userId },
            {
                $set: {
                    onboarding_completed: true,
                    onboarding_completed_at: new Date()
                }
            }
        );
        
        await ctx.editMessageText(
            `✅ *Onboarding Complete!*\n\n` +
            `🎉 Congratulations ${ctx.from.first_name}! You're all set up and ready to start using Zone News Bot.\n\n` +
            `🚀 **What's Next?**\n` +
            `• Start posting content to your destinations\n` +
            `• Explore scheduling and templates\n` +
            `• Check out our tutorials for advanced features\n` +
            `• Join our community for tips and support\n\n` +
            `📞 **Need Help?**\n` +
            `Use /help anytime or browse our tutorials with /tutorial\n\n` +
            `Happy posting! 🎯`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📝 Create First Post', callback_data: 'post:wizard' },
                            { text: '📚 View Tutorials', callback_data: 'tutorial:menu' }
                        ],
                        [
                            { text: '🤝 Join Community', url: 'https://t.me/ZoneNewsBot_Community' },
                            { text: '💰 Affiliate Program', callback_data: 'affiliate:info' }
                        ],
                        [{ text: '🏠 Main Menu', callback_data: 'menu:main' }]
                    ]
                }
            }
        );
        
        // Send welcome bonus or affiliate info
        setTimeout(async () => {
            try {
                await this.bot.telegram.sendMessage(
                    userId,
                    `🎁 *Welcome Bonus!*\n\n` +
                    `As a new user, here's how to get the most out of Zone News Bot:\n\n` +
                    `💰 **Earn Money**: Share your referral link and earn 20.5% commission on subscriptions\n` +
                    `📈 **Grow Faster**: Use scheduling to post consistently\n` +
                    `🎯 **Save Time**: Create templates for recurring content\n\n` +
                    `Ready to start? Try /post to create your first post!`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.error('Error sending welcome bonus message:', error);
            }
        }, 5000); // Send after 5 seconds
    }

    /**
     * Handle /tutorial command
     */
    async handleTutorial(ctx) {
        try {
            const userId = ctx.from.id;
            const userTier = await this.tierManager.getUserTier(userId);
            
            let message = `📚 *Interactive Tutorials*\n\n`;
            message += `Learn Zone News Bot features step-by-step with our interactive tutorials.\n\n`;
            message += `**Available Tutorials:**\n\n`;
            
            const keyboard = [];
            
            for (const [key, tutorial] of Object.entries(this.tutorials)) {
                // Check if user has access to this tutorial
                if (tutorial.min_tier) {
                    const hasAccess = await this.tierManager.hasFeature(userId, 'templates'); // Example check
                    if (!hasAccess) {
                        continue;
                    }
                }
                
                message += `${tutorial.icon} **${tutorial.title}**\n`;
                message += `   ${tutorial.description}\n`;
                message += `   ⏱️ ${tutorial.estimated_time}\n\n`;
                
                keyboard.push([{
                    text: `${tutorial.icon} ${tutorial.title}`,
                    callback_data: `tutorial:start:${key}`
                }]);
            }
            
            keyboard.push([
                { text: '🚀 Quick Start Guides', callback_data: 'guide:quickstart' },
                { text: '💡 Feature Discovery', callback_data: 'discover:menu' }
            ]);
            keyboard.push([{ text: '❌ Close', callback_data: 'cancel' }]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
            
        } catch (error) {
            console.error('Error showing tutorials:', error);
            await ctx.reply('❌ Error loading tutorials.');
        }
    }

    /**
     * Handle /help command
     */
    async handleHelp(ctx) {
        const helpMessage = 
            `📖 *Zone News Bot Help*\n\n` +
            `🚀 **Quick Commands**\n` +
            `/post - Create a new post\n` +
            `/schedule - Schedule a post\n` +
            `/templates - Manage templates\n` +
            `/mydestinations - Manage destinations\n` +
            `/subscribe - View subscription plans\n` +
            `/affiliate - Join affiliate program\n\n` +
            `📚 **Learning Resources**\n` +
            `/tutorial - Interactive tutorials\n` +
            `/onboarding - Restart onboarding\n` +
            `/features - Explore all features\n` +
            `/about - Learn about Zone News\n\n` +
            `💡 **Pro Tips**\n` +
            `• Send media directly to the bot to post\n` +
            `• Use templates to save time\n` +
            `• Schedule posts for optimal engagement\n` +
            `• Join our affiliate program to earn money\n\n` +
            `🆘 **Need More Help?**\n` +
            `Join our community or contact support!`;
        
        await ctx.reply(helpMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📚 Tutorials', callback_data: 'tutorial:menu' },
                        { text: '🚀 Quick Start', callback_data: 'guide:quickstart' }
                    ],
                    [
                        { text: '🤝 Community', url: 'https://t.me/ZoneNewsBot_Community' },
                        { text: '📧 Support', url: 'mailto:support@thezonenews.com' }
                    ],
                    [
                        { text: '💡 Feature Guide', callback_data: 'discover:menu' },
                        { text: '📖 Documentation', url: 'https://docs.thezonenews.com' }
                    ],
                    [{ text: '❌ Close', callback_data: 'cancel' }]
                ]
            }
        });
    }

    /**
     * Skip onboarding
     */
    async skipOnboarding(ctx) {
        const userId = ctx.from.id;
        
        await this.db.collection('users').updateOne(
            { user_id: userId },
            {
                $set: {
                    onboarding_completed: true,
                    onboarding_skipped: true,
                    onboarding_completed_at: new Date()
                }
            }
        );
        
        await ctx.editMessageText(
            `⏭️ *Onboarding Skipped*\n\n` +
            `No problem! You can always return to the tutorials later.\n\n` +
            `🚀 **Quick Start:**\n` +
            `• Use /post to create your first post\n` +
            `• Use /mydestinations to add channels/groups\n` +
            `• Use /help for command reference\n` +
            `• Use /tutorial for interactive guides\n\n` +
            `Ready to get started?`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📝 Create Post', callback_data: 'post:wizard' },
                            { text: '📍 Add Destinations', callback_data: 'destinations:setup' }
                        ],
                        [
                            { text: '📚 View Tutorials', callback_data: 'tutorial:menu' },
                            { text: '🔄 Restart Onboarding', callback_data: 'onboard:restart' }
                        ],
                        [{ text: '🏠 Main Menu', callback_data: 'menu:main' }]
                    ]
                }
            }
        );
    }

    /**
     * Complete onboarding
     */
    async completeOnboarding(ctx) {
        await this.showCompletionStep(ctx);
    }

    /**
     * Show onboarding menu for returning users
     */
    async showOnboardingMenu(ctx) {
        await ctx.reply(
            `👋 *Welcome Back!*\n\n` +
            `You've already completed onboarding. What would you like to do?\n\n` +
            `📚 **Learn More**: Explore tutorials and advanced features\n` +
            `🔄 **Restart**: Go through onboarding again\n` +
            `🚀 **Get Started**: Jump right into posting`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📚 Tutorials', callback_data: 'tutorial:menu' },
                            { text: '💡 Features', callback_data: 'discover:menu' }
                        ],
                        [
                            { text: '🔄 Restart Onboarding', callback_data: 'onboard:restart' },
                            { text: '📝 Create Post', callback_data: 'post:wizard' }
                        ],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ]
                }
            }
        );
    }

    /**
     * Handle /onboarding command
     */
    async handleOnboarding(ctx) {
        const userId = ctx.from.id;
        const user = await this.db.collection('users').findOne({ user_id: userId });
        
        if (user?.onboarding_completed) {
            await this.showOnboardingMenu(ctx);
        } else {
            await this.startOnboarding(ctx);
        }
    }

    /**
     * Check if user should see feature prompts
     */
    async checkFeaturePrompts(userId, postCount) {
        try {
            const userTier = await this.tierManager.getUserTier(userId);
            
            for (const [featureKey, prompt] of Object.entries(this.featurePrompts)) {
                // Check if user has reached trigger threshold
                if (postCount === prompt.trigger_after_posts) {
                    // Check tier requirement
                    if (prompt.min_tier) {
                        const hasFeature = await this.tierManager.hasFeature(userId, 'templates'); // Example
                        if (!hasFeature) continue;
                    }
                    
                    // Check if prompt was already shown
                    const shownPrompt = await this.db.collection('user_prompts').findOne({
                        user_id: userId,
                        feature: featureKey
                    });
                    
                    if (!shownPrompt) {
                        // Show the prompt
                        await this.showFeaturePrompt(userId, featureKey, prompt);
                        
                        // Mark as shown
                        await this.db.collection('user_prompts').insertOne({
                            user_id: userId,
                            feature: featureKey,
                            shown_at: new Date()
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error checking feature prompts:', error);
        }
    }

    /**
     * Show feature discovery prompt
     */
    async showFeaturePrompt(userId, featureKey, prompt) {
        try {
            const keyboard = [];
            
            switch (featureKey) {
                case 'affiliate_program':
                    keyboard.push([{ text: '💰 Learn More', callback_data: 'affiliate:info' }]);
                    break;
                case 'scheduling':
                    keyboard.push([{ text: '⏰ Try Scheduling', callback_data: 'schedule:menu' }]);
                    break;
                case 'templates':
                    keyboard.push([{ text: '📄 Create Template', callback_data: 'template:create' }]);
                    break;
                case 'analytics':
                    keyboard.push([{ text: '📊 View Analytics', callback_data: 'analytics:view' }]);
                    break;
            }
            
            keyboard.push([{ text: '❌ Dismiss', callback_data: 'dismiss' }]);
            
            await this.bot.telegram.sendMessage(
                userId,
                `💡 **Tip**: ${prompt.message}`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                }
            );
        } catch (error) {
            console.error('Error showing feature prompt:', error);
        }
    }
}

module.exports = OnboardingFlow;