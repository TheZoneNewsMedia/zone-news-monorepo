/**
 * Redis Cache Service with Graceful Degradation
 * Handles Redis connection failures without breaking the API
 */

const redis = require('redis');
const { performance } = require('perf_hooks');

class RedisCacheGracefulService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      totalRequests: 0,
      averageResponseTime: 0,
      lastResetTime: new Date()
    };
    
    // Try to connect but don't fail if Redis is unavailable
    this.initConnection();
  }
  
  async initConnection() {
    try {
      // Don't retry too many times to avoid blocking
      if (this.connectionAttempts >= this.maxConnectionAttempts) {
        console.log('⚠️ Redis disabled after max connection attempts');
        return;
      }
      
      this.connectionAttempts++;
      
      const connectionOptions = {
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          connectTimeout: 3000,
          reconnectStrategy: (retries) => {
            if (retries > 1) {
              // Stop retrying after 1 attempt
              console.log('⚠️ Redis unavailable - operating without cache');
              return false;
            }
            return 1000;
          }
        }
      };
      
      if (process.env.REDIS_PASSWORD) {
        connectionOptions.password = process.env.REDIS_PASSWORD;
      }
      
      this.client = redis.createClient(connectionOptions);
      
      this.client.on('ready', () => {
        this.isConnected = true;
        this.connectionAttempts = 0; // Reset on successful connection
        console.log('✅ Redis cache connected');
      });
      
      this.client.on('error', (err) => {
        // Log once and continue without Redis
        if (this.isConnected) {
          console.log('⚠️ Redis disconnected - continuing without cache');
        }
        this.isConnected = false;
        this.metrics.errors++;
      });
      
      this.client.on('end', () => {
        this.isConnected = false;
      });
      
      // Non-blocking connection attempt
      this.client.connect().catch(err => {
        console.log('⚠️ Redis not available - API will run without caching');
        this.isConnected = false;
      });
      
    } catch (error) {
      // Gracefully handle connection failure
      console.log('⚠️ Redis initialization skipped:', error.message);
      this.isConnected = false;
    }
  }
  
  async get(key) {
    // If Redis is not connected, return null (cache miss)
    if (!this.isConnected || !this.client) {
      this.metrics.misses++;
      return null;
    }
    
    const startTime = performance.now();
    
    try {
      this.metrics.totalRequests++;
      const value = await this.client.get(key);
      const duration = performance.now() - startTime;
      
      this.updateAverageResponseTime(duration);
      
      if (value) {
        this.metrics.hits++;
        return JSON.parse(value);
      } else {
        this.metrics.misses++;
        return null;
      }
    } catch (error) {
      this.metrics.errors++;
      this.metrics.misses++;
      // Don't throw - return null on error
      return null;
    }
  }
  
  async set(key, value, ttl = 300) {
    // If Redis is not connected, silently skip caching
    if (!this.isConnected || !this.client) {
      return false;
    }
    
    const startTime = performance.now();
    
    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
      
      const duration = performance.now() - startTime;
      this.updateAverageResponseTime(duration);
      
      return true;
    } catch (error) {
      this.metrics.errors++;
      // Don't throw - return false on error
      return false;
    }
  }
  
  async delete(key) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      this.metrics.errors++;
      return false;
    }
  }
  
  async flush() {
    if (!this.isConnected || !this.client) {
      return false;
    }
    
    try {
      await this.client.flushDb();
      return true;
    } catch (error) {
      this.metrics.errors++;
      return false;
    }
  }
  
  updateAverageResponseTime(duration) {
    const total = this.metrics.totalRequests;
    const currentAvg = this.metrics.averageResponseTime;
    this.metrics.averageResponseTime = ((currentAvg * (total - 1)) + duration) / total;
  }
  
  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;
    
    return {
      ...this.metrics,
      hitRate: Math.round(hitRate * 100) / 100,
      isConnected: this.isConnected,
      status: this.isConnected ? 'connected' : 'disconnected'
    };
  }
  
  async healthCheck() {
    if (!this.isConnected || !this.client) {
      return { 
        status: 'degraded', 
        message: 'Redis unavailable - running without cache',
        operational: true 
      };
    }
    
    try {
      await this.client.ping();
      return { 
        status: 'healthy', 
        message: 'Redis cache operational',
        metrics: this.getMetrics() 
      };
    } catch (error) {
      return { 
        status: 'degraded', 
        message: 'Redis connection issue - running without cache',
        operational: true 
      };
    }
  }
  
  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
      } catch (error) {
        // Silent disconnect
      }
    }
    this.isConnected = false;
  }
}

module.exports = RedisCacheGracefulService;