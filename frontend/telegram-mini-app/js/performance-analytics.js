/**
 * Zone News Mini App - Performance Analytics Service
 * Comprehensive performance monitoring and user behavior tracking
 */

'use strict';

// ===== PERFORMANCE ANALYTICS SERVICE =====
export class PerformanceAnalytics {
  constructor(options = {}) {
    this.options = {
      enableRealTimeMetrics: true,
      enableUserTracking: true,
      enableErrorTracking: true,
      enableNetworkTracking: true,
      sampleRate: 1.0, // 100% sampling by default
      bufferSize: 100,
      flushInterval: 30000, // 30 seconds
      ...options
    };

    // Performance metrics storage
    this.metrics = {
      pageLoad: new Map(),
      userInteractions: new Map(),
      moduleLoading: new Map(),
      apiCalls: new Map(),
      errors: new Map(),
      networkRequests: new Map()
    };

    // User behavior tracking
    this.userSession = {
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      interactions: [],
      pageViews: [],
      features: new Set(),
      errors: []
    };

    // Performance observers
    this.observers = new Map();
    
    // Event buffer for batch processing
    this.eventBuffer = [];
    this.flushTimer = null;

    // Initialize performance monitoring
    this.initialize();
  }

  /**
   * Initialize performance monitoring
   */
  initialize() {
    console.log('📊 Initializing Performance Analytics...');

    if (this.shouldSample()) {
      this.setupPerformanceObservers();
      this.setupEventListeners();
      this.startPerformanceMonitoring();
      this.scheduleFlush();
    }

    console.log('✅ Performance Analytics initialized');
  }

  /**
   * Setup performance observers
   */
  setupPerformanceObservers() {
    // Observe navigation timing
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('navigation')) {
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordNavigationTiming(entry);
        }
      });
      navObserver.observe({ entryTypes: ['navigation'] });
      this.observers.set('navigation', navObserver);
    }

    // Observe resource loading
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('resource')) {
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordResourceTiming(entry);
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.set('resource', resourceObserver);
    }

    // Observe layout shifts (CLS)
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            this.recordLayoutShift(entry);
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.set('layout-shift', clsObserver);
    }

    // Observe long tasks
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordLongTask(entry);
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.set('longtask', longTaskObserver);
    }

    // Observe paint timing
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('paint')) {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordPaintTiming(entry);
        }
      });
      paintObserver.observe({ entryTypes: ['paint'] });
      this.observers.set('paint', paintObserver);
    }
  }

  /**
   * Setup event listeners for user interactions
   */
  setupEventListeners() {
    // Track user interactions
    ['click', 'touchstart', 'keydown', 'scroll'].forEach(eventType => {
      document.addEventListener(eventType, (event) => {
        this.recordUserInteraction(eventType, event);
      }, { passive: true });
    });

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      this.recordVisibilityChange();
    });

    // Track online/offline status
    window.addEventListener('online', () => {
      this.recordConnectionChange('online');
    });

    window.addEventListener('offline', () => {
      this.recordConnectionChange('offline');
    });

    // Track window performance
    window.addEventListener('load', () => {
      this.recordPageLoad();
    });

    // Track errors
    if (this.options.enableErrorTracking) {
      window.addEventListener('error', (event) => {
        this.recordError('javascript', event);
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.recordError('promise', event);
      });
    }
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    // Monitor Core Web Vitals
    this.measureCoreWebVitals();
    
    // Monitor memory usage
    this.startMemoryMonitoring();
    
    // Monitor network quality
    this.monitorNetworkQuality();
  }

  /**
   * Measure Core Web Vitals
   */
  measureCoreWebVitals() {
    // Largest Contentful Paint (LCP)
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      this.recordCoreWebVital('LCP', lastEntry.startTime);
    }).observe({ entryTypes: ['largest-contentful-paint'] });

    // First Input Delay (FID)
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        this.recordCoreWebVital('FID', entry.processingStart - entry.startTime);
      }
    }).observe({ entryTypes: ['first-input'] });

    // Cumulative Layout Shift (CLS) - calculated from layout-shift observer above
  }

  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    if (window.performance && window.performance.memory) {
      setInterval(() => {
        this.recordMemoryUsage();
      }, 10000); // Every 10 seconds
    }
  }

  /**
   * Monitor network quality
   */
  monitorNetworkQuality() {
    if (navigator.connection) {
      this.recordNetworkInfo();
      
      navigator.connection.addEventListener('change', () => {
        this.recordNetworkInfo();
      });
    }
  }

  /**
   * Record navigation timing
   */
  recordNavigationTiming(entry) {
    const timing = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'navigation',
      metrics: {
        dns: entry.domainLookupEnd - entry.domainLookupStart,
        tcp: entry.connectEnd - entry.connectStart,
        request: entry.responseStart - entry.requestStart,
        response: entry.responseEnd - entry.responseStart,
        dom: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
        load: entry.loadEventEnd - entry.loadEventStart,
        total: entry.loadEventEnd - entry.fetchStart
      }
    };

    this.addEvent('navigation_timing', timing);
  }

  /**
   * Record resource timing
   */
  recordResourceTiming(entry) {
    // Only track significant resources
    if (entry.transferSize > 1000 || entry.duration > 100) {
      const timing = {
        timestamp: Date.now(),
        sessionId: this.userSession.sessionId,
        type: 'resource',
        resource: {
          name: entry.name,
          type: this.getResourceType(entry.name),
          size: entry.transferSize,
          duration: entry.duration,
          cached: entry.transferSize === 0 && entry.decodedBodySize > 0
        }
      };

      this.addEvent('resource_timing', timing);
    }
  }

  /**
   * Record layout shift
   */
  recordLayoutShift(entry) {
    const shift = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'layout_shift',
      value: entry.value,
      sources: entry.sources?.map(source => ({
        node: source.node?.tagName || 'unknown',
        previousRect: source.previousRect,
        currentRect: source.currentRect
      })) || []
    };

    this.addEvent('layout_shift', shift);
    
    // Update CLS score
    this.updateCLSScore(entry.value);
  }

  /**
   * Record long task
   */
  recordLongTask(entry) {
    const task = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'long_task',
      duration: entry.duration,
      startTime: entry.startTime,
      attribution: entry.attribution?.map(attr => ({
        name: attr.name,
        type: attr.entryType,
        containerType: attr.containerType,
        containerName: attr.containerName
      })) || []
    };

    this.addEvent('long_task', task);
  }

  /**
   * Record paint timing
   */
  recordPaintTiming(entry) {
    const paint = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'paint',
      name: entry.name,
      startTime: entry.startTime
    };

    this.addEvent('paint_timing', paint);
  }

  /**
   * Record user interaction
   */
  recordUserInteraction(eventType, event) {
    // Throttle interaction recording
    if (this.shouldThrottleInteraction(eventType)) return;

    const interaction = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'user_interaction',
      eventType,
      target: this.getEventTarget(event),
      coordinates: this.getEventCoordinates(event)
    };

    this.userSession.interactions.push(interaction);
    this.addEvent('user_interaction', interaction);
  }

  /**
   * Record Core Web Vital
   */
  recordCoreWebVital(metric, value) {
    const vital = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'core_web_vital',
      metric,
      value,
      rating: this.getCoreWebVitalRating(metric, value)
    };

    this.addEvent('core_web_vital', vital);
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage() {
    if (window.performance && window.performance.memory) {
      const memory = {
        timestamp: Date.now(),
        sessionId: this.userSession.sessionId,
        type: 'memory_usage',
        usedJSHeapSize: window.performance.memory.usedJSHeapSize,
        totalJSHeapSize: window.performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit
      };

      this.addEvent('memory_usage', memory);
    }
  }

  /**
   * Record network information
   */
  recordNetworkInfo() {
    if (navigator.connection) {
      const network = {
        timestamp: Date.now(),
        sessionId: this.userSession.sessionId,
        type: 'network_info',
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      };

      this.addEvent('network_info', network);
    }
  }

  /**
   * Record error
   */
  recordError(errorType, event) {
    const error = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'error',
      errorType,
      message: event.message || event.reason?.message || 'Unknown error',
      filename: event.filename || event.reason?.stack?.split('\n')[0] || 'unknown',
      lineno: event.lineno || 0,
      colno: event.colno || 0,
      stack: event.error?.stack || event.reason?.stack || '',
      userAgent: navigator.userAgent
    };

    this.userSession.errors.push(error);
    this.addEvent('error', error);
  }

  /**
   * Track module loading performance
   */
  trackModuleLoad(moduleName, startTime, endTime, success = true) {
    const moduleLoad = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'module_load',
      moduleName,
      duration: endTime - startTime,
      success,
      startTime,
      endTime
    };

    this.addEvent('module_load', moduleLoad);
  }

  /**
   * Track API call performance
   */
  trackAPICall(endpoint, method, startTime, endTime, status, size = 0) {
    const apiCall = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'api_call',
      endpoint,
      method,
      duration: endTime - startTime,
      status,
      size,
      success: status >= 200 && status < 400
    };

    this.addEvent('api_call', apiCall);
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(featureName, action, metadata = {}) {
    this.userSession.features.add(featureName);

    const feature = {
      timestamp: Date.now(),
      sessionId: this.userSession.sessionId,
      type: 'feature_usage',
      featureName,
      action,
      metadata
    };

    this.addEvent('feature_usage', feature);
  }

  /**
   * Add event to buffer
   */
  addEvent(eventType, eventData) {
    if (this.eventBuffer.length >= this.options.bufferSize) {
      this.flush();
    }

    this.eventBuffer.push({
      eventType,
      eventData,
      timestamp: Date.now()
    });
  }

  /**
   * Flush events to storage/analytics
   */
  flush() {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    // Store locally
    this.storeEventsLocally(events);

    // Send to analytics service
    this.sendToAnalytics(events);

    console.log(`📊 Flushed ${events.length} analytics events`);
  }

  /**
   * Store events locally
   */
  storeEventsLocally(events) {
    try {
      const stored = JSON.parse(localStorage.getItem('zone_news_analytics') || '[]');
      stored.push(...events);
      
      // Keep only last 1000 events
      if (stored.length > 1000) {
        stored.splice(0, stored.length - 1000);
      }
      
      localStorage.setItem('zone_news_analytics', JSON.stringify(stored));
    } catch (error) {
      console.warn('Failed to store analytics locally:', error);
    }
  }

  /**
   * Send events to analytics service
   */
  async sendToAnalytics(events) {
    // Send to Google Analytics
    if (window.gtag) {
      events.forEach(event => {
        window.gtag('event', event.eventType, {
          event_category: 'performance',
          event_label: event.eventData.type,
          value: event.eventData.duration || event.eventData.value || 1,
          custom_parameters: {
            session_id: event.eventData.sessionId
          }
        });
      });
    }

    // Send to custom analytics endpoint (if available)
    try {
      if (window.fetch) {
        fetch('/api/analytics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            events,
            session: this.getSessionSummary()
          })
        }).catch(error => {
          console.warn('Failed to send analytics to server:', error);
        });
      }
    } catch (error) {
      console.warn('Analytics endpoint not available:', error);
    }
  }

  /**
   * Schedule periodic flush
   */
  scheduleFlush() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.options.flushInterval);
  }

  /**
   * Get session summary
   */
  getSessionSummary() {
    return {
      sessionId: this.userSession.sessionId,
      duration: Date.now() - this.userSession.startTime,
      interactions: this.userSession.interactions.length,
      pageViews: this.userSession.pageViews.length,
      features: Array.from(this.userSession.features),
      errors: this.userSession.errors.length
    };
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const report = {
      session: this.getSessionSummary(),
      coreWebVitals: this.getCoreWebVitalsReport(),
      moduleLoading: this.getModuleLoadingReport(),
      apiPerformance: this.getAPIPerformanceReport(),
      errorRate: this.getErrorRate(),
      networkQuality: this.getNetworkQuality()
    };

    return report;
  }

  /**
   * Utility methods
   */
  shouldSample() {
    return Math.random() < this.options.sampleRate;
  }

  shouldThrottleInteraction(eventType) {
    const now = Date.now();
    const lastTime = this.metrics.userInteractions.get(eventType) || 0;
    
    // Throttle based on event type
    const throttleMs = {
      scroll: 1000,
      mousemove: 2000,
      touchmove: 1000,
      click: 0,
      keydown: 500
    };

    if (now - lastTime < (throttleMs[eventType] || 0)) {
      return true;
    }

    this.metrics.userInteractions.set(eventType, now);
    return false;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getResourceType(url) {
    if (url.endsWith('.js')) return 'script';
    if (url.endsWith('.css')) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|otf)$/)) return 'font';
    return 'other';
  }

  getEventTarget(event) {
    const target = event.target;
    return {
      tagName: target.tagName,
      className: target.className,
      id: target.id,
      textContent: target.textContent?.substring(0, 50) || ''
    };
  }

  getEventCoordinates(event) {
    return {
      clientX: event.clientX || 0,
      clientY: event.clientY || 0,
      pageX: event.pageX || 0,
      pageY: event.pageY || 0
    };
  }

  getCoreWebVitalRating(metric, value) {
    const thresholds = {
      LCP: { good: 2500, needsImprovement: 4000 },
      FID: { good: 100, needsImprovement: 300 },
      CLS: { good: 0.1, needsImprovement: 0.25 }
    };

    const threshold = thresholds[metric];
    if (!threshold) return 'unknown';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.needsImprovement) return 'needs-improvement';
    return 'poor';
  }

  updateCLSScore(value) {
    if (!this.clsScore) this.clsScore = 0;
    this.clsScore += value;
  }

  /**
   * Cleanup
   */
  destroy() {
    // Clear timers
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining events
    this.flush();

    // Disconnect observers
    this.observers.forEach(observer => {
      observer.disconnect();
    });
    this.observers.clear();

    console.log('📊 Performance Analytics destroyed');
  }
}

// Export singleton instance
export const performanceAnalytics = new PerformanceAnalytics();