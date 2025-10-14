/**
 * Advanced Redis Caching Middleware
 * Implements intelligent caching with tier-based TTL and invalidation
 */

const { getRedisCache } = require('./redis-client');
const crypto = require('crypto');

class CacheMiddleware {
    constructor(options = {}) {
        this.cache = getRedisCache(options);
        this.defaultTTL = options.ttl || 300; // 5 minutes
        this.tierTTL = {
            free: 300,      // 5 minutes
            pro: 180,       // 3 minutes
            business: 60,   // 1 minute
            enterprise: 30  // 30 seconds (freshest data)
        };
    }

    /**
     * Generate cache key from request
     */
    generateCacheKey(req, prefix = 'api') {
        const { originalUrl, method, query, params } = req;
        const userId = req.userId || 'anonymous';
        const tier = req.tierInfo?.tier || 'free';
        
        // Create a unique key based on request characteristics
        const keyData = {
            url: originalUrl,
            method,
            query: JSON.stringify(query),
            params: JSON.stringify(params),
            userId: userId,
            tier
        };
        
        const hash = crypto
            .createHash('md5')
            .update(JSON.stringify(keyData))
            .digest('hex');
        
        return `${prefix}:${method}:${hash}`;
    }

    /**
     * Cache middleware for GET requests
     */
    cacheMiddleware(options = {}) {
        return async (req, res, next) => {
            // Only cache GET requests by default
            if (req.method !== 'GET' && !options.methods?.includes(req.method)) {
                return next();
            }
            
            // Skip cache for certain paths
            if (options.exclude?.some(path => req.path.includes(path))) {
                return next();
            }
            
            const cacheKey = this.generateCacheKey(req, options.prefix);
            const userTier = req.tierInfo?.tier || 'free';
            
            try {
                // Check cache
                const cached = await this.cache.get(cacheKey);
                
                if (cached) {
                    // Add cache headers
                    res.set('X-Cache', 'HIT');
                    res.set('X-Cache-Key', cacheKey);
                    res.set('X-Cache-TTL', this.tierTTL[userTier]);
                    
                    // Send cached response
                    return res.json(cached);
                }
                
                // Cache MISS - continue to handler
                res.set('X-Cache', 'MISS');
                
                // Store original res.json
                const originalJson = res.json.bind(res);
                
                // Override res.json to cache the response
                res.json = (data) => {
                    // Cache the response with tier-specific TTL
                    const ttl = options.ttl || this.tierTTL[userTier] || this.defaultTTL;
                    
                    this.cache.set(cacheKey, data, ttl).catch(err => {
                        console.error('Cache set error:', err);
                    });
                    
                    // Add cache headers
                    res.set('X-Cache-TTL', ttl);
                    
                    // Send response
                    return originalJson(data);
                };
                
                next();
                
            } catch (error) {
                console.error('Cache middleware error:', error);
                // Continue without cache on error
                next();
            }
        };
    }

    /**
     * Invalidation middleware for mutations
     */
    invalidationMiddleware(patterns = []) {
        return async (req, res, next) => {
            // Only invalidate on mutations
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                return next();
            }
            
            // Store original res.json
            const originalJson = res.json.bind(res);
            
            // Override res.json to invalidate cache after successful mutation
            res.json = async (data) => {
                // Only invalidate on success
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    await this.invalidatePatterns(patterns, req);
                }
                
                return originalJson(data);
            };
            
            next();
        };
    }

    /**
     * Invalidate cache patterns
     */
    async invalidatePatterns(patterns, req) {
        for (const pattern of patterns) {
            try {
                const resolvedPattern = this.resolvePattern(pattern, req);
                await this.cache.flush(resolvedPattern);
                console.log(`Cache invalidated: ${resolvedPattern}`);
            } catch (error) {
                console.error(`Failed to invalidate pattern ${pattern}:`, error);
            }
        }
    }

    /**
     * Resolve pattern with request data
     */
    resolvePattern(pattern, req) {
        return pattern
            .replace(':userId', req.userId || '*')
            .replace(':id', req.params.id || '*')
            .replace(':category', req.params.category || '*');
    }

    /**
     * Rate limiting with Redis
     */
    rateLimitMiddleware(options = {}) {
        const limits = options.limits || {
            free: 60,        // 60 requests per minute
            pro: 300,        // 300 requests per minute
            business: 600,   // 600 requests per minute
            enterprise: 1200 // 1200 requests per minute
        };
        
        return async (req, res, next) => {
            const userId = req.userId || req.ip;
            const userTier = req.tierInfo?.tier || 'free';
            const limit = limits[userTier];
            const window = options.window || 60; // 1 minute default
            
            const identifier = `${userId}:${req.path}`;
            
            try {
                const result = await this.cache.checkRateLimit(identifier, limit, window);
                
                // Set rate limit headers
                res.set('X-RateLimit-Limit', limit.toString());
                res.set('X-RateLimit-Remaining', result.remaining.toString());
                res.set('X-RateLimit-Reset', new Date(Date.now() + result.resetIn * 1000).toISOString());
                
                if (!result.allowed) {
                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        limit,
                        remaining: 0,
                        resetIn: result.resetIn,
                        tier: userTier,
                        upgradeUrl: '/upgrade'
                    });
                }
                
                next();
                
            } catch (error) {
                console.error('Rate limit error:', error);
                // Continue on error
                next();
            }
        };
    }

    /**
     * Query result caching decorator
     */
    async cacheQuery(key, queryFn, ttl = null) {
        return await this.cache.cached(key, queryFn, ttl);
    }

    /**
     * Batch cache operations
     */
    async batchGet(keys) {
        const results = {};
        const promises = keys.map(async key => {
            results[key] = await this.cache.get(key);
        });
        await Promise.all(promises);
        return results;
    }

    async batchSet(entries, ttl = null) {
        const promises = Object.entries(entries).map(([key, value]) => 
            this.cache.set(key, value, ttl)
        );
        await Promise.all(promises);
    }

    /**
     * Cache warming for frequently accessed data
     */
    async warmCache(warmupFunctions) {
        console.log('🔥 Warming cache...');
        
        for (const { key, fn, ttl } of warmupFunctions) {
            try {
                const data = await fn();
                await this.cache.set(key, data, ttl);
                console.log(`✅ Warmed: ${key}`);
            } catch (error) {
                console.error(`❌ Failed to warm ${key}:`, error);
            }
        }
        
        console.log('✅ Cache warming complete');
    }

    /**
     * Cache statistics
     */
    async getStats() {
        // This would need Redis INFO command or custom tracking
        return {
            hits: 0,  // Would need to track
            misses: 0, // Would need to track
            hitRate: 0,
            keys: 0,
            memory: 0
        };
    }
}

/**
 * Express middleware factory
 */
function createCacheMiddleware(options = {}) {
    const middleware = new CacheMiddleware(options);
    
    return {
        cache: middleware.cacheMiddleware.bind(middleware),
        invalidate: middleware.invalidationMiddleware.bind(middleware),
        rateLimit: middleware.rateLimitMiddleware.bind(middleware),
        warmup: middleware.warmCache.bind(middleware),
        instance: middleware
    };
}

module.exports = {
    CacheMiddleware,
    createCacheMiddleware
};