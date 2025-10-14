/**
 * Zone News Mini App - Error Monitoring Service
 * Comprehensive error tracking and crash reporting
 */

'use strict';

// ===== ERROR MONITORING SERVICE =====
export class ErrorMonitoring {
  constructor(options = {}) {
    this.options = {
      enableConsoleCapture: true,
      enableNetworkCapture: true,
      enablePerformanceTracking: true,
      enableUserInteractionTracking: true,
      maxErrorsPerSession: 50,
      maxBreadcrumbs: 30,
      sampleRate: 1.0,
      beforeSend: null,
      ...options
    };

    // Error storage
    this.errors = [];
    this.breadcrumbs = [];
    this.sessionId = this.generateSessionId();
    this.userId = null;
    
    // Error categories
    this.errorCategories = {
      JAVASCRIPT: 'javascript',
      PROMISE: 'unhandled_promise',
      NETWORK: 'network',
      MODULE_LOAD: 'module_load',
      API: 'api',
      USER_ACTION: 'user_action',
      PERFORMANCE: 'performance'
    };

    // Error severity levels
    this.severityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };

    // Initialize monitoring
    this.initialize();
  }

  /**
   * Initialize error monitoring
   */
  initialize() {
    if (!this.shouldSample()) {
      console.log('📊 Error monitoring disabled by sample rate');
      return;
    }

    console.log('🛡️ Initializing Error Monitoring...');

    this.setupGlobalErrorHandlers();
    this.setupConsoleCapture();
    this.setupNetworkCapture();
    this.setupPerformanceMonitoring();
    this.setupUserInteractionTracking();
    
    // Add initial breadcrumb
    this.addBreadcrumb('system', 'Error monitoring initialized', {
      timestamp: Date.now(),
      sessionId: this.sessionId
    });

    console.log('✅ Error Monitoring initialized');
  }

  /**
   * Setup global error handlers
   */
  setupGlobalErrorHandlers() {
    // JavaScript errors
    window.addEventListener('error', (event) => {
      this.captureError({
        category: this.errorCategories.JAVASCRIPT,
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        error: event.error,
        severity: this.determineSeverity(event.error)
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError({
        category: this.errorCategories.PROMISE,
        message: event.reason?.message || 'Unhandled promise rejection',
        stack: event.reason?.stack,
        error: event.reason,
        severity: this.severityLevels.HIGH
      });
    });

    // Service Worker errors
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('error', (event) => {
        this.captureError({
          category: this.errorCategories.JAVASCRIPT,
          message: 'Service Worker error',
          error: event.error,
          severity: this.severityLevels.MEDIUM
        });
      });
    }
  }

  /**
   * Setup console capture
   */
  setupConsoleCapture() {
    if (!this.options.enableConsoleCapture) return;

    const originalConsole = {
      error: console.error,
      warn: console.warn,
      log: console.log
    };

    // Capture console.error
    console.error = (...args) => {
      originalConsole.error.apply(console, args);
      
      this.addBreadcrumb('console', 'error', {
        message: args.join(' '),
        level: 'error'
      });

      // If it looks like an error object, capture it
      if (args[0] instanceof Error) {
        this.captureError({
          category: this.errorCategories.JAVASCRIPT,
          message: args[0].message,
          stack: args[0].stack,
          error: args[0],
          severity: this.severityLevels.MEDIUM
        });
      }
    };

    // Capture console.warn for debugging
    console.warn = (...args) => {
      originalConsole.warn.apply(console, args);
      
      this.addBreadcrumb('console', 'warning', {
        message: args.join(' '),
        level: 'warning'
      });
    };

    // Capture console.log for debugging context
    console.log = (...args) => {
      originalConsole.log.apply(console, args);
      
      // Only capture important log messages
      if (args.some(arg => typeof arg === 'string' && 
          (arg.includes('Error') || arg.includes('Failed') || arg.includes('❌')))) {
        this.addBreadcrumb('console', 'log', {
          message: args.join(' '),
          level: 'info'
        });
      }
    };
  }

  /**
   * Setup network capture
   */
  setupNetworkCapture() {
    if (!this.options.enableNetworkCapture) return;

    // Capture fetch errors
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = Date.now();
      
      try {
        const response = await originalFetch.apply(window, args);
        const duration = Date.now() - startTime;
        
        // Log network breadcrumb
        this.addBreadcrumb('network', 'fetch', {
          url: args[0],
          method: args[1]?.method || 'GET',
          status: response.status,
          duration
        });

        // Capture network errors
        if (!response.ok) {
          this.captureError({
            category: this.errorCategories.NETWORK,
            message: `Network request failed: ${response.status} ${response.statusText}`,
            metadata: {
              url: args[0],
              method: args[1]?.method || 'GET',
              status: response.status,
              statusText: response.statusText,
              duration
            },
            severity: response.status >= 500 ? this.severityLevels.HIGH : this.severityLevels.MEDIUM
          });
        }

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        this.captureError({
          category: this.errorCategories.NETWORK,
          message: `Network request failed: ${error.message}`,
          stack: error.stack,
          error,
          metadata: {
            url: args[0],
            method: args[1]?.method || 'GET',
            duration
          },
          severity: this.severityLevels.HIGH
        });

        throw error;
      }
    };

    // Capture XMLHttpRequest errors
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._errorMonitoringData = {
        method,
        url,
        startTime: Date.now()
      };
      return originalXHROpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(...args) {
      const errorMonitoring = window.errorMonitoring;
      
      this.addEventListener('error', () => {
        if (errorMonitoring && this._errorMonitoringData) {
          errorMonitoring.captureError({
            category: errorMonitoring.errorCategories.NETWORK,
            message: 'XMLHttpRequest failed',
            metadata: {
              ...this._errorMonitoringData,
              duration: Date.now() - this._errorMonitoringData.startTime
            },
            severity: errorMonitoring.severityLevels.HIGH
          });
        }
      });

      this.addEventListener('load', () => {
        if (errorMonitoring && this._errorMonitoringData) {
          const duration = Date.now() - this._errorMonitoringData.startTime;
          
          errorMonitoring.addBreadcrumb('network', 'xhr', {
            ...this._errorMonitoringData,
            status: this.status,
            duration
          });

          if (this.status >= 400) {
            errorMonitoring.captureError({
              category: errorMonitoring.errorCategories.NETWORK,
              message: `XMLHttpRequest failed: ${this.status} ${this.statusText}`,
              metadata: {
                ...this._errorMonitoringData,
                status: this.status,
                statusText: this.statusText,
                duration
              },
              severity: this.status >= 500 ? errorMonitoring.severityLevels.HIGH : errorMonitoring.severityLevels.MEDIUM
            });
          }
        }
      });

      return originalXHRSend.call(this, ...args);
    };
  }

  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    if (!this.options.enablePerformanceTracking) return;

    // Monitor long tasks
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 100) { // Tasks longer than 100ms
            this.captureError({
              category: this.errorCategories.PERFORMANCE,
              message: `Long task detected: ${entry.duration.toFixed(2)}ms`,
              metadata: {
                duration: entry.duration,
                startTime: entry.startTime,
                attribution: entry.attribution
              },
              severity: entry.duration > 500 ? this.severityLevels.HIGH : this.severityLevels.MEDIUM
            });
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    }

    // Monitor memory usage
    if (window.performance && window.performance.memory) {
      setInterval(() => {
        const memory = window.performance.memory;
        const usagePercentage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
        
        if (usagePercentage > 80) {
          this.captureError({
            category: this.errorCategories.PERFORMANCE,
            message: `High memory usage: ${usagePercentage.toFixed(1)}%`,
            metadata: {
              usedJSHeapSize: memory.usedJSHeapSize,
              totalJSHeapSize: memory.totalJSHeapSize,
              jsHeapSizeLimit: memory.jsHeapSizeLimit,
              usagePercentage
            },
            severity: usagePercentage > 95 ? this.severityLevels.CRITICAL : this.severityLevels.HIGH
          });
        }
      }, 30000); // Check every 30 seconds
    }
  }

  /**
   * Setup user interaction tracking
   */
  setupUserInteractionTracking() {
    if (!this.options.enableUserInteractionTracking) return;

    // Track clicks that might cause errors
    document.addEventListener('click', (event) => {
      this.addBreadcrumb('user', 'click', {
        target: this.getElementSelector(event.target),
        timestamp: Date.now()
      });
    }, { passive: true });

    // Track navigation
    window.addEventListener('beforeunload', () => {
      this.addBreadcrumb('user', 'navigation', {
        type: 'beforeunload',
        timestamp: Date.now()
      });
    });

    // Track visibility changes
    document.addEventListener('visibilitychange', () => {
      this.addBreadcrumb('user', 'visibility', {
        hidden: document.hidden,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Capture error with context
   */
  captureError(errorData) {
    try {
      if (this.errors.length >= this.options.maxErrorsPerSession) {
        console.warn('Max errors per session reached, ignoring new errors');
        return;
      }

      const error = {
        id: this.generateErrorId(),
        sessionId: this.sessionId,
        userId: this.userId,
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        ...errorData,
        breadcrumbs: [...this.breadcrumbs],
        context: this.getErrorContext(),
        fingerprint: this.generateFingerprint(errorData)
      };

      // Apply beforeSend filter
      if (this.options.beforeSend) {
        const filteredError = this.options.beforeSend(error);
        if (!filteredError) {
          return; // Error was filtered out
        }
        Object.assign(error, filteredError);
      }

      this.errors.push(error);
      
      // Add error as breadcrumb
      this.addBreadcrumb('error', 'captured', {
        message: error.message,
        category: error.category,
        severity: error.severity
      });

      // Send to monitoring service
      this.sendError(error);

      console.error('🛡️ Error captured:', error);

    } catch (captureError) {
      console.error('Failed to capture error:', captureError);
    }
  }

  /**
   * Add breadcrumb for debugging context
   */
  addBreadcrumb(category, action, data = {}) {
    const breadcrumb = {
      id: this.generateBreadcrumbId(),
      timestamp: Date.now(),
      category,
      action,
      data
    };

    this.breadcrumbs.push(breadcrumb);

    // Keep only the most recent breadcrumbs
    if (this.breadcrumbs.length > this.options.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  /**
   * Manually capture exception
   */
  captureException(error, context = {}) {
    this.captureError({
      category: this.errorCategories.JAVASCRIPT,
      message: error.message,
      stack: error.stack,
      error,
      severity: this.severityLevels.HIGH,
      ...context
    });
  }

  /**
   * Manually capture message
   */
  captureMessage(message, level = 'info', context = {}) {
    this.addBreadcrumb('manual', 'message', {
      message,
      level,
      ...context
    });
  }

  /**
   * Set user context
   */
  setUser(user) {
    this.userId = user.id;
    this.userContext = user;
    
    this.addBreadcrumb('user', 'identified', {
      userId: user.id,
      userTier: user.tier || 'unknown'
    });
  }

  /**
   * Set additional context
   */
  setContext(key, data) {
    if (!this.additionalContext) {
      this.additionalContext = {};
    }
    this.additionalContext[key] = data;
  }

  /**
   * Get error context
   */
  getErrorContext() {
    return {
      timestamp: Date.now(),
      url: window.location.href,
      referrer: document.referrer,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth
      },
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt
      } : null,
      memory: window.performance?.memory ? {
        usedJSHeapSize: window.performance.memory.usedJSHeapSize,
        totalJSHeapSize: window.performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit
      } : null,
      user: this.userContext,
      additional: this.additionalContext
    };
  }

  /**
   * Determine error severity
   */
  determineSeverity(error) {
    if (!error) return this.severityLevels.LOW;

    // Network and API errors
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      return this.severityLevels.HIGH;
    }

    // Module loading errors
    if (error.message?.includes('import') || error.message?.includes('module')) {
      return this.severityLevels.CRITICAL;
    }

    // TypeError usually indicates serious issues
    if (error instanceof TypeError) {
      return this.severityLevels.HIGH;
    }

    // ReferenceError indicates missing dependencies
    if (error instanceof ReferenceError) {
      return this.severityLevels.HIGH;
    }

    // Default to medium
    return this.severityLevels.MEDIUM;
  }

  /**
   * Generate error fingerprint for grouping
   */
  generateFingerprint(errorData) {
    const components = [
      errorData.category,
      errorData.message?.replace(/\d+/g, 'N'), // Replace numbers
      errorData.filename?.split('/').pop(), // Just filename
      errorData.lineno ? 'L' + errorData.lineno : ''
    ].filter(Boolean);

    return btoa(components.join('|')).substring(0, 16);
  }

  /**
   * Send error to monitoring service
   */
  async sendError(error) {
    try {
      // Send to multiple endpoints
      const promises = [];

      // Send to analytics
      if (window.gtag) {
        promises.push(
          new Promise(resolve => {
            window.gtag('event', 'exception', {
              description: error.message,
              fatal: error.severity === this.severityLevels.CRITICAL,
              custom_parameters: {
                category: error.category,
                severity: error.severity,
                fingerprint: error.fingerprint
              }
            });
            resolve();
          })
        );
      }

      // Send to custom endpoint
      if (window.fetch) {
        promises.push(
          fetch('/api/errors', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(error)
          }).catch(err => {
            console.warn('Failed to send error to server:', err);
          })
        );
      }

      // Store locally as backup
      promises.push(this.storeErrorLocally(error));

      await Promise.allSettled(promises);

    } catch (sendError) {
      console.error('Failed to send error:', sendError);
    }
  }

  /**
   * Store error locally
   */
  async storeErrorLocally(error) {
    try {
      const stored = JSON.parse(localStorage.getItem('zone_news_errors') || '[]');
      stored.push(error);
      
      // Keep only last 50 errors
      if (stored.length > 50) {
        stored.splice(0, stored.length - 50);
      }
      
      localStorage.setItem('zone_news_errors', JSON.stringify(stored));
    } catch (storageError) {
      console.warn('Failed to store error locally:', storageError);
    }
  }

  /**
   * Get element selector
   */
  getElementSelector(element) {
    if (!element) return '';
    
    const parts = [];
    
    if (element.id) {
      parts.push(`#${element.id}`);
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(Boolean);
      parts.push(`.${classes.join('.')}`);
    }
    
    parts.unshift(element.tagName.toLowerCase());
    
    return parts.join('');
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const errorsByCategory = {};
    const errorsBySeverity = {};
    
    this.errors.forEach(error => {
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    });

    return {
      totalErrors: this.errors.length,
      totalBreadcrumbs: this.breadcrumbs.length,
      errorsByCategory,
      errorsBySeverity,
      sessionId: this.sessionId,
      sessionDuration: Date.now() - this.sessionStartTime
    };
  }

  /**
   * Utility methods
   */
  shouldSample() {
    return Math.random() < this.options.sampleRate;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateBreadcrumbId() {
    return `bc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      status: 'healthy',
      sessionId: this.sessionId,
      errorsCount: this.errors.length,
      breadcrumbsCount: this.breadcrumbs.length,
      samplingEnabled: this.shouldSample(),
      options: this.options
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    // Clear errors and breadcrumbs
    this.errors = [];
    this.breadcrumbs = [];
    
    // Reset context
    this.userId = null;
    this.userContext = null;
    this.additionalContext = null;
    
    console.log('🛡️ Error Monitoring destroyed');
  }
}

// Export singleton instance
export const errorMonitoring = new ErrorMonitoring();

// Make globally available for manual error capture
window.errorMonitoring = errorMonitoring;