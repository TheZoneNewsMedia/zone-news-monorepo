/**
 * Zone News Mini App - Performance Dashboard
 * Real-time visualization of performance metrics and optimization insights
 */

'use strict';

import { performanceMonitor } from './performance-monitor.js';
import { UIUtils } from './ui-core.js';

// ===== PERFORMANCE DASHBOARD =====
export class PerformanceDashboard {
  constructor(coreUI) {
    this.core = coreUI;
    this.monitor = performanceMonitor;
    this.dashboardContainer = null;
    this.updateInterval = null;
    this.isVisible = false;
    
    console.log('📊 Performance Dashboard initialized');
  }

  /**
   * Show performance dashboard modal
   */
  showDashboard() {
    const dashboardData = this.monitor.getDashboardData();
    
    const content = this.createDashboardContent(dashboardData);
    
    const actions = `
      <button class="btn btn-secondary modal-close-btn">Close</button>
      <button class="btn btn-outline refresh-dashboard-btn">Refresh</button>
      <button class="btn btn-primary export-metrics-btn">Export Metrics</button>
    `;

    const modal = this.core.showModal(content, {
      title: '📊 Performance Dashboard',
      actions: actions,
      className: 'performance-dashboard-modal'
    });

    this.dashboardContainer = modal;
    this.isVisible = true;
    
    // Setup dashboard handlers
    this.setupDashboardHandlers(modal);
    
    // Start auto-refresh
    this.startAutoRefresh();
    
    return modal;
  }

  /**
   * Create dashboard content
   */
  createDashboardContent(data) {
    return `
      <div class="performance-dashboard">
        <!-- Session Overview -->
        <div class="dashboard-section">
          <h4 class="section-title">📱 Current Session</h4>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-label">Session Duration</div>
              <div class="metric-value">${this.formatDuration(data.currentSession.duration)}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Modules Loaded</div>
              <div class="metric-value">${data.currentSession.modulesLoaded}/6</div>
              <div class="metric-subtitle">${this.getModuleLoadingStatus(data.currentSession.modulesLoaded)}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Session ID</div>
              <div class="metric-value session-id">${data.currentSession.sessionId.split('_')[2]}</div>
            </div>
          </div>
        </div>

        <!-- Core Web Vitals -->
        <div class="dashboard-section">
          <h4 class="section-title">⚡ Core Web Vitals</h4>
          <div class="metrics-grid">
            <div class="metric-card ${this.getVitalScore('lcp', data.coreWebVitals.lcp)}">
              <div class="metric-label">LCP</div>
              <div class="metric-value">${this.formatWebVital('lcp', data.coreWebVitals.lcp)}</div>
              <div class="metric-subtitle">Largest Contentful Paint</div>
            </div>
            <div class="metric-card ${this.getVitalScore('fid', data.coreWebVitals.fid)}">
              <div class="metric-label">FID</div>
              <div class="metric-value">${this.formatWebVital('fid', data.coreWebVitals.fid)}</div>
              <div class="metric-subtitle">First Input Delay</div>
            </div>
            <div class="metric-card ${this.getVitalScore('cls', data.coreWebVitals.cls)}">
              <div class="metric-label">CLS</div>
              <div class="metric-value">${this.formatWebVital('cls', data.coreWebVitals.cls)}</div>
              <div class="metric-subtitle">Cumulative Layout Shift</div>
            </div>
          </div>
        </div>

        <!-- Bundle Optimization -->
        <div class="dashboard-section">
          <h4 class="section-title">📦 Bundle Optimization</h4>
          <div class="bundle-metrics">
            ${this.createBundleVisualization(data.bundleMetrics)}
          </div>
        </div>

        <!-- Recent Interactions -->
        <div class="dashboard-section">
          <h4 class="section-title">👆 Recent User Interactions</h4>
          <div class="interactions-timeline">
            ${this.createInteractionsTimeline(data.recentInteractions)}
          </div>
        </div>

        <!-- Optimization Recommendations -->
        <div class="dashboard-section">
          <h4 class="section-title">💡 Optimization Recommendations</h4>
          <div class="recommendations-list">
            ${this.createRecommendationsList(data.recommendations)}
          </div>
        </div>

        <!-- Performance Summary -->
        <div class="dashboard-section">
          <h4 class="section-title">📈 Performance Summary</h4>
          <div class="summary-stats">
            ${this.createPerformanceSummary()}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create bundle optimization visualization
   */
  createBundleVisualization(bundleMetrics) {
    if (!bundleMetrics || Object.keys(bundleMetrics).length === 0) {
      return `
        <div class="bundle-status">
          <div class="bundle-info">
            <span class="bundle-icon">🎯</span>
            <span class="bundle-text">Optimal bundle loading - no lazy modules loaded yet</span>
          </div>
          <div class="bundle-savings">
            <span class="savings-label">Potential Savings:</span>
            <span class="savings-value">~78KB (65% reduction)</span>
          </div>
        </div>
      `;
    }

    const lazyModules = Object.entries(bundleMetrics).filter(([key]) => key.startsWith('lazy_'));
    let totalSavings = 0;
    
    const modulesList = lazyModules.map(([key, metric]) => {
      const moduleName = key.replace('lazy_', '');
      totalSavings += metric.bundleSavings?.savedKB || 0;
      
      return `
        <div class="bundle-module">
          <div class="module-header">
            <span class="module-name">${this.getModuleDisplayName(moduleName)}</span>
            <span class="module-status ${metric.success ? 'loaded' : 'failed'}">${metric.success ? '✅' : '❌'}</span>
          </div>
          <div class="module-metrics">
            <span class="load-time">${metric.loadTime || 0}ms load time</span>
            <span class="savings">Saved ${metric.bundleSavings?.savedKB || 0}KB initially</span>
          </div>
          <div class="module-timing">
            <span class="timing-label">Loaded after:</span>
            <span class="timing-value">${this.formatDuration(metric.timeToFirstLoad)}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="bundle-overview">
        <div class="bundle-summary">
          <span class="summary-label">Total Bundle Savings:</span>
          <span class="summary-value">${totalSavings}KB</span>
        </div>
        <div class="bundle-efficiency">
          <span class="efficiency-label">Lazy Loading Efficiency:</span>
          <span class="efficiency-value">${this.calculateLazyLoadingEfficiency(lazyModules.length)}%</span>
        </div>
      </div>
      <div class="loaded-modules">
        ${modulesList}
      </div>
    `;
  }

  /**
   * Create interactions timeline
   */
  createInteractionsTimeline(interactions) {
    if (!interactions || interactions.length === 0) {
      return '<div class="no-interactions">No recent interactions tracked</div>';
    }

    return interactions.map(interaction => {
      const timeAgo = Date.now() - interaction.timestamp;
      const icon = this.getInteractionIcon(interaction.type);
      
      return `
        <div class="interaction-item">
          <div class="interaction-icon">${icon}</div>
          <div class="interaction-details">
            <div class="interaction-type">${this.formatInteractionType(interaction.type)}</div>
            <div class="interaction-time">${this.formatTimeAgo(timeAgo)} ago</div>
            ${interaction.target ? `<div class="interaction-target">on ${interaction.target}</div>` : ''}
          </div>
          <div class="interaction-metrics">
            ${interaction.responseTime ? `<span class="response-time">${Math.round(interaction.responseTime)}ms</span>` : ''}
            ${interaction.loadTime ? `<span class="load-time">+${interaction.loadTime}ms load</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Create recommendations list
   */
  createRecommendationsList(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      return `
        <div class="no-recommendations">
          <span class="recommendation-icon">✨</span>
          <span class="recommendation-text">Performance is optimal! No recommendations at this time.</span>
        </div>
      `;
    }

    return recommendations.map(rec => {
      const priorityClass = `priority-${rec.priority}`;
      const priorityIcon = this.getPriorityIcon(rec.priority);
      
      return `
        <div class="recommendation-item ${priorityClass}">
          <div class="recommendation-header">
            <span class="recommendation-priority">${priorityIcon} ${rec.priority.toUpperCase()}</span>
            <span class="recommendation-type">${rec.type}</span>
          </div>
          <div class="recommendation-message">${rec.message}</div>
          <div class="recommendation-action">
            <span class="action-label">Suggested action:</span>
            <span class="action-text">${rec.action}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Create performance summary
   */
  createPerformanceSummary() {
    const summary = this.monitor.getPerformanceSummary();
    
    return `
      <div class="summary-grid">
        <div class="summary-metric">
          <div class="summary-label">Bundle Efficiency</div>
          <div class="summary-value">${summary.bundleOptimization?.loadedPercentage?.toFixed(1) || 0}%</div>
          <div class="summary-subtitle">Modules loaded on demand</div>
        </div>
        <div class="summary-metric">
          <div class="summary-label">Average Load Time</div>
          <div class="summary-value">${Math.round(summary.moduleLoading?.averageLoadTime || 0)}ms</div>
          <div class="summary-subtitle">Module loading performance</div>
        </div>
        <div class="summary-metric">
          <div class="summary-label">Search Performance</div>
          <div class="summary-value">${Math.round(summary.searchPerformance?.averageResponseTime || 0)}ms</div>
          <div class="summary-subtitle">Average search response time</div>
        </div>
        <div class="summary-metric">
          <div class="summary-label">User Engagement</div>
          <div class="summary-value">${summary.userExperience?.interactionCount || 0}</div>
          <div class="summary-subtitle">Interactions this session</div>
        </div>
      </div>
    `;
  }

  /**
   * Setup dashboard event handlers
   */
  setupDashboardHandlers(modal) {
    // Refresh button
    const refreshBtn = modal.querySelector('.refresh-dashboard-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshDashboard();
      });
    }

    // Export button
    const exportBtn = modal.querySelector('.export-metrics-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportMetrics();
      });
    }

    // Close handler
    const closeBtn = modal.querySelector('.modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideDashboard();
      });
    }
  }

  /**
   * Start auto-refresh of dashboard data
   */
  startAutoRefresh() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      if (this.isVisible && this.dashboardContainer) {
        this.refreshDashboard();
      }
    }, 5000); // Refresh every 5 seconds
  }

  /**
   * Refresh dashboard data
   */
  refreshDashboard() {
    if (!this.dashboardContainer) return;

    const dashboardData = this.monitor.getDashboardData();
    const dashboardElement = this.dashboardContainer.querySelector('.performance-dashboard');
    
    if (dashboardElement) {
      dashboardElement.innerHTML = this.createDashboardContent(dashboardData).replace(
        '<div class="performance-dashboard">', ''
      ).replace('</div>', '');
    }

    console.log('📊 Dashboard refreshed');
  }

  /**
   * Hide dashboard and cleanup
   */
  hideDashboard() {
    this.isVisible = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.dashboardContainer) {
      this.core.hideModal(this.dashboardContainer);
      this.dashboardContainer = null;
    }
  }

  /**
   * Export metrics to JSON file
   */
  exportMetrics() {
    try {
      const summary = this.monitor.getPerformanceSummary();
      const dataStr = JSON.stringify(summary, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `zone-news-performance-${Date.now()}.json`;
      link.click();
      
      this.core.showToast('Performance metrics exported! 📊', 'success');
      
    } catch (error) {
      console.error('Export failed:', error);
      this.core.showToast('Export failed. Please try again.', 'error');
    }
  }

  /**
   * Utility formatting methods
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  formatWebVital(type, value) {
    if (value === null || value === undefined) return 'N/A';
    
    switch (type) {
      case 'lcp':
        return `${(value / 1000).toFixed(2)}s`;
      case 'fid':
        return `${Math.round(value)}ms`;
      case 'cls':
        return value.toFixed(3);
      default:
        return Math.round(value);
    }
  }

  getVitalScore(type, value) {
    if (value === null || value === undefined) return 'metric-unknown';
    
    const thresholds = {
      lcp: { good: 2500, poor: 4000 },
      fid: { good: 100, poor: 300 },
      cls: { good: 0.1, poor: 0.25 }
    };

    const threshold = thresholds[type];
    if (!threshold) return 'metric-unknown';

    if (value <= threshold.good) return 'metric-good';
    if (value <= threshold.poor) return 'metric-needs-improvement';
    return 'metric-poor';
  }

  getModuleLoadingStatus(loadedCount) {
    if (loadedCount <= 2) return 'Optimal loading';
    if (loadedCount <= 4) return 'Good performance';
    return 'All modules loaded';
  }

  getModuleDisplayName(moduleName) {
    const displayNames = {
      sharing: 'Sharing System',
      forms: 'Forms & Input',
      'search-advanced': 'Advanced Search',
      premium: 'Premium Features'
    };
    return displayNames[moduleName] || moduleName;
  }

  calculateLazyLoadingEfficiency(loadedModulesCount) {
    const totalLazyModules = 4; // sharing, forms, search-advanced, premium
    const notLoadedCount = totalLazyModules - loadedModulesCount;
    return Math.round((notLoadedCount / totalLazyModules) * 100);
  }

  getInteractionIcon(type) {
    const icons = {
      click: '👆',
      touchstart: '👇',
      keydown: '⌨️',
      search: '🔍',
      share: '📤',
      comment: '💬',
      premium: '💎'
    };
    return icons[type] || '👆';
  }

  formatInteractionType(type) {
    const types = {
      click: 'Click',
      touchstart: 'Touch',
      keydown: 'Keyboard',
      search: 'Search',
      share: 'Share',
      comment: 'Comment',
      premium: 'Premium Action'
    };
    return types[type] || type;
  }

  formatTimeAgo(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getPriorityIcon(priority) {
    const icons = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };
    return icons[priority] || '⚪';
  }

  /**
   * Create performance debugging overlay (for development)
   */
  createDebugOverlay() {
    if (document.querySelector('.performance-debug-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'performance-debug-overlay';
    overlay.innerHTML = `
      <div class="debug-header">
        <span class="debug-title">⚡ Performance</span>
        <button class="debug-close">×</button>
      </div>
      <div class="debug-metrics">
        <div class="debug-metric">
          <span class="debug-label">Modules:</span>
          <span class="debug-value" id="debug-modules">0/6</span>
        </div>
        <div class="debug-metric">
          <span class="debug-label">Memory:</span>
          <span class="debug-value" id="debug-memory">N/A</span>
        </div>
        <div class="debug-metric">
          <span class="debug-label">FPS:</span>
          <span class="debug-value" id="debug-fps">60</span>
        </div>
      </div>
    `;

    // Add styles
    overlay.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 10px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 10000;
      min-width: 150px;
    `;

    document.body.appendChild(overlay);

    // Setup close handler
    overlay.querySelector('.debug-close').addEventListener('click', () => {
      overlay.remove();
    });

    // Update debug info
    setInterval(() => {
      const data = this.monitor.getDashboardData();
      overlay.querySelector('#debug-modules').textContent = `${data.currentSession.modulesLoaded}/6`;
      
      if (performance.memory) {
        const memory = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        overlay.querySelector('#debug-memory').textContent = `${memory}MB`;
      }
    }, 1000);

    return overlay;
  }
}

// Export for use in development/admin interfaces
export default PerformanceDashboard;