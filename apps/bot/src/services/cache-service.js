/**
 * Redis Cache Service
 * Production-ready caching with automatic fallback and TTL management
 */

const redis = require('redis');

class CacheService {
    constructor(config = {}) {
        this.connected = false;
        this.client = null;
        this.fallbackCache = new Map(); // In-memory fallback
        this.stats = {
            hits: 0,
            misses: 0,
            errors: 0
        };
        
        // TTL configurations (in seconds)
        this.ttl = {
            user_stats: config.userStatsTTL || 300,        // 5 minutes
            articles: config.articlesTTL || 600,           // 10 minutes  
            search_results: config.searchTTL || 180,       // 3 minutes
            reactions: config.reactionsTTL || 120,         // 2 minutes
            analytics: config.analyticsTTL || 900,         // 15 minutes
            default: config.defaultTTL || 300              // 5 minutes
        };
        
        this.maxRetries = config.maxRetries || 3;
        this.retryDelay = config.retryDelay || 1000;
        
        this.init();
    }
    
    async init() {
        try {
            // Redis connection string from env
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            
            this.client = redis.createClient({
                url: redisUrl,
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > this.maxRetries) {
                            console.error('Redis: Max reconnection attempts reached');
                            return false;
                        }
                        return Math.min(retries * 100, 3000);
                    }
                }
            });
            
            // Event handlers
            this.client.on('connect', () => {
                console.log('✅ Redis Cache connected');
                this.connected = true;
            });
            
            this.client.on('error', (err) => {
                console.error('Redis Cache error:', err);
                this.connected = false;
                this.stats.errors++;
            });
            
            this.client.on('reconnecting', () => {
                console.log('Redis Cache reconnecting...');
            });
            
            // Connect
            await this.client.connect();
            
            // Test connection
            await this.client.ping();
            this.connected = true;
            console.log('✅ Redis Cache Service initialized');
            
        } catch (error) {
            console.error('Failed to initialize Redis:', error);
            console.log('⚠️ Using in-memory fallback cache');
            this.connected = false;
        }
    }
    
    /**
     * Get value from cache with automatic fallback
     */
    async get(key, options = {}) {
        const startTime = Date.now();
        
        try {
            if (this.connected && this.client) {
                const value = await this.client.get(key);
                
                if (value) {
                    this.stats.hits++;
                    this.recordMetrics('cache_hit', Date.now() - startTime);
                    return JSON.parse(value);
                }
            }
            
            // Check fallback cache
            const fallback = this.fallbackCache.get(key);
            if (fallback && fallback.expires > Date.now()) {
                this.stats.hits++;
                return fallback.value;
            }
            
            this.stats.misses++;
            this.recordMetrics('cache_miss', Date.now() - startTime);
            return null;
            
        } catch (error) {
            console.error(`Cache get error for key ${key}:`, error);
            this.stats.errors++;
            
            // Try fallback
            const fallback = this.fallbackCache.get(key);
            return fallback?.value || null;
        }
    }
    
    /**
     * Set value in cache with TTL
     */
    async set(key, value, ttl = null) {
        try {
            const serialized = JSON.stringify(value);
            const expiry = ttl || this.ttl.default;
            
            if (this.connected && this.client) {
                await this.client.setEx(key, expiry, serialized);
            }
            
            // Always set in fallback cache
            this.fallbackCache.set(key, {
                value: value,
                expires: Date.now() + (expiry * 1000)
            });
            
            // Prevent fallback cache from growing too large
            if (this.fallbackCache.size > 1000) {
                this.cleanupFallbackCache();
            }
            
            return true;
        } catch (error) {
            console.error(`Cache set error for key ${key}:`, error);
            this.stats.errors++;
            
            // At least store in fallback
            this.fallbackCache.set(key, {
                value: value,
                expires: Date.now() + ((ttl || this.ttl.default) * 1000)
            });
            
            return false;
        }
    }
    
    /**
     * Delete value from cache
     */
    async del(key) {
        try {
            if (this.connected && this.client) {
                await this.client.del(key);
            }
            this.fallbackCache.delete(key);
            return true;
        } catch (error) {
            console.error(`Cache delete error for key ${key}:`, error);
            this.fallbackCache.delete(key);
            return false;
        }
    }
    
    /**
     * Clear all cache entries matching pattern
     */
    async clearPattern(pattern) {
        try {
            if (this.connected && this.client) {
                const keys = await this.client.keys(pattern);
                if (keys.length > 0) {
                    await this.client.del(keys);
                }
            }
            
            // Clear from fallback
            for (const key of this.fallbackCache.keys()) {
                if (key.match(new RegExp(pattern.replace('*', '.*')))) {
                    this.fallbackCache.delete(key);
                }
            }
            
            return true;
        } catch (error) {
            console.error(`Cache clear pattern error for ${pattern}:`, error);
            return false;
        }
    }
    
    /**
     * Cache wrapper for async functions
     */
    async cached(key, fn, ttl = null) {
        // Try to get from cache first
        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }
        
        // Execute function and cache result
        try {
            const result = await fn();
            if (result !== undefined) {
                await this.set(key, result, ttl);
            }
            return result;
        } catch (error) {
            console.error(`Error executing cached function for ${key}:`, error);
            throw error;
        }
    }
    
    /**
     * Batch get multiple keys
     */
    async mget(keys) {
        try {
            if (this.connected && this.client) {
                const values = await this.client.mGet(keys);
                return values.map(v => v ? JSON.parse(v) : null);
            }
            
            // Fallback
            return keys.map(key => {
                const fallback = this.fallbackCache.get(key);
                return fallback && fallback.expires > Date.now() ? fallback.value : null;
            });
        } catch (error) {
            console.error('Cache mget error:', error);
            return keys.map(() => null);
        }
    }
    
    /**
     * Batch set multiple key-value pairs
     */
    async mset(entries, ttl = null) {
        try {
            const expiry = ttl || this.ttl.default;
            
            if (this.connected && this.client) {
                const pipeline = this.client.multi();
                
                for (const [key, value] of entries) {
                    pipeline.setEx(key, expiry, JSON.stringify(value));
                }
                
                await pipeline.exec();
            }
            
            // Set in fallback
            for (const [key, value] of entries) {
                this.fallbackCache.set(key, {
                    value: value,
                    expires: Date.now() + (expiry * 1000)
                });
            }
            
            return true;
        } catch (error) {
            console.error('Cache mset error:', error);
            return false;
        }
    }
    
    /**
     * Clean up expired entries from fallback cache
     */
    cleanupFallbackCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, entry] of this.fallbackCache) {
            if (entry.expires < now) {
                this.fallbackCache.delete(key);
                cleaned++;
            }
        }
        
        console.log(`Cleaned ${cleaned} expired entries from fallback cache`);
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
        
        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            connected: this.connected,
            fallbackSize: this.fallbackCache.size
        };
    }
    
    /**
     * Record metrics (for monitoring)
     */
    recordMetrics(event, duration) {
        // Can be integrated with Prometheus or other monitoring
        if (process.env.NODE_ENV === 'development') {
            console.log(`Cache ${event}: ${duration}ms`);
        }
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            if (this.client) {
                await this.client.quit();
                console.log('Redis Cache connection closed');
            }
        } catch (error) {
            console.error('Error during cache shutdown:', error);
        }
    }
    
    /**
     * Cache key generators
     */
    static keys = {
        userStats: (userId) => `user:stats:${userId}`,
        article: (articleId) => `article:${articleId}`,
        search: (query, page = 1) => `search:${query}:${page}`,
        reactions: (messageId) => `reactions:${messageId}`,
        analytics: (userId, type) => `analytics:${userId}:${type}`,
        session: (userId, sessionType) => `session:${userId}:${sessionType}`,
        drafts: (userId, page = 1) => `drafts:${userId}:${page}`
    };
}

module.exports = CacheService;