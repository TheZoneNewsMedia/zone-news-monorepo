/**
 * Tier Manager - Complete tier management system with access control and usage tracking
 * Production-ready implementation for Zone News Bot
 */

const { ObjectId } = require('mongodb');

class TierManager {
    constructor(db) {
        this.db = db;
        
        // Define feature access by tier with comprehensive limits
        this.tiers = {
            free: {
                name: 'Free',
                level: 0,
                price: 0,
                commands: [
                    'start', 'help', 'about', 'news', 'post', 'mydestinations',
                    'affiliate', 'subscribe', 'usage', 'onboarding'
                ],
                limits: {
                    posts_per_day: 3,
                    posts_per_month: 50,
                    scheduled_posts: 0,
                    media_size_mb: 5,
                    destinations: 1,
                    analytics_days: 0,
                    templates: 0,
                    bulk_destinations: 0,
                    api_calls_per_day: 0,
                    webhook_endpoints: 0,
                    custom_domains: 0,
                    team_members: 1,
                    export_formats: [],
                    priority_support: false,
                    white_label: false
                },
                features: {
                    basic_posting: true,
                    media_posting: false,
                    scheduled_posting: false,
                    recurring_posts: false,
                    bulk_posting: false,
                    templates: false,
                    analytics: false,
                    export: false,
                    api_access: false,
                    webhooks: false,
                    custom_branding: false,
                    team_collaboration: false,
                    priority_support: false
                }
            },
            basic: {
                name: 'Basic',
                level: 1,
                price: 999, // $9.99
                commands: [
                    'start', 'help', 'about', 'news', 'post', 'postmedia', 'schedule', 
                    'scheduled', 'mydestinations', 'affiliate', 'subscribe', 'usage',
                    'earnings', 'withdraw', 'templates', 'savetemplate', 'loadtemplate',
                    'quickpost', 'onboarding'
                ],
                limits: {
                    posts_per_day: 50,
                    posts_per_month: 1000,
                    scheduled_posts: 10,
                    media_size_mb: 50,
                    destinations: 5,
                    analytics_days: 7,
                    templates: 5,
                    bulk_destinations: 3,
                    api_calls_per_day: 100,
                    webhook_endpoints: 1,
                    custom_domains: 0,
                    team_members: 1,
                    export_formats: ['csv'],
                    priority_support: false,
                    white_label: false
                },
                features: {
                    basic_posting: true,
                    media_posting: true,
                    scheduled_posting: true,
                    recurring_posts: false,
                    bulk_posting: true,
                    templates: true,
                    analytics: true,
                    export: true,
                    api_access: false,
                    webhooks: false,
                    custom_branding: false,
                    team_collaboration: false,
                    priority_support: false
                }
            },
            pro: {
                name: 'Pro',
                level: 2,
                price: 1999, // $19.99
                commands: [
                    'start', 'help', 'about', 'news', 'post', 'postmedia', 'posttogroup',
                    'posttochannel', 'schedule', 'scheduled', 'cancelschedule', 'reschedule',
                    'mydestinations', 'checkbot', 'affiliate', 'subscribe', 'usage',
                    'earnings', 'withdraw', 'templates', 'savetemplate', 'loadtemplate',
                    'deletetemplate', 'templatecategories', 'shartemplate', 'quickpost',
                    'bulkpost', 'bulkedit', 'bulkschedule', 'bulkdelete', 'trending',
                    'analytics', 'export', 'posttext', 'clearmedia', 'recurring',
                    'onboarding'
                ],
                limits: {
                    posts_per_day: 500,
                    posts_per_month: 10000,
                    scheduled_posts: 100,
                    media_size_mb: 200,
                    destinations: 50,
                    analytics_days: 30,
                    templates: 20,
                    bulk_destinations: 25,
                    api_calls_per_day: 1000,
                    webhook_endpoints: 5,
                    custom_domains: 1,
                    team_members: 3,
                    export_formats: ['csv', 'json', 'pdf'],
                    priority_support: true,
                    white_label: false
                },
                features: {
                    basic_posting: true,
                    media_posting: true,
                    scheduled_posting: true,
                    recurring_posts: true,
                    bulk_posting: true,
                    templates: true,
                    analytics: true,
                    export: true,
                    api_access: true,
                    webhooks: true,
                    custom_branding: false,
                    team_collaboration: true,
                    priority_support: true
                }
            },
            enterprise: {
                name: 'Enterprise',
                level: 3,
                price: 4999, // $49.99
                commands: ['*'], // All commands
                limits: {
                    posts_per_day: -1,      // Unlimited
                    posts_per_month: -1,    // Unlimited
                    scheduled_posts: -1,    // Unlimited
                    media_size_mb: 1000,
                    destinations: -1,       // Unlimited
                    analytics_days: 365,
                    templates: -1,          // Unlimited
                    bulk_destinations: -1,  // Unlimited
                    api_calls_per_day: -1,  // Unlimited
                    webhook_endpoints: -1,  // Unlimited
                    custom_domains: -1,     // Unlimited
                    team_members: -1,       // Unlimited
                    export_formats: ['csv', 'json', 'pdf', 'xml', 'xlsx'],
                    priority_support: true,
                    white_label: true
                },
                features: {
                    basic_posting: true,
                    media_posting: true,
                    scheduled_posting: true,
                    recurring_posts: true,
                    bulk_posting: true,
                    templates: true,
                    analytics: true,
                    export: true,
                    api_access: true,
                    webhooks: true,
                    custom_branding: true,
                    team_collaboration: true,
                    priority_support: true
                }
            }
        };
        
        // Premium command restrictions with detailed messages
        this.premiumCommands = {
            'postmedia': {
                minTier: 'basic',
                feature: 'media_posting',
                message: '📸 *Media Posting* requires Basic tier or higher.\n\n✨ Upgrade to Basic ($9.99/mo) to:\n• Post photos, videos, and documents\n• Schedule media posts\n• Use up to 50MB files\n• Access 5 destinations'
            },
            'schedule': {
                minTier: 'basic',
                feature: 'scheduled_posting',
                message: '⏰ *Scheduled Posting* requires Basic tier or higher.\n\n✨ Upgrade to Basic ($9.99/mo) to:\n• Schedule posts for later\n• Set up to 10 scheduled posts\n• Manage content calendar\n• Quick scheduling options'
            },
            'posttogroup': {
                minTier: 'pro',
                feature: 'bulk_posting',
                message: '📱 *Advanced Group Posting* requires Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• Post to multiple groups simultaneously\n• Bulk posting to 25 destinations\n• Advanced targeting options\n• Group management tools'
            },
            'posttochannel': {
                minTier: 'pro',
                feature: 'bulk_posting',
                message: '📢 *Channel Management* requires Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• Manage multiple channels\n• Cross-post content easily\n• Channel analytics\n• Advanced scheduling'
            },
            'analytics': {
                minTier: 'basic',
                feature: 'analytics',
                message: '📊 *Analytics* requires Basic tier or higher.\n\n✨ Upgrade to Basic ($9.99/mo) to:\n• View 7-day analytics\n• Track engagement metrics\n• Export reports\n• Performance insights'
            },
            'trending': {
                minTier: 'pro',
                feature: 'analytics',
                message: '📈 *Trending Analytics* requires Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• 30-day trending analysis\n• Advanced metrics\n• Viral content insights\n• Performance predictions'
            },
            'withdraw': {
                minTier: 'basic',
                feature: 'basic_posting',
                message: '💵 *Withdrawals* require an active subscription.\n\n✨ Upgrade to Basic ($9.99/mo) or higher to:\n• Withdraw affiliate earnings\n• Access payment methods\n• Instant transfers\n• Transaction history'
            },
            'bulkpost': {
                minTier: 'pro',
                feature: 'bulk_posting',
                message: '📤 *Bulk Posting* requires Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• Post to 25 destinations simultaneously\n• Bulk edit and schedule\n• Mass operations\n• Time-saving automation'
            },
            'bulkedit': {
                minTier: 'pro',
                feature: 'bulk_posting',
                message: '✏️ *Bulk Editing* requires Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• Edit multiple posts at once\n• Bulk rescheduling\n• Mass updates\n• Efficient content management'
            },
            'templates': {
                minTier: 'basic',
                feature: 'templates',
                message: '📝 *Templates* require Basic tier or higher.\n\n✨ Upgrade to Basic ($9.99/mo) to:\n• Save 5 custom templates\n• Quick post creation\n• Template categories\n• Reusable content'
            },
            'savetemplate': {
                minTier: 'basic',
                feature: 'templates',
                message: '💾 *Save Templates* requires Basic tier or higher.\n\n✨ Upgrade to Basic ($9.99/mo) to save custom templates.'
            },
            'recurring': {
                minTier: 'pro',
                feature: 'recurring_posts',
                message: '🔄 *Recurring Posts* require Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• Set up recurring schedules\n• Daily, weekly, monthly posts\n• Automated content cycles\n• Content calendar automation'
            },
            'export': {
                minTier: 'basic',
                feature: 'export',
                message: '📁 *Export Features* require Basic tier or higher.\n\n✨ Upgrade to Basic ($9.99/mo) to export data in CSV format.'
            },
            'api': {
                minTier: 'pro',
                feature: 'api_access',
                message: '🔌 *API Access* requires Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• Full API access\n• 1000 calls/day\n• Webhook integrations\n• Custom applications'
            },
            'webhooks': {
                minTier: 'pro',
                feature: 'webhooks',
                message: '🔗 *Webhooks* require Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• 5 webhook endpoints\n• Real-time notifications\n• Integration automation\n• Event triggers'
            },
            'team': {
                minTier: 'pro',
                feature: 'team_collaboration',
                message: '👥 *Team Features* require Pro tier.\n\n🚀 Upgrade to Pro ($19.99/mo) to:\n• Add 3 team members\n• Role management\n• Collaborative editing\n• Team analytics'
            },
            'whitelabel': {
                minTier: 'enterprise',
                feature: 'custom_branding',
                message: '🎨 *White Label* requires Enterprise tier.\n\n💎 Upgrade to Enterprise ($49.99/mo) to:\n• Custom branding\n• Remove Zone News branding\n• Custom domains\n• Full customisation'
            }
        };
        
        // Track usage for rate limiting
        this.usageCache = new Map();
        this.cacheTimeout = 60000; // 1 minute cache
    }

    /**
     * Register tier management commands and middleware
     */
    register(bot) {
        // Commands
        bot.command('usage', this.handleUsageCommand.bind(this));
        bot.command('upgrade', this.handleUpgradeCommand.bind(this));
        bot.command('downgrade', this.handleDowngradeCommand.bind(this));
        bot.command('tiers', this.handleTiersCommand.bind(this));
        bot.command('features', this.handleFeaturesCommand.bind(this));
        bot.command('limits', this.handleLimitsCommand.bind(this));
        
        // Callback handlers
        bot.action(/^tier:/, this.handleTierCallback.bind(this));
        bot.action(/^usage:/, this.handleUsageCallback.bind(this));
        bot.action(/^upgrade:/, this.handleUpgradeCallback.bind(this));
        
        // Apply tier checking middleware globally
        bot.use(this.createMiddleware());
        
        console.log('✅ TierManager registered');
    }

    /**
     * Check if user has access to a command
     */
    async canUseCommand(userId, command) {
        try {
            const userTier = await this.getUserTier(userId);
            const tierConfig = this.tiers[userTier];
            
            // Check if command is in tier's allowed commands
            if (tierConfig.commands.includes('*') || tierConfig.commands.includes(command)) {
                return { allowed: true };
            }
            
            // Check premium command restrictions
            const restriction = this.premiumCommands[command];
            if (restriction) {
                const hasFeature = await this.hasFeature(userId, restriction.feature);
                if (!hasFeature) {
                    return {
                        allowed: false,
                        message: restriction.message,
                        upgradeRequired: restriction.minTier,
                        feature: restriction.feature
                    };
                }
                return { allowed: true };
            }
            
            return { 
                allowed: false, 
                message: `❌ Command /${command} is not available in ${tierConfig.name} tier.\n\nUse /tiers to see available features.` 
            };
            
        } catch (error) {
            console.error('Error checking command access:', error);
            return { allowed: true }; // Allow by default on error
        }
    }

    /**
     * Check if user has a specific feature
     */
    async hasFeature(userId, feature) {
        try {
            const userTier = await this.getUserTier(userId);
            const tierConfig = this.tiers[userTier];
            return tierConfig.features[feature] === true;
        } catch (error) {
            console.error('Error checking feature access:', error);
            return false;
        }
    }

    /**
     * Get user's subscription tier
     */
    async getUserTier(userId) {
        try {
            const subscription = await this.db.collection('subscriptions').findOne({
                user_id: userId,
                status: 'active',
                expires_at: { $gt: new Date() }
            });
            
            return subscription ? subscription.tier : 'free';
        } catch (error) {
            console.error('Error getting user tier:', error);
            return 'free';
        }
    }

    /**
     * Get tier level for comparison
     */
    getTierLevel(tierName) {
        return this.tiers[tierName]?.level || 0;
    }

    /**
     * Check if user has reached their limit for a specific action
     */
    async checkLimit(userId, limitType, value = 1) {
        try {
            const userTier = await this.getUserTier(userId);
            const tierConfig = this.tiers[userTier];
            const limit = tierConfig.limits[limitType];
            
            // -1 means unlimited
            if (limit === -1) {
                return { allowed: true, unlimited: true };
            }
            
            // Check usage based on limit type
            switch (limitType) {
                case 'posts_per_day':
                    return await this.checkDailyLimit(userId, 'post_history', limit);
                
                case 'posts_per_month':
                    return await this.checkMonthlyLimit(userId, 'post_history', limit);
                
                case 'scheduled_posts':
                    return await this.checkActiveLimit(userId, 'scheduled_posts', { status: 'scheduled' }, limit);
                
                case 'media_size_mb':
                    if (value > limit) {
                        return {
                            allowed: false,
                            message: `📁 File too large (${value}MB). ${tierConfig.name} tier supports up to ${limit}MB.\n\n${this.getUpgradeMessage(userTier)}`,
                            current: value,
                            limit: limit
                        };
                    }
                    break;
                
                case 'destinations':
                    return await this.checkActiveLimit(userId, 'user_destinations', {}, limit);
                
                case 'templates':
                    return await this.checkActiveLimit(userId, 'user_templates', {}, limit);
                
                case 'bulk_destinations':
                    if (value > limit) {
                        return {
                            allowed: false,
                            message: `📤 Too many destinations (${value}). ${tierConfig.name} tier supports up to ${limit} destinations.\n\n${this.getUpgradeMessage(userTier)}`,
                            current: value,
                            limit: limit
                        };
                    }
                    break;
                
                case 'api_calls_per_day':
                    return await this.checkDailyLimit(userId, 'api_usage', limit);
                
                case 'webhook_endpoints':
                    return await this.checkActiveLimit(userId, 'webhook_endpoints', {}, limit);
                
                case 'team_members':
                    return await this.checkActiveLimit(userId, 'team_members', {}, limit);
                
                default:
                    console.warn(`Unknown limit type: ${limitType}`);
                    return { allowed: true };
            }
            
            return { allowed: true };
            
        } catch (error) {
            console.error('Error checking limit:', error);
            return { allowed: true };
        }
    }

    /**
     * Check daily usage limit
     */
    async checkDailyLimit(userId, collection, limit) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const count = await this.db.collection(collection).countDocuments({
            user_id: userId,
            created_at: { $gte: today }
        });
        
        if (count >= limit) {
            const userTier = await this.getUserTier(userId);
            return {
                allowed: false,
                message: `📊 Daily limit reached (${count}/${limit}).\n\n${this.getUpgradeMessage(userTier)}`,
                current: count,
                limit: limit
            };
        }
        
        return { allowed: true, current: count, limit: limit };
    }

    /**
     * Check monthly usage limit
     */
    async checkMonthlyLimit(userId, collection, limit) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        
        const count = await this.db.collection(collection).countDocuments({
            user_id: userId,
            created_at: { $gte: startOfMonth }
        });
        
        if (count >= limit) {
            const userTier = await this.getUserTier(userId);
            return {
                allowed: false,
                message: `📊 Monthly limit reached (${count}/${limit}).\n\n${this.getUpgradeMessage(userTier)}`,
                current: count,
                limit: limit
            };
        }
        
        return { allowed: true, current: count, limit: limit };
    }

    /**
     * Check active item limit (like scheduled posts, destinations, etc.)
     */
    async checkActiveLimit(userId, collection, query, limit) {
        const count = await this.db.collection(collection).countDocuments({
            user_id: userId,
            ...query
        });
        
        if (count >= limit) {
            const userTier = await this.getUserTier(userId);
            const tierConfig = this.tiers[userTier];
            
            return {
                allowed: false,
                message: `📊 ${collection.replace('_', ' ')} limit reached (${count}/${limit}) for ${tierConfig.name} tier.\n\n${this.getUpgradeMessage(userTier)}`,
                current: count,
                limit: limit
            };
        }
        
        return { allowed: true, current: count, limit: limit };
    }

    /**
     * Get upgrade message for current tier
     */
    getUpgradeMessage(currentTier) {
        const nextTiers = Object.entries(this.tiers)
            .filter(([key, tier]) => tier.level > this.tiers[currentTier].level)
            .slice(0, 2);
        
        if (nextTiers.length === 0) return 'You have the highest tier available!';
        
        const messages = nextTiers.map(([key, tier]) => 
            `• ${tier.name}: $${(tier.price / 100).toFixed(2)}/mo`
        );
        
        return `Upgrade to increase limits:\n${messages.join('\n')}\n\nUse /upgrade to see all options.`;
    }

    /**
     * Get user's current usage statistics
     */
    async getUserUsage(userId) {
        try {
            const userTier = await this.getUserTier(userId);
            const tierConfig = this.tiers[userTier];
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            
            const usage = {
                tier: tierConfig.name,
                level: tierConfig.level,
                limits: tierConfig.limits,
                features: tierConfig.features,
                current: {
                    posts_today: await this.db.collection('post_history').countDocuments({
                        user_id: userId,
                        created_at: { $gte: today }
                    }),
                    posts_this_month: await this.db.collection('post_history').countDocuments({
                        user_id: userId,
                        created_at: { $gte: startOfMonth }
                    }),
                    scheduled_posts: await this.db.collection('scheduled_posts').countDocuments({
                        user_id: userId,
                        status: 'scheduled'
                    }),
                    destinations: await this.db.collection('user_destinations').countDocuments({
                        user_id: userId
                    }),
                    templates: await this.db.collection('user_templates').countDocuments({
                        user_id: userId
                    }),
                    api_calls_today: await this.db.collection('api_usage').countDocuments({
                        user_id: userId,
                        created_at: { $gte: today }
                    }),
                    webhook_endpoints: await this.db.collection('webhook_endpoints').countDocuments({
                        user_id: userId
                    }),
                    team_members: await this.db.collection('team_members').countDocuments({
                        user_id: userId
                    })
                }
            };
            
            return usage;
            
        } catch (error) {
            console.error('Error getting user usage:', error);
            return null;
        }
    }

    /**
     * Handle /usage command
     */
    async handleUsageCommand(ctx) {
        try {
            const userId = ctx.from.id;
            const usage = await this.getUserUsage(userId);
            
            if (!usage) {
                await ctx.reply('❌ Error retrieving usage information.');
                return;
            }
            
            const formatLimit = (current, limit) => {
                if (limit === -1) return `${current} (Unlimited)`;
                return `${current}/${limit}`;
            };
            
            const getUsageEmoji = (current, limit) => {
                if (limit === -1) return '✅';
                const percentage = (current / limit) * 100;
                if (percentage >= 90) return '🔴';
                if (percentage >= 70) return '🟡';
                return '✅';
            };
            
            let message = `📊 *Usage Report - ${usage.tier} Tier*\n\n`;
            
            // Posts
            message += `📝 *Posts*\n`;
            message += `${getUsageEmoji(usage.current.posts_today, usage.limits.posts_per_day)} Today: ${formatLimit(usage.current.posts_today, usage.limits.posts_per_day)}\n`;
            message += `${getUsageEmoji(usage.current.posts_this_month, usage.limits.posts_per_month)} This month: ${formatLimit(usage.current.posts_this_month, usage.limits.posts_per_month)}\n\n`;
            
            // Scheduled posts
            message += `⏰ *Scheduled Posts*\n`;
            message += `${getUsageEmoji(usage.current.scheduled_posts, usage.limits.scheduled_posts)} Active: ${formatLimit(usage.current.scheduled_posts, usage.limits.scheduled_posts)}\n\n`;
            
            // Destinations
            message += `📍 *Destinations*\n`;
            message += `${getUsageEmoji(usage.current.destinations, usage.limits.destinations)} Connected: ${formatLimit(usage.current.destinations, usage.limits.destinations)}\n\n`;
            
            // Templates
            message += `📝 *Templates*\n`;
            message += `${getUsageEmoji(usage.current.templates, usage.limits.templates)} Saved: ${formatLimit(usage.current.templates, usage.limits.templates)}\n\n`;
            
            // API usage (if applicable)
            if (usage.features.api_access) {
                message += `🔌 *API Usage*\n`;
                message += `${getUsageEmoji(usage.current.api_calls_today, usage.limits.api_calls_per_day)} Today: ${formatLimit(usage.current.api_calls_today, usage.limits.api_calls_per_day)}\n\n`;
            }
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📈 Detailed Report', callback_data: 'usage:detailed' },
                            { text: '📊 Analytics', callback_data: 'usage:analytics' }
                        ],
                        [
                            { text: '💎 Upgrade', callback_data: 'upgrade:options' },
                            { text: '🔄 Refresh', callback_data: 'usage:refresh' }
                        ],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Error in usage command:', error);
            await ctx.reply('❌ Error retrieving usage information.');
        }
    }

    /**
     * Handle /tiers command
     */
    async handleTiersCommand(ctx) {
        try {
            const userId = ctx.from.id;
            const currentTier = await this.getUserTier(userId);
            
            let message = '💎 *Subscription Tiers*\n\n';
            
            for (const [key, tier] of Object.entries(this.tiers)) {
                const isCurrentTier = key === currentTier;
                const emoji = isCurrentTier ? '✅' : (tier.level > this.tiers[currentTier].level ? '⬆️' : '⬇️');
                
                message += `${emoji} *${tier.name}*`;
                if (tier.price > 0) {
                    message += ` - $${(tier.price / 100).toFixed(2)}/month`;
                }
                if (isCurrentTier) {
                    message += ' (Current)';
                }
                message += '\n';
                
                // Key features
                const keyFeatures = [];
                if (tier.limits.posts_per_day === -1) {
                    keyFeatures.push('Unlimited posts');
                } else {
                    keyFeatures.push(`${tier.limits.posts_per_day} posts/day`);
                }
                
                if (tier.features.media_posting) keyFeatures.push('Media posting');
                if (tier.features.scheduled_posting) keyFeatures.push('Scheduling');
                if (tier.features.bulk_posting) keyFeatures.push('Bulk posting');
                if (tier.features.analytics) keyFeatures.push('Analytics');
                if (tier.features.api_access) keyFeatures.push('API access');
                
                message += keyFeatures.slice(0, 3).map(f => `  • ${f}`).join('\n') + '\n\n';
            }
            
            const keyboard = [
                [
                    { text: '📊 Compare Features', callback_data: 'tier:compare' },
                    { text: '💎 Upgrade', callback_data: 'upgrade:options' }
                ]
            ];
            
            if (currentTier !== 'free') {
                keyboard.push([{ text: '📉 Downgrade', callback_data: 'tier:downgrade' }]);
            }
            
            keyboard.push([{ text: '❌ Close', callback_data: 'cancel' }]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error in tiers command:', error);
            await ctx.reply('❌ Error loading tier information.');
        }
    }

    /**
     * Create middleware for tier checking
     */
    createMiddleware() {
        return async (ctx, next) => {
            try {
                // Skip non-command messages
                if (!ctx.message?.text?.startsWith('/')) {
                    return next();
                }
                
                const command = ctx.message.text.split(' ')[0].substring(1).split('@')[0];
                const userId = ctx.from.id;
                
                // Skip tier checking for tier management commands
                const exemptCommands = ['usage', 'tiers', 'upgrade', 'subscribe', 'start', 'help'];
                if (exemptCommands.includes(command)) {
                    return next();
                }
                
                // Check command access
                const access = await this.canUseCommand(userId, command);
                
                if (!access.allowed) {
                    await ctx.reply(
                        access.message + '\n\nUse /subscribe to upgrade your plan.',
                        { 
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '💎 View Plans', callback_data: 'subscribe:plans' }],
                                    [{ text: '📊 Usage Stats', callback_data: 'usage:view' }],
                                    [{ text: '❌ Close', callback_data: 'cancel' }]
                                ]
                            }
                        }
                    );
                    return; // Don't continue to next middleware
                }
                
                // Check rate limits for posting commands
                const postingCommands = ['post', 'quickpost', 'postmedia', 'schedule'];
                if (postingCommands.includes(command)) {
                    const limitCheck = await this.checkLimit(userId, 'posts_per_day');
                    if (!limitCheck.allowed) {
                        await ctx.reply(
                            limitCheck.message,
                            { 
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '💎 Upgrade', callback_data: 'upgrade:options' }],
                                        [{ text: '📊 View Usage', callback_data: 'usage:view' }],
                                        [{ text: '❌ Close', callback_data: 'cancel' }]
                                    ]
                                }
                            }
                        );
                        return;
                    }
                }
                
                return next();
                
            } catch (error) {
                console.error('Error in tier middleware:', error);
                return next(); // Continue on error
            }
        };
    }

    /**
     * Track usage for analytics
     */
    async trackUsage(userId, action, metadata = {}) {
        try {
            await this.db.collection('usage_analytics').insertOne({
                user_id: userId,
                action: action,
                metadata: metadata,
                created_at: new Date()
            });
        } catch (error) {
            console.error('Error tracking usage:', error);
        }
    }

    /**
     * Get tier comparison data
     */
    getTierComparison() {
        const comparison = {
            features: [
                'posts_per_day',
                'scheduled_posts', 
                'media_size_mb',
                'destinations',
                'templates',
                'analytics_days',
                'bulk_destinations',
                'api_calls_per_day'
            ],
            tiers: {}
        };
        
        for (const [key, tier] of Object.entries(this.tiers)) {
            comparison.tiers[key] = {
                name: tier.name,
                price: tier.price,
                limits: tier.limits,
                features: tier.features
            };
        }
        
        return comparison;
    }

    /**
     * Handle tier-related callbacks
     */
    async handleTierCallback(ctx) {
        try {
            const action = ctx.callbackQuery.data.split(':')[1];
            
            switch (action) {
                case 'compare':
                    await this.showFeatureComparison(ctx);
                    break;
                case 'downgrade':
                    await this.showDowngradeOptions(ctx);
                    break;
                default:
                    await ctx.answerCallbackQuery('Unknown action');
            }
        } catch (error) {
            console.error('Error handling tier callback:', error);
            await ctx.answerCallbackQuery('❌ Error processing request');
        }
    }

    /**
     * Show detailed feature comparison
     */
    async showFeatureComparison(ctx) {
        let message = '📊 *Feature Comparison*\n\n';
        
        const features = [
            { key: 'posts_per_day', name: 'Posts per day' },
            { key: 'media_posting', name: 'Media posting' },
            { key: 'scheduled_posting', name: 'Scheduling' },
            { key: 'bulk_posting', name: 'Bulk operations' },
            { key: 'analytics', name: 'Analytics' },
            { key: 'api_access', name: 'API access' },
            { key: 'team_collaboration', name: 'Team features' }
        ];
        
        for (const feature of features) {
            message += `*${feature.name}*\n`;
            
            for (const [tierKey, tier] of Object.entries(this.tiers)) {
                if (feature.key in tier.limits) {
                    const value = tier.limits[feature.key];
                    const displayValue = value === -1 ? 'Unlimited' : value;
                    message += `  ${tier.name}: ${displayValue}\n`;
                } else if (feature.key in tier.features) {
                    const hasFeature = tier.features[feature.key];
                    message += `  ${tier.name}: ${hasFeature ? '✅' : '❌'}\n`;
                }
            }
            message += '\n';
        }
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '« Back to Tiers', callback_data: 'tier:back' }],
                    [{ text: '💎 Upgrade', callback_data: 'upgrade:options' }],
                    [{ text: '❌ Close', callback_data: 'cancel' }]
                ]
            }
        });
    }

    /**
     * Log tier changes for analytics
     */
    async logTierChange(userId, fromTier, toTier, reason = 'manual') {
        try {
            await this.db.collection('tier_changes').insertOne({
                user_id: userId,
                from_tier: fromTier,
                to_tier: toTier,
                reason: reason,
                created_at: new Date()
            });
        } catch (error) {
            console.error('Error logging tier change:', error);
        }
    }
}

module.exports = TierManager;