/**
 * Zone News Mini App - Enhanced JavaScript
 * Modern, accessible, and production-ready Telegram Mini App
 * 
 * Features:
 * - Modern ES6+ syntax with proper error handling
 * - Accessibility compliance (WCAG 2.1)
 * - Smooth animations and micro-interactions
 * - Local storage for user preferences
 * - Progressive Web App capabilities
 * - Performance optimizations
 */

'use strict';

// ===== GLOBAL STATE & CONFIGURATION =====
const APP_CONFIG = {
  API_BASE_URL: 'http://67.219.107.230:3001',
  REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
  TOAST_DURATION: 3000,
  ANIMATION_DURATION: 250,
  FREE_TIER_LIMIT: 10,
  STORAGE_KEYS: {
    USER_TIER: 'zone_user_tier',
    ARTICLES_VIEWED: 'zone_articles_viewed',
    SAVED_ARTICLES: 'zone_saved_articles',
    USER_PREFERENCES: 'zone_user_preferences',
    LAST_REFRESH: 'zone_last_refresh'
  }
};

const APP_STATE = {
  userTier: 'free',
  articlesViewed: 0,
  savedArticles: new Set(),
  currentFilter: 'all',
  currentTab: 'home',
  articles: [],
  isLoading: false,
  currentArticle: null,
  refreshTimer: null,
  hasError: false
};

// ===== TELEGRAM WEB APP INTEGRATION =====
class TelegramWebApp {
  constructor() {
    this.webApp = window.Telegram?.WebApp;
    this.user = this.webApp?.initDataUnsafe?.user;
    this.isAvailable = !!this.webApp;
  }

  init() {
    if (!this.isAvailable) {
      console.warn('Telegram WebApp not available');
      return false;
    }

    try {
      this.webApp.ready();
      this.webApp.expand();
      
      // Configure app appearance
      this.webApp.headerColor = '#667eea';
      this.webApp.backgroundColor = '#ffffff';
      
      // Set up haptic feedback
      this.enableHapticFeedback();
      
      console.log('Telegram WebApp initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Telegram WebApp:', error);
      return false;
    }
  }

  enableHapticFeedback() {
    if (!this.webApp?.HapticFeedback) return;
    
    // Add haptic feedback to buttons
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button, .news-card, .nav-item');
      if (button && !button.disabled) {
        this.webApp.HapticFeedback.impactOccurred('light');
      }
    });
  }

  sendData(data) {
    if (this.webApp) {
      this.webApp.sendData(JSON.stringify(data));
    }
  }

  close() {
    if (this.webApp) {
      this.webApp.close();
    }
  }

  openLink(url) {
    if (this.webApp) {
      this.webApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  }
}

// ===== STORAGE MANAGER =====
class StorageManager {
  static get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      console.error(`Failed to get ${key} from storage:`, error);
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Failed to set ${key} in storage:`, error);
      return false;
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Failed to remove ${key} from storage:`, error);
      return false;
    }
  }

  static clear() {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear storage:', error);
      return false;
    }
  }
}

// ===== API SERVICE =====
class ApiService {
  static async request(endpoint, options = {}) {
    const url = `${APP_CONFIG.API_BASE_URL}${endpoint}`;
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    const config = { ...defaultOptions, ...options };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  static async getNews() {
    return this.request('/api/news');
  }

  static async getArticle(id) {
    return this.request(`/api/news/${id}`);
  }

  static async addReaction(articleId, reaction) {
    return this.request(`/api/news/${articleId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ reaction }),
    });
  }
}

// ===== UI COMPONENTS =====
class UIComponents {
  static showToast(message, type = 'info', duration = APP_CONFIG.TOAST_DURATION) {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const messageEl = document.getElementById('toastMessage');

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    icon.textContent = icons[type] || icons.info;
    messageEl.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';

    // Auto hide
    setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  }

  static showLoading(container) {
    container.innerHTML = `
      <div class="loading-state" role="status" aria-live="polite">
        <div class="loading-spinner" aria-hidden="true"></div>
        <span class="loading-text">Loading latest news...</span>
      </div>
    `;
  }

  static showError(container, message) {
    container.innerHTML = `
      <div class="error-state" role="alert">
        <div class="error-icon" aria-hidden="true">⚠️</div>
        <h3 class="error-title">Unable to load news</h3>
        <p class="error-message">${message}</p>
        <button class="refresh-button" onclick="loadNews()" aria-label="Retry loading news">
          <span aria-hidden="true">🔄</span>
          Try Again
        </button>
      </div>
    `;
  }

  static createNewsCard(article, index) {
    const isLocked = APP_STATE.userTier === 'free' && 
                     APP_STATE.articlesViewed >= APP_CONFIG.FREE_TIER_LIMIT && 
                     index > 0;
    
    const isSaved = APP_STATE.savedArticles.has(article._id);
    
    const card = document.createElement('article');
    card.className = `news-card ${isLocked ? 'locked' : ''}`;
    card.setAttribute('data-article-id', article._id);
    
    if (isLocked) {
      card.setAttribute('aria-disabled', 'true');
      card.setAttribute('aria-describedby', 'upgrade-notice');
    }

    const timeAgo = this.formatTimeAgo(new Date(article.createdAt || Date.now()));
    const excerpt = article.excerpt || article.content?.substring(0, 150) + '...';

    card.innerHTML = `
      <div class="news-category" aria-label="Category: ${article.category || 'News'}">
        <span class="category-icon" aria-hidden="true">${this.getCategoryIcon(article.category)}</span>
        ${article.category || 'News'}
      </div>
      
      <h3 class="news-title">${this.escapeHtml(article.title)}</h3>
      
      <p class="news-excerpt">${this.escapeHtml(excerpt)}</p>
      
      <div class="news-meta" aria-label="Article metadata">
        <div class="meta-item">
          <span aria-hidden="true">📍</span>
          <span>Adelaide</span>
        </div>
        <div class="meta-item">
          <span aria-hidden="true">👁</span>
          <span>${this.formatNumber(article.views || 0)} views</span>
        </div>
        <div class="meta-item">
          <span aria-hidden="true">🕒</span>
          <span>${timeAgo}</span>
        </div>
      </div>
      
      <div class="news-actions">
        <div class="reaction-group" role="group" aria-label="Article reactions">
          <button class="reaction-button" data-reaction="👍" onclick="addReaction('${article._id}', '👍')" 
                  aria-label="Like this article">
            <span class="reaction-emoji">👍</span>
            <span class="reaction-count">${article.reactions?.['👍'] || 0}</span>
          </button>
          <button class="reaction-button" data-reaction="❤️" onclick="addReaction('${article._id}', '❤️')" 
                  aria-label="Love this article">
            <span class="reaction-emoji">❤️</span>
            <span class="reaction-count">${article.reactions?.['❤️'] || 0}</span>
          </button>
        </div>
        
        <button class="action-button ${isSaved ? 'active' : ''}" onclick="toggleSaveArticle('${article._id}')" 
                aria-label="${isSaved ? 'Remove from saved' : 'Save article'}">
          <span class="action-icon" aria-hidden="true">${isSaved ? '📌' : '📑'}</span>
          <span class="action-text">${isSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>
    `;

    // Add click handler for non-locked articles
    if (!isLocked) {
      card.addEventListener('click', (event) => {
        // Don't trigger if clicking on buttons
        if (event.target.closest('button')) return;
        
        APP_STATE.articlesViewed++;
        this.updateUsageStats();
        this.openArticleModal(article);
      });
      
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Read article: ${article.title}`);
      
      // Keyboard navigation
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          card.click();
        }
      });
    }

    return card;
  }

  static openArticleModal(article) {
    const modal = document.getElementById('articleModal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const saveButton = document.getElementById('saveButton');
    
    APP_STATE.currentArticle = article;
    
    title.textContent = article.title;
    body.innerHTML = `
      <div class="article-meta">
        <div class="meta-item">
          <span aria-hidden="true">📍</span>
          <span>Adelaide</span>
        </div>
        <div class="meta-item">
          <span aria-hidden="true">🕒</span>
          <span>${this.formatTimeAgo(new Date(article.createdAt || Date.now()))}</span>
        </div>
      </div>
      <div class="article-content">
        ${this.formatArticleContent(article.content)}
      </div>
    `;
    
    // Update save button state
    const isSaved = APP_STATE.savedArticles.has(article._id);
    saveButton.className = `action-button ${isSaved ? 'active' : ''}`;
    saveButton.setAttribute('aria-label', isSaved ? 'Remove from saved' : 'Save article');
    saveButton.innerHTML = `
      <span class="action-icon" aria-hidden="true">${isSaved ? '📌' : '📑'}</span>
      <span class="action-text">${isSaved ? 'Saved' : 'Save'}</span>
    `;
    
    // Update reaction counts
    document.getElementById('like-count').textContent = article.reactions?.['👍'] || 0;
    document.getElementById('love-count').textContent = article.reactions?.['❤️'] || 0;
    
    modal.style.display = 'block';
    modal.focus();
    
    // Trap focus in modal
    this.trapFocus(modal);
  }

  static formatArticleContent(content) {
    if (!content) return '<p>Content not available.</p>';
    
    // Basic formatting for better readability
    return content
      .split('\n\n')
      .map(paragraph => `<p>${this.escapeHtml(paragraph.trim())}</p>`)
      .join('');
  }

  static trapFocus(element) {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    element.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
      
      if (event.key === 'Escape') {
        closeArticleModal();
      }
    });
  }

  static updateUsageStats() {
    const statsEl = document.getElementById('usageStats');
    const progressFill = document.getElementById('progressFill');
    const statsText = document.getElementById('statsText');
    
    if (APP_STATE.userTier === 'free') {
      const percentage = Math.min((APP_STATE.articlesViewed / APP_CONFIG.FREE_TIER_LIMIT) * 100, 100);
      
      progressFill.style.width = `${percentage}%`;
      statsText.textContent = `${APP_STATE.articlesViewed}/${APP_CONFIG.FREE_TIER_LIMIT}`;
      statsEl.style.display = 'block';
      
      // Save to storage
      StorageManager.set(APP_CONFIG.STORAGE_KEYS.ARTICLES_VIEWED, APP_STATE.articlesViewed);
      
      // Show upgrade prompt if limit reached
      if (APP_STATE.articlesViewed >= APP_CONFIG.FREE_TIER_LIMIT) {
        this.showTierBanner();
      }
    } else {
      statsEl.style.display = 'none';
    }
  }

  static showTierBanner() {
    const banner = document.getElementById('tierBanner');
    banner.style.display = 'flex';
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  static formatTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
      }
    }
    
    return 'Just now';
  }

  static formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  static getCategoryIcon(category) {
    const icons = {
      'local': '📍',
      'business': '💼',
      'sports': '⚽',
      'politics': '🏛️',
      'technology': '💻',
      'health': '🏥',
      'entertainment': '🎬',
      'weather': '🌤️'
    };
    
    return icons[category?.toLowerCase()] || '📰';
  }

  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ===== MAIN APPLICATION CLASS =====
class ZoneNewsApp {
  constructor() {
    this.telegramApp = new TelegramWebApp();
    this.initializeApp();
  }

  async initializeApp() {
    try {
      // Initialize Telegram WebApp
      this.telegramApp.init();
      
      // Load user data from storage
      this.loadUserData();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Initial news load
      await this.loadNews();
      
      // Set up auto-refresh
      this.setupAutoRefresh();
      
      // Update UI based on current state
      this.updateUI();
      
      console.log('Zone News App initialized successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      UIComponents.showToast('Failed to initialize app', 'error');
    }
  }

  loadUserData() {
    APP_STATE.userTier = StorageManager.get(APP_CONFIG.STORAGE_KEYS.USER_TIER, 'free');
    APP_STATE.articlesViewed = this.getTodaysArticleCount();
    APP_STATE.savedArticles = new Set(
      StorageManager.get(APP_CONFIG.STORAGE_KEYS.SAVED_ARTICLES, [])
    );
  }

  getTodaysArticleCount() {
    const today = new Date().toDateString();
    const lastRefresh = StorageManager.get(APP_CONFIG.STORAGE_KEYS.LAST_REFRESH);
    
    if (lastRefresh && new Date(lastRefresh).toDateString() === today) {
      return StorageManager.get(APP_CONFIG.STORAGE_KEYS.ARTICLES_VIEWED, 0);
    } else {
      // Reset count for new day
      StorageManager.set(APP_CONFIG.STORAGE_KEYS.ARTICLES_VIEWED, 0);
      StorageManager.set(APP_CONFIG.STORAGE_KEYS.LAST_REFRESH, new Date().toISOString());
      return 0;
    }
  }

  setupEventListeners() {
    // Filter tabs
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => this.handleFilterChange(tab));
    });

    // Bottom navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => this.handleTabChange(item));
    });

    // Modal close handlers
    document.addEventListener('click', (event) => {
      if (event.target.id === 'articleModal') {
        this.closeArticleModal();
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const modal = document.getElementById('articleModal');
        if (modal.style.display === 'block') {
          this.closeArticleModal();
        }
      }
    });

    // Swipe gestures for mobile
    this.setupSwipeGestures();
  }

  setupSwipeGestures() {
    let startX = 0;
    let startY = 0;
    
    document.addEventListener('touchstart', (event) => {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    
    document.addEventListener('touchmove', (event) => {
      // Prevent scroll when swiping horizontally
      const deltaX = Math.abs(event.touches[0].clientX - startX);
      const deltaY = Math.abs(event.touches[0].clientY - startY);
      
      if (deltaX > deltaY && deltaX > 50) {
        event.preventDefault();
      }
    }, { passive: false });
    
    document.addEventListener('touchend', (event) => {
      const endX = event.changedTouches[0].clientX;
      const deltaX = endX - startX;
      
      // Swipe threshold
      if (Math.abs(deltaX) > 100) {
        if (deltaX > 0) {
          // Swipe right - previous tab
          this.navigateTab('previous');
        } else {
          // Swipe left - next tab
          this.navigateTab('next');
        }
      }
    }, { passive: true });
  }

  async loadNews() {
    if (APP_STATE.isLoading) return;
    
    APP_STATE.isLoading = true;
    APP_STATE.hasError = false;
    
    const container = document.getElementById('newsContainer');
    UIComponents.showLoading(container);

    try {
      const response = await ApiService.getNews();
      
      if (response.success && response.data.articles) {
        APP_STATE.articles = response.data.articles;
        this.displayNews();
        UIComponents.showToast('News updated successfully', 'success');
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Failed to load news:', error);
      APP_STATE.hasError = true;
      UIComponents.showError(container, error.message);
      UIComponents.showToast('Failed to load news', 'error');
    } finally {
      APP_STATE.isLoading = false;
    }
  }

  displayNews() {
    const container = document.getElementById('newsContainer');
    const emptyState = document.getElementById('emptyState');
    
    // Filter articles based on current filter
    const filteredArticles = this.filterArticles(APP_STATE.articles, APP_STATE.currentFilter);
    
    if (filteredArticles.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    container.innerHTML = '';
    
    filteredArticles.forEach((article, index) => {
      const card = UIComponents.createNewsCard(article, index);
      container.appendChild(card);
    });
    
    // Update usage stats
    UIComponents.updateUsageStats();
    
    // Show tier banner for free users
    if (APP_STATE.userTier === 'free') {
      UIComponents.showTierBanner();
    }
  }

  filterArticles(articles, filter) {
    if (filter === 'all') return articles;
    
    return articles.filter(article => {
      const category = article.category?.toLowerCase();
      return category === filter.toLowerCase();
    });
  }

  handleFilterChange(tab) {
    const category = tab.dataset.category;
    
    // Update active state
    document.querySelectorAll('.filter-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-pressed', 'false');
    });
    
    tab.classList.add('active');
    tab.setAttribute('aria-pressed', 'true');
    
    APP_STATE.currentFilter = category;
    this.displayNews();
  }

  handleTabChange(item) {
    const tab = item.dataset.tab;
    
    // Update active state
    document.querySelectorAll('.nav-item').forEach(i => {
      i.classList.remove('active');
      i.setAttribute('aria-pressed', 'false');
    });
    
    item.classList.add('active');
    item.setAttribute('aria-pressed', 'true');
    
    APP_STATE.currentTab = tab;
    this.handleTabAction(tab);
  }

  handleTabAction(tab) {
    switch (tab) {
      case 'home':
        // Already showing home content
        break;
      case 'saved':
        this.showSavedArticles();
        break;
      case 'trending':
        this.showTrendingArticles();
        break;
      case 'profile':
        this.showProfile();
        break;
    }
  }

  showSavedArticles() {
    const savedIds = Array.from(APP_STATE.savedArticles);
    const savedArticles = APP_STATE.articles.filter(article => 
      savedIds.includes(article._id)
    );
    
    const container = document.getElementById('newsContainer');
    
    if (savedArticles.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">📑</div>
          <h3 class="empty-title">No saved articles</h3>
          <p class="empty-description">Articles you save will appear here for easy access.</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = '';
    savedArticles.forEach((article, index) => {
      const card = UIComponents.createNewsCard(article, index);
      container.appendChild(card);
    });
  }

  showTrendingArticles() {
    // Sort articles by views/reactions for trending
    const trending = [...APP_STATE.articles]
      .sort((a, b) => {
        const aScore = (a.views || 0) + Object.values(a.reactions || {}).reduce((sum, count) => sum + count, 0);
        const bScore = (b.views || 0) + Object.values(b.reactions || {}).reduce((sum, count) => sum + count, 0);
        return bScore - aScore;
      })
      .slice(0, 10); // Top 10 trending
    
    const container = document.getElementById('newsContainer');
    container.innerHTML = '';
    
    trending.forEach((article, index) => {
      const card = UIComponents.createNewsCard(article, index);
      container.appendChild(card);
    });
  }

  showProfile() {
    const container = document.getElementById('newsContainer');
    container.innerHTML = `
      <div class="profile-section">
        <div class="profile-card">
          <h3>Your Account</h3>
          <p><strong>Tier:</strong> ${APP_STATE.userTier === 'free' ? 'Free' : 'Zone Pro'}</p>
          <p><strong>Articles read today:</strong> ${APP_STATE.articlesViewed}</p>
          <p><strong>Saved articles:</strong> ${APP_STATE.savedArticles.size}</p>
        </div>
        
        ${APP_STATE.userTier === 'free' ? `
          <div class="upgrade-card">
            <h4>Upgrade to Zone Pro</h4>
            <ul>
              <li>50 articles per day</li>
              <li>AI-powered summaries</li>
              <li>Breaking news alerts</li>
              <li>Offline reading</li>
            </ul>
            <button class="tier-button" onclick="handleUpgrade()">
              Upgrade for $14.99/month
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  navigateTab(direction) {
    const tabs = ['home', 'saved', 'trending', 'profile'];
    const currentIndex = tabs.indexOf(APP_STATE.currentTab);
    
    let newIndex;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % tabs.length;
    } else {
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }
    
    const newTab = tabs[newIndex];
    const navItem = document.querySelector(`[data-tab="${newTab}"]`);
    if (navItem) {
      navItem.click();
    }
  }

  setupAutoRefresh() {
    if (APP_STATE.refreshTimer) {
      clearInterval(APP_STATE.refreshTimer);
    }
    
    APP_STATE.refreshTimer = setInterval(() => {
      if (!APP_STATE.isLoading && !APP_STATE.hasError) {
        this.loadNews();
      }
    }, APP_CONFIG.REFRESH_INTERVAL);
  }

  closeArticleModal() {
    const modal = document.getElementById('articleModal');
    modal.style.display = 'none';
    APP_STATE.currentArticle = null;
  }

  updateUI() {
    // Update tier-specific UI elements
    const tierBanner = document.getElementById('tierBanner');
    if (APP_STATE.userTier === 'pro') {
      tierBanner.style.display = 'none';
    }
    
    // Update saved articles badge
    this.updateSavedBadge();
  }

  updateSavedBadge() {
    const badge = document.getElementById('savedBadge');
    const count = APP_STATE.savedArticles.size;
    
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count.toString();
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

// ===== GLOBAL FUNCTIONS (for onclick handlers) =====
async function loadNews() {
  if (window.zoneNewsApp) {
    await window.zoneNewsApp.loadNews();
  }
}

function handleUpgrade() {
  const app = window.zoneNewsApp?.telegramApp;
  
  if (app?.isAvailable) {
    app.openLink('https://t.me/ZoneNewsBot?start=upgrade');
  } else {
    UIComponents.showToast('Please open this app in Telegram to upgrade', 'warning');
  }
}

function closeTierBanner() {
  const banner = document.getElementById('tierBanner');
  banner.style.display = 'none';
}

function closeArticleModal() {
  if (window.zoneNewsApp) {
    window.zoneNewsApp.closeArticleModal();
  }
}

function toggleSaveArticle(articleId) {
  if (!articleId) {
    articleId = APP_STATE.currentArticle?._id;
  }
  
  if (!articleId) return;
  
  if (APP_STATE.savedArticles.has(articleId)) {
    APP_STATE.savedArticles.delete(articleId);
    UIComponents.showToast('Article removed from saved', 'info');
  } else {
    APP_STATE.savedArticles.add(articleId);
    UIComponents.showToast('Article saved successfully', 'success');
  }
  
  // Save to storage
  StorageManager.set(
    APP_CONFIG.STORAGE_KEYS.SAVED_ARTICLES, 
    Array.from(APP_STATE.savedArticles)
  );
  
  // Update UI
  if (window.zoneNewsApp) {
    window.zoneNewsApp.updateSavedBadge();
    
    // Update current view if showing saved articles
    if (APP_STATE.currentTab === 'saved') {
      window.zoneNewsApp.showSavedArticles();
    }
  }
}

async function addReaction(articleId, reaction) {
  try {
    const response = await ApiService.addReaction(articleId, reaction);
    
    if (response.success) {
      // Update local state
      const article = APP_STATE.articles.find(a => a._id === articleId);
      if (article) {
        article.reactions = article.reactions || {};
        article.reactions[reaction] = (article.reactions[reaction] || 0) + 1;
        
        // Update UI
        const button = document.querySelector(`[data-reaction="${reaction}"][onclick*="${articleId}"]`);
        if (button) {
          const countEl = button.querySelector('.reaction-count');
          countEl.textContent = article.reactions[reaction];
          button.classList.add('active');
          
          // Visual feedback
          button.style.transform = 'scale(1.2)';
          setTimeout(() => {
            button.style.transform = '';
          }, 150);
        }
      }
      
      UIComponents.showToast(`Reaction ${reaction} added!`, 'success');
    }
  } catch (error) {
    console.error('Failed to add reaction:', error);
    UIComponents.showToast('Failed to add reaction', 'error');
  }
}

function shareArticle() {
  const article = APP_STATE.currentArticle;
  if (!article) return;
  
  const shareData = {
    title: article.title,
    text: article.excerpt || article.content?.substring(0, 100) + '...',
    url: window.location.href
  };
  
  if (navigator.share) {
    navigator.share(shareData)
      .then(() => UIComponents.showToast('Article shared successfully', 'success'))
      .catch(() => UIComponents.showToast('Failed to share article', 'error'));
  } else {
    // Fallback for browsers without Web Share API
    const text = `${shareData.title}\n\n${shareData.text}\n\n${shareData.url}`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => UIComponents.showToast('Article link copied to clipboard', 'success'))
        .catch(() => UIComponents.showToast('Failed to copy link', 'error'));
    } else {
      UIComponents.showToast('Sharing not supported on this device', 'warning');
    }
  }
}

// ===== APPLICATION INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  // Initialize the application
  window.zoneNewsApp = new ZoneNewsApp();
  
  // Set up global error handling
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    UIComponents.showToast('An error occurred. Please try refreshing.', 'error');
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    UIComponents.showToast('A network error occurred. Please check your connection.', 'error');
  });
  
  // Handle app visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.zoneNewsApp) {
      // App became visible, refresh news if it's been a while
      const lastRefresh = StorageManager.get(APP_CONFIG.STORAGE_KEYS.LAST_REFRESH);
      const now = Date.now();
      
      if (!lastRefresh || (now - new Date(lastRefresh).getTime()) > APP_CONFIG.REFRESH_INTERVAL) {
        window.zoneNewsApp.loadNews();
      }
    }
  });
});