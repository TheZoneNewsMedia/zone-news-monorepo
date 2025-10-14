const CommandUtils = require('../utils/command-utils');

class SettingsCallbacks {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.processingUsers = new Set();
    }

    /**
     * Register all settings-related callback handlers with specific actions
     */
    register() {
        // Notification settings actions
        this.bot.action('settings:notifications:toggle', this.handleNotificationSettings.bind(this));
        this.bot.action('settings:notifications:daily', this.handleNotificationSettings.bind(this));
        this.bot.action('settings:notifications:instant', this.handleNotificationSettings.bind(this));
        this.bot.action('settings:notifications:disabled', this.handleNotificationSettings.bind(this));
        
        // Language settings actions
        this.bot.action(/^settings:language:.+$/, this.handleLanguageSettings.bind(this));
        
        // Timezone settings actions
        this.bot.action(/^settings:timezone:.+$/, this.handleTimezoneSettings.bind(this));
        
        // Category settings actions
        this.bot.action(/^settings:categories:toggle:.+$/, this.handleCategorySettings.bind(this));
        this.bot.action('settings:categories:all', this.handleCategorySettings.bind(this));
        this.bot.action('settings:categories:none', this.handleCategorySettings.bind(this));
        
        // Preference actions
        this.bot.action('pref:save', this.handlePreferenceActions.bind(this));
        this.bot.action('pref:reset', this.handlePreferenceActions.bind(this));
    }

    /**
     * Handle notification settings callbacks
     */
    async handleNotificationSettings(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('settings:notifications:')) return;

        if (this.processingUsers.has(from.id)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '⏳ Processing...',
                show_alert: false
            });
            return;
        }

        try {
            this.processingUsers.add(from.id);
            const setting = data.split(':')[2];

            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'settings:notifications', { setting });
            
            switch (setting) {
                case 'toggle':
                    await this.toggleNotifications(callbackQuery);
                    break;
                case 'daily':
                    await this.setNotificationFrequency(callbackQuery, 'daily');
                    break;
                case 'instant':
                    await this.setNotificationFrequency(callbackQuery, 'instant');
                    break;
                case 'disabled':
                    await this.setNotificationFrequency(callbackQuery, 'disabled');
                    break;
                default:
                    throw new Error(`Unknown notification setting: ${setting}`);
            }

        } catch (error) {
            console.error('Notification settings error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to update notifications',
                show_alert: true
            });
        } finally {
            this.processingUsers.delete(from.id);
        }
    }

    /**
     * Handle language settings callbacks
     */
    async handleLanguageSettings(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('settings:language:')) return;

        try {
            const language = data.split(':')[2];
            const userId = from.id;

            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'settings:language', { language });

            const success = await CommandUtils.saveUserPreference(userId, 'language', language, this.db);

            if (success) {
                const languageNames = {
                    'en': 'English',
                    'es': 'Español',
                    'fr': 'Français',
                    'de': 'Deutsch',
                    'it': 'Italiano',
                    'pt': 'Português'
                };

                const languageName = languageNames[language] || language;
                
                await this.refreshSettingsMenu(callbackQuery);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: `🌐 Language set to ${languageName}`,
                    show_alert: false
                });
            } else {
                throw new Error('Failed to save language preference');
            }

        } catch (error) {
            console.error('Language settings error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to change language',
                show_alert: true
            });
        }
    }

    /**
     * Handle timezone settings callbacks
     */
    async handleTimezoneSettings(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('settings:timezone:')) return;

        try {
            const timezone = data.split(':').slice(2).join(':'); // Handle timezone names with colons
            const userId = from.id;

            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'settings:timezone', { timezone });

            const success = await CommandUtils.saveUserPreference(userId, 'timezone', timezone, this.db);

            if (success) {
                const timezoneNames = {
                    'Australia/Adelaide': 'Adelaide (ACST/ACDT)',
                    'Australia/Sydney': 'Sydney (AEST/AEDT)',
                    'Australia/Melbourne': 'Melbourne (AEST/AEDT)',
                    'Australia/Perth': 'Perth (AWST)',
                    'Australia/Brisbane': 'Brisbane (AEST)',
                    'Australia/Darwin': 'Darwin (ACST)',
                    'Pacific/Auckland': 'Auckland (NZST/NZDT)',
                    'UTC': 'UTC',
                    'America/New_York': 'New York (EST/EDT)',
                    'Europe/London': 'London (GMT/BST)'
                };

                const timezoneName = timezoneNames[timezone] || timezone;
                
                await this.refreshSettingsMenu(callbackQuery);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: `🕐 Timezone set to ${timezoneName}`,
                    show_alert: false
                });
            } else {
                throw new Error('Failed to save timezone preference');
            }

        } catch (error) {
            console.error('Timezone settings error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to change timezone',
                show_alert: true
            });
        }
    }

    /**
     * Handle category settings callbacks
     */
    async handleCategorySettings(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('settings:categories:')) return;

        try {
            const [, , action, categoryId] = data.split(':');
            const userId = from.id;

            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'settings:categories', { action, categoryId });

            switch (action) {
                case 'toggle':
                    await this.toggleCategorySubscription(callbackQuery, categoryId);
                    break;
                case 'all':
                    await this.subscribeToAllCategories(callbackQuery);
                    break;
                case 'none':
                    await this.unsubscribeFromAllCategories(callbackQuery);
                    break;
                default:
                    throw new Error(`Unknown category action: ${action}`);
            }

        } catch (error) {
            console.error('Category settings error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Failed to update categories',
                show_alert: true
            });
        }
    }

    /**
     * Handle preference action callbacks (save/reset)
     */
    async handlePreferenceActions(ctx) {
        const callbackQuery = ctx.callbackQuery;
        const { data, from } = callbackQuery;
        
        if (!data?.startsWith('pref:')) return;

        try {
            const action = data.split(':')[1];
            
            await CommandUtils.logCommand({ from, callbackQuery }, this.db, 'preferences', { action });

            switch (action) {
                case 'save':
                    await this.saveAllPreferences(callbackQuery);
                    break;
                case 'reset':
                    await this.resetAllPreferences(callbackQuery);
                    break;
                default:
                    throw new Error(`Unknown preference action: ${action}`);
            }

        } catch (error) {
            console.error('Preference action error:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Action failed',
                show_alert: true
            });
        }
    }

    /**
     * Toggle notification settings
     */
    async toggleNotifications(callbackQuery) {
        const userId = callbackQuery.from.id;
        const userPrefs = await CommandUtils.getUserPreferences(userId, this.db);
        
        const newStatus = !userPrefs.notifications;
        
        const success = await CommandUtils.saveUserPreference(userId, 'notifications', newStatus, this.db);
        
        if (success) {
            await this.refreshSettingsMenu(callbackQuery);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: newStatus ? '🔔 Notifications enabled' : '🔕 Notifications disabled',
                show_alert: false
            });
        } else {
            throw new Error('Failed to toggle notifications');
        }
    }

    /**
     * Set notification frequency
     */
    async setNotificationFrequency(callbackQuery, frequency) {
        const userId = callbackQuery.from.id;
        
        const success = await CommandUtils.saveUserPreference(
            userId, 
            'notification_frequency', 
            frequency, 
            this.db
        );
        
        if (success) {
            await this.refreshSettingsMenu(callbackQuery);
            
            const frequencyText = {
                'instant': 'Instant notifications',
                'daily': 'Daily digest',
                'disabled': 'Notifications disabled'
            };
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: `📅 ${frequencyText[frequency]}`,
                show_alert: false
            });
        } else {
            throw new Error('Failed to set notification frequency');
        }
    }

    /**
     * Toggle category subscription
     */
    async toggleCategorySubscription(callbackQuery, categoryId) {
        const userId = callbackQuery.from.id;
        const userPrefs = await CommandUtils.getUserPreferences(userId, this.db);
        
        let categories = userPrefs.categories || [];
        
        if (categories.includes(categoryId)) {
            categories = categories.filter(cat => cat !== categoryId);
        } else {
            categories.push(categoryId);
        }

        const success = await CommandUtils.saveUserPreference(userId, 'categories', categories, this.db);
        
        if (success) {
            await this.refreshSettingsMenu(callbackQuery);
            
            const action = categories.includes(categoryId) ? 'subscribed to' : 'unsubscribed from';
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: `📂 ${action} ${categoryId}`,
                show_alert: false
            });
        } else {
            throw new Error('Failed to update category subscription');
        }
    }

    /**
     * Subscribe to all categories
     */
    async subscribeToAllCategories(callbackQuery) {
        const userId = callbackQuery.from.id;
        const allCategories = ['general', 'politics', 'sports', 'technology', 'business', 'entertainment', 'health'];
        
        const success = await CommandUtils.saveUserPreference(userId, 'categories', allCategories, this.db);
        
        if (success) {
            await this.refreshSettingsMenu(callbackQuery);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '✅ Subscribed to all categories',
                show_alert: false
            });
        } else {
            throw new Error('Failed to subscribe to all categories');
        }
    }

    /**
     * Unsubscribe from all categories
     */
    async unsubscribeFromAllCategories(callbackQuery) {
        const userId = callbackQuery.from.id;
        
        const success = await CommandUtils.saveUserPreference(userId, 'categories', [], this.db);
        
        if (success) {
            await this.refreshSettingsMenu(callbackQuery);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Unsubscribed from all categories',
                show_alert: false
            });
        } else {
            throw new Error('Failed to unsubscribe from all categories');
        }
    }

    /**
     * Save all current preferences
     */
    async saveAllPreferences(callbackQuery) {
        const userId = callbackQuery.from.id;
        
        // Log save action
        await CommandUtils.trackAnalytics('preferences_saved', { userId }, this.db);
        
        await this.bot.answerCallbackQuery(callbackQuery.id, {
            text: '✅ All preferences saved successfully',
            show_alert: false
        });
    }

    /**
     * Reset all preferences to defaults
     */
    async resetAllPreferences(callbackQuery) {
        const userId = callbackQuery.from.id;
        
        const defaultPrefs = {
            notifications: true,
            language: 'en',
            timezone: 'Australia/Adelaide',
            notification_frequency: 'daily'
        };
        
        const defaultCategories = ['general'];

        try {
            await this.db.collection('users').updateOne(
                { user_id: userId },
                { 
                    $set: { 
                        preferences: defaultPrefs,
                        categories: defaultCategories,
                        updated_at: new Date()
                    }
                }
            );

            await CommandUtils.trackAnalytics('preferences_reset', { userId }, this.db);
            
            await this.refreshSettingsMenu(callbackQuery);
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: '🔄 All preferences reset to defaults',
                show_alert: false
            });

        } catch (error) {
            throw new Error('Failed to reset preferences');
        }
    }

    /**
     * Refresh the settings menu to show updated values
     */
    async refreshSettingsMenu(callbackQuery) {
        try {
            const userId = callbackQuery.from.id;
            const userPrefs = await CommandUtils.getUserPreferences(userId, this.db);
            
            const settingsText = this.buildSettingsText(userPrefs);
            const keyboard = this.buildSettingsKeyboard(userPrefs);

            await this.bot.editMessageText(settingsText, {
                chat_id: callbackQuery.message.chat.id,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            console.error('Failed to refresh settings menu:', {
                userId: userId,
                chatId: callbackQuery.message?.chat?.id,
                messageId: callbackQuery.message?.message_id,
                error: error.message
            });
        }
    }

    /**
     * Build settings display text
     */
    buildSettingsText(userPrefs) {
        const notificationStatus = userPrefs.notifications ? '🔔 Enabled' : '🔕 Disabled';
        const languageNames = { 'en': 'English', 'es': 'Español', 'fr': 'Français' };
        const languageName = languageNames[userPrefs.language] || userPrefs.language;
        
        return `⚙️ <b>Your Settings</b>\n\n` +
               `🔔 <b>Notifications:</b> ${notificationStatus}\n` +
               `🌐 <b>Language:</b> ${languageName}\n` +
               `🕐 <b>Timezone:</b> ${userPrefs.timezone}\n` +
               `📂 <b>Categories:</b> ${userPrefs.categories?.length || 0} selected\n\n` +
               `Use the buttons below to modify your preferences.`;
    }

    /**
     * Build settings keyboard
     */
    buildSettingsKeyboard(userPrefs) {
        return [
            [
                { text: userPrefs.notifications ? '🔕 Disable Notifications' : '🔔 Enable Notifications', 
                  callback_data: 'settings:notifications:toggle' }
            ],
            [
                { text: '🌐 Language', callback_data: 'settings:language:menu' },
                { text: '🕐 Timezone', callback_data: 'settings:timezone:menu' }
            ],
            [
                { text: '📂 Categories', callback_data: 'settings:categories:menu' }
            ],
            [
                { text: '💾 Save All', callback_data: 'pref:save' },
                { text: '🔄 Reset All', callback_data: 'pref:reset' }
            ],
            [
                { text: '↩️ Back', callback_data: 'main_menu' }
            ]
        ];
    }
}

module.exports = SettingsCallbacks;