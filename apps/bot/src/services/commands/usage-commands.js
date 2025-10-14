/**
 * Usage Commands - Show user's tier, limits, and usage
 */

const TierManager = require('../tier-manager');

class UsageCommands {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.tierManager = new TierManager(db);
    }

    /**
     * Register usage commands
     */
    register() {
        this.bot.command('usage', this.handleUsage.bind(this));
        this.bot.command('limits', this.handleLimits.bind(this));
        this.bot.command('upgrade', this.handleUpgrade.bind(this));
        this.bot.command('plans', this.handlePlans.bind(this));
        
        // Register callback handlers
        this.bot.action(/^usage:/, this.handleUsageCallback.bind(this));
    }

    /**
     * Handle /usage command
     */
    async handleUsage(ctx) {
        try {
            const userId = ctx.from.id;
            const usage = await this.tierManager.getUserUsage(userId);
            
            if (!usage) {
                await ctx.reply('❌ Error retrieving usage data.');
                return;
            }
            
            let message = '📊 *Your Usage*\n\n';
            message += `*Tier:* ${usage.tier}\n\n`;
            
            // Posts
            const postsLimit = usage.limits.posts_per_day;
            const postsUsed = usage.current.posts_today;
            const postsPercent = postsLimit === -1 ? 0 : Math.round((postsUsed / postsLimit) * 100);
            
            message += '*Daily Posts:*\n';
            if (postsLimit === -1) {
                message += `${postsUsed} used (Unlimited)\n`;
            } else {
                message += `${postsUsed} / ${postsLimit} (${postsPercent}%)\n`;
                message += this.getProgressBar(postsPercent) + '\n';
            }
            message += '\n';
            
            // Scheduled Posts
            const scheduledLimit = usage.limits.scheduled_posts;
            const scheduledUsed = usage.current.scheduled_posts;
            
            if (scheduledLimit > 0 || scheduledLimit === -1) {
                const scheduledPercent = scheduledLimit === -1 ? 0 : Math.round((scheduledUsed / scheduledLimit) * 100);
                
                message += '*Scheduled Posts:*\n';
                if (scheduledLimit === -1) {
                    message += `${scheduledUsed} active (Unlimited)\n`;
                } else {
                    message += `${scheduledUsed} / ${scheduledLimit} (${scheduledPercent}%)\n`;
                    message += this.getProgressBar(scheduledPercent) + '\n';
                }
                message += '\n';
            }
            
            // Destinations
            const destLimit = usage.limits.destinations;
            const destUsed = usage.current.destinations;
            const destPercent = destLimit === -1 ? 0 : Math.round((destUsed / destLimit) * 100);
            
            message += '*Destinations:*\n';
            if (destLimit === -1) {
                message += `${destUsed} configured (Unlimited)\n`;
            } else {
                message += `${destUsed} / ${destLimit} (${destPercent}%)\n`;
                message += this.getProgressBar(destPercent) + '\n';
            }
            message += '\n';
            
            // Other limits
            message += '*Other Limits:*\n';
            message += `• Media size: ${usage.limits.media_size_mb}MB\n`;
            if (usage.limits.analytics_days > 0) {
                message += `• Analytics: ${usage.limits.analytics_days} days\n`;
            }
            if (usage.limits.recurring_posts) {
                message += '• ✓ Recurring posts\n';
            }
            if (usage.limits.bulk_posting) {
                message += '• ✓ Bulk posting\n';
            }
            if (usage.limits.api_access) {
                message += '• ✓ API access\n';
            }
            
            // Upgrade prompt if not enterprise
            if (usage.tier !== 'Enterprise') {
                message += '\n💎 Upgrade for more features!';
            }
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔄 Refresh', callback_data: 'usage:refresh' },
                            { text: '📊 Details', callback_data: 'usage:details' }
                        ],
                        usage.tier !== 'Enterprise' ? 
                            [{ text: '💎 Upgrade', callback_data: 'subscribe:menu' }] : [],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ].filter(row => row.length > 0)
                }
            });
            
        } catch (error) {
            console.error('Error in usage command:', error);
            await ctx.reply('❌ Error retrieving usage data.');
        }
    }

    /**
     * Handle /limits command
     */
    async handleLimits(ctx) {
        try {
            const userId = ctx.from.id;
            const userTier = await this.tierManager.getUserTier(userId);
            const tierConfig = this.tierManager.tiers[userTier];
            
            let message = `📋 *Your Limits (${tierConfig.name} Tier)*\n\n`;
            
            // Format limits
            const limits = tierConfig.limits;
            
            message += '*Posting:*\n';
            message += `• Daily posts: ${limits.posts_per_day === -1 ? 'Unlimited' : limits.posts_per_day}\n`;
            message += `• Scheduled posts: ${limits.scheduled_posts === -1 ? 'Unlimited' : limits.scheduled_posts}\n`;
            message += `• Destinations: ${limits.destinations === -1 ? 'Unlimited' : limits.destinations}\n`;
            message += '\n';
            
            message += '*Media:*\n';
            message += `• Max file size: ${limits.media_size_mb}MB\n`;
            message += '\n';
            
            message += '*Features:*\n';
            message += `• Analytics: ${limits.analytics_days ? limits.analytics_days + ' days' : '❌'}\n`;
            message += `• Recurring posts: ${limits.recurring_posts ? '✅' : '❌'}\n`;
            message += `• Bulk posting: ${limits.bulk_posting ? '✅' : '❌'}\n`;
            message += `• API access: ${limits.api_access ? '✅' : '❌'}\n`;
            message += `• White label: ${limits.white_label ? '✅' : '❌'}\n`;
            message += `• Priority support: ${limits.priority_support ? '✅' : '❌'}\n`;
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📊 View Usage', callback_data: 'usage:view' }],
                        userTier !== 'enterprise' ? 
                            [{ text: '💎 Upgrade', callback_data: 'subscribe:menu' }] : [],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ].filter(row => row.length > 0)
                }
            });
            
        } catch (error) {
            console.error('Error in limits command:', error);
            await ctx.reply('❌ Error retrieving limits.');
        }
    }

    /**
     * Handle /upgrade command
     */
    async handleUpgrade(ctx) {
        try {
            const userId = ctx.from.id;
            const currentTier = await this.tierManager.getUserTier(userId);
            
            let message = '💎 *Upgrade Your Plan*\n\n';
            message += `Current tier: *${this.tierManager.tiers[currentTier].name}*\n\n`;
            
            // Show upgrade options based on current tier
            const tierLevels = ['free', 'basic', 'pro', 'enterprise'];
            const currentLevel = tierLevels.indexOf(currentTier);
            
            const keyboard = [];
            
            for (let i = currentLevel + 1; i < tierLevels.length; i++) {
                const tierKey = tierLevels[i];
                const tier = this.tierManager.tiers[tierKey];
                
                keyboard.push([{
                    text: `${tier.name} - $${(tier.price / 100).toFixed(2)}/mo`,
                    callback_data: `subscribe:${tierKey}`
                }]);
            }
            
            if (keyboard.length === 0) {
                message += 'You have the highest tier! 🎉\n\n';
                message += 'Enjoy unlimited access to all features.';
                
                await ctx.reply(message, { parse_mode: 'Markdown' });
                return;
            }
            
            message += 'Select your upgrade:';
            
            keyboard.push([{ text: '📊 Compare All Plans', callback_data: 'subscribe:compare' }]);
            keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel' }]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error in upgrade command:', error);
            await ctx.reply('❌ Error loading upgrade options.');
        }
    }

    /**
     * Handle /plans command
     */
    async handlePlans(ctx) {
        try {
            const comparison = this.tierManager.getTierComparison();
            
            await ctx.reply(comparison, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💎 Subscribe', callback_data: 'subscribe:menu' }],
                        [{ text: '📊 Check Your Usage', callback_data: 'usage:view' }],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Error in plans command:', error);
            await ctx.reply('❌ Error loading plans.');
        }
    }

    /**
     * Handle usage callbacks
     */
    async handleUsageCallback(ctx) {
        try {
            const action = ctx.callbackQuery.data.split(':')[1];
            
            switch (action) {
                case 'refresh':
                case 'view':
                    await ctx.answerCallbackQuery('Refreshing...');
                    await this.handleUsage(ctx);
                    break;
                    
                case 'details':
                    await ctx.answerCallbackQuery();
                    await this.showDetailedUsage(ctx);
                    break;
                    
                default:
                    await ctx.answerCallbackQuery('Unknown action');
            }
            
        } catch (error) {
            console.error('Error handling usage callback:', error);
            await ctx.answerCallbackQuery('❌ Error');
        }
    }

    /**
     * Show detailed usage statistics
     */
    async showDetailedUsage(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Get this month's stats
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            
            const stats = {
                totalPosts: await this.db.collection('post_history').countDocuments({
                    user_id: userId,
                    created_at: { $gte: monthStart }
                }),
                totalScheduled: await this.db.collection('scheduled_posts').countDocuments({
                    user_id: userId,
                    created_at: { $gte: monthStart }
                }),
                totalMedia: await this.db.collection('user_media').countDocuments({
                    user_id: userId,
                    created_at: { $gte: monthStart }
                })
            };
            
            let message = '📈 *Detailed Usage (This Month)*\n\n';
            message += `*Total Posts:* ${stats.totalPosts}\n`;
            message += `*Scheduled:* ${stats.totalScheduled}\n`;
            message += `*Media Uploaded:* ${stats.totalMedia}\n\n`;
            
            // Get daily breakdown for last 7 days
            message += '*Last 7 Days:*\n';
            
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                date.setHours(0, 0, 0, 0);
                
                const nextDate = new Date(date);
                nextDate.setDate(nextDate.getDate() + 1);
                
                const dayPosts = await this.db.collection('post_history').countDocuments({
                    user_id: userId,
                    created_at: {
                        $gte: date,
                        $lt: nextDate
                    }
                });
                
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                message += `${dayName}: ${dayPosts} posts\n`;
            }
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '« Back', callback_data: 'usage:view' }],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Error showing detailed usage:', error);
            await ctx.reply('❌ Error loading detailed usage.');
        }
    }

    /**
     * Generate progress bar
     */
    getProgressBar(percent) {
        const filled = Math.round(percent / 10);
        const empty = 10 - filled;
        
        let bar = '';
        for (let i = 0; i < filled; i++) {
            bar += '▓';
        }
        for (let i = 0; i < empty; i++) {
            bar += '░';
        }
        
        return bar;
    }
}

module.exports = UsageCommands;