/**
 * Command Utilities Module
 * Provides shared utilities for all command modules in the Telegram Bot
 * 
 * @module CommandUtils
 */

const { Markup } = require('telegraf');

class CommandUtils {
    /**
     * User Tracking Functions
     */

    /**
     * Track user activity and update profile information
     * @param {Object} ctx - Telegraf context object
     * @param {Object} db - MongoDB database connection
     * @returns {Promise<Object|null>} Updated user document or null if failed
     */
    static async trackUser(ctx, db) {
        try {
            const userId = ctx.from.id;
            const userUpdate = {
                user_id: userId,
                username: ctx.from.username || null,
                first_name: ctx.from.first_name || null,
                last_name: ctx.from.last_name || null,
                is_bot: ctx.from.is_bot || false,
                last_active: new Date(),
                chat_id: ctx.chat?.id || null,
                chat_type: ctx.chat?.type || null,
                updated_at: new Date()
            };

            const user = await db.collection('users').findOneAndUpdate(
                { user_id: userId },
                { 
                    $set: userUpdate,
                    $setOnInsert: {
                        created_at: new Date(),
                        city: 'Adelaide',
                        categories: ['general'],
                        preferences: {
                            notifications: true,
                            language: 'en',
                            timezone: 'Australia/Adelaide'
                        }
                    }
                },
                { upsert: true, returnDocument: 'after' }
            );

            return user;
        } catch (error) {
            console.error('Error tracking user:', error);
            // Continue even if tracking fails
            return null;
        }
    }

    /**
     * Get user preferences from database
     * @param {number} userId - Telegram user ID
     * @param {Object} db - MongoDB database connection
     * @returns {Promise<Object>} User preferences object
     */
    static async getUserPreferences(userId, db) {
        try {
            const user = await db.collection('users').findOne({ user_id: userId });
            
            if (!user) {
                // Return default preferences
                return {
                    city: 'Adelaide',
                    categories: ['general'],
                    notifications: true,
                    language: 'en',
                    timezone: 'Australia/Adelaide'
                };
            }

            return {
                city: user.city || 'Adelaide',
                categories: user.categories || ['general'],
                notifications: user.preferences?.notifications !== false,
                language: user.preferences?.language || 'en',
                timezone: user.preferences?.timezone || 'Australia/Adelaide',
                ...user.preferences
            };
        } catch (error) {
            console.error('Error getting user preferences:', error);
            return {
                city: 'Adelaide',
                categories: ['general'],
                notifications: true,
                language: 'en',
                timezone: 'Australia/Adelaide'
            };
        }
    }

    /**
     * Save user preference to database
     * @param {number} userId - Telegram user ID
     * @param {string} key - Preference key
     * @param {*} value - Preference value
     * @param {Object} db - MongoDB database connection
     * @returns {Promise<boolean>} Success status
     */
    static async saveUserPreference(userId, key, value, db) {
        try {
            const updateField = key.includes('.') ? key : `preferences.${key}`;
            
            await db.collection('users').updateOne(
                { user_id: userId },
                { 
                    $set: { 
                        [updateField]: value,
                        updated_at: new Date()
                    }
                },
                { upsert: true }
            );

            return true;
        } catch (error) {
            console.error('Error saving user preference:', error);
            return false;
        }
    }

    /**
     * Command Logging Functions
     */

    /**
     * Log command usage to database for analytics
     * @param {Object} ctx - Telegraf context object
     * @param {Object} db - MongoDB database connection
     * @param {string} command - Command name
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<boolean>} Success status
     */
    static async logCommand(ctx, db, command, metadata = {}) {
        try {
            const logEntry = {
                user_id: ctx.from.id,
                username: ctx.from.username,
                command,
                chat_id: ctx.chat?.id,
                chat_type: ctx.chat?.type,
                timestamp: new Date(),
                metadata,
                message_id: ctx.message?.message_id,
                callback_query: ctx.callbackQuery ? {
                    data: ctx.callbackQuery.data,
                    message_id: ctx.callbackQuery.message?.message_id
                } : null
            };

            await db.collection('command_usage').insertOne(logEntry);
            return true;
        } catch (error) {
            console.error('Error logging command:', error);
            return false;
        }
    }

    /**
     * Track analytics events
     * @param {string} event - Event name
     * @param {Object} data - Event data
     * @param {Object} db - MongoDB database connection
     * @returns {Promise<boolean>} Success status
     */
    static async trackAnalytics(event, data, db) {
        try {
            const analyticsEntry = {
                event,
                data,
                timestamp: new Date(),
                date_key: new Date().toISOString().split('T')[0] // For daily aggregation
            };

            await db.collection('analytics').insertOne(analyticsEntry);
            return true;
        } catch (error) {
            console.error('Error tracking analytics:', error);
            return false;
        }
    }

    /**
     * Error Handling Functions
     */

    /**
     * Handle errors with user-friendly messages
     * @param {Object} ctx - Telegraf context object
     * @param {Error} error - Error object
     * @param {boolean} userFriendly - Whether to show user-friendly message
     * @returns {Promise<void>}
     */
    static async handleError(ctx, error, userFriendly = true) {
        try {
            console.error('Command error:', {
                userId: ctx.from?.id,
                command: ctx.message?.text || ctx.callbackQuery?.data,
                error: error.message,
                stack: error.stack
            });

            if (userFriendly) {
                const message = '⚠️ Something went wrong. Please try again or contact support if the problem persists.';
                await this.sendErrorMessage(ctx, message);
            }
        } catch (sendError) {
            console.error('Error sending error message:', sendError);
        }
    }

    /**
     * Send error message to user
     * @param {Object} ctx - Telegraf context object
     * @param {string} message - Error message
     * @returns {Promise<void>}
     */
    static async sendErrorMessage(ctx, message) {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(message, { show_alert: true });
            } else {
                await ctx.reply(message);
            }
        } catch (error) {
            console.error('Error sending error message:', error);
        }
    }

    /**
     * Pagination Helper Functions
     */

    /**
     * Build pagination keyboard
     * @param {number} currentPage - Current page number
     * @param {number} totalPages - Total number of pages
     * @param {string} prefix - Callback data prefix
     * @returns {Array} Keyboard markup array
     */
    static buildPagination(currentPage, totalPages, prefix) {
        const buttons = [];
        const row = [];

        // Previous button
        if (currentPage > 1) {
            row.push(Markup.button.callback('⬅️ Previous', `${prefix}:${currentPage - 1}`));
        }

        // Page indicator
        row.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));

        // Next button
        if (currentPage < totalPages) {
            row.push(Markup.button.callback('Next ➡️', `${prefix}:${currentPage + 1}`));
        }

        if (row.length > 0) {
            buttons.push(row);
        }

        // Jump buttons for long lists
        if (totalPages > 5) {
            const jumpRow = [];
            
            if (currentPage > 2) {
                jumpRow.push(Markup.button.callback('⏮ First', `${prefix}:1`));
            }
            
            if (currentPage < totalPages - 1) {
                jumpRow.push(Markup.button.callback('Last ⏭', `${prefix}:${totalPages}`));
            }
            
            if (jumpRow.length > 0) {
                buttons.push(jumpRow);
            }
        }

        return buttons;
    }

    /**
     * Get pagination data for database queries
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @param {number} totalItems - Total number of items
     * @returns {Object} Pagination data object
     */
    static getPaginationData(page, limit, totalItems) {
        const totalPages = Math.ceil(totalItems / limit);
        const skip = (page - 1) * limit;

        return {
            skip,
            limit,
            page,
            totalPages,
            totalItems,
            hasNext: page < totalPages,
            hasPrev: page > 1,
            startItem: skip + 1,
            endItem: Math.min(skip + limit, totalItems)
        };
    }

    /**
     * Keyboard Builder Functions
     */

    /**
     * Build category selection keyboard
     * @param {Array} categories - Array of category objects
     * @param {Array} selected - Array of selected category IDs
     * @returns {Array} Keyboard markup array
     */
    static buildCategoryKeyboard(categories, selected = []) {
        const keyboard = [];
        const buttonsPerRow = 2;

        for (let i = 0; i < categories.length; i += buttonsPerRow) {
            const row = [];
            
            for (let j = 0; j < buttonsPerRow && i + j < categories.length; j++) {
                const category = categories[i + j];
                const isSelected = selected.includes(category.id || category.name);
                const emoji = isSelected ? '✅' : '🔘';
                
                row.push(Markup.button.callback(
                    `${emoji} ${category.name}`,
                    `category:${category.id || category.name}`
                ));
            }
            
            keyboard.push(row);
        }

        return keyboard;
    }

    /**
     * Build confirmation keyboard
     * @param {string} action - Action to confirm
     * @param {Object} options - Additional options
     * @returns {Array} Keyboard markup array
     */
    static buildConfirmKeyboard(action, options = {}) {
        const confirmText = options.confirmText || '✅ Confirm';
        const cancelText = options.cancelText || '❌ Cancel';

        return [
            [
                Markup.button.callback(confirmText, `confirm:${action}`),
                Markup.button.callback(cancelText, `cancel:${action}`)
            ]
        ];
    }

    /**
     * Build back navigation keyboard
     * @param {string} callback - Back callback data
     * @param {string} text - Button text
     * @returns {Array} Keyboard markup array
     */
    static buildBackKeyboard(callback, text = '↩️ Back') {
        return [
            [Markup.button.callback(text, callback)]
        ];
    }

    /**
     * Article Formatting Functions
     */

    /**
     * Format article for display
     * @param {Object} article - Article object
     * @param {boolean} showReactions - Whether to show reaction buttons
     * @param {Object} options - Additional formatting options
     * @returns {string} Formatted article text
     */
    static formatArticle(article, showReactions = true, options = {}) {
        if (!article) return 'No article data available';

        const date = article.published_date 
            ? new Date(article.published_date).toLocaleDateString('en-AU')
            : 'Unknown date';
        
        const title = article.title || 'Untitled';
        const content = article.summary || 
                       (article.content ? article.content.substring(0, 300) : '');
        const category = article.category || 'General';
        const url = article.url || 'https://thezonenews.com';
        
        let formatted = `📰 *${this.escapeMarkdown(title)}*\n\n`;
        
        if (content) {
            formatted += `${this.escapeMarkdown(content)}${content.length > 300 ? '...' : ''}\n\n`;
        }
        
        formatted += `📅 ${date} | 📂 ${category}`;
        
        if (options.showCity && article.city) {
            formatted += ` | 🏙️ ${article.city}`;
        }
        
        if (options.showViews && article.views) {
            formatted += ` | 👀 ${article.views}`;
        }
        
        formatted += `\n🔗 [Read More](${url})`;
        
        if (showReactions && article.reactions) {
            const reactions = Object.entries(article.reactions)
                .map(([emoji, count]) => `${emoji} ${count}`)
                .join(' ');
            
            if (reactions) {
                formatted += `\n\n${reactions}`;
            }
        }

        return formatted;
    }

    /**
     * Format article list with pagination info
     * @param {Array} articles - Array of articles
     * @param {number} page - Current page
     * @param {number} perPage - Articles per page
     * @param {Object} options - Formatting options
     * @returns {string} Formatted article list
     */
    static formatArticleList(articles, page, perPage, options = {}) {
        if (!articles || articles.length === 0) {
            return '📭 No articles found.';
        }

        let message = options.title || '📰 *Latest News*';
        message += `\n\n`;

        articles.forEach((article, i) => {
            const num = (page - 1) * perPage + i + 1;
            message += `${num}. ${this.formatArticle(article, false, options)}\n\n`;
        });

        return message;
    }

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @param {string} suffix - Suffix for truncated text
     * @returns {string} Truncated text
     */
    static truncateText(text, maxLength = 200, suffix = '...') {
        if (!text || text.length <= maxLength) return text || '';
        return text.substring(0, maxLength - suffix.length) + suffix;
    }

    /**
     * Permission Check Functions
     */

    /**
     * Check if user is a bot administrator
     * @param {Object} ctx - Telegraf context object
     * @param {Object} db - MongoDB database connection
     * @returns {Promise<boolean>} True if user is admin
     */
    static async isAdmin(ctx, db) {
        try {
            const userId = ctx.from.id;
            const admin = await db.collection('bot_admins').findOne({ 
                telegram_id: userId,
                active: true 
            });
            
            return !!admin;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }

    /**
     * Check if user can post to specific group
     * @param {Object} ctx - Telegraf context object
     * @param {string} groupId - Group ID to check
     * @param {Object} db - MongoDB database connection
     * @returns {Promise<boolean>} True if user can post
     */
    static async canPostToGroup(ctx, groupId, db) {
        try {
            const userId = ctx.from.id;
            
            // Check if user is bot admin
            if (await this.isAdmin(ctx, db)) {
                return true;
            }
            
            // Check if user is channel admin for this group
            const channelAdmin = await db.collection('channel_admins').findOne({
                telegram_id: userId,
                channel_id: groupId,
                active: true
            });
            
            return !!channelAdmin;
        } catch (error) {
            console.error('Error checking group posting permissions:', error);
            return false;
        }
    }

    /**
     * Check if user has active subscription
     * @param {number} userId - Telegram user ID
     * @param {Object} db - MongoDB database connection
     * @returns {Promise<Object>} Subscription status object
     */
    static async hasSubscription(userId, db) {
        try {
            const user = await db.collection('users').findOne({ user_id: userId });
            
            if (!user?.subscription) {
                return {
                    hasSubscription: false,
                    tier: 'free',
                    expiresAt: null
                };
            }

            const subscription = user.subscription;
            const now = new Date();
            const isActive = subscription.expires_at && new Date(subscription.expires_at) > now;

            return {
                hasSubscription: isActive,
                tier: subscription.tier || 'free',
                expiresAt: subscription.expires_at,
                isExpired: !isActive
            };
        } catch (error) {
            console.error('Error checking subscription:', error);
            return {
                hasSubscription: false,
                tier: 'free',
                expiresAt: null,
                error: true
            };
        }
    }

    /**
     * Message Helper Functions
     */

    /**
     * Send typing indicator to user
     * @param {Object} ctx - Telegraf context object
     * @returns {Promise<void>}
     */
    static async sendTyping(ctx) {
        try {
            await ctx.sendChatAction('typing');
        } catch (error) {
            console.warn('Failed to send typing indicator:', {
                userId: ctx.from?.id,
                chatId: ctx.chat?.id,
                error: error.message
            });
        }
    }

    /**
     * Safely delete a message
     * @param {Object} ctx - Telegraf context object
     * @param {number} messageId - Message ID to delete
     * @returns {Promise<boolean>} Success status
     */
    static async deleteMessageSafe(ctx, messageId) {
        try {
            if (messageId) {
                await ctx.deleteMessage(messageId);
            } else {
                await ctx.deleteMessage();
            }
            return true;
        } catch (error) {
            // Message might already be deleted or too old
            console.log('Could not delete message:', error.message);
            return false;
        }
    }

    /**
     * Edit message or reply if editing fails
     * @param {Object} ctx - Telegraf context object
     * @param {string} text - Message text
     * @param {Object} options - Message options
     * @returns {Promise<Object>} Sent/edited message
     */
    static async editOrReply(ctx, text, options = {}) {
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                // Try to edit the message
                return await ctx.editMessageText(text, options);
            } else {
                // Send new reply
                return await ctx.reply(text, options);
            }
        } catch (error) {
            // If editing fails, send new message
            try {
                return await ctx.reply(text, options);
            } catch (replyError) {
                console.error('Error in editOrReply:', replyError);
                throw replyError;
            }
        }
    }

    /**
     * Utility Helper Functions
     */

    /**
     * Escape markdown special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    static escapeMarkdown(text) {
        if (!text) return '';
        
        // Handle URLs separately to avoid escaping them
        const urlRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const urls = [];
        let tempText = text.replace(urlRegex, (match) => {
            urls.push(match);
            return `__URL_${urls.length - 1}__`;
        });
        
        // Escape special characters
        tempText = tempText.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
        
        // Restore URLs
        urls.forEach((url, index) => {
            tempText = tempText.replace(`__URL_${index}__`, url);
        });
        
        return tempText;
    }

    /**
     * Format date in Australian format
     * @param {Date|string} date - Date to format
     * @param {Object} options - Formatting options
     * @returns {string} Formatted date
     */
    static formatDate(date, options = {}) {
        if (!date) return 'Unknown date';
        
        const dateObj = new Date(date);
        
        if (options.relative) {
            return this.formatDateRelative(dateObj);
        }
        
        return dateObj.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            ...options
        });
    }

    /**
     * Format date relative to now
     * @param {Date} date - Date to format
     * @returns {string} Relative date string
     */
    static formatDateRelative(date) {
        const now = new Date();
        const then = new Date(date);
        const diff = now - then;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 7) {
            return then.toLocaleDateString('en-AU');
        } else if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }

    /**
     * Sleep function for delays
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate random ID
     * @param {number} length - ID length
     * @returns {string} Random ID
     */
    static generateId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

module.exports = CommandUtils;