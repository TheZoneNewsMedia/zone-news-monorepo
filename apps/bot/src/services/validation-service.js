/**
 * Validation Service
 * Joi-based input validation for security and data integrity
 */

const Joi = require('joi');
const { logger } = require('./logger-service');

class ValidationService {
    constructor() {
        // Define validation schemas
        this.schemas = this.defineSchemas();
        
        // Validation statistics
        this.stats = {
            validated: 0,
            failed: 0,
            byType: {}
        };
    }
    
    /**
     * Define all validation schemas
     */
    defineSchemas() {
        return {
            // User input schemas
            user: {
                telegram_id: Joi.number().integer().positive().required(),
                username: Joi.string().alphanum().min(3).max(32).allow(null),
                first_name: Joi.string().min(1).max(64).required(),
                last_name: Joi.string().min(1).max(64).allow(null),
                language_code: Joi.string().length(2).allow(null),
                is_bot: Joi.boolean().default(false)
            },
            
            // Article schemas
            article: {
                create: Joi.object({
                    title: Joi.string().min(1).max(500).required(),
                    content: Joi.string().min(10).max(50000).required(),
                    summary: Joi.string().max(1000).allow(''),
                    category: Joi.string().valid(
                        'politics', 'technology', 'business', 'sports',
                        'entertainment', 'health', 'science', 'world',
                        'local', 'opinion'
                    ).required(),
                    tags: Joi.array().items(Joi.string().max(50)).max(10),
                    author_id: Joi.number().integer().positive().required(),
                    status: Joi.string().valid('draft', 'published', 'archived').default('draft'),
                    source_url: Joi.string().uri().allow(null),
                    image_url: Joi.string().uri().allow(null)
                }),
                
                update: Joi.object({
                    title: Joi.string().min(1).max(500),
                    content: Joi.string().min(10).max(50000),
                    summary: Joi.string().max(1000).allow(''),
                    category: Joi.string().valid(
                        'politics', 'technology', 'business', 'sports',
                        'entertainment', 'health', 'science', 'world',
                        'local', 'opinion'
                    ),
                    tags: Joi.array().items(Joi.string().max(50)).max(10),
                    status: Joi.string().valid('draft', 'published', 'archived'),
                    image_url: Joi.string().uri().allow(null)
                }).min(1), // At least one field required
                
                search: Joi.object({
                    query: Joi.string().min(1).max(200),
                    category: Joi.string().valid(
                        'politics', 'technology', 'business', 'sports',
                        'entertainment', 'health', 'science', 'world',
                        'local', 'opinion', 'all'
                    ),
                    author_id: Joi.number().integer().positive(),
                    status: Joi.string().valid('draft', 'published', 'archived'),
                    from_date: Joi.date().iso(),
                    to_date: Joi.date().iso(),
                    limit: Joi.number().integer().min(1).max(100).default(20),
                    offset: Joi.number().integer().min(0).default(0),
                    sort_by: Joi.string().valid('date', 'views', 'reactions').default('date'),
                    sort_order: Joi.string().valid('asc', 'desc').default('desc')
                })
            },
            
            // Reaction schemas
            reaction: {
                add: Joi.object({
                    user_id: Joi.number().integer().positive().required(),
                    message_id: Joi.alternatives().try(
                        Joi.number().integer().positive(),
                        Joi.string().pattern(/^\d+$/)
                    ).required(),
                    emoji: Joi.string().valid('👍', '❤️', '🔥', '🎉', '😊', '😮').required(),
                    username: Joi.string().alphanum().min(3).max(32).allow(null)
                }),
                
                remove: Joi.object({
                    user_id: Joi.number().integer().positive().required(),
                    message_id: Joi.alternatives().try(
                        Joi.number().integer().positive(),
                        Joi.string().pattern(/^\d+$/)
                    ).required(),
                    emoji: Joi.string().valid('👍', '❤️', '🔥', '🎉', '😊', '😮').required()
                })
            },
            
            // Payment schemas
            payment: {
                intent: Joi.object({
                    user_id: Joi.number().integer().positive().required(),
                    amount: Joi.number().positive().max(100000).required(),
                    currency: Joi.string().length(3).uppercase().default('USD'),
                    description: Joi.string().max(500),
                    metadata: Joi.object().max(10)
                }),
                
                subscription: Joi.object({
                    user_id: Joi.number().integer().positive().required(),
                    tier: Joi.string().valid('basic', 'pro', 'enterprise').required(),
                    payment_method: Joi.string().valid('card', 'paypal', 'crypto').required(),
                    referral_code: Joi.string().alphanum().length(8).allow(null)
                })
            },
            
            // Admin command schemas
            admin: {
                broadcast: Joi.object({
                    message: Joi.string().min(1).max(4096).required(),
                    target: Joi.string().valid('all', 'active', 'premium').default('all'),
                    pin: Joi.boolean().default(false),
                    silent: Joi.boolean().default(false)
                }),
                
                ban: Joi.object({
                    user_id: Joi.number().integer().positive().required(),
                    reason: Joi.string().max(500).required(),
                    duration: Joi.number().integer().positive().max(365).default(0) // 0 = permanent
                }),
                
                stats_query: Joi.object({
                    metric: Joi.string().valid(
                        'users', 'articles', 'reactions', 'revenue',
                        'engagement', 'growth'
                    ).required(),
                    period: Joi.string().valid(
                        'hour', 'day', 'week', 'month', 'year'
                    ).default('day'),
                    from_date: Joi.date().iso(),
                    to_date: Joi.date().iso()
                })
            },
            
            // Telegram callback data
            callback: {
                reaction: Joi.object({
                    action: Joi.string().valid('reaction').required(),
                    emoji: Joi.string().required(),
                    messageId: Joi.string().required(),
                    userId: Joi.number().integer().positive()
                }),
                
                navigation: Joi.object({
                    action: Joi.string().valid(
                        'menu', 'back', 'next', 'prev',
                        'home', 'settings', 'help'
                    ).required(),
                    page: Joi.number().integer().min(0),
                    context: Joi.string().max(50)
                }),
                
                article: Joi.object({
                    action: Joi.string().valid(
                        'view', 'edit', 'delete', 'publish',
                        'archive', 'share'
                    ).required(),
                    article_id: Joi.string().required(),
                    confirm: Joi.boolean()
                })
            },
            
            // Configuration schemas
            config: {
                bot: Joi.object({
                    webhook_url: Joi.string().uri().required(),
                    allowed_updates: Joi.array().items(Joi.string()),
                    max_connections: Joi.number().integer().min(1).max(100).default(40),
                    drop_pending_updates: Joi.boolean().default(false)
                }),
                
                channel: Joi.object({
                    channel_id: Joi.alternatives().try(
                        Joi.number().integer(),
                        Joi.string().pattern(/^@[\w]+$/)
                    ).required(),
                    post_format: Joi.string().valid('full', 'summary', 'title').default('full'),
                    auto_forward: Joi.boolean().default(false),
                    filter_keywords: Joi.array().items(Joi.string()).max(50)
                })
            },
            
            // API request schemas
            api: {
                pagination: Joi.object({
                    page: Joi.number().integer().min(1).default(1),
                    limit: Joi.number().integer().min(1).max(100).default(20),
                    sort: Joi.string(),
                    order: Joi.string().valid('asc', 'desc').default('desc')
                }),
                
                filter: Joi.object({
                    field: Joi.string().required(),
                    operator: Joi.string().valid(
                        'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
                        'in', 'nin', 'contains', 'regex'
                    ).required(),
                    value: Joi.any().required()
                })
            }
        };
    }
    
    /**
     * Validate input against schema
     */
    async validate(data, schemaPath, options = {}) {
        const startTime = Date.now();
        
        try {
            // Get schema by path (e.g., 'article.create')
            const schema = this.getSchemaByPath(schemaPath);
            
            if (!schema) {
                throw new Error(`Schema not found: ${schemaPath}`);
            }
            
            // Default validation options
            const validationOptions = {
                abortEarly: false, // Return all errors
                stripUnknown: true, // Remove unknown keys
                convert: true, // Type coercion
                ...options
            };
            
            // Perform validation
            const result = schema.validate(data, validationOptions);
            
            // Track statistics
            if (result.error) {
                this.stats.failed++;
                this.trackValidationType(schemaPath, false);
                
                logger.warn('Validation failed', {
                    schema: schemaPath,
                    errors: result.error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message
                    })),
                    duration: Date.now() - startTime
                });
                
                return {
                    valid: false,
                    errors: this.formatErrors(result.error),
                    value: null
                };
            }
            
            this.stats.validated++;
            this.trackValidationType(schemaPath, true);
            
            logger.debug('Validation successful', {
                schema: schemaPath,
                duration: Date.now() - startTime
            });
            
            return {
                valid: true,
                errors: null,
                value: result.value
            };
            
        } catch (error) {
            logger.error('Validation error', {
                schema: schemaPath,
                error: error.message
            });
            
            return {
                valid: false,
                errors: [{ field: 'general', message: error.message }],
                value: null
            };
        }
    }
    
    /**
     * Get schema by dot notation path
     */
    getSchemaByPath(path) {
        const parts = path.split('.');
        let schema = this.schemas;
        
        for (const part of parts) {
            schema = schema[part];
            if (!schema) return null;
        }
        
        return Joi.isSchema(schema) ? schema : Joi.object(schema);
    }
    
    /**
     * Format validation errors for user display
     */
    formatErrors(error) {
        return error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message.replace(/"/g, ''),
            type: detail.type
        }));
    }
    
    /**
     * Track validation type statistics
     */
    trackValidationType(schemaPath, success) {
        if (!this.stats.byType[schemaPath]) {
            this.stats.byType[schemaPath] = {
                success: 0,
                failed: 0
            };
        }
        
        if (success) {
            this.stats.byType[schemaPath].success++;
        } else {
            this.stats.byType[schemaPath].failed++;
        }
    }
    
    /**
     * Sanitize string input
     */
    sanitizeString(input, options = {}) {
        if (typeof input !== 'string') return input;
        
        let sanitized = input;
        
        // Remove control characters
        if (options.removeControl !== false) {
            sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
        }
        
        // Trim whitespace
        if (options.trim !== false) {
            sanitized = sanitized.trim();
        }
        
        // Limit length
        if (options.maxLength) {
            sanitized = sanitized.substring(0, options.maxLength);
        }
        
        // Remove HTML tags
        if (options.stripHtml) {
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        }
        
        // Escape special characters for database
        if (options.escapeDb) {
            sanitized = sanitized
                .replace(/\$/g, '\\$')
                .replace(/\./g, '\\.');
        }
        
        return sanitized;
    }
    
    /**
     * Validate Telegram user input
     */
    async validateTelegramUser(user) {
        return this.validate({
            telegram_id: user.id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            language_code: user.language_code,
            is_bot: user.is_bot
        }, 'user');
    }
    
    /**
     * Validate article creation
     */
    async validateArticleCreate(article) {
        // Sanitize text fields
        if (article.title) {
            article.title = this.sanitizeString(article.title, {
                maxLength: 500,
                stripHtml: true
            });
        }
        
        if (article.content) {
            article.content = this.sanitizeString(article.content, {
                maxLength: 50000,
                stripHtml: false // Allow formatting
            });
        }
        
        return this.validate(article, 'article.create');
    }
    
    /**
     * Validate reaction input
     */
    async validateReaction(reaction) {
        return this.validate(reaction, 'reaction.add');
    }
    
    /**
     * Validate callback data
     */
    validateCallbackData(data) {
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            
            // Determine callback type
            if (parsed.action === 'reaction') {
                return this.validate(parsed, 'callback.reaction');
            } else if (['menu', 'back', 'next', 'prev'].includes(parsed.action)) {
                return this.validate(parsed, 'callback.navigation');
            } else if (['view', 'edit', 'delete'].includes(parsed.action)) {
                return this.validate(parsed, 'callback.article');
            }
            
            return { valid: false, errors: [{ field: 'action', message: 'Unknown action type' }] };
            
        } catch (error) {
            return { valid: false, errors: [{ field: 'data', message: 'Invalid callback data format' }] };
        }
    }
    
    /**
     * Get validation statistics
     */
    getStats() {
        const successRate = this.stats.validated > 0
            ? (this.stats.validated / (this.stats.validated + this.stats.failed) * 100).toFixed(2)
            : 0;
        
        return {
            total: this.stats.validated + this.stats.failed,
            validated: this.stats.validated,
            failed: this.stats.failed,
            successRate: `${successRate}%`,
            byType: this.stats.byType
        };
    }
    
    /**
     * Create custom validator for specific use case
     */
    createCustomValidator(schema) {
        return (data, options) => {
            const joiSchema = Joi.isSchema(schema) ? schema : Joi.object(schema);
            return joiSchema.validate(data, options);
        };
    }
    
    /**
     * Batch validate multiple items
     */
    async batchValidate(items, schemaPath, options = {}) {
        const results = await Promise.all(
            items.map(item => this.validate(item, schemaPath, options))
        );
        
        return {
            valid: results.every(r => r.valid),
            results,
            summary: {
                total: results.length,
                valid: results.filter(r => r.valid).length,
                invalid: results.filter(r => !r.valid).length
            }
        };
    }
}

// Export singleton instance
const validationService = new ValidationService();

module.exports = {
    ValidationService,
    validationService,
    Joi // Export Joi for custom schemas
};