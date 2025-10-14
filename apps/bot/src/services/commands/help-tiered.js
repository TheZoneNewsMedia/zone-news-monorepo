/**
 * Tiered Help Command - Shows commands based on user's subscription tier
 */

const TierManager = require('../tier-manager');

class TieredHelp {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.tierManager = new TierManager(db);
    }

    /**
     * Register help command
     */
    register() {
        this.bot.command('help', this.handleHelp.bind(this));
        this.bot.command('commands', this.handleCommands.bind(this));
    }

    /**
     * Handle /help command
     */
    async handleHelp(ctx) {
        try {
            const userId = ctx.from.id;
            const userTier = await this.tierManager.getUserTier(userId);
            const tierConfig = this.tierManager.tiers[userTier];
            
            let message = '📚 *Zone News Bot Help*\n\n';
            message += `Your tier: *${tierConfig.name}*\n\n`;
            
            // Group commands by category
            const categories = {
                '🚀 Basic': ['start', 'help', 'news', 'subscribe'],
                '📤 Posting': ['post', 'postmedia', 'quickpost', 'posttext'],
                '📱 Destinations': ['mydestinations', 'posttogroup', 'posttochannel', 'checkbot'],
                '⏰ Scheduling': ['schedule', 'scheduled', 'cancelschedule'],
                '💰 Monetization': ['affiliate', 'earnings', 'withdraw'],
                '📊 Analytics': ['usage', 'limits', 'analytics', 'trending'],
                '⚙️ Settings': ['upgrade', 'plans', 'subscription']
            };
            
            // Filter commands based on tier
            const availableCommands = tierConfig.commands.includes('*') ? 
                this.getAllCommands() : tierConfig.commands;
            
            for (const [category, commands] of Object.entries(categories)) {
                const available = commands.filter(cmd => availableCommands.includes(cmd));
                
                if (available.length > 0) {
                    message += `*${category}*\n`;
                    for (const cmd of available) {
                        message += `• /${cmd} - ${this.getCommandDescription(cmd)}\n`;
                    }
                    message += '\n';
                }
            }
            
            // Show locked features for free/basic users
            if (userTier === 'free' || userTier === 'basic') {
                message += '*🔒 Premium Features*\n';
                
                if (userTier === 'free') {
                    message += '• Media posting (Basic+)\n';
                    message += '• Scheduled posts (Basic+)\n';
                    message += '• Multiple destinations (Basic+)\n';
                }
                
                if (userTier === 'free' || userTier === 'basic') {
                    message += '• Advanced analytics (Pro+)\n';
                    message += '• Bulk posting (Pro+)\n';
                    message += '• Recurring posts (Pro+)\n';
                    message += '• API access (Enterprise)\n';
                }
                
                message += '\n💎 Upgrade to unlock more features!';
            }
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📊 Your Usage', callback_data: 'usage:view' },
                            { text: '📋 Your Limits', callback_data: 'limits:view' }
                        ],
                        userTier !== 'enterprise' ? 
                            [{ text: '💎 Upgrade', callback_data: 'subscribe:menu' }] : [],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ].filter(row => row.length > 0)
                }
            });
            
        } catch (error) {
            console.error('Error in help command:', error);
            await ctx.reply('❌ Error loading help.');
        }
    }

    /**
     * Handle /commands command - Show all commands with tier requirements
     */
    async handleCommands(ctx) {
        try {
            const userId = ctx.from.id;
            const userTier = await this.tierManager.getUserTier(userId);
            
            let message = '📋 *All Commands*\n\n';
            
            const allCommands = {
                'Free': {
                    commands: ['start', 'help', 'news', 'subscribe', 'affiliate', 'post', 'mydestinations'],
                    emoji: '🆓'
                },
                'Basic ($9.99/mo)': {
                    commands: ['postmedia', 'schedule', 'scheduled', 'quickpost', 'earnings'],
                    emoji: '⭐'
                },
                'Pro ($19.99/mo)': {
                    commands: ['posttogroup', 'posttochannel', 'cancelschedule', 'checkbot', 'analytics', 'trending', 'withdraw', 'clearmedia', 'posttext'],
                    emoji: '💎'
                },
                'Enterprise ($49.99/mo)': {
                    commands: ['api', 'team', 'export', 'whitelabel', 'priority'],
                    emoji: '👑'
                }
            };
            
            for (const [tier, data] of Object.entries(allCommands)) {
                message += `*${data.emoji} ${tier}*\n`;
                
                for (const cmd of data.commands) {
                    const canUse = await this.tierManager.canUseCommand(userId, cmd);
                    const icon = canUse.allowed ? '✅' : '🔒';
                    message += `${icon} /${cmd}\n`;
                }
                message += '\n';
            }
            
            message += '_✅ = Available to you_\n';
            message += '_🔒 = Requires upgrade_';
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📊 Compare Plans', callback_data: 'subscribe:compare' }],
                        userTier !== 'enterprise' ? 
                            [{ text: '💎 Upgrade Now', callback_data: 'subscribe:menu' }] : [],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ].filter(row => row.length > 0)
                }
            });
            
        } catch (error) {
            console.error('Error in commands command:', error);
            await ctx.reply('❌ Error loading commands.');
        }
    }

    /**
     * Get all available commands
     */
    getAllCommands() {
        return [
            'start', 'help', 'news', 'subscribe', 'affiliate',
            'post', 'postmedia', 'quickpost', 'posttext', 'clearmedia',
            'mydestinations', 'posttogroup', 'posttochannel', 'checkbot',
            'schedule', 'scheduled', 'cancelschedule',
            'earnings', 'withdraw',
            'usage', 'limits', 'analytics', 'trending',
            'upgrade', 'plans', 'subscription', 'commands'
        ];
    }

    /**
     * Get command description
     */
    getCommandDescription(command) {
        const descriptions = {
            'start': 'Welcome message',
            'help': 'Show this help',
            'news': 'Latest news',
            'subscribe': 'Premium plans',
            'affiliate': 'Earn commissions',
            'post': 'Create a post',
            'postmedia': 'Post with media',
            'quickpost': 'Quick posting',
            'posttext': 'Set post text',
            'clearmedia': 'Clear saved media',
            'mydestinations': 'View destinations',
            'posttogroup': 'Post to groups',
            'posttochannel': 'Post to channels',
            'checkbot': 'Check bot status',
            'schedule': 'Schedule posts',
            'scheduled': 'View scheduled',
            'cancelschedule': 'Cancel scheduled',
            'earnings': 'View earnings',
            'withdraw': 'Withdraw funds',
            'usage': 'Your usage stats',
            'limits': 'Your limits',
            'analytics': 'Analytics dashboard',
            'trending': 'Trending content',
            'upgrade': 'Upgrade tier',
            'plans': 'View all plans',
            'subscription': 'Manage subscription',
            'commands': 'All commands list'
        };
        
        return descriptions[command] || 'Command help';
    }
}

module.exports = TieredHelp;