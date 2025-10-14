/**
 * Safe Rate Limiting Middleware
 * Production-safe rate limiting using express-rate-limit only
 */

const rateLimit = require('express-rate-limit');

class SafeRateLimitingMiddleware {
    constructor() {
        this.setupLimiters();
    }

    setupLimiters() {
        // API endpoints rate limiting
        this.apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again later.',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });

        // Admin endpoints rate limiting (stricter)
        this.adminLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 20, // limit each IP to 20 requests per windowMs
            message: {
                error: 'Too many admin requests from this IP, please try again later.',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });

        // Health check rate limiting (lenient)
        this.healthLimiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 30, // limit each IP to 30 health checks per minute
            message: {
                error: 'Too many health check requests from this IP.',
                retryAfter: '1 minute'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });

        // News endpoint rate limiting
        this.newsLimiter = rateLimit({
            windowMs: 5 * 60 * 1000, // 5 minutes
            max: 50, // limit each IP to 50 news requests per 5 minutes
            message: {
                error: 'Too many news requests from this IP, please try again later.',
                retryAfter: '5 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
    }

    getApiLimiter() {
        return this.apiLimiter;
    }

    getAdminLimiter() {
        return this.adminLimiter;
    }

    getHealthLimiter() {
        return this.healthLimiter;
    }

    getNewsLimiter() {
        return this.newsLimiter;
    }

    // Get rate limit info for monitoring
    getRateLimitInfo() {
        return {
            api: { windowMs: 15 * 60 * 1000, max: 100 },
            admin: { windowMs: 15 * 60 * 1000, max: 20 },
            health: { windowMs: 1 * 60 * 1000, max: 30 },
            news: { windowMs: 5 * 60 * 1000, max: 50 }
        };
    }
}

module.exports = SafeRateLimitingMiddleware;