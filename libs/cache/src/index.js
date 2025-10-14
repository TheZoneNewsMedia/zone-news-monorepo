const Redis = require('ioredis');

class RedisCache {
    constructor() {
        this.client = new Redis({
            host: '127.0.0.1',
            port: 6379,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });
        
        this.client.on('connect', () => {
            console.log('✅ Redis cache connected');
        });
        
        this.client.on('error', (err) => {
            console.error('Redis error:', err);
        });
    }
    
    async get(key) {
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    }
    
    async set(key, value, ttl = 3600) {
        try {
            await this.client.setex(key, ttl, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Cache set error:', error);
            return false;
        }
    }
    
    async del(key) {
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('Cache delete error:', error);
            return false;
        }
    }
    
    async cacheArticle(articleId, article) {
        return await this.set(`article:${articleId}`, article, 7200);
    }
    
    async getCachedArticle(articleId) {
        return await this.get(`article:${articleId}`);
    }
    
    async cacheUser(userId, userData) {
        return await this.set(`user:${userId}`, userData, 3600);
    }
    
    async getCachedUser(userId) {
        return await this.get(`user:${userId}`);
    }
}

module.exports = new RedisCache();
