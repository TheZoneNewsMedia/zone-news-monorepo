/**
 * Advanced Cache Invalidation Service
 * Granular cache invalidation with dependency tracking and cascade management
 * Ensures cache consistency while minimizing performance impact
 */

const OptimizedKeyManager = require('./optimized-key-manager.service');

class AdvancedCacheInvalidationService {
  constructor(cacheService, keyManager = null) {
    this.cacheService = cacheService;
    this.keyManager = keyManager || new OptimizedKeyManager();
    
    // Dependency tracking sets
    this.dependencyPrefix = 'zdep'; // zone:dependency
    this.articleDependencies = new Map(); // In-memory tracking for performance
    
    this.metrics = {
      invalidationEvents: 0,
      dependenciesTracked: 0,
      cascadeInvalidations: 0,
      lastInvalidation: null,
      averageInvalidationTime: 0
    };
    
    // Invalidation strategies
    this.strategies = {
      IMMEDIATE: 'immediate',     // Invalidate immediately
      BATCH: 'batch',            // Batch invalidations
      LAZY: 'lazy',              // Invalidate on next access
      CASCADE: 'cascade'         // Cascade to dependent caches
    };
    
    this.batchQueue = [];
    this.batchInterval = 5000; // Process batch every 5 seconds
    this.setupBatchProcessor();
  }

  /**
   * Track dependencies when caching data
   */
  async trackDependencies(cacheKey, dependencies = []) {
    const startTime = performance.now();
    
    try {
      // Store dependencies in Redis set
      const depKey = `${this.dependencyPrefix}:${cacheKey}`;
      
      if (dependencies.length > 0) {
        await this.cacheService.client.sAdd(depKey, dependencies);
        await this.cacheService.client.expire(depKey, 86400); // 24 hour TTL for dependencies
        
        // Track reverse dependencies for cascade invalidation
        for (const dep of dependencies) {
          const reverseDep = `${this.dependencyPrefix}:rev:${dep}`;
          await this.cacheService.client.sAdd(reverseDep, cacheKey);
          await this.cacheService.client.expire(reverseDep, 86400);
        }
        
        this.metrics.dependenciesTracked += dependencies.length;
      }
      
      // Store in memory for fast access
      this.articleDependencies.set(cacheKey, dependencies);
      
      const duration = performance.now() - startTime;
      this.updateMetrics('trackDependencies', duration);
      
      return true;
      
    } catch (error) {
      console.error('Error tracking dependencies:', error.message);
      return false;
    }
  }

  /**
   * Invalidate article cache when article is updated
   */
  async invalidateArticle(articleId, strategy = this.strategies.CASCADE) {
    const startTime = performance.now();
    
    try {
      const articleKey = this.keyManager.generateArticleKey(articleId);
      
      // Get article data to determine broader invalidation scope
      const article = await this.getArticleFromCache(articleId);
      
      const invalidationTasks = [];
      
      // 1. Invalidate the specific article
      invalidationTasks.push(this.invalidateKey(articleKey));
      
      // 2. Invalidate related query caches
      if (article) {
        const relatedKeys = this.generateRelatedKeys(article);
        invalidationTasks.push(...relatedKeys.map(key => this.invalidateKey(key)));
      }
      
      // 3. Invalidate category-based caches
      if (article?.category) {
        const categoryKey = this.keyManager.generateCategoryKey(article.category);
        invalidationTasks.push(this.invalidateKey(categoryKey));
      }
      
      // 4. Invalidate aggregate caches
      invalidationTasks.push(
        this.invalidateKey(this.keyManager.generateStatsKey()),
        this.invalidateKey(this.keyManager.generateTrendingKey()),
        this.invalidateKey(this.keyManager.generateBreakingKey())
      );
      
      // Execute invalidation based on strategy
      if (strategy === this.strategies.IMMEDIATE) {
        await Promise.all(invalidationTasks);
      } else if (strategy === this.strategies.BATCH) {
        this.batchQueue.push(...invalidationTasks);
      }
      
      const duration = performance.now() - startTime;
      this.updateMetrics('invalidateArticle', duration);
      
      return true;
      
    } catch (error) {
      console.error('Error invalidating article:', error.message);
      return false;
    }
  }

  /**
   * Invalidate category-based caches
   */
  async invalidateCategory(category, strategy = this.strategies.CASCADE) {
    const startTime = performance.now();
    
    try {
      const invalidationTasks = [];
      
      // Invalidate category-specific cache
      const categoryKey = this.keyManager.generateCategoryKey(category);
      invalidationTasks.push(this.invalidateKey(categoryKey));
      
      // Invalidate news queries that include this category
      const queryPattern = this.keyManager.generateInvalidationPattern('NEWS_QUERY', `*${category}*`);
      invalidationTasks.push(this.invalidatePattern(queryPattern));
      
      // Invalidate statistics
      invalidationTasks.push(this.invalidateKey(this.keyManager.generateStatsKey()));
      
      // Execute based on strategy
      if (strategy === this.strategies.IMMEDIATE) {
        await Promise.all(invalidationTasks);
      } else if (strategy === this.strategies.BATCH) {
        this.batchQueue.push(...invalidationTasks);
      }
      
      const duration = performance.now() - startTime;
      this.updateMetrics('invalidateCategory', duration);
      
      return true;
      
    } catch (error) {
      console.error('Error invalidating category:', error.message);
      return false;
    }
  }

  /**
   * Invalidate time-sensitive caches (breaking news, trending)
   */
  async invalidateTimeSensitive(type = 'breaking') {
    const startTime = performance.now();
    
    try {
      const invalidationTasks = [];
      
      if (type === 'breaking') {
        // Invalidate all breaking news caches
        const breakingPattern = this.keyManager.generateInvalidationPattern('BREAKING', '*');
        invalidationTasks.push(this.invalidatePattern(breakingPattern));
      } else if (type === 'trending') {
        // Invalidate trending caches
        const trendingPattern = this.keyManager.generateInvalidationPattern('TRENDING', '*');
        invalidationTasks.push(this.invalidatePattern(trendingPattern));
      }
      
      await Promise.all(invalidationTasks);
      
      const duration = performance.now() - startTime;
      this.updateMetrics('invalidateTimeSensitive', duration);
      
      return true;
      
    } catch (error) {
      console.error('Error invalidating time-sensitive cache:', error.message);
      return false;
    }
  }

  /**
   * Cascade invalidation based on dependencies
   */
  async cascadeInvalidation(triggerKey) {
    const startTime = performance.now();
    
    try {
      // Get reverse dependencies
      const reverseDep = `${this.dependencyPrefix}:rev:${triggerKey}`;
      const dependentKeys = await this.cacheService.client.sMembers(reverseDep);
      
      if (dependentKeys.length > 0) {
        const invalidationTasks = dependentKeys.map(key => this.invalidateKey(key));
        await Promise.all(invalidationTasks);
        
        this.metrics.cascadeInvalidations += dependentKeys.length;
      }
      
      const duration = performance.now() - startTime;
      this.updateMetrics('cascadeInvalidation', duration);
      
      return dependentKeys.length;
      
    } catch (error) {
      console.error('Error in cascade invalidation:', error.message);
      return 0;
    }
  }

  /**
   * Smart invalidation based on content change analysis
   */
  async smartInvalidate(articleId, changes = {}) {
    const startTime = performance.now();
    
    try {
      const invalidationSets = {
        minimal: [],    // Title/content changes only
        moderate: [],   // Category/location changes
        extensive: []   // Breaking news or major updates
      };
      
      // Analyze what changed
      const changeScope = this.analyzeChanges(changes);
      
      // Build invalidation strategy based on change scope
      if (changeScope.includes('content') || changeScope.includes('title')) {
        const articleKey = this.keyManager.generateArticleKey(articleId);
        invalidationSets.minimal.push(articleKey);
      }
      
      if (changeScope.includes('category') || changeScope.includes('location')) {
        // Invalidate category and location-based caches
        if (changes.category) {
          invalidationSets.moderate.push(
            this.keyManager.generateCategoryKey(changes.category.old),
            this.keyManager.generateCategoryKey(changes.category.new)
          );
        }
        
        // Invalidate location-based queries
        if (changes.city) {
          const cityPattern = this.keyManager.generateInvalidationPattern('NEWS_QUERY', `*:${changes.city.old}:*`);
          invalidationSets.moderate.push(cityPattern);
        }
      }
      
      if (changeScope.includes('breaking') || changeScope.includes('priority')) {
        // Extensive invalidation for breaking news
        invalidationSets.extensive.push(
          this.keyManager.generateBreakingKey(),
          this.keyManager.generateTrendingKey(),
          this.keyManager.generateStatsKey()
        );
      }
      
      // Execute invalidations in order of importance
      for (const key of invalidationSets.minimal) {
        await this.invalidateKey(key);
      }
      
      for (const key of invalidationSets.moderate) {
        if (key.includes('*')) {
          await this.invalidatePattern(key);
        } else {
          await this.invalidateKey(key);
        }
      }
      
      for (const key of invalidationSets.extensive) {
        await this.invalidateKey(key);
      }
      
      const duration = performance.now() - startTime;
      this.updateMetrics('smartInvalidate', duration);
      
      return {
        minimal: invalidationSets.minimal.length,
        moderate: invalidationSets.moderate.length,
        extensive: invalidationSets.extensive.length
      };
      
    } catch (error) {
      console.error('Error in smart invalidation:', error.message);
      return null;
    }
  }

  /**
   * Invalidate single cache key
   */
  async invalidateKey(key) {
    try {
      await this.cacheService.del(key);
      this.metrics.invalidationEvents++;
      return true;
    } catch (error) {
      console.error(`Error invalidating key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Invalidate keys matching pattern
   */
  async invalidatePattern(pattern) {
    try {
      await this.cacheService.invalidatePattern(pattern);
      this.metrics.invalidationEvents++;
      return true;
    } catch (error) {
      console.error(`Error invalidating pattern ${pattern}:`, error.message);
      return false;
    }
  }

  /**
   * Setup batch processing for performance
   */
  setupBatchProcessor() {
    setInterval(async () => {
      if (this.batchQueue.length > 0) {
        const batch = this.batchQueue.splice(0); // Empty the queue
        
        try {
          // Group by operation type for efficiency
          const keyInvalidations = batch.filter(task => typeof task === 'string');
          const functionInvalidations = batch.filter(task => typeof task === 'function');
          
          // Process key invalidations in parallel
          if (keyInvalidations.length > 0) {
            await Promise.all(keyInvalidations.map(key => this.invalidateKey(key)));
          }
          
          // Process function invalidations
          if (functionInvalidations.length > 0) {
            await Promise.all(functionInvalidations.map(fn => fn()));
          }
          
          console.log(`✅ Processed ${batch.length} batch invalidations`);
          
        } catch (error) {
          console.error('Error processing batch invalidations:', error.message);
        }
      }
    }, this.batchInterval);
  }

  /**
   * Generate related cache keys for an article
   */
  generateRelatedKeys(article) {
    const keys = [];
    
    // News query keys that would include this article
    const baseParams = [
      { category: 'all', scope: 'all', city: 'Adelaide' },
      { category: article.category, scope: 'all', city: 'Adelaide' },
      { category: 'all', scope: article.scope, city: 'Adelaide' },
      { category: article.category, scope: article.scope, city: article.city }
    ];
    
    // Generate keys for first few pages (most commonly accessed)
    for (const params of baseParams) {
      for (let page = 1; page <= 3; page++) {
        keys.push(this.keyManager.generateNewsQueryKey({
          ...params,
          page,
          limit: 20
        }));
      }
    }
    
    return keys;
  }

  /**
   * Analyze what aspects of an article changed
   */
  analyzeChanges(changes) {
    const scope = [];
    
    if (changes.title || changes.content || changes.summary) {
      scope.push('content');
    }
    
    if (changes.category) {
      scope.push('category');
    }
    
    if (changes.city || changes.scope) {
      scope.push('location');
    }
    
    if (changes.breaking || changes.priority === 'high') {
      scope.push('breaking');
    }
    
    if (changes.views || changes.reactions) {
      scope.push('engagement');
    }
    
    return scope;
  }

  /**
   * Get article from cache (for invalidation analysis)
   */
  async getArticleFromCache(articleId) {
    try {
      const articleKey = this.keyManager.generateArticleKey(articleId);
      return await this.cacheService.get(articleKey);
    } catch (error) {
      console.error('Error getting article from cache:', error.message);
      return null;
    }
  }

  /**
   * Update metrics
   */
  updateMetrics(operation, duration) {
    this.metrics.lastInvalidation = new Date();
    
    // Update average invalidation time
    if (this.metrics.averageInvalidationTime === 0) {
      this.metrics.averageInvalidationTime = duration;
    } else {
      this.metrics.averageInvalidationTime = 
        (this.metrics.averageInvalidationTime + duration) / 2;
    }
  }

  /**
   * Get invalidation metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      batchQueueSize: this.batchQueue.length,
      dependenciesInMemory: this.articleDependencies.size
    };
  }

  /**
   * Health check for invalidation service
   */
  async healthCheck() {
    try {
      // Test basic invalidation
      const testKey = 'test:invalidation:health';
      await this.cacheService.set(testKey, { test: true }, 10);
      await this.invalidateKey(testKey);
      
      const stillExists = await this.cacheService.get(testKey);
      
      return {
        healthy: stillExists === null,
        metrics: this.getMetrics(),
        batchProcessorActive: true,
        dependencyTrackingActive: true
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        metrics: this.getMetrics()
      };
    }
  }

  /**
   * Clean up old dependencies
   */
  async cleanupDependencies() {
    try {
      const pattern = `${this.dependencyPrefix}:*`;
      const keys = await this.cacheService.client.keys(pattern);
      
      let cleaned = 0;
      
      for (const key of keys) {
        const exists = await this.cacheService.client.exists(key);
        if (!exists) {
          await this.cacheService.client.del(key);
          cleaned++;
        }
      }
      
      console.log(`✅ Cleaned up ${cleaned} stale dependencies`);
      return cleaned;
      
    } catch (error) {
      console.error('Error cleaning dependencies:', error.message);
      return 0;
    }
  }
}

module.exports = AdvancedCacheInvalidationService;