/**
 * Redis Cache Service
 * Production-grade caching service with performance monitoring
 */

const redis = require('redis');
const redisConfig = require('../config/redis.config');

class RedisCacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      totalRequests: 0,
      averageResponseTime: 0,
      lastResetTime: new Date()
    };
    
    // Initialize connection
    this.connect();
  }
  
  async connect() {
    if (!redisConfig.FEATURES.CACHE_ENABLED) {
      console.log('📦 Redis caching disabled via configuration');
      return;
    }
    
    try {
      const connectionOptions = {
        socket: {
          host: redisConfig.REDIS_HOST,
          port: redisConfig.REDIS_PORT,
          connectTimeout: redisConfig.REDIS_CONNECT_TIMEOUT,
          commandTimeout: redisConfig.REDIS_COMMAND_TIMEOUT,
        },
        database: redisConfig.REDIS_DB,
        retryStrategy: (retries) => {
          if (retries > redisConfig.REDIS_MAX_RETRIES) {
            console.error('❌ Redis connection failed after max retries');
            return null;
          }
          return Math.min(retries * redisConfig.REDIS_RETRY_DELAY, 3000);
        }
      };
      
      if (redisConfig.REDIS_PASSWORD) {
        connectionOptions.password = redisConfig.REDIS_PASSWORD;
      }
      
      this.client = redis.createClient(connectionOptions);
      
      this.client.on('connect', () => {
        console.log('🔗 Connecting to Redis...');
      });
      
      this.client.on('ready', () => {
        this.isConnected = true;
        console.log('✅ Redis cache service ready');
      });
      
      this.client.on('error', (err) => {
        console.error('❌ Redis connection error:', err.message);
        this.isConnected = false;
        this.metrics.errors++;
      });
      
      this.client.on('end', () => {
        console.log('🔚 Redis connection closed');
        this.isConnected = false;
      });
      
      await this.client.connect();
      
    } catch (error) {
      console.error('❌ Redis initialization failed:', error.message);
      this.isConnected = false;
    }
  }
  
  async get(key) {
    if (!this.isConnected || !redisConfig.FEATURES.CACHE_ENABLED) {
      this.metrics.misses++;
      return null;
    }
    
    const startTime = performance.now();
    
    try {
      this.metrics.totalRequests++;
      
      const value = await this.client.get(key);
      const duration = performance.now() - startTime;
      
      this.updateAverageResponseTime(duration);
      
      if (value !== null) {
        this.metrics.hits++;
        return redisConfig.FEATURES.CACHE_COMPRESSION ? 
          JSON.parse(value) : 
          JSON.parse(value);
      } else {
        this.metrics.misses++;
        return null;
      }
      
    } catch (error) {
      console.error('Redis GET error:', error.message);
      this.metrics.errors++;
      this.metrics.misses++;
      return null;
    }
  }
  
  async set(key, value, ttlSeconds = null) {
    if (!this.isConnected || !redisConfig.FEATURES.CACHE_ENABLED) {
      return false;
    }
    
    try {
      const serializedValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
      
      return true;
      
    } catch (error) {
      console.error('Redis SET error:', error.message);
      this.metrics.errors++;
      return false;
    }
  }
  
  async del(key) {
    if (!this.isConnected || !redisConfig.FEATURES.CACHE_ENABLED) {
      return false;
    }
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error.message);
      this.metrics.errors++;
      return false;
    }
  }
  
  async invalidatePattern(pattern) {
    if (!this.isConnected || !redisConfig.FEATURES.CACHE_ENABLED) {
      return false;
    }
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error('Redis pattern invalidation error:', error.message);
      this.metrics.errors++;
      return false;
    }
  }
  
  generateCacheKey(prefix, params = {}) {
    const baseKey = redisConfig.CACHE_PREFIXES[prefix.toUpperCase()] || `zone:${prefix}`;
    
    if (Object.keys(params).length === 0) {
      return baseKey;
    }
    
    // Sort parameters for consistent key generation
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join(':');
      
    return `${baseKey}:${sortedParams}`;
  }
  
  getCacheHitRate() {
    if (this.metrics.totalRequests === 0) return 0;
    return (this.metrics.hits / this.metrics.totalRequests).toFixed(4);
  }
  
  updateAverageResponseTime(duration) {
    const totalDuration = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1);
    this.metrics.averageResponseTime = (totalDuration + duration) / this.metrics.totalRequests;
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      hitRate: this.getCacheHitRate(),
      isConnected: this.isConnected,
      config: {
        enabled: redisConfig.FEATURES.CACHE_ENABLED,
        compression: redisConfig.FEATURES.CACHE_COMPRESSION,
        host: redisConfig.REDIS_HOST,
        port: redisConfig.REDIS_PORT
      }
    };
  }
  
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      totalRequests: 0,
      averageResponseTime: 0,
      lastResetTime: new Date()
    };
  }
  
  async getMemoryUsage() {
    if (!this.isConnected) return null;
    
    try {
      const info = await this.client.info('memory');
      const memoryLines = info.split('\r\n');
      const memoryUsed = memoryLines
        .find(line => line.startsWith('used_memory:'))
        ?.split(':')[1];
        
      return memoryUsed ? parseInt(memoryUsed) : null;
    } catch (error) {
      console.error('Redis memory usage error:', error.message);
      return null;
    }
  }
  
  async healthCheck() {
    if (!this.isConnected) {
      return { healthy: false, message: 'Redis not connected' };
    }
    
    try {
      const startTime = performance.now();
      await this.client.ping();
      const responseTime = performance.now() - startTime;
      
      const memoryUsage = await this.getMemoryUsage();
      const hitRate = parseFloat(this.getCacheHitRate());
      
      const healthy = responseTime < redisConfig.CACHE_METRICS.SLOW_QUERY_THRESHOLD &&
                     hitRate >= redisConfig.CACHE_METRICS.TARGET_HIT_RATE * 0.5; // 50% of target is warning threshold
      
      return {
        healthy,
        responseTime: Math.round(responseTime * 100) / 100,
        hitRate,
        memoryUsage,
        metrics: this.getMetrics()
      };
      
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }
  
  async close() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log('👋 Redis cache service closed');
    }
  }
}

module.exports = RedisCacheService;