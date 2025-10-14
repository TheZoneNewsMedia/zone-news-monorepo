/**
 * Subscription Commands Module
 * Handles subscription management for news categories and preferences
 * 
 * @module SubscriptionCommands
 */

const { Markup } = require('telegraf');
const CommandUtils = require('../utils/command-utils');

class SubscriptionCommands {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        
        // Available news categories with descriptions
        this.categories = [
            { id: 'general', name: 'General', description: 'General news and updates', emoji: '📰' },
            { id: 'politics', name: 'Politics', description: 'Government and political news', emoji: '🏛️' },
            { id: 'business', name: 'Business', description: 'Business and economic news', emoji: '💼' },
            { id: 'technology', name: 'Technology', description: 'Tech innovations and updates', emoji: '🔧' },
            { id: 'sports', name: 'Sports', description: 'Local and international sports', emoji: '⚽' },
            { id: 'entertainment', name: 'Entertainment', description: 'Movies, music, and celebrity news', emoji: '🎭' },
            { id: 'health', name: 'Health', description: 'Health and medical news', emoji: '🏥' },
            { id: 'environment', name: 'Environment', description: 'Climate and environmental updates', emoji: '🌱' },
            { id: 'education', name: 'Education', description: 'Education system and university news', emoji: '🎓' },
            { id: 'crime', name: 'Crime', description: 'Public safety and crime reports', emoji: '🚨' },
            { id: 'weather', name: 'Weather', description: 'Weather alerts and forecasts', emoji: '🌤️' },
            { id: 'transport', name: 'Transport', description: 'Public transport and traffic updates', emoji: '🚌' }
        ];
    }

    /**
     * Register all subscription commands with the bot
     */
    register() {
        // Register main subscription commands
        this.bot.command('subscribe', (ctx) => this.subscribe(ctx));
        this.bot.command('unsubscribe', (ctx) => this.unsubscribe(ctx));
        
        // Register callback queries for interactive features
        this.bot.action(/^sub:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action === 'main') {
                return this.subscribe(ctx);
            } else if (action === 'selectall') {
                return this.subscribe(ctx, 'selectall');
            } else if (action === 'clearall') {
                return this.subscribe(ctx, 'clearall');
            } else if (action === 'save') {
                return this.subscribe(ctx, 'save');
            } else if (action === 'reset') {
                return this.subscribe(ctx, 'reset');
            } else if (action.startsWith('toggle:')) {
                const categoryId = action.split(':')[1];
                return this.subscribe(ctx, 'toggle', categoryId);
            }
        });
        
        this.bot.action(/^unsub:(.+)$/, (ctx) => {
            const action = ctx.match[1];
            if (action === 'main') {
                return this.unsubscribe(ctx);
            } else if (action === 'all') {
                return this.unsubscribe(ctx, 'all');
            } else if (action === 'confirm:all') {
                return this.handleUnsubscriptionAction(ctx, 'all');
            } else if (action.startsWith('remove:')) {
                const categoryId = action.split(':')[1];
                return this.unsubscribe(ctx, 'remove', categoryId);
            }
        });
    }

    /**
     * Subscribe Command - Interactive category subscription interface
     */
    async subscribe(ctx, action = null, categoryId = null) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'subscribe', { action, categoryId });

            const userId = ctx.from.id;
            const preferences = await CommandUtils.getUserPreferences(userId, this.db);
            
            if (!action) {
                return this.showSubscriptionInterface(ctx, preferences);
            }

            await this.handleSubscriptionAction(ctx, action, categoryId, preferences);

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Unsubscribe Command - Remove category subscriptions
     */
    async unsubscribe(ctx, action = null, categoryId = null) {
        try {
            await CommandUtils.trackUser(ctx, this.db);
            await CommandUtils.logCommand(ctx, this.db, 'unsubscribe', { action, categoryId });

            const userId = ctx.from.id;
            const preferences = await CommandUtils.getUserPreferences(userId, this.db);

            if (!action) {
                return this.showUnsubscribeInterface(ctx, preferences);
            }

            await this.handleUnsubscriptionAction(ctx, action, categoryId, preferences);

        } catch (error) {
            await CommandUtils.handleError(ctx, error);
        }
    }

    /**
     * Show subscription interface with current selections
     */
    async showSubscriptionInterface(ctx, preferences) {
        const selectedCategories = preferences.categories || ['general'];
        const selectedCount = selectedCategories.length;
        const totalCategories = this.categories.length;

        const categoryList = this.categories
            .map(cat => {
                const isSelected = selectedCategories.includes(cat.id);
                return `${isSelected ? '✅' : '🔘'} ${cat.emoji} ${cat.name}`;
            })
            .join('\n');

        const message = 
            `📂 *News Category Subscriptions*\n\n` +
            `🎯 Selected: ${selectedCount}/${totalCategories} categories\n\n` +
            `${categoryList}\n\n` +
            `Select categories to add or remove from your subscriptions:`;

        const keyboard = this.buildSubscriptionKeyboard(selectedCategories);
        
        // Add quick action buttons
        keyboard.push([
            Markup.button.callback('🎯 Select All', 'sub:selectall'),
            Markup.button.callback('🗑️ Clear All', 'sub:clearall')
        ]);

        // Add management buttons
        keyboard.push([
            Markup.button.callback('✅ Save Changes', 'sub:save'),
            Markup.button.callback('🔄 Reset', 'sub:reset')
        ]);

        keyboard.push([Markup.button.callback('↩️ Back', 'start')]);

        await CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    /**
     * Show unsubscribe interface
     */
    async showUnsubscribeInterface(ctx, preferences) {
        const selectedCategories = preferences.categories || [];

        if (selectedCategories.length === 0) {
            const message = 
                `📭 *No Active Subscriptions*\n\n` +
                `You don't have any category subscriptions to remove.\n\n` +
                `💡 Use /subscribe to add categories you're interested in!`;

            const keyboard = [
                [Markup.button.callback('📂 Subscribe to Categories', 'sub:main')],
                [Markup.button.callback('↩️ Back', 'start')]
            ];

            return CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });
        }

        const subscribedCategories = this.categories
            .filter(cat => selectedCategories.includes(cat.id))
            .map(cat => `✅ ${cat.emoji} ${cat.name}`)
            .join('\n');

        const message = 
            `🗑️ *Unsubscribe from Categories*\n\n` +
            `Currently subscribed to ${selectedCategories.length} categories:\n\n` +
            `${subscribedCategories}\n\n` +
            `Select categories to unsubscribe from:`;

        const keyboard = this.buildUnsubscribeKeyboard(selectedCategories);
        
        keyboard.push([
            Markup.button.callback('🗑️ Unsubscribe All', 'unsub:all'),
            Markup.button.callback('📂 Manage Subscriptions', 'sub:main')
        ]);

        keyboard.push([Markup.button.callback('↩️ Back', 'start')]);

        await CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    /**
     * Handle subscription actions
     */
    async handleSubscriptionAction(ctx, action, categoryId, preferences) {
        const userId = ctx.from.id;
        let selectedCategories = [...(preferences.categories || ['general'])];

        switch (action) {
            case 'toggle':
                if (selectedCategories.includes(categoryId)) {
                    selectedCategories = selectedCategories.filter(id => id !== categoryId);
                } else {
                    selectedCategories.push(categoryId);
                }
                
                // Ensure at least one category remains
                if (selectedCategories.length === 0) {
                    selectedCategories = ['general'];
                }
                break;

            case 'selectall':
                selectedCategories = this.categories.map(cat => cat.id);
                break;

            case 'clearall':
                selectedCategories = ['general']; // Keep general as minimum
                break;

            case 'save':
                await this.saveSubscriptionChanges(ctx, userId, selectedCategories);
                return;

            case 'reset':
                selectedCategories = preferences.categories || ['general'];
                break;

            case 'main':
                return this.showSubscriptionInterface(ctx, preferences);
        }

        // Update preferences temporarily and refresh interface
        preferences.categories = selectedCategories;
        await this.showSubscriptionInterface(ctx, preferences);
    }

    /**
     * Handle unsubscription actions
     */
    async handleUnsubscriptionAction(ctx, action, categoryId, preferences) {
        const userId = ctx.from.id;
        let selectedCategories = [...(preferences.categories || ['general'])];

        switch (action) {
            case 'remove':
                selectedCategories = selectedCategories.filter(id => id !== categoryId);
                
                // Ensure at least general remains
                if (selectedCategories.length === 0) {
                    selectedCategories = ['general'];
                }
                
                await this.saveSubscriptionChanges(ctx, userId, selectedCategories);
                return;

            case 'all':
                await this.confirmUnsubscribeAll(ctx);
                return;

            default:
                return this.showUnsubscribeInterface(ctx, preferences);
        }
    }

    /**
     * Save subscription changes to database
     */
    async saveSubscriptionChanges(ctx, userId, categories) {
        try {
            await CommandUtils.saveUserPreference(userId, 'categories', categories, this.db);
            
            // Track subscription changes
            await CommandUtils.trackAnalytics('subscription_updated', {
                user_id: userId,
                categories: categories,
                category_count: categories.length
            }, this.db);

            const categoryNames = categories
                .map(id => this.categories.find(cat => cat.id === id)?.name || id)
                .join(', ');

            const message = 
                `✅ *Subscription Updated Successfully*\n\n` +
                `🎯 You're now subscribed to:\n` +
                `${categories.map(id => {
                    const cat = this.categories.find(c => c.id === id);
                    return `${cat?.emoji || '📰'} ${cat?.name || id}`;
                }).join('\n')}\n\n` +
                `📬 You'll receive notifications for news in these categories.\n\n` +
                `🔧 Change these preferences anytime with /subscribe`;

            const keyboard = [
                [
                    Markup.button.callback('📰 View Latest News', 'news:latest'),
                    Markup.button.callback('📂 Edit Subscriptions', 'sub:main')
                ],
                [
                    Markup.button.callback('🔔 Notification Settings', 'settings:notifications'),
                    Markup.button.callback('📊 My Stats', 'mystats')
                ],
                [Markup.button.callback('🏠 Main Menu', 'start')]
            ];

            await CommandUtils.editOrReply(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard(keyboard)
            });

        } catch (error) {
            console.error('Error saving subscription changes:', error);
            const message = '❌ Failed to save subscription changes. Please try again.';
            
            const keyboard = [
                [Markup.button.callback('🔄 Try Again', 'sub:save')],
                [Markup.button.callback('↩️ Back', 'sub:main')]
            ];

            await CommandUtils.editOrReply(ctx, message, {
                reply_markup: Markup.inlineKeyboard(keyboard)
            });
        }
    }

    /**
     * Confirm unsubscribe all action
     */
    async confirmUnsubscribeAll(ctx) {
        const message = 
            `⚠️ *Confirm Unsubscribe All*\n\n` +
            `Are you sure you want to unsubscribe from all categories?\n\n` +
            `📝 Note: You'll be automatically subscribed to General news to ensure you still receive important updates.`;

        const keyboard = [
            [
                Markup.button.callback('✅ Yes, Unsubscribe All', 'unsub:confirm:all'),
                Markup.button.callback('❌ Cancel', 'unsub:main')
            ]
        ];

        await CommandUtils.editOrReply(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(keyboard)
        });
    }

    /**
     * Build subscription keyboard with toggle functionality
     */
    buildSubscriptionKeyboard(selectedCategories) {
        const keyboard = [];
        const buttonsPerRow = 2;

        for (let i = 0; i < this.categories.length; i += buttonsPerRow) {
            const row = [];
            
            for (let j = 0; j < buttonsPerRow && i + j < this.categories.length; j++) {
                const category = this.categories[i + j];
                const isSelected = selectedCategories.includes(category.id);
                const emoji = isSelected ? '✅' : '🔘';
                
                row.push(Markup.button.callback(
                    `${emoji} ${category.emoji} ${category.name}`,
                    `sub:toggle:${category.id}`
                ));
            }
            
            keyboard.push(row);
        }

        return keyboard;
    }

    /**
     * Build unsubscribe keyboard
     */
    buildUnsubscribeKeyboard(selectedCategories) {
        const subscribedCategories = this.categories.filter(cat => 
            selectedCategories.includes(cat.id)
        );

        const keyboard = [];
        const buttonsPerRow = 2;

        for (let i = 0; i < subscribedCategories.length; i += buttonsPerRow) {
            const row = [];
            
            for (let j = 0; j < buttonsPerRow && i + j < subscribedCategories.length; j++) {
                const category = subscribedCategories[i + j];
                
                row.push(Markup.button.callback(
                    `🗑️ ${category.name}`,
                    `unsub:remove:${category.id}`
                ));
            }
            
            keyboard.push(row);
        }

        return keyboard;
    }

    /**
     * Get category statistics for user
     */
    async getCategoryStats(userId) {
        try {
            const stats = await this.db.collection('user_article_views').aggregate([
                { $match: { user_id: userId } },
                {
                    $lookup: {
                        from: 'articles',
                        localField: 'article_id',
                        foreignField: '_id',
                        as: 'article'
                    }
                },
                { $unwind: '$article' },
                {
                    $group: {
                        _id: '$article.category',
                        views: { $sum: 1 },
                        last_read: { $max: '$viewed_at' }
                    }
                },
                { $sort: { views: -1 } }
            ]).toArray();

            return stats.map(stat => ({
                category: stat._id || 'general',
                views: stat.views,
                lastRead: stat.last_read
            }));

        } catch (error) {
            console.error('Error getting category stats:', error);
            return [];
        }
    }
}

module.exports = SubscriptionCommands;