const redis = require('redis');
const { promisify } = require('util');

class RedisCache {
    constructor(options = {}) {
        this.client = null;
        this.isConnected = false;
        this.options = {
            host: options.host || process.env.REDIS_HOST || 'localhost',
            port: options.port || process.env.REDIS_PORT || 6379,
            password: options.password || process.env.REDIS_PASSWORD,
            db: options.db || 0,
            keyPrefix: options.keyPrefix || 'zone:',
            ttl: options.ttl || 300, // 5 minutes default
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        };
    }

    async connect() {
        if (this.isConnected) return;

        try {
            this.client = redis.createClient({
                host: this.options.host,
                port: this.options.port,
                password: this.options.password,
                db: this.options.db,
                retry_strategy: this.options.retryStrategy
            });

            // Promisify Redis methods
            this.getAsync = promisify(this.client.get).bind(this.client);
            this.setAsync = promisify(this.client.set).bind(this.client);
            this.delAsync = promisify(this.client.del).bind(this.client);
            this.existsAsync = promisify(this.client.exists).bind(this.client);
            this.expireAsync = promisify(this.client.expire).bind(this.client);
            this.ttlAsync = promisify(this.client.ttl).bind(this.client);
            this.incrAsync = promisify(this.client.incr).bind(this.client);
            this.decrAsync = promisify(this.client.decr).bind(this.client);
            this.hgetAsync = promisify(this.client.hget).bind(this.client);
            this.hsetAsync = promisify(this.client.hset).bind(this.client);
            this.hgetallAsync = promisify(this.client.hgetall).bind(this.client);
            this.zaddAsync = promisify(this.client.zadd).bind(this.client);
            this.zrangeAsync = promisify(this.client.zrange).bind(this.client);
            this.zremAsync = promisify(this.client.zrem).bind(this.client);

            // Handle events
            this.client.on('connect', () => {
                this.isConnected = true;
                console.log('Redis connected');
            });

            this.client.on('error', (err) => {
                console.error('Redis error:', err);
                this.isConnected = false;
            });

            this.client.on('end', () => {
                this.isConnected = false;
                console.log('Redis disconnected');
            });

        } catch (error) {
            console.error('Failed to connect to Redis:', error);
            throw error;
        }
    }

    /**
     * Get a value from cache
     */
    async get(key, options = {}) {
        if (!this.isConnected) await this.connect();
        
        try {
            const fullKey = this.options.keyPrefix + key;
            const value = await this.getAsync(fullKey);
            
            if (value && options.parse !== false) {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }
            
            return value;
        } catch (error) {
            console.error(`Redis GET error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Set a value in cache
     */
    async set(key, value, ttl = null) {
        if (!this.isConnected) await this.connect();
        
        try {
            const fullKey = this.options.keyPrefix + key;
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            const expiry = ttl || this.options.ttl;
            
            if (expiry > 0) {
                await this.setAsync(fullKey, serialized, 'EX', expiry);
            } else {
                await this.setAsync(fullKey, serialized);
            }
            
            return true;
        } catch (error) {
            console.error(`Redis SET error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete a key from cache
     */
    async del(key) {
        if (!this.isConnected) await this.connect();
        
        try {
            const fullKey = this.options.keyPrefix + key;
            const result = await this.delAsync(fullKey);
            return result > 0;
        } catch (error) {
            console.error(`Redis DEL error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Check if key exists
     */
    async exists(key) {
        if (!this.isConnected) await this.connect();
        
        try {
            const fullKey = this.options.keyPrefix + key;
            const result = await this.existsAsync(fullKey);
            return result === 1;
        } catch (error) {
            console.error(`Redis EXISTS error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Increment a counter
     */
    async incr(key, ttl = null) {
        if (!this.isConnected) await this.connect();
        
        try {
            const fullKey = this.options.keyPrefix + key;
            const value = await this.incrAsync(fullKey);
            
            if (ttl) {
                await this.expireAsync(fullKey, ttl);
            }
            
            return value;
        } catch (error) {
            console.error(`Redis INCR error for key ${key}:`, error);
            return 0;
        }
    }

    /**
     * Rate limiting helper
     */
    async checkRateLimit(identifier, limit, window = 60) {
        if (!this.isConnected) await this.connect();
        
        const key = `ratelimit:${identifier}`;
        const current = await this.incr(key, window);
        
        return {
            allowed: current <= limit,
            current,
            limit,
            remaining: Math.max(0, limit - current),
            resetIn: await this.ttlAsync(this.options.keyPrefix + key)
        };
    }

    /**
     * Cache with automatic fetch
     */
    async cached(key, fetchFn, ttl = null) {
        // Try to get from cache
        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }
        
        // Fetch fresh data
        const fresh = await fetchFn();
        
        // Store in cache
        if (fresh !== null && fresh !== undefined) {
            await this.set(key, fresh, ttl);
        }
        
        return fresh;
    }

    /**
     * Store user session
     */
    async setSession(sessionId, data, ttl = 3600) {
        const key = `session:${sessionId}`;
        return await this.set(key, data, ttl);
    }

    /**
     * Get user session
     */
    async getSession(sessionId) {
        const key = `session:${sessionId}`;
        return await this.get(key);
    }

    /**
     * Clear all keys with prefix
     */
    async flush(pattern = '*') {
        if (!this.isConnected) await this.connect();
        
        return new Promise((resolve, reject) => {
            const stream = this.client.scanStream({
                match: this.options.keyPrefix + pattern
            });
            
            stream.on('data', (keys) => {
                if (keys.length) {
                    const pipeline = this.client.pipeline();
                    keys.forEach(key => pipeline.del(key));
                    pipeline.exec();
                }
            });
            
            stream.on('end', resolve);
            stream.on('error', reject);
        });
    }

    /**
     * Close Redis connection
     */
    async disconnect() {
        if (this.client) {
            this.client.quit();
            this.isConnected = false;
        }
    }
}

// Singleton instance
let instance = null;

/**
 * Get Redis cache instance
 */
function getRedisCache(options) {
    if (!instance) {
        instance = new RedisCache(options);
    }
    return instance;
}

module.exports = {
    RedisCache,
    getRedisCache
};