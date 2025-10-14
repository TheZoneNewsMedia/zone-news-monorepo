/**
 * Advanced Rate Limiting Middleware
 * Multi-tier rate limiting with endpoint-specific rules and user classification
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { RateLimitError } = require('../types/error.types');

class AdvancedRateLimitingMiddleware {
    constructor(cacheService = null) {
        this.cacheService = cacheService;
        this.userClassifications = new Map();
        this.suspiciousIPs = new Set();
        
        // Rate limit configurations for different tiers
        this.rateLimitConfigs = {
            // Public endpoints - more restrictive
            public: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 100, // requests per window
                standardHeaders: true,
                legacyHeaders: false,
                message: {
                    error: 'Too many requests from this IP',
                    retryAfter: '15 minutes'
                }
            },
            
            // News endpoints - moderate restrictions
            news: {
                windowMs: 1 * 60 * 1000, // 1 minute
                max: 30, // requests per minute
                standardHeaders: true,
                legacyHeaders: false,
                message: {
                    error: 'Rate limit exceeded for news endpoints',
                    retryAfter: '1 minute'
                }
            },
            
            // Search endpoints - more restrictive due to DB load
            search: {
                windowMs: 1 * 60 * 1000, // 1 minute
                max: 10, // requests per minute
                standardHeaders: true,
                legacyHeaders: false,
                message: {
                    error: 'Search rate limit exceeded',
                    retryAfter: '1 minute'
                }
            },
            
            // Admin endpoints - very restrictive
            admin: {
                windowMs: 5 * 60 * 1000, // 5 minutes
                max: 10, // requests per 5 minutes
                standardHeaders: true,
                legacyHeaders: false,
                message: {
                    error: 'Admin endpoint rate limit exceeded',
                    retryAfter: '5 minutes'
                }
            },
            
            // Health check - more lenient
            health: {
                windowMs: 1 * 60 * 1000, // 1 minute
                max: 60, // requests per minute
                standardHeaders: true,
                legacyHeaders: false,
                skip: (req) => req.path === '/health' && req.method === 'GET'
            }
        };

        // Slow down configurations
        this.slowDownConfigs = {
            general: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                delayAfter: 50, // Start slowing down after 50 requests
                delayMs: 500, // Add 500ms delay per request
                maxDelayMs: 10000 // Maximum delay of 10 seconds
            }
        };
    }
    
    /**
     * Create rate limiter for specific endpoint type
     */
    createRateLimiter(type = 'public', customConfig = {}) {
        const config = { ...this.rateLimitConfigs[type], ...customConfig };
        
        // Add custom key generator for user classification
        config.keyGenerator = (req) => {
            const ip = req.ip || req.connection.remoteAddress;
            const userAgent = req.get('User-Agent') || 'unknown';
            const userId = req.user?.id || req.body?.telegram_id || null;
            
            // Use user ID if available, otherwise IP
            const baseKey = userId ? `user:${userId}` : `ip:${ip}`;
            
            // Classify user and adjust limits
            const classification = this.classifyUser(ip, userAgent, userId);
            if (classification === 'premium') {
                config.max = Math.floor(config.max * 2); // Double the limit for premium users
            } else if (classification === 'suspicious') {
                config.max = Math.floor(config.max * 0.5); // Half the limit for suspicious users
            }
            
            return `${baseKey}:${type}`;
        };
        
        // Add custom handler for rate limit exceeded
        config.handler = (req, res) => {
            const ip = req.ip || req.connection.remoteAddress;
            this.recordRateLimitViolation(ip, type);
            
            const error = new RateLimitError(new Date(Date.now() + config.windowMs));
            res.status(429).json(error.toJSON());
        };
        
        // Add skip function for cache hits (if caching is enabled)
        if (this.cacheService) {
            const originalSkip = config.skip || (() => false);
            config.skip = (req) => {
                if (originalSkip(req)) return true;
                
                // Skip rate limiting for cache hits
                const cacheHeader = req.get('X-Cache');
                return cacheHeader === 'HIT';
            };
        }
        
        return rateLimit(config);
    }
    
    /**
     * Create slow down middleware
     */
    createSlowDown(type = 'general', customConfig = {}) {
        const config = { ...this.slowDownConfigs[type], ...customConfig };
        
        config.keyGenerator = (req) => {
            const ip = req.ip || req.connection.remoteAddress;
            const userId = req.user?.id || req.body?.telegram_id || null;
            return userId ? `user:${userId}` : `ip:${ip}`;
        };
        
        return slowDown(config);
    }
    
    /**
     * Classify users based on behavior patterns
     */
    classifyUser(ip, userAgent, userId) {
        const key = userId || ip;
        
        // Check for suspicious patterns
        if (this.suspiciousIPs.has(ip)) {
            return 'suspicious';
        }
        
        // Check for bot user agents
        const botPatterns = [
            /bot/i, /crawler/i, /spider/i, /scraper/i,
            /facebook/i, /twitter/i, /linkedin/i,
            /curl/i, /wget/i, /python/i, /axios/i
        ];
        
        if (botPatterns.some(pattern => pattern.test(userAgent))) {
            this.suspiciousIPs.add(ip);
            return 'suspicious';
        }
        
        // Get existing classification or default to standard
        const existing = this.userClassifications.get(key) || 'standard';
        
        // Premium users would be identified by API key or subscription
        // For now, we'll use a simple heuristic
        if (userId && existing === 'standard') {
            // Could integrate with subscription service here
            return 'standard';
        }
        
        return existing;
    }
    
    /**
     * Record rate limit violations for monitoring
     */
    recordRateLimitViolation(ip, endpointType) {
        const key = `rate_limit:${ip}:${endpointType}`;
        const timestamp = new Date();
        
        // Track violations for escalation
        const violationCount = this.getViolationCount(ip);
        
        if (violationCount > 5) {
            this.suspiciousIPs.add(ip);
            console.warn(`🚨 IP ${ip} marked as suspicious due to repeated rate limit violations`);
        }
        
        // Log the violation
        console.log(`⚠️  Rate limit violation: IP ${ip}, endpoint type: ${endpointType}, time: ${timestamp.toISOString()}`);
    }
    
    /**
     * Get violation count for IP
     */
    getViolationCount(ip) {
        // In a production system, this would query Redis or a database
        // For now, we'll use a simple in-memory counter
        if (!this.violationCounts) {
            this.violationCounts = new Map();
        }
        
        const count = this.violationCounts.get(ip) || 0;
        this.violationCounts.set(ip, count + 1);
        
        // Reset counts every hour
        setTimeout(() => {
            this.violationCounts.delete(ip);
        }, 60 * 60 * 1000);
        
        return count + 1;
    }
    
    /**
     * Create endpoint-specific rate limiters
     */
    createEndpointLimiters() {
        return {
            // News endpoints
            news: this.createRateLimiter('news'),
            
            // Search endpoints  
            search: this.createRateLimiter('search'),
            
            // Admin endpoints
            admin: this.createRateLimiter('admin'),
            
            // Health check
            health: this.createRateLimiter('health'),
            
            // General public endpoints
            public: this.createRateLimiter('public'),
            
            // Global slow down
            slowDown: this.createSlowDown('general')
        };
    }
    
    /**
     * API key authentication middleware
     */
    apiKeyAuth() {
        return (req, res, next) => {
            const apiKey = req.get('X-API-Key') || req.query.api_key;
            
            if (!apiKey) {
                // No API key provided - continue with standard rate limits
                return next();
            }
            
            // Validate API key
            const validApiKeys = this.getValidApiKeys();
            const keyInfo = validApiKeys.get(apiKey);
            
            if (!keyInfo) {
                return res.status(401).json({
                    error: 'Invalid API key',
                    code: 'INVALID_API_KEY'
                });
            }
            
            // Check if API key is active
            if (!keyInfo.active) {
                return res.status(401).json({
                    error: 'API key is disabled',
                    code: 'API_KEY_DISABLED'
                });
            }
            
            // Check rate limits for this API key
            if (keyInfo.rateLimit) {
                const usage = this.getApiKeyUsage(apiKey);
                if (usage >= keyInfo.rateLimit) {
                    return res.status(429).json({
                        error: 'API key rate limit exceeded',
                        code: 'API_KEY_RATE_LIMIT',
                        resetTime: this.getApiKeyResetTime(apiKey)
                    });
                }
                
                this.recordApiKeyUsage(apiKey);
            }
            
            // Add API key info to request
            req.apiKey = keyInfo;
            req.user = { id: keyInfo.userId, tier: keyInfo.tier };
            
            next();
        };
    }
    
    /**
     * Get valid API keys (in production, this would query a database)
     */
    getValidApiKeys() {
        // This would typically come from a database
        const validKeys = new Map();
        
        // Example API keys (in production, these would be hashed)
        validKeys.set(process.env.ADMIN_API_KEY || 'admin-key-123', {
            userId: 'admin',
            tier: 'admin',
            active: true,
            rateLimit: 1000, // requests per hour
            permissions: ['admin', 'read', 'write']
        });
        
        validKeys.set(process.env.PREMIUM_API_KEY || 'premium-key-456', {
            userId: 'premium-user',
            tier: 'premium',
            active: true,
            rateLimit: 500, // requests per hour
            permissions: ['read', 'write']
        });
        
        return validKeys;
    }
    
    /**
     * Get API key usage (simplified - would use Redis in production)
     */
    getApiKeyUsage(apiKey) {
        if (!this.apiKeyUsage) {
            this.apiKeyUsage = new Map();
        }
        
        const now = new Date();
        const hourKey = `${apiKey}:${now.getHours()}:${now.getDate()}`;
        
        return this.apiKeyUsage.get(hourKey) || 0;
    }
    
    /**
     * Record API key usage
     */
    recordApiKeyUsage(apiKey) {
        if (!this.apiKeyUsage) {
            this.apiKeyUsage = new Map();
        }
        
        const now = new Date();
        const hourKey = `${apiKey}:${now.getHours()}:${now.getDate()}`;
        const currentUsage = this.apiKeyUsage.get(hourKey) || 0;
        
        this.apiKeyUsage.set(hourKey, currentUsage + 1);
        
        // Clean up old usage data
        setTimeout(() => {
            this.apiKeyUsage.delete(hourKey);
        }, 2 * 60 * 60 * 1000); // Keep for 2 hours
    }
    
    /**
     * Get API key reset time
     */
    getApiKeyResetTime(apiKey) {
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setHours(now.getHours() + 1, 0, 0, 0);
        return nextHour.toISOString();
    }
    
    /**
     * Get rate limiting statistics
     */
    getStatistics() {
        return {
            suspiciousIPs: Array.from(this.suspiciousIPs),
            userClassifications: Object.fromEntries(this.userClassifications),
            violationCounts: this.violationCounts ? Object.fromEntries(this.violationCounts) : {},
            apiKeyUsage: this.apiKeyUsage ? Object.fromEntries(this.apiKeyUsage) : {},
            totalSuspiciousIPs: this.suspiciousIPs.size
        };
    }
    
    /**
     * Health check for rate limiting system
     */
    healthCheck() {
        return {
            healthy: true,
            suspiciousIPCount: this.suspiciousIPs.size,
            activeViolations: this.violationCounts ? this.violationCounts.size : 0,
            apiKeyUsageActive: this.apiKeyUsage ? this.apiKeyUsage.size : 0
        };
    }
}

module.exports = AdvancedRateLimitingMiddleware;