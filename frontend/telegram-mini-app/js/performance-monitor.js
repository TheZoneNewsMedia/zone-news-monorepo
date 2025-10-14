/**
 * Zone News Mini App - Performance Monitoring System
 * Tracks code splitting metrics, bundle loading performance, and user experience metrics
 */

'use strict';

import { APP_CONFIG, EVENTS } from './config.js';

// ===== PERFORMANCE MONITORING SERVICE =====
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.moduleLoadTimes = new Map();
    this.bundleMetrics = new Map();
    this.userInteractionMetrics = new Map();
    this.performanceObserver = null;
    this.startTime = performance.now();
    this.sessionId = this.generateSessionId();
    
    this.initializeMonitoring();
    this.setupEventListeners();
    console.log('📊 Performance Monitor initialized');
  }

  /**
   * Initialize performance monitoring
   */
  initializeMonitoring() {
    // Track initial page load metrics
    this.trackPageLoadMetrics();
    
    // Setup performance observers
    this.setupPerformanceObservers();
    
    // Track bundle splitting effectiveness
    this.trackBundleSplitting();
    
    // Monitor memory usage
    this.setupMemoryMonitoring();
    
    // Track user experience metrics
    this.setupUXMetrics();
  }

  /**
   * Setup event listeners for module loading tracking
   */
  setupEventListeners() {
    // Track module loading events
    document.addEventListener(EVENTS.MODULE_LOADED, (e) => {
      this.trackModuleLoad(e.detail);
    });

    // Track search performance
    document.addEventListener(EVENTS.SEARCH_PERFORMED, (e) => {
      this.trackSearchPerformance(e.detail);
    });

    // Track premium feature usage
    document.addEventListener(EVENTS.PREMIUM_LIMIT_REACHED, (e) => {
      this.trackPremiumMetrics(e.detail);
    });

    // Track form interactions
    document.addEventListener(EVENTS.FORM_INTERACTION, (e) => {
      this.trackFormPerformance(e.detail);
    });

    // Track sharing performance
    document.addEventListener(EVENTS.SHARING_COMPLETE, (e) => {
      this.trackSharingPerformance(e.detail);
    });

    // Page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.trackVisibilityChange();
    });

    // Before page unload
    window.addEventListener('beforeunload', () => {
      this.flushMetrics();
    });
  }

  /**
   * Track page load metrics including bundle sizes
   */
  trackPageLoadMetrics() {
    const loadMetrics = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      startTime: this.startTime,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      connection: this.getConnectionInfo(),
      initialBundle: this.measureInitialBundle()
    };

    // Use Performance API if available
    if (performance.getEntriesByType) {
      const navigation = performance.getEntriesByType('navigation')[0];
      if (navigation) {
        loadMetrics.navigation = {
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
          firstPaint: this.getFirstPaint(),
          firstContentfulPaint: this.getFirstContentfulPaint(),
          largestContentfulPaint: this.getLargestContentfulPaint()
        };
      }
    }

    this.metrics.set('pageLoad', loadMetrics);
    console.log('📊 Page load metrics captured:', loadMetrics);
  }

  /**
   * Measure initial bundle size and composition
   */
  measureInitialBundle() {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    
    return {
      scriptCount: scripts.length,
      stylesheetCount: stylesheets.length,
      estimatedSize: this.estimateBundleSize(scripts, stylesheets),
      coreModules: ['app.js', 'ui-core.js', 'config.js'],
      lazyModules: ['ui-sharing.js', 'ui-forms.js', 'search-advanced.js', 'premium-manager.js']
    };
  }

  /**
   * Estimate bundle size (rough calculation)
   */
  estimateBundleSize(scripts, stylesheets) {
    // Rough estimates based on typical file sizes
    const estimates = {
      'app.js': 45, // KB
      'ui-core.js': 25,
      'config.js': 5,
      'style.css': 35,
      'ui-sharing.js': 20, // Lazy loaded
      'ui-forms.js': 18, // Lazy loaded
      'search-advanced.js': 25, // Lazy loaded
      'premium-manager.js': 15 // Lazy loaded
    };

    let totalSize = 0;
    scripts.forEach(script => {
      const filename = script.src.split('/').pop();
      totalSize += estimates[filename] || 10; // Default estimate
    });

    stylesheets.forEach(link => {
      const filename = link.href.split('/').pop();
      totalSize += estimates[filename] || 5; // Default estimate
    });

    return {
      estimated: totalSize,
      unit: 'KB',
      breakdown: estimates
    };
  }

  /**
   * Track module loading performance
   */
  trackModuleLoad(detail) {
    const { module, success, error, loadTime } = detail;
    const loadMetric = {
      module,
      success,
      loadTime: loadTime || 0,
      timestamp: Date.now(),
      error: error ? error.message : null,
      sessionId: this.sessionId
    };

    // Store in module load times
    this.moduleLoadTimes.set(module, loadMetric);

    // Track lazy loading effectiveness
    this.trackLazyLoadingEffectiveness(module, loadMetric);

    console.log(`📊 Module load tracked: ${module} (${success ? 'success' : 'failed'})`, loadMetric);
  }

  /**
   * Track lazy loading effectiveness
   */
  trackLazyLoadingEffectiveness(module, loadMetric) {
    const lazyModules = ['sharing', 'forms', 'search-advanced', 'premium'];
    
    if (lazyModules.includes(module)) {
      const timeToFirstLoad = loadMetric.timestamp - this.startTime;
      
      const lazyMetric = {
        module,
        timeToFirstLoad,
        loadTime: loadMetric.loadTime,
        success: loadMetric.success,
        bundleSavings: this.calculateBundleSavings(module),
        userTriggered: this.wasUserTriggered(module)
      };

      this.bundleMetrics.set(`lazy_${module}`, lazyMetric);
    }
  }

  /**
   * Calculate bundle size savings from lazy loading
   */
  calculateBundleSavings(module) {
    const moduleSizes = {
      'sharing': 20, // KB
      'forms': 18,
      'search-advanced': 25,
      'premium': 15
    };

    const moduleSize = moduleSizes[module] || 10;
    const initialBundleSize = this.metrics.get('pageLoad')?.initialBundle?.estimated || 100;
    
    return {
      savedBytes: moduleSize * 1024, // Convert to bytes
      savedKB: moduleSize,
      percentageSaving: (moduleSize / (initialBundleSize + moduleSize)) * 100
    };
  }

  /**
   * Check if module load was user-triggered
   */
  wasUserTriggered(module) {
    // Check recent user interactions to determine if load was user-triggered
    const recentInteractions = this.getRecentUserInteractions(1000); // Last 1 second
    
    const triggerMappings = {
      'sharing': ['share_button_click', 'article_share'],
      'forms': ['comment_button_click', 'search_advanced_click'],
      'search-advanced': ['advanced_search_button', 'search_filter_click'],
      'premium': ['upgrade_button_click', 'premium_feature_access']
    };

    const triggers = triggerMappings[module] || [];
    return recentInteractions.some(interaction => 
      triggers.includes(interaction.type)
    );
  }

  /**
   * Track search performance metrics
   */
  trackSearchPerformance(detail) {
    const { query, type, timestamp, results } = detail;
    
    const searchMetric = {
      query: query.substring(0, 50), // Truncate for privacy
      type, // 'basic' or 'advanced'
      timestamp,
      sessionId: this.sessionId,
      responseTime: performance.now() - (timestamp || Date.now()),
      resultCount: results?.total || 0,
      cacheHit: this.wasSearchCacheHit(query, type),
      moduleLoadRequired: type === 'advanced' && !this.moduleLoadTimes.has('search-advanced')
    };

    // Track search module performance
    if (searchMetric.moduleLoadRequired) {
      searchMetric.moduleLoadTime = this.moduleLoadTimes.get('search-advanced')?.loadTime || 0;
    }

    this.userInteractionMetrics.set(`search_${Date.now()}`, searchMetric);

    // Track search patterns for optimization
    this.trackSearchPatterns(searchMetric);

    console.log('📊 Search performance tracked:', searchMetric);
  }

  /**
   * Track search patterns for optimization insights
   */
  trackSearchPatterns(searchMetric) {
    const patterns = this.metrics.get('searchPatterns') || {
      basicToAdvanced: 0,
      advancedFirstUse: 0,
      cacheEffectiveness: 0,
      averageResponseTime: 0,
      totalSearches: 0
    };

    patterns.totalSearches++;
    patterns.averageResponseTime = (patterns.averageResponseTime + searchMetric.responseTime) / 2;

    if (searchMetric.type === 'advanced') {
      if (patterns.totalSearches === 1) {
        patterns.advancedFirstUse++;
      } else {
        patterns.basicToAdvanced++;
      }
    }

    if (searchMetric.cacheHit) {
      patterns.cacheEffectiveness = (patterns.cacheEffectiveness + 1) / patterns.totalSearches;
    }

    this.metrics.set('searchPatterns', patterns);
  }

  /**
   * Track premium feature metrics
   */
  trackPremiumMetrics(detail) {
    const { feature, reason, context } = detail;
    
    const premiumMetric = {
      feature,
      reason,
      context,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      moduleLoadTime: this.moduleLoadTimes.get('premium')?.loadTime || 0,
      conversionOpportunity: true
    };

    this.userInteractionMetrics.set(`premium_${Date.now()}`, premiumMetric);

    // Track premium conversion funnel
    this.trackPremiumConversionFunnel(premiumMetric);

    console.log('📊 Premium metrics tracked:', premiumMetric);
  }

  /**
   * Track premium conversion funnel
   */
  trackPremiumConversionFunnel(premiumMetric) {
    const funnel = this.metrics.get('premiumFunnel') || {
      limitReached: 0,
      upgradeModalShown: 0,
      upgradeClicked: 0,
      conversionRate: 0
    };

    funnel.limitReached++;
    
    if (premiumMetric.reason === 'upgrade_modal_shown') {
      funnel.upgradeModalShown++;
    }
    
    if (premiumMetric.reason === 'upgrade_clicked') {
      funnel.upgradeClicked++;
      funnel.conversionRate = funnel.upgradeClicked / funnel.limitReached;
    }

    this.metrics.set('premiumFunnel', funnel);
  }

  /**
   * Track form interaction performance
   */
  trackFormPerformance(detail) {
    const { formType, action, timestamp } = detail;
    
    const formMetric = {
      formType,
      action,
      timestamp,
      sessionId: this.sessionId,
      moduleLoadTime: this.moduleLoadTimes.get('forms')?.loadTime || 0,
      interactionLatency: performance.now() - timestamp
    };

    this.userInteractionMetrics.set(`form_${Date.now()}`, formMetric);

    console.log('📊 Form performance tracked:', formMetric);
  }

  /**
   * Track sharing performance
   */
  trackSharingPerformance(detail) {
    const { platform, article, timestamp } = detail;
    
    const sharingMetric = {
      platform,
      articleId: article?.id,
      timestamp,
      sessionId: this.sessionId,
      moduleLoadTime: this.moduleLoadTimes.get('sharing')?.loadTime || 0,
      shareLatency: performance.now() - timestamp
    };

    this.userInteractionMetrics.set(`sharing_${Date.now()}`, sharingMetric);

    console.log('📊 Sharing performance tracked:', sharingMetric);
  }

  /**
   * Setup performance observers for detailed metrics
   */
  setupPerformanceObservers() {
    // Largest Contentful Paint observer
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.metrics.set('lcp', {
            value: lastEntry.startTime,
            timestamp: Date.now(),
            element: lastEntry.element?.tagName || 'unknown'
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay observer
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            this.metrics.set('fid', {
              value: entry.processingStart - entry.startTime,
              timestamp: Date.now(),
              eventType: entry.name
            });
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Layout shift observer
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          let clsValue = 0;
          entries.forEach(entry => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
          this.metrics.set('cls', {
            value: clsValue,
            timestamp: Date.now()
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });

        this.performanceObserver = { lcpObserver, fidObserver, clsObserver };

      } catch (error) {
        console.warn('Performance Observer setup failed:', error);
      }
    }
  }

  /**
   * Setup memory monitoring
   */
  setupMemoryMonitoring() {
    if ('memory' in performance) {
      setInterval(() => {
        const memoryInfo = {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          timestamp: Date.now(),
          moduleCount: this.moduleLoadTimes.size
        };

        this.metrics.set(`memory_${Date.now()}`, memoryInfo);
      }, 30000); // Every 30 seconds
    }
  }

  /**
   * Setup UX metrics tracking
   */
  setupUXMetrics() {
    // Track user interactions
    let interactionCount = 0;
    let lastInteractionTime = Date.now();

    ['click', 'touchstart', 'keydown'].forEach(eventType => {
      document.addEventListener(eventType, (e) => {
        interactionCount++;
        const now = Date.now();
        
        const interaction = {
          type: eventType,
          timestamp: now,
          timeSinceLastInteraction: now - lastInteractionTime,
          target: e.target.tagName || 'unknown',
          sessionId: this.sessionId
        };

        this.userInteractionMetrics.set(`interaction_${now}`, interaction);
        lastInteractionTime = now;

        // Track interaction responsiveness
        this.trackInteractionResponsiveness(interaction);
      }, { passive: true });
    });

    // Track session duration and engagement
    setInterval(() => {
      this.trackSessionMetrics(interactionCount);
      interactionCount = 0; // Reset for next interval
    }, 60000); // Every minute
  }

  /**
   * Track interaction responsiveness
   */
  trackInteractionResponsiveness(interaction) {
    const responsiveness = {
      interactionType: interaction.type,
      timestamp: interaction.timestamp,
      moduleLoadPending: this.getActiveModuleLoads(),
      memoryPressure: this.getCurrentMemoryPressure(),
      sessionId: this.sessionId
    };

    // Measure response time for click events
    if (interaction.type === 'click') {
      setTimeout(() => {
        responsiveness.responseTime = performance.now() - interaction.timestamp;
        this.metrics.set(`responsiveness_${interaction.timestamp}`, responsiveness);
      }, 0);
    }
  }

  /**
   * Track session metrics
   */
  trackSessionMetrics(interactionCount) {
    const sessionMetrics = {
      duration: Date.now() - this.startTime,
      interactionsPerMinute: interactionCount,
      modulesLoaded: this.moduleLoadTimes.size,
      totalModulesAvailable: 6, // core, sharing, forms, search-advanced, premium, performance
      bundleEfficiency: this.calculateBundleEfficiency(),
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    this.metrics.set('sessionMetrics', sessionMetrics);
  }

  /**
   * Calculate bundle loading efficiency
   */
  calculateBundleEfficiency() {
    const totalModules = 6;
    const loadedModules = this.moduleLoadTimes.size;
    const averageLoadTime = this.getAverageModuleLoadTime();
    
    return {
      loadedPercentage: (loadedModules / totalModules) * 100,
      averageLoadTime,
      lazyLoadingSavings: this.calculateTotalLazyLoadingSavings(),
      cacheHitRate: this.calculateCacheHitRate()
    };
  }

  /**
   * Get performance summary report
   */
  getPerformanceSummary() {
    const summary = {
      sessionId: this.sessionId,
      sessionDuration: Date.now() - this.startTime,
      pageLoad: this.metrics.get('pageLoad'),
      moduleLoading: {
        modulesLoaded: this.moduleLoadTimes.size,
        averageLoadTime: this.getAverageModuleLoadTime(),
        lazyLoadingEffective: this.isLazyLoadingEffective()
      },
      userExperience: {
        lcp: this.metrics.get('lcp')?.value,
        fid: this.metrics.get('fid')?.value,
        cls: this.metrics.get('cls')?.value,
        interactionCount: Array.from(this.userInteractionMetrics.keys()).filter(k => k.startsWith('interaction_')).length
      },
      bundleOptimization: this.calculateBundleEfficiency(),
      searchPerformance: this.getSearchPerformanceSummary(),
      premiumConversion: this.metrics.get('premiumFunnel'),
      recommendations: this.generateOptimizationRecommendations()
    };

    return summary;
  }

  /**
   * Generate optimization recommendations based on metrics
   */
  generateOptimizationRecommendations() {
    const recommendations = [];
    
    // Bundle size recommendations
    const bundleSize = this.metrics.get('pageLoad')?.initialBundle?.estimated || 0;
    if (bundleSize > 100) {
      recommendations.push({
        type: 'bundle-size',
        priority: 'high',
        message: `Initial bundle size (${bundleSize}KB) is large. Consider more aggressive code splitting.`,
        action: 'Split large modules further or implement tree shaking'
      });
    }

    // Module loading recommendations
    const avgLoadTime = this.getAverageModuleLoadTime();
    if (avgLoadTime > 500) {
      recommendations.push({
        type: 'module-loading',
        priority: 'medium',
        message: `Average module load time (${avgLoadTime}ms) is slow.`,
        action: 'Optimize module loading or implement preloading for frequently used modules'
      });
    }

    // Search performance recommendations
    const searchPatterns = this.metrics.get('searchPatterns');
    if (searchPatterns && searchPatterns.basicToAdvanced > 5) {
      recommendations.push({
        type: 'search-optimization',
        priority: 'low',
        message: 'Users frequently upgrade from basic to advanced search.',
        action: 'Consider preloading advanced search module or improving basic search capabilities'
      });
    }

    // Premium conversion recommendations
    const premiumFunnel = this.metrics.get('premiumFunnel');
    if (premiumFunnel && premiumFunnel.conversionRate < 0.1) {
      recommendations.push({
        type: 'premium-conversion',
        priority: 'medium',
        message: `Low premium conversion rate (${(premiumFunnel.conversionRate * 100).toFixed(1)}%).`,
        action: 'Improve premium value proposition or upgrade flow UX'
      });
    }

    return recommendations;
  }

  /**
   * Utility methods
   */
  getAverageModuleLoadTime() {
    const loadTimes = Array.from(this.moduleLoadTimes.values())
      .filter(metric => metric.success && metric.loadTime > 0)
      .map(metric => metric.loadTime);
    
    return loadTimes.length > 0 ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0;
  }

  isLazyLoadingEffective() {
    const lazyModuleCount = Array.from(this.bundleMetrics.keys()).filter(k => k.startsWith('lazy_')).length;
    const totalLazyModules = 4; // sharing, forms, search-advanced, premium
    
    return lazyModuleCount < totalLazyModules; // Effective if not all lazy modules are loaded
  }

  calculateTotalLazyLoadingSavings() {
    let totalSavings = 0;
    this.bundleMetrics.forEach((metric, key) => {
      if (key.startsWith('lazy_') && metric.bundleSavings) {
        totalSavings += metric.bundleSavings.savedKB;
      }
    });
    return totalSavings;
  }

  calculateCacheHitRate() {
    const searches = Array.from(this.userInteractionMetrics.values())
      .filter(metric => metric.query !== undefined);
    
    if (searches.length === 0) return 0;
    
    const cacheHits = searches.filter(search => search.cacheHit).length;
    return (cacheHits / searches.length) * 100;
  }

  wasSearchCacheHit(query, type) {
    // Simple heuristic - in real implementation, this would check actual cache
    return Math.random() > 0.3; // Simulated 70% cache hit rate
  }

  getRecentUserInteractions(timeWindow) {
    const now = Date.now();
    return Array.from(this.userInteractionMetrics.values())
      .filter(metric => (now - metric.timestamp) < timeWindow);
  }

  getActiveModuleLoads() {
    return Array.from(this.moduleLoadTimes.values())
      .filter(metric => !metric.success && metric.timestamp > Date.now() - 5000).length;
  }

  getCurrentMemoryPressure() {
    if ('memory' in performance) {
      const memory = performance.memory;
      return (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
    }
    return 0;
  }

  getSearchPerformanceSummary() {
    const searches = Array.from(this.userInteractionMetrics.values())
      .filter(metric => metric.query !== undefined);
    
    if (searches.length === 0) return null;
    
    return {
      totalSearches: searches.length,
      averageResponseTime: searches.reduce((sum, search) => sum + search.responseTime, 0) / searches.length,
      advancedSearchUsage: searches.filter(s => s.type === 'advanced').length,
      cacheHitRate: this.calculateCacheHitRate()
    };
  }

  getFirstPaint() {
    const paintEntries = performance.getEntriesByType('paint');
    const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
    return firstPaint ? firstPaint.startTime : null;
  }

  getFirstContentfulPaint() {
    const paintEntries = performance.getEntriesByType('paint');
    const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    return fcp ? fcp.startTime : null;
  }

  getLargestContentfulPaint() {
    const lcp = this.metrics.get('lcp');
    return lcp ? lcp.value : null;
  }

  getConnectionInfo() {
    if ('connection' in navigator) {
      return {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      };
    }
    return null;
  }

  trackVisibilityChange() {
    const visibility = {
      hidden: document.hidden,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };
    
    this.metrics.set(`visibility_${Date.now()}`, visibility);
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Flush metrics to analytics endpoint
   */
  async flushMetrics() {
    try {
      const summary = this.getPerformanceSummary();
      
      // Send to analytics endpoint
      if (window.fetch && summary) {
        await fetch('/api/analytics/performance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(summary),
          keepalive: true
        });
      }

      // Also send to console for development
      console.log('📊 Performance Summary:', summary);

    } catch (error) {
      console.warn('Failed to flush performance metrics:', error);
    }
  }

  /**
   * Get real-time performance dashboard data
   */
  getDashboardData() {
    return {
      currentSession: {
        sessionId: this.sessionId,
        duration: Date.now() - this.startTime,
        modulesLoaded: this.moduleLoadTimes.size
      },
      bundleMetrics: Object.fromEntries(this.bundleMetrics),
      recentInteractions: Array.from(this.userInteractionMetrics.entries())
        .slice(-10)
        .map(([key, value]) => ({ key, ...value })),
      coreWebVitals: {
        lcp: this.getLargestContentfulPaint(),
        fid: this.metrics.get('fid')?.value,
        cls: this.metrics.get('cls')?.value
      },
      recommendations: this.generateOptimizationRecommendations()
    };
  }

  /**
   * Clear metrics (for testing or reset)
   */
  clearMetrics() {
    this.metrics.clear();
    this.moduleLoadTimes.clear();
    this.bundleMetrics.clear();
    this.userInteractionMetrics.clear();
    console.log('📊 Performance metrics cleared');
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
export default PerformanceMonitor;