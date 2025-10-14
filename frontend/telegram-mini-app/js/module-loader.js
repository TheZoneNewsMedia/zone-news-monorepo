/**
 * Zone News Mini App - Dynamic Module Loader
 * Implements code splitting and lazy loading for better performance
 */

'use strict';

// ===== MODULE LOADER =====
export class ModuleLoader {
  constructor() {
    this.loadedModules = new Map();
    this.loadingPromises = new Map();
    this.loadTimes = new Map();
    this.errorRetries = new Map();
    
    // Performance tracking
    this.performanceMetrics = {
      totalLoadTime: 0,
      moduleCount: 0,
      failures: 0,
      retries: 0
    };
  }

  /**
   * Lazy load a module with error handling and retry logic
   */
  async loadModule(moduleName, modulePath, options = {}) {
    const {
      retryCount = 3,
      retryDelay = 1000,
      timeout = 10000,
      preload = false
    } = options;

    // Return cached module if already loaded
    if (this.loadedModules.has(moduleName)) {
      return this.loadedModules.get(moduleName);
    }

    // Return existing promise if already loading
    if (this.loadingPromises.has(moduleName)) {
      return this.loadingPromises.get(moduleName);
    }

    // Create loading promise
    const loadingPromise = this.createLoadingPromise(moduleName, modulePath, {
      retryCount,
      retryDelay,
      timeout,
      preload
    });

    this.loadingPromises.set(moduleName, loadingPromise);

    try {
      const module = await loadingPromise;
      this.loadedModules.set(moduleName, module);
      this.loadingPromises.delete(moduleName);
      return module;
    } catch (error) {
      this.loadingPromises.delete(moduleName);
      this.performanceMetrics.failures++;
      throw error;
    }
  }

  /**
   * Create loading promise with timeout and retry logic
   */
  async createLoadingPromise(moduleName, modulePath, options) {
    const { retryCount, retryDelay, timeout } = options;
    const startTime = performance.now();

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Module load timeout: ${moduleName}`)), timeout);
        });

        // Create import promise
        const importPromise = import(modulePath);

        // Race between import and timeout
        const module = await Promise.race([importPromise, timeoutPromise]);

        // Track performance
        const loadTime = performance.now() - startTime;
        this.loadTimes.set(moduleName, loadTime);
        this.performanceMetrics.totalLoadTime += loadTime;
        this.performanceMetrics.moduleCount++;

        if (attempt > 0) {
          this.performanceMetrics.retries++;
        }

        console.log(`📦 Module loaded: ${moduleName} (${loadTime.toFixed(2)}ms)${attempt > 0 ? ` - Retry ${attempt}` : ''}`);
        
        return module;

      } catch (error) {
        console.warn(`⚠️ Module load attempt ${attempt + 1} failed: ${moduleName}`, error);

        if (attempt === retryCount) {
          throw new Error(`Failed to load module ${moduleName} after ${retryCount + 1} attempts: ${error.message}`);
        }

        // Wait before retry
        if (retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
  }

  /**
   * Preload modules for better performance
   */
  async preloadModules(moduleConfigs) {
    const preloadPromises = moduleConfigs.map(config => 
      this.loadModule(config.name, config.path, { ...config.options, preload: true })
        .catch(error => {
          console.warn(`Preload failed for ${config.name}:`, error);
          return null;
        })
    );

    const results = await Promise.allSettled(preloadPromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    console.log(`🚀 Preloaded ${successful}/${moduleConfigs.length} modules`);
    return results;
  }

  /**
   * Load module with feature detection
   */
  async loadModuleConditionally(moduleName, modulePath, condition, fallback = null) {
    if (typeof condition === 'function' ? condition() : condition) {
      return this.loadModule(moduleName, modulePath);
    } else if (fallback) {
      return this.loadModule(`${moduleName}_fallback`, fallback.path, fallback.options);
    }
    return null;
  }

  /**
   * Batch load multiple modules
   */
  async loadModules(modules, options = {}) {
    const { parallel = true, failFast = false } = options;

    if (parallel) {
      const promises = modules.map(({ name, path, options: moduleOptions }) => 
        this.loadModule(name, path, moduleOptions)
          .catch(error => ({ error, module: name }))
      );

      if (failFast) {
        return Promise.all(promises);
      } else {
        return Promise.allSettled(promises);
      }
    } else {
      const results = [];
      for (const { name, path, options: moduleOptions } of modules) {
        try {
          const module = await this.loadModule(name, path, moduleOptions);
          results.push(module);
        } catch (error) {
          if (failFast) {
            throw error;
          }
          results.push({ error, module: name });
        }
      }
      return results;
    }
  }

  /**
   * Unload module to free memory
   */
  unloadModule(moduleName) {
    if (this.loadedModules.has(moduleName)) {
      this.loadedModules.delete(moduleName);
      this.loadTimes.delete(moduleName);
      console.log(`🗑️ Module unloaded: ${moduleName}`);
      return true;
    }
    return false;
  }

  /**
   * Get module loading statistics
   */
  getLoadingStats() {
    const avgLoadTime = this.performanceMetrics.moduleCount > 0 
      ? this.performanceMetrics.totalLoadTime / this.performanceMetrics.moduleCount 
      : 0;

    return {
      ...this.performanceMetrics,
      avgLoadTime: Math.round(avgLoadTime * 100) / 100,
      loadedModules: this.loadedModules.size,
      moduleLoadTimes: Object.fromEntries(this.loadTimes),
      successRate: this.performanceMetrics.moduleCount > 0 
        ? ((this.performanceMetrics.moduleCount - this.performanceMetrics.failures) / this.performanceMetrics.moduleCount * 100).toFixed(1) + '%'
        : '100%'
    };
  }

  /**
   * Check if module is loaded
   */
  isModuleLoaded(moduleName) {
    return this.loadedModules.has(moduleName);
  }

  /**
   * Check if module is loading
   */
  isModuleLoading(moduleName) {
    return this.loadingPromises.has(moduleName);
  }

  /**
   * Get loaded module
   */
  getModule(moduleName) {
    return this.loadedModules.get(moduleName);
  }

  /**
   * Clear all loaded modules
   */
  clearModules() {
    this.loadedModules.clear();
    this.loadingPromises.clear();
    this.loadTimes.clear();
    this.errorRetries.clear();
    this.performanceMetrics = {
      totalLoadTime: 0,
      moduleCount: 0,
      failures: 0,
      retries: 0
    };
    console.log('🧹 All modules cleared');
  }

  /**
   * Module health check
   */
  healthCheck() {
    return {
      status: 'healthy',
      loadedModules: Array.from(this.loadedModules.keys()),
      loadingModules: Array.from(this.loadingPromises.keys()),
      metrics: this.getLoadingStats(),
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage of loaded modules
   */
  estimateMemoryUsage() {
    if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
      return {
        usedJSHeapSize: window.performance.memory.usedJSHeapSize,
        totalJSHeapSize: window.performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit
      };
    }
    return { estimated: `~${this.loadedModules.size * 50}KB` };
  }
}

// ===== LAZY LOADING HELPERS =====

/**
 * Create a lazy-loaded component wrapper
 */
export function createLazyComponent(loader, fallback = null) {
  return {
    async load() {
      try {
        const module = await loader();
        return module.default || module;
      } catch (error) {
        console.error('Lazy component loading failed:', error);
        return fallback;
      }
    }
  };
}

/**
 * Lazy load function with caching
 */
export function createLazyFunction(loader, cacheDuration = 300000) { // 5 minutes default
  let cachedResult = null;
  let cacheTime = 0;

  return async function(...args) {
    const now = Date.now();
    
    if (cachedResult && (now - cacheTime) < cacheDuration) {
      return cachedResult;
    }

    try {
      const fn = await loader();
      cachedResult = await fn(...args);
      cacheTime = now;
      return cachedResult;
    } catch (error) {
      console.error('Lazy function execution failed:', error);
      throw error;
    }
  };
}

/**
 * Feature-based module loading
 */
export class FeatureLoader {
  constructor(moduleLoader) {
    this.moduleLoader = moduleLoader;
    this.features = new Map();
  }

  /**
   * Register a feature with its module requirements
   */
  registerFeature(featureName, moduleConfig) {
    this.features.set(featureName, moduleConfig);
  }

  /**
   * Load feature modules when needed
   */
  async loadFeature(featureName) {
    const config = this.features.get(featureName);
    if (!config) {
      throw new Error(`Feature not registered: ${featureName}`);
    }

    console.log(`🎯 Loading feature: ${featureName}`);
    
    if (config.modules) {
      return this.moduleLoader.loadModules(config.modules, config.options);
    } else {
      return this.moduleLoader.loadModule(featureName, config.path, config.options);
    }
  }

  /**
   * Check if feature is available
   */
  isFeatureAvailable(featureName) {
    const config = this.features.get(featureName);
    if (!config) return false;

    if (config.condition && typeof config.condition === 'function') {
      return config.condition();
    }

    return true;
  }
}

// ===== PERFORMANCE UTILITIES =====

/**
 * Measure module loading performance
 */
export function measureModulePerformance(moduleName, loader) {
  return async function(...args) {
    const startTime = performance.now();
    
    try {
      const result = await loader(...args);
      const endTime = performance.now();
      
      console.log(`📊 ${moduleName} loaded in ${(endTime - startTime).toFixed(2)}ms`);
      
      // Report to analytics if available
      if (window.gtag) {
        window.gtag('event', 'module_load', {
          event_category: 'performance',
          event_label: moduleName,
          value: Math.round(endTime - startTime)
        });
      }
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      console.error(`❌ ${moduleName} failed to load after ${(endTime - startTime).toFixed(2)}ms:`, error);
      throw error;
    }
  };
}

// Export singleton instance
export const moduleLoader = new ModuleLoader();
export const featureLoader = new FeatureLoader(moduleLoader);