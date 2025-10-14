/**
 * Zone News Mini App - A/B Testing Framework
 * Enables data-driven optimization of bundle loading strategies and user experience features
 */

'use strict';

import { APP_CONFIG, EVENTS } from './config.js';
import { performanceMonitor } from './performance-monitor.js';

// ===== A/B TESTING FRAMEWORK =====
export class ABTestingFramework {
  constructor() {
    this.userId = this.generateUserId();
    this.activeTests = new Map();
    this.completedTests = new Map();
    this.testResults = new Map();
    this.sessionStartTime = Date.now();
    
    this.initializeFramework();
    console.log('🧪 A/B Testing Framework initialized');
  }

  /**
   * Initialize A/B testing framework
   */
  initializeFramework() {
    // Setup test definitions
    this.setupTestDefinitions();
    
    // Load user's test history
    this.loadUserTestHistory();
    
    // Initialize active tests
    this.initializeActiveTests();
    
    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup test definitions for bundle optimization
   */
  setupTestDefinitions() {
    this.testDefinitions = {
      // Bundle loading strategy tests
      bundleLoadingStrategy: {
        name: 'Bundle Loading Strategy',
        description: 'Test different approaches to loading lazy modules',
        variants: {
          eager: {
            name: 'Eager Loading',
            description: 'Preload modules during idle time',
            weight: 25,
            config: {
              preloadModules: ['sharing', 'forms'],
              preloadDelay: 2000,
              preloadOnIdle: true
            }
          },
          lazy: {
            name: 'Pure Lazy Loading',
            description: 'Load modules only when needed',
            weight: 25,
            config: {
              preloadModules: [],
              preloadDelay: 0,
              preloadOnIdle: false
            }
          },
          predictive: {
            name: 'Predictive Loading',
            description: 'Load based on user behavior patterns',
            weight: 25,
            config: {
              preloadModules: [],
              preloadDelay: 1000,
              preloadOnIdle: true,
              predictiveEnabled: true
            }
          },
          hybrid: {
            name: 'Hybrid Strategy',
            description: 'Mix of eager and lazy based on module priority',
            weight: 25,
            config: {
              preloadModules: ['sharing'],
              preloadDelay: 1500,
              preloadOnIdle: true,
              priorityBasedLoading: true
            }
          }
        },
        metrics: ['bundleLoadTime', 'initialPageLoad', 'userEngagement', 'memoryUsage'],
        duration: 7 * 24 * 60 * 60 * 1000, // 7 days
        successMetrics: {
          bundleLoadTime: { target: 300, direction: 'lower' },
          initialPageLoad: { target: 2000, direction: 'lower' },
          userEngagement: { target: 5, direction: 'higher' },
          memoryUsage: { target: 50, direction: 'lower' }
        }
      },

      // Premium feature presentation tests
      premiumFeaturePresentation: {
        name: 'Premium Feature Presentation',
        description: 'Test different ways to present premium features',
        variants: {
          subtle: {
            name: 'Subtle Hints',
            description: 'Gentle premium feature suggestions',
            weight: 33,
            config: {
              upgradePromptFrequency: 'low',
              premiumBadgeStyle: 'subtle',
              limitWarningThreshold: 1
            }
          },
          prominent: {
            name: 'Prominent Display',
            description: 'Clear premium feature promotion',
            weight: 33,
            config: {
              upgradePromptFrequency: 'medium',
              premiumBadgeStyle: 'prominent',
              limitWarningThreshold: 2
            }
          },
          progressive: {
            name: 'Progressive Disclosure',
            description: 'Gradually introduce premium features',
            weight: 34,
            config: {
              upgradePromptFrequency: 'adaptive',
              premiumBadgeStyle: 'progressive',
              limitWarningThreshold: 3
            }
          }
        },
        metrics: ['conversionRate', 'userFrustration', 'featureDiscovery'],
        duration: 14 * 24 * 60 * 60 * 1000, // 14 days
        successMetrics: {
          conversionRate: { target: 0.15, direction: 'higher' },
          userFrustration: { target: 0.1, direction: 'lower' },
          featureDiscovery: { target: 0.8, direction: 'higher' }
        }
      },

      // Search interface optimization
      searchInterfaceOptimization: {
        name: 'Search Interface Optimization',
        description: 'Test different search interface approaches',
        variants: {
          unified: {
            name: 'Unified Search',
            description: 'Single search box with progressive enhancement',
            weight: 50,
            config: {
              showAdvancedToggle: true,
              inlineFilters: false,
              searchSuggestions: true
            }
          },
          separated: {
            name: 'Separated Search',
            description: 'Distinct basic and advanced search interfaces',
            weight: 50,
            config: {
              showAdvancedToggle: false,
              inlineFilters: true,
              searchSuggestions: false
            }
          }
        },
        metrics: ['searchUsage', 'advancedSearchAdoption', 'searchSuccess'],
        duration: 10 * 24 * 60 * 60 * 1000, // 10 days
        successMetrics: {
          searchUsage: { target: 3, direction: 'higher' },
          advancedSearchAdoption: { target: 0.3, direction: 'higher' },
          searchSuccess: { target: 0.7, direction: 'higher' }
        }
      }
    };
  }

  /**
   * Initialize active tests for user
   */
  initializeActiveTests() {
    Object.entries(this.testDefinitions).forEach(([testId, testDef]) => {
      if (this.shouldParticipateInTest(testId, testDef)) {
        const variant = this.assignVariant(testDef);
        this.enrollInTest(testId, variant);
      }
    });
  }

  /**
   * Check if user should participate in test
   */
  shouldParticipateInTest(testId, testDef) {
    // Check if test is already completed
    if (this.completedTests.has(testId)) {
      return false;
    }

    // Check if test is within duration
    const testStartTime = this.getTestStartTime(testId);
    if (testStartTime && (Date.now() - testStartTime) > testDef.duration) {
      this.completeTest(testId);
      return false;
    }

    // Simple participation logic (could be more sophisticated)
    return Math.random() < 0.8; // 80% participation rate
  }

  /**
   * Assign variant based on user ID and weights
   */
  assignVariant(testDef) {
    const variants = Object.entries(testDef.variants);
    const hash = this.hashUserId();
    
    let totalWeight = 0;
    variants.forEach(([, variant]) => totalWeight += variant.weight);
    
    let threshold = (hash % totalWeight);
    let currentWeight = 0;
    
    for (const [variantId, variant] of variants) {
      currentWeight += variant.weight;
      if (threshold < currentWeight) {
        return { id: variantId, ...variant };
      }
    }
    
    // Fallback to first variant
    return { id: variants[0][0], ...variants[0][1] };
  }

  /**
   * Enroll user in test with assigned variant
   */
  enrollInTest(testId, variant) {
    const testData = {
      testId,
      variant,
      startTime: Date.now(),
      events: [],
      metrics: new Map()
    };

    this.activeTests.set(testId, testData);
    
    // Apply variant configuration
    this.applyVariantConfiguration(testId, variant);
    
    // Track enrollment
    this.trackEvent(testId, 'enrolled', {
      variant: variant.id,
      timestamp: Date.now()
    });

    console.log(`🧪 Enrolled in test: ${testId} (variant: ${variant.id})`);
  }

  /**
   * Apply variant configuration to the application
   */
  applyVariantConfiguration(testId, variant) {
    switch (testId) {
      case 'bundleLoadingStrategy':
        this.applyBundleLoadingConfig(variant.config);
        break;
      case 'premiumFeaturePresentation':
        this.applyPremiumPresentationConfig(variant.config);
        break;
      case 'searchInterfaceOptimization':
        this.applySearchInterfaceConfig(variant.config);
        break;
    }
  }

  /**
   * Apply bundle loading strategy configuration
   */
  applyBundleLoadingConfig(config) {
    if (config.preloadOnIdle && config.preloadModules.length > 0) {
      // Setup idle preloading
      this.setupIdlePreloading(config.preloadModules, config.preloadDelay);
    }

    if (config.predictiveEnabled) {
      // Enable predictive loading based on user patterns
      this.enablePredictiveLoading();
    }

    if (config.priorityBasedLoading) {
      // Setup priority-based loading
      this.setupPriorityBasedLoading();
    }

    // Store configuration globally for other modules to access
    window.abTestConfig = window.abTestConfig || {};
    window.abTestConfig.bundleLoading = config;
  }

  /**
   * Apply premium feature presentation configuration
   */
  applyPremiumPresentationConfig(config) {
    window.abTestConfig = window.abTestConfig || {};
    window.abTestConfig.premiumPresentation = config;

    // Notify premium manager of config changes
    document.dispatchEvent(new CustomEvent('ab-test-config-updated', {
      detail: { type: 'premiumPresentation', config }
    }));
  }

  /**
   * Apply search interface configuration
   */
  applySearchInterfaceConfig(config) {
    window.abTestConfig = window.abTestConfig || {};
    window.abTestConfig.searchInterface = config;

    // Notify search modules of config changes
    document.dispatchEvent(new CustomEvent('ab-test-config-updated', {
      detail: { type: 'searchInterface', config }
    }));
  }

  /**
   * Setup idle preloading for specified modules
   */
  setupIdlePreloading(modules, delay) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        setTimeout(() => {
          modules.forEach(module => this.preloadModule(module));
        }, delay);
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        modules.forEach(module => this.preloadModule(module));
      }, delay + 1000);
    }
  }

  /**
   * Preload a specific module
   */
  async preloadModule(moduleName) {
    try {
      const moduleMap = {
        sharing: './ui-sharing.js',
        forms: './ui-forms.js',
        'search-advanced': './search-advanced.js',
        premium: './premium-manager.js'
      };

      const modulePath = moduleMap[moduleName];
      if (modulePath) {
        const startTime = performance.now();
        await import(modulePath);
        const loadTime = performance.now() - startTime;

        this.trackEvent('bundleLoadingStrategy', 'module_preloaded', {
          module: moduleName,
          loadTime,
          timestamp: Date.now()
        });

        console.log(`🧪 Preloaded module: ${moduleName} (${Math.round(loadTime)}ms)`);
      }
    } catch (error) {
      console.warn(`🧪 Failed to preload module: ${moduleName}`, error);
    }
  }

  /**
   * Enable predictive loading based on user behavior
   */
  enablePredictiveLoading() {
    // Track user interactions to predict module needs
    let lastInteractionTime = Date.now();
    const interactionHistory = [];

    ['click', 'touchstart'].forEach(eventType => {
      document.addEventListener(eventType, (e) => {
        const now = Date.now();
        const timeSinceLastInteraction = now - lastInteractionTime;
        
        const interaction = {
          type: eventType,
          target: e.target.tagName,
          className: e.target.className,
          timestamp: now,
          timeSinceLastInteraction
        };

        interactionHistory.push(interaction);
        lastInteractionTime = now;

        // Keep only recent interactions
        while (interactionHistory.length > 10) {
          interactionHistory.shift();
        }

        // Predict and preload based on patterns
        this.predictAndPreload(interactionHistory);
      }, { passive: true });
    });
  }

  /**
   * Predict which modules to preload based on interaction patterns
   */
  predictAndPreload(interactionHistory) {
    // Simple prediction logic - can be enhanced with ML
    const recentInteractions = interactionHistory.slice(-3);
    
    const patterns = {
      sharing: ['share-btn', 'article-card', 'news-item'],
      forms: ['comment-btn', 'feedback-btn', 'search-input'],
      'search-advanced': ['search-btn', 'filter-btn', 'search-input'],
      premium: ['upgrade-btn', 'premium-feature', 'limit-warning']
    };

    Object.entries(patterns).forEach(([module, triggers]) => {
      const relevantInteractions = recentInteractions.filter(interaction =>
        triggers.some(trigger => 
          interaction.className?.includes(trigger) || 
          interaction.target?.toLowerCase().includes(trigger)
        )
      );

      if (relevantInteractions.length >= 2) {
        this.preloadModule(module);
      }
    });
  }

  /**
   * Setup priority-based loading
   */
  setupPriorityBasedLoading() {
    const modulePriorities = {
      sharing: 1, // High priority - commonly used
      forms: 2,   // Medium priority
      'search-advanced': 3, // Lower priority - premium feature
      premium: 4  // Lowest priority - only for premium users
    };

    // Load modules in priority order with delays
    Object.entries(modulePriorities).forEach(([module, priority]) => {
      setTimeout(() => {
        this.preloadModule(module);
      }, priority * 1000); // 1s delay per priority level
    });
  }

  /**
   * Track test event
   */
  trackEvent(testId, eventType, data = {}) {
    const testData = this.activeTests.get(testId);
    if (!testData) return;

    const event = {
      type: eventType,
      timestamp: Date.now(),
      data
    };

    testData.events.push(event);

    // Update metrics based on event
    this.updateMetrics(testId, eventType, data);
  }

  /**
   * Update test metrics
   */
  updateMetrics(testId, eventType, data) {
    const testData = this.activeTests.get(testId);
    if (!testData) return;

    const testDef = this.testDefinitions[testId];
    if (!testDef) return;

    // Calculate metrics based on event type and test definition
    switch (testId) {
      case 'bundleLoadingStrategy':
        this.updateBundleLoadingMetrics(testData, eventType, data);
        break;
      case 'premiumFeaturePresentation':
        this.updatePremiumPresentationMetrics(testData, eventType, data);
        break;
      case 'searchInterfaceOptimization':
        this.updateSearchOptimizationMetrics(testData, eventType, data);
        break;
    }
  }

  /**
   * Update bundle loading strategy metrics
   */
  updateBundleLoadingMetrics(testData, eventType, data) {
    switch (eventType) {
      case 'module_preloaded':
      case 'module_loaded':
        const loadTimes = testData.metrics.get('bundleLoadTimes') || [];
        loadTimes.push(data.loadTime);
        testData.metrics.set('bundleLoadTimes', loadTimes);
        testData.metrics.set('bundleLoadTime', this.calculateAverage(loadTimes));
        break;
        
      case 'page_loaded':
        testData.metrics.set('initialPageLoad', data.loadTime);
        break;
        
      case 'user_interaction':
        const interactions = testData.metrics.get('userInteractions') || 0;
        testData.metrics.set('userInteractions', interactions + 1);
        testData.metrics.set('userEngagement', this.calculateEngagementScore(testData));
        break;
    }
  }

  /**
   * Update premium presentation metrics
   */
  updatePremiumPresentationMetrics(testData, eventType, data) {
    switch (eventType) {
      case 'premium_limit_reached':
        const limitReached = testData.metrics.get('premiumLimitReached') || 0;
        testData.metrics.set('premiumLimitReached', limitReached + 1);
        break;
        
      case 'upgrade_clicked':
        const upgradeClicks = testData.metrics.get('upgradeClicks') || 0;
        testData.metrics.set('upgradeClicks', upgradeClicks + 1);
        this.updateConversionRate(testData);
        break;
        
      case 'feature_discovered':
        const discoveries = testData.metrics.get('featureDiscoveries') || 0;
        testData.metrics.set('featureDiscoveries', discoveries + 1);
        this.updateFeatureDiscoveryRate(testData);
        break;
    }
  }

  /**
   * Update search optimization metrics
   */
  updateSearchOptimizationMetrics(testData, eventType, data) {
    switch (eventType) {
      case 'search_performed':
        const searches = testData.metrics.get('searchCount') || 0;
        testData.metrics.set('searchCount', searches + 1);
        
        if (data.type === 'advanced') {
          const advancedSearches = testData.metrics.get('advancedSearchCount') || 0;
          testData.metrics.set('advancedSearchCount', advancedSearches + 1);
        }
        
        this.updateSearchMetrics(testData);
        break;
        
      case 'search_successful':
        const successfulSearches = testData.metrics.get('successfulSearches') || 0;
        testData.metrics.set('successfulSearches', successfulSearches + 1);
        this.updateSearchSuccessRate(testData);
        break;
    }
  }

  /**
   * Setup event listeners for A/B testing
   */
  setupEventListeners() {
    // Track module loading events
    document.addEventListener(EVENTS.MODULE_LOADED, (e) => {
      Object.keys(this.activeTests.toJSON ? this.activeTests.toJSON() : {}).forEach(testId => {
        this.trackEvent(testId, 'module_loaded', e.detail);
      });
    });

    // Track search events
    document.addEventListener(EVENTS.SEARCH_PERFORMED, (e) => {
      this.trackEvent('searchInterfaceOptimization', 'search_performed', e.detail);
    });

    // Track premium events
    document.addEventListener(EVENTS.PREMIUM_LIMIT_REACHED, (e) => {
      this.trackEvent('premiumFeaturePresentation', 'premium_limit_reached', e.detail);
    });

    // Track user interactions
    ['click', 'touchstart'].forEach(eventType => {
      document.addEventListener(eventType, () => {
        Object.keys(this.activeTests.toJSON ? this.activeTests.toJSON() : {}).forEach(testId => {
          this.trackEvent(testId, 'user_interaction', { type: eventType });
        });
      }, { passive: true });
    });

    // Track page visibility for session metrics
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.flushTestData();
      }
    });

    // Flush data before page unload
    window.addEventListener('beforeunload', () => {
      this.flushTestData();
    });
  }

  /**
   * Calculate conversion rate
   */
  updateConversionRate(testData) {
    const limitReached = testData.metrics.get('premiumLimitReached') || 0;
    const upgradeClicks = testData.metrics.get('upgradeClicks') || 0;
    const conversionRate = limitReached > 0 ? upgradeClicks / limitReached : 0;
    testData.metrics.set('conversionRate', conversionRate);
  }

  /**
   * Calculate feature discovery rate
   */
  updateFeatureDiscoveryRate(testData) {
    const discoveries = testData.metrics.get('featureDiscoveries') || 0;
    const sessions = 1; // Simple: one discovery per session
    const discoveryRate = discoveries / Math.max(sessions, 1);
    testData.metrics.set('featureDiscovery', Math.min(discoveryRate, 1));
  }

  /**
   * Update search metrics
   */
  updateSearchMetrics(testData) {
    const searches = testData.metrics.get('searchCount') || 0;
    const advancedSearches = testData.metrics.get('advancedSearchCount') || 0;
    
    testData.metrics.set('searchUsage', searches);
    testData.metrics.set('advancedSearchAdoption', searches > 0 ? advancedSearches / searches : 0);
  }

  /**
   * Update search success rate
   */
  updateSearchSuccessRate(testData) {
    const searches = testData.metrics.get('searchCount') || 0;
    const successfulSearches = testData.metrics.get('successfulSearches') || 0;
    const successRate = searches > 0 ? successfulSearches / searches : 0;
    testData.metrics.set('searchSuccess', successRate);
  }

  /**
   * Calculate engagement score
   */
  calculateEngagementScore(testData) {
    const sessionDuration = Date.now() - testData.startTime;
    const interactions = testData.metrics.get('userInteractions') || 0;
    const minutes = sessionDuration / (1000 * 60);
    return minutes > 0 ? interactions / minutes : 0;
  }

  /**
   * Calculate average from array of numbers
   */
  calculateAverage(numbers) {
    return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
  }

  /**
   * Get test results for analysis
   */
  getTestResults(testId) {
    const testData = this.activeTests.get(testId) || this.completedTests.get(testId);
    if (!testData) return null;

    const testDef = this.testDefinitions[testId];
    if (!testDef) return null;

    const results = {
      testId,
      variant: testData.variant,
      startTime: testData.startTime,
      duration: Date.now() - testData.startTime,
      events: testData.events,
      metrics: Object.fromEntries(testData.metrics),
      performance: this.calculateTestPerformance(testId, testData)
    };

    return results;
  }

  /**
   * Calculate test performance against success metrics
   */
  calculateTestPerformance(testId, testData) {
    const testDef = this.testDefinitions[testId];
    const performance = {};

    Object.entries(testDef.successMetrics).forEach(([metric, target]) => {
      const actualValue = testData.metrics.get(metric);
      if (actualValue !== undefined) {
        const isSuccess = target.direction === 'higher' 
          ? actualValue >= target.target
          : actualValue <= target.target;
        
        performance[metric] = {
          actual: actualValue,
          target: target.target,
          direction: target.direction,
          success: isSuccess,
          improvement: this.calculateImprovement(actualValue, target.target, target.direction)
        };
      }
    });

    return performance;
  }

  /**
   * Calculate improvement percentage
   */
  calculateImprovement(actual, target, direction) {
    if (direction === 'higher') {
      return ((actual - target) / target) * 100;
    } else {
      return ((target - actual) / target) * 100;
    }
  }

  /**
   * Complete a test and move to completed tests
   */
  completeTest(testId) {
    const testData = this.activeTests.get(testId);
    if (testData) {
      testData.endTime = Date.now();
      this.completedTests.set(testId, testData);
      this.activeTests.delete(testId);
      
      console.log(`🧪 Test completed: ${testId}`);
      this.flushTestData(testId);
    }
  }

  /**
   * Flush test data to analytics
   */
  async flushTestData(specificTestId = null) {
    try {
      const testsToFlush = specificTestId 
        ? [specificTestId] 
        : [...this.activeTests.keys(), ...this.completedTests.keys()];

      for (const testId of testsToFlush) {
        const results = this.getTestResults(testId);
        if (results) {
          // Send to analytics endpoint
          await this.sendTestResults(results);
        }
      }
    } catch (error) {
      console.warn('Failed to flush A/B test data:', error);
    }
  }

  /**
   * Send test results to analytics
   */
  async sendTestResults(results) {
    try {
      if (window.fetch) {
        await fetch('/api/analytics/ab-tests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: this.userId,
            sessionId: performanceMonitor.sessionId,
            timestamp: Date.now(),
            ...results
          }),
          keepalive: true
        });
      }

      // Also log to console for development
      console.log('🧪 A/B Test Results:', results);

    } catch (error) {
      console.warn('Failed to send A/B test results:', error);
    }
  }

  /**
   * Utility methods
   */
  generateUserId() {
    // Generate consistent user ID (in production, this would be from authentication)
    let userId = localStorage.getItem('ab_test_user_id');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('ab_test_user_id', userId);
    }
    return userId;
  }

  hashUserId() {
    // Simple hash function for variant assignment
    let hash = 0;
    for (let i = 0; i < this.userId.length; i++) {
      const char = this.userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  getTestStartTime(testId) {
    const storedTime = localStorage.getItem(`ab_test_start_${testId}`);
    if (!storedTime) {
      const startTime = Date.now();
      localStorage.setItem(`ab_test_start_${testId}`, startTime.toString());
      return startTime;
    }
    return parseInt(storedTime, 10);
  }

  loadUserTestHistory() {
    try {
      const history = localStorage.getItem('ab_test_history');
      if (history) {
        const parsed = JSON.parse(history);
        parsed.completed.forEach(testId => {
          this.completedTests.set(testId, { testId, completed: true });
        });
      }
    } catch (error) {
      console.warn('Failed to load A/B test history:', error);
    }
  }

  saveUserTestHistory() {
    try {
      const history = {
        completed: Array.from(this.completedTests.keys()),
        lastUpdated: Date.now()
      };
      localStorage.setItem('ab_test_history', JSON.stringify(history));
    } catch (error) {
      console.warn('Failed to save A/B test history:', error);
    }
  }

  /**
   * Get current test configuration for other modules
   */
  getTestConfig(category) {
    return window.abTestConfig?.[category] || {};
  }

  /**
   * Check if user is in specific test variant
   */
  isInVariant(testId, variantId) {
    const testData = this.activeTests.get(testId);
    return testData?.variant?.id === variantId;
  }

  /**
   * Get active tests summary
   */
  getActiveTestsSummary() {
    const summary = {};
    this.activeTests.forEach((testData, testId) => {
      summary[testId] = {
        variant: testData.variant.id,
        duration: Date.now() - testData.startTime,
        events: testData.events.length,
        metrics: Object.fromEntries(testData.metrics)
      };
    });
    return summary;
  }
}

// Export singleton instance
export const abTesting = new ABTestingFramework();
export default ABTestingFramework;