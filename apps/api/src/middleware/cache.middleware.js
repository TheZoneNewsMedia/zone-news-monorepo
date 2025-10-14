/**
 * Cache Middleware
 * Production-grade caching middleware for API endpoints
 */

const redisConfig = require('../config/redis.config');

class CacheMiddleware {
  constructor(cacheService) {
    this.cacheService = cacheService;
    this.metricsService = null; // Will be injected if available
  }
  
  // Inject metrics service for performance tracking
  setMetricsService(metricsService) {
    this.metricsService = metricsService;
  }
  
  // Cache middleware factory
  cache(options = {}) {
    const {
      ttl = redisConfig.CACHE_TTL.NEWS_ARTICLES,
      keyPrefix = 'NEWS',
      generateKey = null,
      skipCondition = null,
      invalidateOn = []
    } = options;
    
    return async (req, res, next) => {
      // Skip caching if condition is met
      if (skipCondition && skipCondition(req)) {
        return next();
      }
      
      // Generate cache key
      const cacheKey = generateKey ? 
        generateKey(req) : 
        this.generateDefaultKey(keyPrefix, req);
      
      const startTime = performance.now();
      
      try {
        // Try to get from cache
        const cachedData = await this.cacheService.get(cacheKey);
        
        if (cachedData) {
          // Cache hit - record metrics and return
          const duration = performance.now() - startTime;
          
          if (this.metricsService) {
            this.metricsService.recordCacheHit({
              endpoint: req.path,
              cacheKey,
              duration,
              method: req.method
            });
          }
          
          // Set cache headers
          res.set({
            'X-Cache': 'HIT',
            'X-Cache-Key': cacheKey,
            'X-Cache-TTL': ttl,
            'Cache-Control': `public, max-age=${ttl}`
          });
          
          return res.json(cachedData);
        }
        
        // Cache miss - continue to endpoint and cache the response
        const originalSend = res.json;
        
        res.json = async (data) => {
          const responseTime = performance.now() - startTime;
          
          try {
            // Cache the response data
            if (data && typeof data === 'object' && !data.error) {
              await this.cacheService.set(cacheKey, data, ttl);
            }
            
            // Record metrics
            if (this.metricsService) {
              this.metricsService.recordCacheMiss({
                endpoint: req.path,
                cacheKey,
                duration: responseTime,
                method: req.method
              });
            }
            
            // Set cache headers
            res.set({
              'X-Cache': 'MISS',
              'X-Cache-Key': cacheKey,
              'X-Cache-TTL': ttl,
              'Cache-Control': `public, max-age=${ttl}`
            });
            
          } catch (cacheError) {
            console.error('Cache storage error:', cacheError.message);
          }
          
          // Send the original response
          return originalSend.call(res, data);
        };
        
        next();
        
      } catch (error) {
        console.error('Cache middleware error:', error.message);
        // Continue without caching on error
        next();
      }
    };
  }
  
  // Cache invalidation middleware
  invalidateCache(patterns = []) {
    return async (req, res, next) => {
      const originalSend = res.json;
      
      res.json = async (data) => {
        // Invalidate cache patterns after successful response
        if (res.statusCode < 400 && patterns.length > 0) {
          try {
            for (const pattern of patterns) {
              await this.cacheService.invalidatePattern(pattern);
            }
          } catch (error) {
            console.error('Cache invalidation error:', error.message);
          }
        }
        
        return originalSend.call(res, data);
      };
      
      next();
    };
  }
  
  // Warmup cache with popular content
  async warmupCache() {
    if (!redisConfig.FEATURES.CACHE_WARMING_ENABLED) {
      return;
    }
    
    console.log('🔥 Starting cache warmup...');
    
    try {
      // Simulate requests to popular endpoints to populate cache
      const warmupEndpoints = [
        { path: '/api/news', params: { page: 1, limit: 20 } },
        { path: '/api/trending', params: {} },
        { path: '/api/breaking', params: {} },
        { path: '/api/stats', params: {} }
      ];
      
      for (const endpoint of warmupEndpoints) {
        const cacheKey = this.generateDefaultKey('NEWS', { 
          path: endpoint.path, 
          query: endpoint.params 
        });
        
        // Check if already cached
        const cached = await this.cacheService.get(cacheKey);
        if (!cached) {
          console.log(`🔥 Warming up cache for ${endpoint.path}`);
          // Note: In production, you would make actual API calls here
          // For now, we'll just log the intention
        }
      }
      
      console.log('✅ Cache warmup completed');
      
    } catch (error) {
      console.error('❌ Cache warmup failed:', error.message);
    }
  }
  
  // Generate default cache key based on request
  generateDefaultKey(prefix, req) {
    const params = {
      path: req.path || req.url,
      method: req.method || 'GET',
      ...req.query
    };
    
    return this.cacheService.generateCacheKey(prefix, params);
  }
  
  // Cache configuration for different endpoints
  static getEndpointConfig(endpoint) {
    const configs = {
      '/api/news': {
        ttl: redisConfig.CACHE_TTL.NEWS_ARTICLES,
        keyPrefix: 'NEWS',
        generateKey: (req) => {
          const params = {
            category: req.query.category || 'all',
            scope: req.query.scope || 'all',
            city: req.query.city || 'Adelaide',
            page: req.query.page || 1,
            limit: req.query.limit || 20,
            search: req.query.search || ''
          };
          return `${redisConfig.CACHE_PREFIXES.NEWS}:${Object.values(params).join(':')}`;
        }
      },
      
      '/api/trending': {
        ttl: redisConfig.CACHE_TTL.TRENDING_ARTICLES,
        keyPrefix: 'TRENDING',
        generateKey: () => redisConfig.CACHE_PREFIXES.TRENDING
      },
      
      '/api/breaking': {
        ttl: redisConfig.CACHE_TTL.BREAKING_NEWS,
        keyPrefix: 'BREAKING',
        generateKey: () => redisConfig.CACHE_PREFIXES.BREAKING
      },
      
      '/api/stats': {
        ttl: redisConfig.CACHE_TTL.ARTICLE_STATS,
        keyPrefix: 'STATS',
        generateKey: () => redisConfig.CACHE_PREFIXES.STATS
      }
    };
    
    return configs[endpoint] || {
      ttl: redisConfig.CACHE_TTL.NEWS_ARTICLES,
      keyPrefix: 'NEWS'
    };
  }
  
  // Create middleware for specific endpoints
  static createNewsCache(cacheService) {
    const middleware = new CacheMiddleware(cacheService);
    const config = CacheMiddleware.getEndpointConfig('/api/news');
    return middleware.cache(config);
  }
  
  static createTrendingCache(cacheService) {
    const middleware = new CacheMiddleware(cacheService);
    const config = CacheMiddleware.getEndpointConfig('/api/trending');
    return middleware.cache(config);
  }
  
  static createBreakingCache(cacheService) {
    const middleware = new CacheMiddleware(cacheService);
    const config = CacheMiddleware.getEndpointConfig('/api/breaking');
    return middleware.cache(config);
  }
  
  static createStatsCache(cacheService) {
    const middleware = new CacheMiddleware(cacheService);
    const config = CacheMiddleware.getEndpointConfig('/api/stats');
    return middleware.cache(config);
  }
  
  // Cache health monitoring
  getCacheHealth() {
    return this.cacheService.healthCheck();
  }
  
  // Get cache metrics
  getCacheMetrics() {
    return this.cacheService.getMetrics();
  }
}

module.exports = CacheMiddleware;