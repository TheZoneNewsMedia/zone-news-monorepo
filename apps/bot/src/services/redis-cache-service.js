/**
 * Redis Cache Service for Zone News Bot
 * Production-grade caching service to replace Map-based caching
 * Handles connection management, fallback strategies, and performance optimization
 */

const Redis = require('ioredis');

class RedisCacheService {
    constructor(config = {}) {
        this.config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB) || 0,
            connectTimeout: 5000,
            commandTimeout: 3000,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
            ...config
        };
        
        this.redis = null;
        this.isConnected = false;
        this.fallbackCache = new Map(); // Fallback for when Redis is unavailable
        this.useFallback = false;
        
        this.initialize();
    }
    
    async initialize() {
        try {
            console.log('🔄 Initializing Redis cache service...');
            
            this.redis = new Redis(this.config);
            
            this.redis.on('connect', () => {
                console.log('✅ Redis connected successfully');
                this.isConnected = true;
                this.useFallback = false;
            });
            
            this.redis.on('error', (error) => {
                console.warn('⚠️ Redis connection error:', error.message);
                this.isConnected = false;
                this.useFallback = true;
                
                // Don't log full error details to avoid log spam
                if (error.code !== 'ECONNREFUSED') {
                    console.error('Redis error details:', error);
                }
            });
            
            this.redis.on('close', () => {
                console.log('🔒 Redis connection closed');
                this.isConnected = false;
                this.useFallback = true;
            });
            
            this.redis.on('reconnecting', () => {
                console.log('🔄 Redis reconnecting...');
            });
            
            // Test connection
            await this.redis.ping();
            console.log('✅ Redis cache service initialized');
            
        } catch (error) {
            console.warn('⚠️ Redis initialization failed, using fallback cache:', error.message);
            this.useFallback = true;
        }
    }
    
    /**
     * Set a value in cache with optional TTL (Time To Live)
     * @param {string} key - Cache key
     * @param {any} value - Value to cache (will be JSON stringified)
     * @param {number} ttl - TTL in seconds (optional)
     * @returns {Promise<boolean>} Success status
     */
    async set(key, value, ttl = null) {
        try {
            const serialized = JSON.stringify(value);
            
            if (this.useFallback) {
                this.fallbackCache.set(key, {
                    value: serialized,
                    expires: ttl ? Date.now() + (ttl * 1000) : null
                });
                return true;
            }
            
            if (ttl) {
                await this.redis.setex(key, ttl, serialized);
            } else {
                await this.redis.set(key, serialized);
            }
            
            return true;
        } catch (error) {
            console.error('Cache set error:', error);
            return false;
        }
    }
    
    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @returns {Promise<any|null>} Cached value or null if not found
     */
    async get(key) {
        try {
            if (this.useFallback) {
                const cached = this.fallbackCache.get(key);
                if (!cached) return null;
                
                // Check if expired
                if (cached.expires && Date.now() > cached.expires) {
                    this.fallbackCache.delete(key);
                    return null;
                }
                
                return JSON.parse(cached.value);
            }
            
            const value = await this.redis.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    }
    
    /**
     * Delete a key from cache
     * @param {string} key - Cache key
     * @returns {Promise<boolean>} Success status
     */
    async del(key) {
        try {
            if (this.useFallback) {
                return this.fallbackCache.delete(key);
            }
            
            const result = await this.redis.del(key);
            return result > 0;
        } catch (error) {
            console.error('Cache delete error:', error);
            return false;
        }
    }
    
    /**
     * Check if a key exists in cache
     * @param {string} key - Cache key
     * @returns {Promise<boolean>} True if key exists
     */
    async exists(key) {
        try {
            if (this.useFallback) {
                const cached = this.fallbackCache.get(key);
                if (!cached) return false;
                
                // Check if expired
                if (cached.expires && Date.now() > cached.expires) {
                    this.fallbackCache.delete(key);
                    return false;
                }
                
                return true;
            }
            
            const result = await this.redis.exists(key);
            return result === 1;
        } catch (error) {
            console.error('Cache exists error:', error);
            return false;
        }
    }
    
    /**
     * Set multiple key-value pairs
     * @param {Object} keyValuePairs - Object with key-value pairs
     * @param {number} ttl - TTL in seconds (optional)
     * @returns {Promise<boolean>} Success status
     */
    async mset(keyValuePairs, ttl = null) {
        try {
            if (this.useFallback) {
                for (const [key, value] of Object.entries(keyValuePairs)) {
                    await this.set(key, value, ttl);
                }
                return true;
            }
            
            const pipeline = this.redis.pipeline();
            
            for (const [key, value] of Object.entries(keyValuePairs)) {
                const serialized = JSON.stringify(value);
                if (ttl) {
                    pipeline.setex(key, ttl, serialized);
                } else {
                    pipeline.set(key, serialized);
                }
            }
            
            await pipeline.exec();
            return true;
        } catch (error) {
            console.error('Cache mset error:', error);
            return false;
        }
    }
    
    /**
     * Get multiple values by keys
     * @param {string[]} keys - Array of cache keys
     * @returns {Promise<Object>} Object with key-value pairs
     */
    async mget(keys) {
        try {
            const result = {};
            
            if (this.useFallback) {
                for (const key of keys) {
                    result[key] = await this.get(key);
                }
                return result;
            }
            
            const values = await this.redis.mget(keys);
            
            keys.forEach((key, index) => {
                result[key] = values[index] ? JSON.parse(values[index]) : null;
            });
            
            return result;
        } catch (error) {
            console.error('Cache mget error:', error);
            return {};
        }
    }
    
    /**
     * Clear all cache entries
     * @returns {Promise<boolean>} Success status
     */
    async clear() {
        try {
            if (this.useFallback) {
                this.fallbackCache.clear();
                return true;
            }
            
            await this.redis.flushdb();
            return true;
        } catch (error) {
            console.error('Cache clear error:', error);
            return false;
        }
    }
    
    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache stats
     */
    async getStats() {
        try {
            if (this.useFallback) {
                return {
                    type: 'memory',
                    connected: false,
                    keyCount: this.fallbackCache.size,
                    memoryUsage: this.fallbackCache.size * 100 // Rough estimate
                };
            }
            
            const info = await this.redis.info('memory');
            const keyCount = await this.redis.dbsize();
            
            return {
                type: 'redis',
                connected: this.isConnected,
                keyCount,
                info: info.split('\r\n').reduce((acc, line) => {
                    const [key, value] = line.split(':');
                    if (key && value) acc[key] = value;
                    return acc;
                }, {})
            };
        } catch (error) {
            console.error('Cache stats error:', error);
            return { error: error.message };
        }
    }
    
    /**
     * Close Redis connection
     */
    async close() {
        try {
            if (this.redis && !this.useFallback) {
                await this.redis.quit();
            }
            console.log('✅ Redis cache service closed');
        } catch (error) {
            console.error('Error closing Redis connection:', error);
        }
    }
    
    /**
     * Health check for monitoring
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        try {
            if (this.useFallback) {
                return {
                    status: 'degraded',
                    type: 'memory_fallback',
                    message: 'Using memory fallback cache'
                };
            }
            
            const start = Date.now();
            await this.redis.ping();
            const latency = Date.now() - start;
            
            return {
                status: 'healthy',
                type: 'redis',
                latency,
                connected: this.isConnected
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                type: 'redis',
                error: error.message
            };
        }
    }
}

// Singleton instance
let cacheInstance = null;

/**
 * Get the cache service instance
 * @returns {RedisCacheService} Cache service instance
 */
function getCacheService() {
    if (!cacheInstance) {
        cacheInstance = new RedisCacheService();
    }
    return cacheInstance;
}

module.exports = {
    RedisCacheService,
    getCacheService
};