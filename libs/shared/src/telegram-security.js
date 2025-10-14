/**
 * Zone News Bot - Telegram Security Utilities
 * Specialized security functions for Telegram integration
 */

const crypto = require('crypto');

class TelegramSecurity {
    /**
     * Validate Telegram webhook signature using bot token
     */
    static validateWebhookSignature(botToken, body, signature) {
        if (!botToken || !signature) {
            return false;
        }

        try {
            // Calculate expected signature
            const expectedSignature = crypto
                .createHmac('sha256', botToken)
                .update(JSON.stringify(body))
                .digest('hex');

            // Compare signatures using timing-safe comparison
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(expectedSignature, 'hex')
            );
        } catch (error) {
            console.error('Webhook signature validation error:', error);
            return false;
        }
    }

    /**
     * Validate Telegram webhook IP address
     */
    static validateTelegramIP(clientIP) {
        // Telegram webhook IP ranges (as of 2025)
        const telegramIPRanges = [
            '149.154.160.0/20',
            '91.108.4.0/22',
            '91.108.56.0/22',
            '149.154.160.0/22',
            '149.154.164.0/22',
            '149.154.168.0/22',
            '149.154.172.0/22',
            '91.108.8.0/22',
            '91.108.12.0/22',
            '91.108.16.0/22',
            '91.108.20.0/22'
        ];

        return this.isIPInRanges(clientIP, telegramIPRanges);
    }

    /**
     * Check if IP is in specified CIDR ranges
     */
    static isIPInRanges(ip, ranges) {
        try {
            const ipNum = this.ipToNumber(ip);
            
            for (const range of ranges) {
                const [rangeIP, cidr] = range.split('/');
                const rangeNum = this.ipToNumber(rangeIP);
                const mask = (0xffffffff << (32 - parseInt(cidr))) >>> 0;
                
                if ((ipNum & mask) === (rangeNum & mask)) {
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('IP range validation error:', error);
            return false;
        }
    }

    /**
     * Convert IP address to number
     */
    static ipToNumber(ip) {
        return ip.split('.').reduce((num, octet) => (num << 8) + parseInt(octet), 0) >>> 0;
    }

    /**
     * Validate Telegram update structure
     */
    static validateUpdateStructure(update) {
        if (!update || typeof update !== 'object') {
            return { valid: false, error: 'Invalid update object' };
        }

        // Check required update_id
        if (!Number.isInteger(update.update_id)) {
            return { valid: false, error: 'Missing or invalid update_id' };
        }

        // Check that at least one update type is present
        const updateTypes = [
            'message', 'edited_message', 'channel_post', 'edited_channel_post',
            'inline_query', 'chosen_inline_result', 'callback_query',
            'shipping_query', 'pre_checkout_query', 'poll', 'poll_answer',
            'my_chat_member', 'chat_member', 'chat_join_request'
        ];

        const hasValidUpdateType = updateTypes.some(type => update[type]);
        if (!hasValidUpdateType) {
            return { valid: false, error: 'No valid update type found' };
        }

        // Validate message structure if present
        if (update.message && !this.validateMessageStructure(update.message)) {
            return { valid: false, error: 'Invalid message structure' };
        }

        return { valid: true };
    }

    /**
     * Validate message structure
     */
    static validateMessageStructure(message) {
        if (!message || typeof message !== 'object') {
            return false;
        }

        // Check required fields
        if (!Number.isInteger(message.message_id) || 
            !Number.isInteger(message.date) ||
            !message.chat) {
            return false;
        }

        // Validate chat object
        if (!Number.isInteger(message.chat.id)) {
            return false;
        }

        return true;
    }

    /**
     * Sanitize user input from Telegram messages
     */
    static sanitizeUserInput(text, options = {}) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        const {
            maxLength = 4096, // Telegram message limit
            allowMarkdown = false,
            allowHTML = false,
            stripUrls = false
        } = options;

        let sanitized = text;

        // Truncate to max length
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }

        // Strip URLs if requested
        if (stripUrls) {
            sanitized = sanitized.replace(/https?:\/\/[^\s]+/g, '[URL]');
        }

        // Handle markdown/HTML
        if (!allowMarkdown && !allowHTML) {
            // Strip all formatting
            sanitized = sanitized
                .replace(/[*_`\[\]()~]/g, '') // Markdown characters
                .replace(/<[^>]*>/g, ''); // HTML tags
        } else if (!allowHTML) {
            // Strip HTML but keep Markdown
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        } else if (!allowMarkdown) {
            // Strip Markdown but keep HTML
            sanitized = sanitized.replace(/[*_`~]/g, '');
        }

        // Remove potentially dangerous characters
        sanitized = sanitized
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Control characters
            .trim();

        return sanitized;
    }

    /**
     * Rate limiting specifically for Telegram commands
     */
    static createCommandRateLimit() {
        const commandCounts = new Map();
        const COMMAND_WINDOW = 60000; // 1 minute
        const MAX_COMMANDS_PER_USER = 30; // Per minute

        return (userId, command) => {
            const now = Date.now();
            const userKey = `${userId}_${command}`;
            
            if (!commandCounts.has(userKey)) {
                commandCounts.set(userKey, []);
            }

            const userCommands = commandCounts.get(userKey);
            
            // Remove old entries
            const validCommands = userCommands.filter(timestamp => now - timestamp < COMMAND_WINDOW);
            
            // Check rate limit
            if (validCommands.length >= MAX_COMMANDS_PER_USER) {
                return {
                    allowed: false,
                    resetTime: Math.min(...validCommands) + COMMAND_WINDOW
                };
            }

            // Add current command
            validCommands.push(now);
            commandCounts.set(userKey, validCommands);

            return {
                allowed: true,
                remaining: MAX_COMMANDS_PER_USER - validCommands.length
            };
        };
    }

    /**
     * Validate bot token format
     */
    static validateBotToken(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }

        // Bot token format: {bot_id}:{bot_hash}
        // Example: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz-1234567890
        const tokenRegex = /^\d+:[A-Za-z0-9_-]{35}$/;
        return tokenRegex.test(token);
    }

    /**
     * Create secure webhook URL with validation token
     */
    static createSecureWebhookPath(botToken) {
        const hash = crypto
            .createHash('sha256')
            .update(botToken + process.env.WEBHOOK_SECRET || '')
            .digest('hex')
            .substring(0, 32);
        
        return `/webhook/${hash}`;
    }

    /**
     * Validate webhook URL format
     */
    static validateWebhookUrl(url) {
        try {
            const parsed = new URL(url);
            
            // Must use HTTPS in production
            if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
                return false;
            }

            // Check domain format
            if (!parsed.hostname || parsed.hostname.length < 3) {
                return false;
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Security event logger for Telegram-specific events
     */
    static logSecurityEvent(eventType, details) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: eventType,
            service: 'telegram-security',
            ...details
        };

        console.log(`🔒 Security Event [${eventType}]:`, logEntry);

        // In production, this should also write to a security log file
        if (process.env.NODE_ENV === 'production') {
            // TODO: Implement secure logging to file/database
        }
    }
}

module.exports = TelegramSecurity;