/**
 * Security Service - Handles webhook validation, rate limiting, and security
 */

const crypto = require('crypto');

class SecurityService {
    constructor(config) {
        this.config = config;
        this.rateLimits = new Map();
        this.webhookSecret = process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
    }
    
    /**
     * Validate webhook signature from Telegram
     */
    validateWebhookSignature(req) {
        if (!this.config.webhookSecret) return true; // Skip if no secret configured
        
        const signature = req.headers['x-telegram-bot-api-secret-token'];
        if (!signature) return false;
        
        return signature === this.webhookSecret;
    }
    
    /**
     * Rate limiting per user
     */
    checkRateLimit(userId, limit = 30, windowMs = 60000) {
        const now = Date.now();
        const userLimits = this.rateLimits.get(userId) || { count: 0, resetTime: now + windowMs };
        
        // Reset if window expired
        if (now > userLimits.resetTime) {
            userLimits.count = 0;
            userLimits.resetTime = now + windowMs;
        }
        
        // Check limit
        if (userLimits.count >= limit) {
            const waitTime = Math.ceil((userLimits.resetTime - now) / 1000);
            return {
                allowed: false,
                waitTime: waitTime,
                message: `Rate limit exceeded. Please wait ${waitTime} seconds.`
            };
        }
        
        // Increment and store
        userLimits.count++;
        this.rateLimits.set(userId, userLimits);
        
        // Clean old entries periodically
        if (this.rateLimits.size > 1000) {
            this.cleanupRateLimits();
        }
        
        return { allowed: true };
    }
    
    /**
     * Clean up old rate limit entries
     */
    cleanupRateLimits() {
        const now = Date.now();
        for (const [userId, limits] of this.rateLimits.entries()) {
            if (now > limits.resetTime + 300000) { // 5 minutes grace period
                this.rateLimits.delete(userId);
            }
        }
    }
    
    /**
     * Sanitize user input
     */
    sanitizeInput(text) {
        if (!text) return '';
        
        // Remove potential HTML/script tags
        let sanitized = text.replace(/<[^>]*>/g, '');
        
        // Escape special characters for Telegram Markdown
        sanitized = sanitized
            .replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
        
        // Limit length
        if (sanitized.length > 4096) {
            sanitized = sanitized.substring(0, 4093) + '...';
        }
        
        return sanitized;
    }
    
    /**
     * Validate broadcast safety
     */
    validateBroadcast(message, userCount) {
        const errors = [];
        
        // Check message length
        if (!message || message.length < 1) {
            errors.push('Message cannot be empty');
        }
        
        if (message.length > 4096) {
            errors.push('Message too long (max 4096 characters)');
        }
        
        // Check user count safety
        if (userCount > 1000) {
            errors.push(`Broadcasting to ${userCount} users requires batching`);
        }
        
        // Check for spam patterns
        const spamPatterns = [
            /http[s]?:\/\/[^\s]{50,}/gi,  // Very long URLs
            /(.)\1{10,}/gi,                // Repeated characters
            /[A-Z]{20,}/g,                 // All caps spam
        ];
        
        for (const pattern of spamPatterns) {
            if (pattern.test(message)) {
                errors.push('Message contains spam-like patterns');
                break;
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            requiresConfirmation: userCount > 100
        };
    }
    
    /**
     * Generate webhook secret
     */
    generateWebhookSecret() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    /**
     * Hash sensitive data
     */
    hashData(data) {
        return crypto
            .createHash('sha256')
            .update(data)
            .digest('hex');
    }
    
    /**
     * Validate admin permission
     */
    isAdmin(userId) {
        const adminIds = this.config.adminIds || [];
        return adminIds.includes(userId);
    }
    
    /**
     * Check for malicious patterns
     */
    detectMaliciousContent(text) {
        const maliciousPatterns = [
            /javascript:/gi,
            /<script/gi,
            /onclick=/gi,
            /onerror=/gi,
            /eval\(/gi,
            /document\./gi,
            /window\./gi,
            /\.exe/gi,
            /\.bat/gi,
            /\.cmd/gi,
            /\.scr/gi,
            /\.vbs/gi,
            /\.js\.download/gi
        ];
        
        for (const pattern of maliciousPatterns) {
            if (pattern.test(text)) {
                return {
                    safe: false,
                    reason: 'Potentially malicious content detected'
                };
            }
        }
        
        return { safe: true };
    }
    
    /**
     * Middleware for Express/Telegraf
     */
    webhookAuthMiddleware() {
        return (req, res, next) => {
            if (!this.validateWebhookSignature(req)) {
                return res.status(401).json({ error: 'Invalid webhook signature' });
            }
            next();
        };
    }
    
    rateLimitMiddleware(limit = 30, windowMs = 60000) {
        return async (ctx, next) => {
            if (!ctx.from) return next();
            
            const result = this.checkRateLimit(ctx.from.id, limit, windowMs);
            
            if (!result.allowed) {
                return ctx.reply(`⏱️ ${result.message}`);
            }
            
            return next();
        };
    }
}

module.exports = SecurityService;