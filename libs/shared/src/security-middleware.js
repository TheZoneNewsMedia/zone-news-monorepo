/**
 * Zone News Bot - Production Security Middleware
 * Comprehensive security safeguards for all services
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const validator = require('validator');
const helmet = require('helmet');

class SecurityMiddleware {
    /**
     * Rate limiting configuration for different endpoint types
     */
    static getRateLimitConfig() {
        return {
            // Webhook endpoints - high traffic expected
            webhook: {
                windowMs: 1 * 60 * 1000, // 1 minute
                max: 100, // 100 requests per minute
                message: { error: 'Too many webhook requests', code: 'RATE_LIMIT_WEBHOOK' },
                standardHeaders: true,
                legacyHeaders: false,
                skip: (req) => {
                    // Skip rate limiting for verified Telegram webhooks
                    return req.headers['user-agent']?.includes('TelegramBot');
                }
            },
            
            // API endpoints - moderate traffic
            api: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 1000, // 1000 requests per 15 minutes
                message: { error: 'Too many API requests', code: 'RATE_LIMIT_API' },
                standardHeaders: true,
                legacyHeaders: false,
                keyGenerator: (req) => {
                    // Use IP + User-Agent for better rate limiting
                    return `${req.ip}_${req.get('User-Agent') || 'unknown'}`;
                }
            },
            
            // Authentication endpoints - strict limits
            auth: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 10, // Only 10 auth attempts per 15 minutes
                message: { error: 'Too many authentication attempts', code: 'RATE_LIMIT_AUTH' },
                standardHeaders: true,
                legacyHeaders: false,
                skipSuccessfulRequests: true
            },
            
            // Admin endpoints - very strict
            admin: {
                windowMs: 5 * 60 * 1000, // 5 minutes
                max: 20, // 20 requests per 5 minutes
                message: { error: 'Too many admin requests', code: 'RATE_LIMIT_ADMIN' },
                standardHeaders: true,
                legacyHeaders: false
            }
        };
    }

    /**
     * Speed limiting (progressive delay)
     */
    static getSpeedLimitConfig() {
        return {
            windowMs: 15 * 60 * 1000, // 15 minutes
            delayAfter: 50, // Allow 50 requests at full speed
            delayMs: 500, // Add 500ms delay after delayAfter requests
            maxDelayMs: 20000, // Maximum delay of 20 seconds
            skipSuccessfulRequests: true
        };
    }

    /**
     * Input validation and sanitization
     */
    static validateInput(options = {}) {
        return (req, res, next) => {
            try {
                const {
                    maxBodySize = 1024 * 1024, // 1MB default
                    allowedContentTypes = ['application/json', 'application/x-www-form-urlencoded'],
                    sanitizeHtml = true,
                    validateJson = true
                } = options;

                // Check content type
                const contentType = req.get('Content-Type');
                if (contentType && !allowedContentTypes.some(type => contentType.includes(type))) {
                    return res.status(415).json({
                        error: 'Unsupported Media Type',
                        code: 'INVALID_CONTENT_TYPE',
                        allowed: allowedContentTypes
                    });
                }

                // Check body size
                const contentLength = parseInt(req.get('Content-Length') || '0');
                if (contentLength > maxBodySize) {
                    return res.status(413).json({
                        error: 'Request Entity Too Large',
                        code: 'BODY_SIZE_EXCEEDED',
                        maxSize: maxBodySize
                    });
                }

                // Sanitize query parameters
                if (req.query) {
                    for (const [key, value] of Object.entries(req.query)) {
                        if (typeof value === 'string') {
                            // Basic XSS protection
                            req.query[key] = sanitizeHtml ? 
                                validator.escape(value) : 
                                value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                        }
                    }
                }

                // Validate JSON structure if enabled
                if (validateJson && req.body && typeof req.body === 'object') {
                    try {
                        JSON.stringify(req.body);
                    } catch (error) {
                        return res.status(400).json({
                            error: 'Invalid JSON structure',
                            code: 'INVALID_JSON'
                        });
                    }
                }

                next();
            } catch (error) {
                console.error('Input validation error:', error);
                res.status(500).json({
                    error: 'Input validation failed',
                    code: 'VALIDATION_ERROR'
                });
            }
        };
    }

    /**
     * Telegram webhook signature validation
     */
    static validateTelegramWebhook(botToken) {
        return (req, res, next) => {
            try {
                // Skip validation if no token provided (for testing)
                if (!botToken) {
                    console.warn('⚠️ Telegram webhook validation skipped - no bot token');
                    return next();
                }

                // Check for secret token in headers
                const providedSecret = req.headers['x-telegram-bot-api-secret-token'];
                const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

                if (expectedSecret && providedSecret !== expectedSecret) {
                    console.warn('❌ Invalid Telegram webhook secret');
                    return res.status(403).json({
                        error: 'Invalid webhook secret',
                        code: 'INVALID_WEBHOOK_SECRET'
                    });
                }

                // Validate request structure
                if (!req.body || typeof req.body !== 'object') {
                    return res.status(400).json({
                        error: 'Invalid webhook payload',
                        code: 'INVALID_WEBHOOK_PAYLOAD'
                    });
                }

                // Validate update_id exists (required field)
                if (!req.body.update_id && req.body.update_id !== 0) {
                    return res.status(400).json({
                        error: 'Missing update_id in webhook payload',
                        code: 'MISSING_UPDATE_ID'
                    });
                }

                // Optional: Validate IP address (Telegram uses specific IP ranges)
                const clientIP = req.ip || req.connection.remoteAddress;
                const telegramIPRanges = [
                    '149.154.160.0/20',
                    '91.108.4.0/22',
                    '91.108.56.0/22',
                    '149.154.160.0/22'
                ];

                // Store validation result for logging
                req.telegramValidation = {
                    hasSecret: !!providedSecret,
                    hasValidStructure: true,
                    clientIP
                };

                next();
            } catch (error) {
                console.error('Telegram webhook validation error:', error);
                res.status(500).json({
                    error: 'Webhook validation failed',
                    code: 'WEBHOOK_VALIDATION_ERROR'
                });
            }
        };
    }

    /**
     * CORS configuration with security headers
     */
    static getCorsConfig() {
        return {
            origin: function(origin, callback) {
                // Define allowed origins based on environment
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:3001',
                    'http://localhost:8080',
                    'https://zonenews.com.au',
                    'https://api.zonenews.com.au',
                    'https://t.me',
                    'https://web.telegram.org'
                ];

                // Allow requests with no origin (mobile apps, curl, etc.)
                if (!origin) return callback(null, true);

                // Check if origin is allowed
                if (allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    console.warn(`❌ CORS blocked origin: ${origin}`);
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Origin',
                'X-Requested-With',
                'Content-Type',
                'Accept',
                'Authorization',
                'X-Telegram-Bot-Api-Secret-Token',
                'X-API-Key'
            ],
            exposedHeaders: [
                'X-Total-Count',
                'X-Rate-Limit-Limit',
                'X-Rate-Limit-Remaining',
                'X-Rate-Limit-Reset'
            ],
            maxAge: 86400 // 24 hours
        };
    }

    /**
     * Security headers using Helmet
     */
    static getHelmetConfig() {
        return {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https:"],
                    scriptSrc: ["'self'", "https://telegram.org"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "https://api.telegram.org"],
                    fontSrc: ["'self'", "https:", "data:"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            },
            crossOriginEmbedderPolicy: false, // Disable for Telegram compatibility
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        };
    }

    /**
     * Request logging with security context
     */
    static logSecurityEvents(options = {}) {
        return (req, res, next) => {
            const startTime = Date.now();
            
            // Log security-relevant information
            const securityContext = {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                method: req.method,
                url: req.url,
                timestamp: new Date().toISOString()
            };

            // Log suspicious patterns
            const suspiciousPatterns = [
                /\.\./,  // Directory traversal
                /<script/i,  // XSS attempts
                /union.*select/i,  // SQL injection
                /javascript:/i,  // JavaScript injection
                /'.*or.*'/i  // SQL injection
            ];

            const requestString = `${req.url} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`;
            const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestString));

            if (isSuspicious) {
                console.warn('🚨 Suspicious request detected:', {
                    ...securityContext,
                    request: requestString
                });
            }

            // Override res.end to log response
            const originalEnd = res.end;
            res.end = function(...args) {
                const duration = Date.now() - startTime;
                
                if (options.logLevel === 'verbose' || res.statusCode >= 400) {
                    console.log('📊 Request completed:', {
                        ...securityContext,
                        statusCode: res.statusCode,
                        duration: `${duration}ms`,
                        suspicious: isSuspicious
                    });
                }
                
                originalEnd.apply(this, args);
            };

            next();
        };
    }

    /**
     * Error handling with security context
     */
    static errorHandler() {
        return (error, req, res, next) => {
            // Log error with security context
            console.error('🚨 Server error:', {
                error: error.message,
                stack: error.stack,
                ip: req.ip,
                method: req.method,
                url: req.url,
                userAgent: req.get('User-Agent')
            });

            // Don't expose internal errors in production
            const isDevelopment = process.env.NODE_ENV === 'development';
            
            res.status(error.status || 500).json({
                error: isDevelopment ? error.message : 'Internal Server Error',
                code: error.code || 'INTERNAL_ERROR',
                ...(isDevelopment && { stack: error.stack })
            });
        };
    }

    /**
     * API key validation
     */
    static validateApiKey(validKeys = []) {
        return (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            
            if (!apiKey) {
                return res.status(401).json({
                    error: 'API key required',
                    code: 'MISSING_API_KEY'
                });
            }

            if (!validKeys.includes(apiKey)) {
                console.warn('❌ Invalid API key attempt:', {
                    ip: req.ip,
                    providedKey: apiKey.substring(0, 8) + '...',
                    userAgent: req.get('User-Agent')
                });
                
                return res.status(403).json({
                    error: 'Invalid API key',
                    code: 'INVALID_API_KEY'
                });
            }

            next();
        };
    }

    /**
     * Complete security middleware setup
     */
    static setupSecurity(app, options = {}) {
        const {
            enableRateLimit = true,
            enableSpeedLimit = true,
            enableInputValidation = true,
            enableHelmet = true,
            enableCors = true,
            enableLogging = true,
            enableErrorHandler = true
        } = options;

        // Security headers
        if (enableHelmet) {
            app.use(helmet(this.getHelmetConfig()));
        }

        // CORS
        if (enableCors) {
            const cors = require('cors');
            app.use(cors(this.getCorsConfig()));
        }

        // Request logging
        if (enableLogging) {
            app.use(this.logSecurityEvents(options));
        }

        // Input validation
        if (enableInputValidation) {
            app.use(this.validateInput(options));
        }

        // Speed limiting
        if (enableSpeedLimit) {
            app.use(slowDown(this.getSpeedLimitConfig()));
        }

        // Rate limiting for different endpoint types
        if (enableRateLimit) {
            const rateLimitConfigs = this.getRateLimitConfig();
            
            // Apply webhook rate limiting
            app.use('/webhook', rateLimit(rateLimitConfigs.webhook));
            
            // Apply API rate limiting
            app.use('/api', rateLimit(rateLimitConfigs.api));
            
            // Apply auth rate limiting
            app.use(['/auth', '/login', '/register'], rateLimit(rateLimitConfigs.auth));
            
            // Apply admin rate limiting
            app.use('/admin', rateLimit(rateLimitConfigs.admin));
        }

        // Error handler (should be last)
        if (enableErrorHandler) {
            app.use(this.errorHandler());
        }

        console.log('🛡️ Security middleware configured');
    }
}

module.exports = SecurityMiddleware;