/**
 * Zone News Mini App - Core UI Components
 * Essential UI components loaded immediately (critical path)
 */

'use strict';

import { APP_CONFIG, APP_STATE, EVENTS } from './config.js';

// ===== CORE UI COMPONENTS =====
export class UICoreComponents {
  constructor() {
    this.toastContainer = null;
    this.modalContainer = null;
    this.setupToastContainer();
    this.setupModalContainer();
  }

  /**
   * Setup toast notification container
   */
  setupToastContainer() {
    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'toast-container';
    this.toastContainer.setAttribute('aria-live', 'polite');
    this.toastContainer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(this.toastContainer);
  }

  /**
   * Setup modal container
   */
  setupModalContainer() {
    this.modalContainer = document.createElement('div');
    this.modalContainer.className = 'modal-container';
    this.modalContainer.style.display = 'none';
    document.body.appendChild(this.modalContainer);
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info', duration = APP_CONFIG.TOAST_DURATION) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${this.getToastIcon(type)}</span>
        <span class="toast-message">${this.escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Close notification">×</button>
      </div>
    `;

    // Add to container
    this.toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // Setup close handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.hideToast(toast));

    // Auto hide
    if (duration > 0) {
      setTimeout(() => this.hideToast(toast), duration);
    }

    return toast;
  }

  /**
   * Hide toast notification
   */
  hideToast(toast) {
    toast.classList.add('toast-hide');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, APP_CONFIG.ANIMATION_DURATION);
  }

  /**
   * Get toast icon based on type
   */
  getToastIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  /**
   * Show loading spinner
   */
  showLoading(container, message = 'Loading...') {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.innerHTML = `
      <div class="spinner-animation"></div>
      <p class="loading-text">${this.escapeHtml(message)}</p>
    `;
    
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    
    container.appendChild(spinner);
    return spinner;
  }

  /**
   * Hide loading spinner
   */
  hideLoading(container) {
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    
    const spinner = container.querySelector('.loading-spinner');
    if (spinner) {
      spinner.remove();
    }
  }

  /**
   * Create skeleton loader
   */
  createSkeletonLoader(count = 3) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-container';
    
    for (let i = 0; i < count; i++) {
      const item = document.createElement('div');
      item.className = 'skeleton-item';
      item.innerHTML = `
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-subtitle"></div>
        <div class="skeleton-line skeleton-content"></div>
      `;
      skeleton.appendChild(item);
    }
    
    return skeleton;
  }

  /**
   * Show basic modal dialog
   */
  showModal(content, options = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h3 id="modal-title">${this.escapeHtml(options.title || 'Modal')}</h3>
          <button class="modal-close" aria-label="Close modal">×</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        ${options.actions ? `<div class="modal-footer">${options.actions}</div>` : ''}
      </div>
    `;

    this.modalContainer.appendChild(modal);
    this.modalContainer.style.display = 'flex';

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('modal-show');
    });

    // Setup close handlers
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');
    
    const closeHandler = () => this.hideModal(modal);
    closeBtn.addEventListener('click', closeHandler);
    backdrop.addEventListener('click', closeHandler);

    // Focus management
    const dialog = modal.querySelector('.modal-dialog');
    dialog.focus();

    // Escape key handler
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeHandler();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    return modal;
  }

  /**
   * Hide modal dialog
   */
  hideModal(modal) {
    modal.classList.add('modal-hide');
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      if (this.modalContainer.children.length === 0) {
        this.modalContainer.style.display = 'none';
      }
    }, APP_CONFIG.ANIMATION_DURATION);
  }

  /**
   * Create article card
   */
  createArticleCard(article, options = {}) {
    const card = document.createElement('article');
    card.className = 'article-card';
    card.setAttribute('data-article-id', article.id);
    
    const publishedDate = new Date(article.published_date);
    const timeAgo = this.getTimeAgo(publishedDate);
    
    card.innerHTML = `
      <div class="article-card-header">
        <div class="article-meta">
          <span class="article-category">${this.escapeHtml(article.category)}</span>
          <span class="article-scope">${this.escapeHtml(article.scope)}</span>
          <time class="article-time" datetime="${article.published_date}">${timeAgo}</time>
        </div>
        <button class="article-save-btn ${options.isSaved ? 'saved' : ''}" 
                aria-label="${options.isSaved ? 'Remove from saved' : 'Save article'}"
                data-article-id="${article.id}">
          ${options.isSaved ? '📌' : '📍'}
        </button>
      </div>
      
      <h3 class="article-title">${this.escapeHtml(article.title)}</h3>
      
      <p class="article-excerpt">${this.escapeHtml(article.excerpt || '')}</p>
      
      <div class="article-footer">
        <div class="article-stats">
          <span class="article-views">
            <span class="stat-icon">👁️</span>
            <span class="stat-value">${this.formatNumber(article.views || 0)}</span>
          </span>
          <span class="article-source">${this.escapeHtml(article.source || 'Zone News')}</span>
        </div>
        
        <div class="article-actions">
          <button class="reaction-btn" data-reaction="like" data-article-id="${article.id}">
            👍 <span class="reaction-count">${article.reactions?.likes || 0}</span>
          </button>
          <button class="reaction-btn" data-reaction="heart" data-article-id="${article.id}">
            ❤️ <span class="reaction-count">${article.reactions?.hearts || 0}</span>
          </button>
          <button class="comment-btn" data-article-id="${article.id}" aria-label="View comments">
            💬 <span class="comment-count">${article.comments || 0}</span>
          </button>
          <button class="share-btn" data-article-id="${article.id}" aria-label="Share article">
            📤
          </button>
        </div>
      </div>
      
      ${article.isPremium && !options.isPremiumUser ? 
        '<div class="premium-overlay">🔒 Premium Content</div>' : ''
      }
    `;

    // Add click handler for full article view
    card.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        this.showBasicArticleModal(article);
      }
    });

    return card;
  }

  /**
   * Show basic article modal (without advanced features)
   */
  showBasicArticleModal(article) {
    const content = `
      <div class="article-modal-content">
        <div class="article-modal-header">
          <span class="article-category">${this.escapeHtml(article.category)}</span>
          <time class="article-time">${this.getTimeAgo(new Date(article.published_date))}</time>
        </div>
        
        <h2 class="article-modal-title">${this.escapeHtml(article.title)}</h2>
        
        <div class="article-modal-body">
          ${this.escapeHtml(article.content || article.excerpt || '')}
        </div>
        
        <div class="article-modal-footer">
          <div class="article-stats">
            <span>👁️ ${this.formatNumber(article.views || 0)} views</span>
            <span>📰 ${this.escapeHtml(article.source || 'Zone News')}</span>
          </div>
          
          ${article.channelUrl ? 
            `<a href="${article.channelUrl}" target="_blank" class="channel-link">
              View on Telegram 📱
            </a>` : ''
          }
        </div>
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Close</button>
      <button class="btn btn-primary basic-share-btn" data-article-id="${article.id}">
        Share 📤
      </button>
    `;

    const modal = this.showModal(content, {
      title: 'Article Details',
      actions: actions
    });

    // Setup basic share handler (will trigger lazy loading)
    const shareBtn = modal.querySelector('.basic-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        // Emit event for lazy loading of sharing module
        document.dispatchEvent(new CustomEvent(EVENTS.UI_SHARE_REQUESTED, {
          detail: { article, modal }
        }));
      });
    }

    return modal;
  }

  /**
   * Create filter tabs
   */
  createFilterTabs(categories, activeCategory = 'all') {
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'filter-tabs';
    tabsContainer.setAttribute('role', 'tablist');

    Object.entries(categories).forEach(([key, config]) => {
      const tab = document.createElement('button');
      tab.className = `filter-tab ${key === activeCategory ? 'active' : ''}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', key === activeCategory);
      tab.setAttribute('data-category', key);
      tab.innerHTML = `
        <span class="tab-icon">${config.icon}</span>
        <span class="tab-label">${config.label}</span>
      `;

      tab.addEventListener('click', () => {
        this.setActiveTab(tabsContainer, tab);
        document.dispatchEvent(new CustomEvent(EVENTS.FILTER_CHANGED, {
          detail: { category: key }
        }));
      });

      tabsContainer.appendChild(tab);
    });

    return tabsContainer;
  }

  /**
   * Set active tab
   */
  setActiveTab(container, activeTab) {
    const tabs = container.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    });

    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
  }

  /**
   * Create bottom navigation
   */
  createBottomNavigation(tabs, activeTab = 'home') {
    const nav = document.createElement('nav');
    nav.className = 'bottom-navigation';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');

    Object.entries(tabs).forEach(([key, config]) => {
      const tab = document.createElement('button');
      tab.className = `nav-tab ${key === activeTab ? 'active' : ''}`;
      tab.setAttribute('data-tab', key);
      tab.innerHTML = `
        <span class="nav-icon">${config.icon}</span>
        <span class="nav-label">${config.label}</span>
        ${config.badge ? `<span class="nav-badge">${config.badge}</span>` : ''}
      `;

      tab.addEventListener('click', () => {
        this.setActiveNavTab(nav, tab);
        document.dispatchEvent(new CustomEvent(EVENTS.TAB_CHANGED, {
          detail: { tab: key }
        }));
      });

      nav.appendChild(tab);
    });

    return nav;
  }

  /**
   * Set active navigation tab
   */
  setActiveNavTab(nav, activeTab) {
    const tabs = nav.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.classList.remove('active');
    });
    activeTab.classList.add('active');
  }

  /**
   * Create progress bar
   */
  createProgressBar(current, max, label = '') {
    const progress = document.createElement('div');
    progress.className = 'progress-container';
    
    const percentage = Math.min((current / max) * 100, 100);
    
    progress.innerHTML = `
      <div class="progress-label">
        <span>${this.escapeHtml(label)}</span>
        <span>${current}/${max}</span>
      </div>
      <div class="progress-bar" role="progressbar" aria-valuenow="${current}" aria-valuemin="0" aria-valuemax="${max}">
        <div class="progress-fill" style="width: ${percentage}%"></div>
      </div>
    `;

    return progress;
  }

  /**
   * Update progress bar
   */
  updateProgressBar(progressBar, current, max) {
    const percentage = Math.min((current / max) * 100, 100);
    const fill = progressBar.querySelector('.progress-fill');
    const valueSpan = progressBar.querySelector('.progress-label span:last-child');
    
    fill.style.width = percentage + '%';
    valueSpan.textContent = `${current}/${max}`;
    
    progressBar.querySelector('.progress-bar').setAttribute('aria-valuenow', current);
  }

  /**
   * Basic share functionality (fallback)
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Link copied to clipboard! 📋', 'success', 3000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showToast('Link copied! 📋', 'success', 3000);
    }
  }

  /**
   * Utility: Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Utility: Format number
   */
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Utility: Get time ago
   */
  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Animate element
   */
  animate(element, animation, duration = APP_CONFIG.ANIMATION_DURATION) {
    return new Promise((resolve) => {
      element.style.animation = `${animation} ${duration}ms ease-in-out`;
      
      const handleAnimationEnd = () => {
        element.style.animation = '';
        element.removeEventListener('animationend', handleAnimationEnd);
        resolve();
      };
      
      element.addEventListener('animationend', handleAnimationEnd);
    });
  }

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function
   */
  throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}