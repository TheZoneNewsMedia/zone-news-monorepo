/**
 * Zone News Mini App - Main Application
 * Entry point and application orchestration
 */

'use strict';

import { APP_CONFIG, APP_STATE, EVENTS } from './config.js';
import { TelegramWebApp } from './telegram-integration.js';
import { ApiService } from './api-service.js';
import { StorageService } from './storage-service.js';
import { UIComponents } from './ui-components.js';
import { SearchService } from './search-service.js';
import { RealTimeService } from './real-time-service.js';
import { RecommendationService } from './recommendation-service.js';
import { CommentSystem } from './comment-system.js';
import { performanceMonitor } from './performance-monitor.js';
import { abTesting } from './ab-testing.js';

// ===== MAIN APPLICATION CLASS =====
export class ZoneNewsApp {
  constructor() {
    this.telegram = new TelegramWebApp();
    this.api = new ApiService();
    this.storage = new StorageService();
    this.ui = new UIComponents();
    
    // Enhanced services
    this.search = new SearchService(this.storage);
    this.realTime = new RealTimeService();
    this.recommendations = new RecommendationService(this.storage);
    this.comments = new CommentSystem(this.realTime, this.storage);
    
    // Optimization services
    this.performanceMonitor = performanceMonitor;
    this.abTesting = abTesting;
    
    this.initialized = false;
    this.refreshTimer = null;
    
    // Bind methods
    this.handleFilterChange = this.handleFilterChange.bind(this);
    this.handleTabChange = this.handleTabChange.bind(this);
    this.handleArticleSave = this.handleArticleSave.bind(this);
    this.handleArticleReaction = this.handleArticleReaction.bind(this);
    this.handleShare = this.handleShare.bind(this);
    this.handleRefresh = this.handleRefresh.bind(this);
  }

  /**
   * Initialize the application
   */
  async initialize() {
    if (this.initialized) return;

    try {
      console.log('🚀 Initializing Zone News App...');
      
      // Apply Telegram theme
      this.telegram.applyTheme();
      
      // Load user state from storage
      this.loadUserState();
      
      // Setup UI
      this.setupUI();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Load initial data
      await this.loadInitialData();
      
      // Initialize A/B testing framework
      this.setupABTesting();
      
      // Start auto-refresh
      this.startAutoRefresh();
      
      // Mark as initialized
      this.initialized = true;
      
      console.log('✅ Zone News App initialized successfully');
      
      // Show welcome message for first-time users
      if (this.isFirstTime()) {
        this.showWelcomeMessage();
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize app:', error);
      this.handleError(error);
    }
  }

  /**
   * Load user state from storage
   */
  loadUserState() {
    APP_STATE.userTier = this.storage.getUserTier();
    APP_STATE.articlesViewed = this.storage.getArticlesViewed();
    APP_STATE.savedArticles = this.storage.getSavedArticles();
    
    // Check if user is premium (from Telegram or storage)
    const telegramUser = this.telegram.getUserInfo();
    if (telegramUser?.isPremium) {
      APP_STATE.userTier = 'premium';
      this.storage.setUserTier('premium');
    }
  }

  /**
   * Setup UI components
   */
  setupUI() {
    // Get main containers
    const filterContainer = document.getElementById('filter-tabs');
    const articlesContainer = document.getElementById('articles-container');
    const bottomNavContainer = document.getElementById('bottom-navigation');
    const usageContainer = document.getElementById('usage-stats');

    // Create filter tabs
    if (filterContainer) {
      const filterTabs = this.ui.createFilterTabs(APP_CONFIG.CATEGORIES, APP_STATE.currentFilter);
      filterContainer.appendChild(filterTabs);
    }

    // Create bottom navigation
    if (bottomNavContainer) {
      const savedCount = APP_STATE.savedArticles.size;
      const tabs = {
        ...APP_CONFIG.TABS,
        saved: { ...APP_CONFIG.TABS.saved, badge: savedCount > 0 ? savedCount : null }
      };
      const bottomNav = this.ui.createBottomNavigation(tabs, APP_STATE.currentTab);
      bottomNavContainer.appendChild(bottomNav);
    }

    // Create usage stats for free tier
    if (usageContainer && APP_STATE.userTier === 'free') {
      const progressBar = this.ui.createProgressBar(
        APP_STATE.articlesViewed,
        APP_CONFIG.FREE_TIER_LIMIT,
        'Daily articles viewed'
      );
      usageContainer.appendChild(progressBar);
    }

    // Setup main button
    this.telegram.showMainButton('Refresh News');
    
    // Setup enhanced search UI
    this.setupSearchUI();
    
    // Setup real-time features
    this.setupRealTimeFeatures();
    
    // Setup comment system
    this.setupCommentSystem();
  }

  /**
   * Setup enhanced search UI and functionality
   */
  setupSearchUI() {
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const searchSuggestions = document.getElementById('searchSuggestions');
    const searchFilters = document.getElementById('searchFilters');
    const applyFilters = document.getElementById('applyFilters');
    const clearFilters = document.getElementById('clearFilters');
    const suggestionsList = document.getElementById('suggestionsList');

    if (!searchInput) return;

    // Initialize search service with current articles
    this.search.indexArticles(APP_STATE.articles);

    // Search input event handlers
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      // Show/hide clear button
      if (searchClear) {
        searchClear.style.display = query.length > 0 ? 'flex' : 'none';
      }

      // Handle search
      if (query.length > 0) {
        this.handleSearch(query);
        this.showSearchSuggestions(query);
      } else {
        this.clearSearch();
        this.hideSearchSuggestions();
      }
    });

    // Search focus - show suggestions
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length > 0) {
        this.showSearchSuggestions(searchInput.value.trim());
      } else {
        this.showRecentSearches();
      }
    });

    // Clear search
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        this.clearSearch();
        this.hideSearchSuggestions();
        searchInput.focus();
      });
    }

    // Search suggestions click handler
    if (suggestionsList) {
      suggestionsList.addEventListener('click', (e) => {
        const suggestionItem = e.target.closest('.suggestion-item');
        if (suggestionItem) {
          const query = suggestionItem.dataset.query;
          searchInput.value = query;
          this.handleSearch(query);
          this.hideSearchSuggestions();
          this.search.trackSearchQuery(query);
        }
      });
    }

    // Advanced filters
    if (applyFilters) {
      applyFilters.addEventListener('click', () => {
        this.applyAdvancedFilters();
      });
    }

    if (clearFilters) {
      clearFilters.addEventListener('click', () => {
        this.clearAdvancedFilters();
      });
    }

    // Show filters on long press or right click
    let longPressTimer;
    searchInput.addEventListener('mousedown', (e) => {
      if (e.button === 2) { // Right click
        e.preventDefault();
        this.toggleAdvancedFilters();
      }
    });

    searchInput.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => {
        this.toggleAdvancedFilters();
        this.telegram.hapticFeedback('impact', 'medium');
      }, 800);
    });

    searchInput.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        this.hideSearchSuggestions();
        this.hideAdvancedFilters();
      }
    });

    console.log('✅ Enhanced search UI initialized');
  }

  /**
   * Setup real-time features and event handlers
   */
  setupRealTimeFeatures() {
    // Real-time reaction updates
    this.realTime.on('reaction_update', (data) => {
      this.handleRealTimeReactionUpdate(data);
    });

    // Real-time comment updates
    this.realTime.on('comment_update', (data) => {
      this.handleRealTimeCommentUpdate(data);
    });

    // Breaking news alerts
    this.realTime.on('breaking_news', (breakingItem) => {
      this.handleBreakingNews(breakingItem);
    });

    // Connection status changes
    this.realTime.on('connection_state_changed', (data) => {
      this.handleConnectionStateChange(data);
    });

    // User activity updates
    this.realTime.on('user_activity', (data) => {
      this.handleUserActivity(data);
    });

    // Article statistics updates
    this.realTime.on('article_update', (data) => {
      this.handleRealTimeArticleUpdate(data);
    });

    // Send initial user activity
    this.realTime.sendUserActivity('active', {
      currentPage: APP_STATE.currentTab,
      userTier: APP_STATE.userTier
    });

    // Track article views for real-time analytics
    this.trackArticleViews();

    console.log('✅ Real-time features initialized');
  }

  /**
   * Setup comment system integration
   */
  setupCommentSystem() {
    // Comment button click handler
    document.addEventListener('click', (e) => {
      if (e.target.matches('.comment-btn, .comment-btn *')) {
        e.preventDefault();
        const button = e.target.closest('.comment-btn');
        const articleId = button.dataset.articleId;
        this.showArticleComments(articleId);
      }
    });

    // Add comment button to article interactions if not present
    this.enhanceArticleCardsWithComments();

    console.log('✅ Comment system initialized');
  }

  /**
   * Show comments for an article
   */
  showArticleComments(articleId) {
    const article = APP_STATE.articles.find(a => a.id === articleId);
    if (!article) return;

    const content = `
      <div class="article-comments-modal">
        <div class="comments-article-header">
          <h3 class="comments-article-title">${this.ui.escapeHtml(article.title)}</h3>
          <div class="comments-article-meta">
            <span class="article-category">${this.ui.escapeHtml(article.category || 'News')}</span>
            <span class="article-date">${this.ui.getTimeAgo(new Date(article.published_date))}</span>
          </div>
        </div>
        <div id="commentsContainer-${articleId}" class="comments-container"></div>
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Close</button>
      <button class="btn btn-primary" onclick="app.shareArticle('${articleId}')">
        Share Article 📤
      </button>
    `;

    const modal = this.ui.showModal(content, {
      title: '💬 Comments',
      actions,
      className: 'comments-modal'
    });

    // Initialize comments in the modal
    const commentsContainer = modal.querySelector(`#commentsContainer-${articleId}`);
    this.comments.showComments(articleId, commentsContainer);

    // Track interaction
    this.recommendations.trackInteraction(articleId, 'comment_view', { article });
    this.realTime.sendUserActivity('viewing_comments', { articleId });
  }

  /**
   * Enhance article cards with comment buttons
   */
  enhanceArticleCardsWithComments() {
    // This will be called after articles are rendered
    const addCommentButtons = () => {
      document.querySelectorAll('.article-actions').forEach(actionsContainer => {
        if (actionsContainer.querySelector('.comment-btn')) return; // Already has comment button
        
        const articleCard = actionsContainer.closest('[data-article-id]');
        if (!articleCard) return;
        
        const articleId = articleCard.dataset.articleId;
        const article = APP_STATE.articles.find(a => a.id === articleId);
        if (!article) return;

        // Create comment button
        const commentBtn = document.createElement('button');
        commentBtn.className = 'comment-btn';
        commentBtn.dataset.articleId = articleId;
        commentBtn.innerHTML = `💬 <span class="comment-count">${article.comments || 0}</span>`;
        commentBtn.setAttribute('aria-label', 'View comments');
        
        // Insert before share button
        const shareBtn = actionsContainer.querySelector('.share-btn');
        if (shareBtn) {
          actionsContainer.insertBefore(commentBtn, shareBtn);
        } else {
          actionsContainer.appendChild(commentBtn);
        }
      });
    };

    // Override renderArticles to add comment buttons
    const originalRenderArticles = this.renderArticles.bind(this);
    this.renderArticles = function(articles) {
      originalRenderArticles(articles);
      setTimeout(addCommentButtons, 100);
    };

    // Add to search results too
    const originalRenderSearchResults = this.renderSearchResults.bind(this);
    this.renderSearchResults = function(results) {
      originalRenderSearchResults(results);
      setTimeout(addCommentButtons, 100);
    };
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Filter changes
    document.addEventListener(EVENTS.FILTER_CHANGED, this.handleFilterChange);
    
    // Tab changes
    document.addEventListener(EVENTS.TAB_CHANGED, this.handleTabChange);
    
    // Article interactions
    document.addEventListener('click', (e) => {
      if (e.target.matches('.article-save-btn, .article-save-btn *')) {
        e.preventDefault();
        this.handleArticleSave(e);
      } else if (e.target.matches('.reaction-btn, .reaction-btn *')) {
        e.preventDefault();
        this.handleArticleReaction(e);
      } else if (e.target.matches('.share-btn, .share-btn *')) {
        e.preventDefault();
        this.handleShare(e);
      }
    });
    
    // Telegram refresh
    window.addEventListener('telegram:refresh', this.handleRefresh);
    
    // Window events
    window.addEventListener('online', () => {
      console.log('📶 Connection restored');
      this.ui.showToast('Connection restored', 'success');
      this.loadArticles();
    });
    
    window.addEventListener('offline', () => {
      console.log('📵 Connection lost');
      this.ui.showToast('No internet connection', 'warning');
    });
    
    // Visibility change (for auto-refresh)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.storage.isRefreshNeeded()) {
        this.loadArticles();
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            this.handleRefresh();
            break;
          case 'f':
            e.preventDefault();
            // Focus search (future feature)
            break;
        }
      }
    });
    
    // Touch gestures for mobile
    this.setupTouchGestures();
  }

  /**
   * Setup touch gestures
   */
  setupTouchGestures() {
    let startX = 0;
    let startY = 0;
    
    document.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    });
    
    document.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = startX - endX;
      const diffY = startY - endY;
      
      // Horizontal swipe
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swipe left - next tab
          this.switchTab('next');
        } else {
          // Swipe right - previous tab
          this.switchTab('prev');
        }
      }
      
      // Pull to refresh (vertical swipe down from top)
      if (diffY < -100 && window.scrollY === 0) {
        this.handleRefresh();
      }
    });
  }

  /**
   * Setup A/B testing framework
   */
  setupABTesting() {
    // A/B testing is already initialized via the singleton import
    // Just setup any app-specific integrations here
    
    // Listen for A/B test configuration updates
    document.addEventListener('ab-test-config-updated', (e) => {
      const { type, config } = e.detail;
      console.log(`🧪 A/B test config updated: ${type}`, config);
      
      // Apply configuration changes to relevant systems
      switch (type) {
        case 'premiumPresentation':
          // Update premium feature presentation
          this.updatePremiumPresentation(config);
          break;
        case 'searchInterface':
          // Update search interface
          this.updateSearchInterface(config);
          break;
      }
    });

    // Track initial page load for bundle optimization tests
    this.abTesting.trackEvent('bundleLoadingStrategy', 'page_loaded', {
      loadTime: performance.now(),
      timestamp: Date.now()
    });

    console.log('🧪 A/B testing integration setup complete');
  }

  /**
   * Update premium presentation based on A/B test config
   */
  updatePremiumPresentation(config) {
    // Store config for premium manager to access
    window.abTestConfig = window.abTestConfig || {};
    window.abTestConfig.premiumPresentation = config;
    
    // Apply styling based on config
    const body = document.body;
    body.classList.remove('premium-subtle', 'premium-prominent', 'premium-progressive');
    body.classList.add(`premium-${config.premiumBadgeStyle}`);
  }

  /**
   * Update search interface based on A/B test config
   */
  updateSearchInterface(config) {
    // Store config for search modules to access
    window.abTestConfig = window.abTestConfig || {};
    window.abTestConfig.searchInterface = config;
    
    // Update search UI elements
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      if (config.showAdvancedToggle) {
        searchContainer.classList.add('with-advanced-toggle');
      } else {
        searchContainer.classList.remove('with-advanced-toggle');
      }
    }
  }

  /**
   * Load initial data
   */
  async loadInitialData() {
    this.showLoading();
    
    try {
      // Load based on current tab
      switch (APP_STATE.currentTab) {
        case 'home':
          await this.loadArticles();
          break;
        case 'saved':
          this.showSavedArticles();
          break;
        case 'trending':
          await this.loadTrendingArticles();
          break;
        case 'profile':
          this.showProfile();
          break;
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Load articles
   */
  async loadArticles(filters = {}) {
    try {
      APP_STATE.isLoading = true;
      this.showLoading();
      
      const params = {
        category: APP_STATE.currentFilter === 'all' ? undefined : APP_STATE.currentFilter,
        ...filters
      };
      
      const response = await this.api.getNews(params);
      APP_STATE.articles = response.articles || [];
      
      this.renderArticles(APP_STATE.articles);
      this.storage.setLastRefresh();
      
      // Show success toast
      this.ui.showToast(`Loaded ${APP_STATE.articles.length} articles`, 'success', 2000);
      
    } catch (error) {
      console.error('Failed to load articles:', error);
      this.handleError(error);
    } finally {
      APP_STATE.isLoading = false;
      this.hideLoading();
    }
  }

  /**
   * Load trending articles
   */
  async loadTrendingArticles() {
    try {
      APP_STATE.isLoading = true;
      this.showLoading();
      
      const response = await this.api.getTrending();
      const trending = response.trending || [];
      
      this.renderTrendingArticles(trending);
      
    } catch (error) {
      console.error('Failed to load trending:', error);
      this.handleError(error);
    } finally {
      APP_STATE.isLoading = false;
      this.hideLoading();
    }
  }

  /**
   * Render articles
   */
  renderArticles(articles) {
    const container = document.getElementById('articles-container');
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    if (articles.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📰</div>
          <h3>No articles found</h3>
          <p>Try adjusting your filters or check back later for new content.</p>
          <button class="btn btn-primary" onclick="app.handleRefresh()">Refresh</button>
        </div>
      `;
      return;
    }
    
    // Render articles
    articles.forEach(article => {
      const isSaved = APP_STATE.savedArticles.has(article.id);
      const isPremiumUser = APP_STATE.userTier === 'premium';
      
      // Check if user can view this article
      const canView = this.canViewArticle(article);
      if (!canView && !isPremiumUser) {
        return; // Skip premium articles for free users who hit limit
      }
      
      const card = this.ui.createArticleCard(article, {
        isSaved,
        isPremiumUser,
        canView
      });
      
      container.appendChild(card);
    });
    
    // Update usage stats
    this.updateUsageStats();
  }

  /**
   * Render trending articles
   */
  renderTrendingArticles(trending) {
    const container = document.getElementById('articles-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (trending.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔥</div>
          <h3>No trending articles</h3>
          <p>Check back later for trending content.</p>
        </div>
      `;
      return;
    }
    
    trending.forEach((item, index) => {
      const trendingCard = document.createElement('div');
      trendingCard.className = 'trending-card';
      trendingCard.innerHTML = `
        <div class="trending-rank">#${index + 1}</div>
        <div class="trending-content">
          <h4 class="trending-title">${this.ui.escapeHtml(item.title)}</h4>
          <div class="trending-stats">
            <span>👁️ ${this.ui.formatNumber(item.views)} views</span>
            <span class="trending-category">${this.ui.escapeHtml(item.category)}</span>
          </div>
        </div>
      `;
      
      container.appendChild(trendingCard);
    });
  }

  /**
   * Show saved articles
   */
  showSavedArticles() {
    const savedIds = Array.from(APP_STATE.savedArticles);
    const savedArticles = APP_STATE.articles.filter(article => 
      savedIds.includes(article.id)
    );
    
    this.renderArticles(savedArticles);
  }

  /**
   * Show profile
   */
  showProfile() {
    const container = document.getElementById('articles-container');
    if (!container) return;
    
    const user = this.telegram.getUserInfo();
    const stats = this.storage.getStorageStats();
    
    container.innerHTML = `
      <div class="profile-container">
        <div class="profile-header">
          <div class="profile-avatar">👤</div>
          <div class="profile-info">
            <h2>${user ? this.ui.escapeHtml(user.firstName) : 'Anonymous User'}</h2>
            <p class="profile-tier">${APP_STATE.userTier === 'premium' ? '⭐ Premium' : '🆓 Free'} User</p>
          </div>
        </div>
        
        <div class="profile-stats">
          <div class="stat-item">
            <span class="stat-label">Articles Viewed Today</span>
            <span class="stat-value">${APP_STATE.articlesViewed}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Saved Articles</span>
            <span class="stat-value">${APP_STATE.savedArticles.size}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Storage Used</span>
            <span class="stat-value">${stats.formattedSize || '0 Bytes'}</span>
          </div>
        </div>
        
        ${APP_STATE.userTier === 'free' ? `
          <div class="upgrade-prompt">
            <h3>Upgrade to Premium</h3>
            <p>Get unlimited articles, exclusive content, and more!</p>
            <button class="btn btn-primary" onclick="app.showUpgradeModal()">
              Upgrade Now ⭐
            </button>
          </div>
        ` : ''}
        
        <div class="profile-actions">
          <button class="btn btn-primary" onclick="app.showPersonalizedRecommendations()">
            📈 View Recommendations
          </button>
          <button class="btn btn-secondary" onclick="app.exportData()">
            Export Data 📤
          </button>
          <button class="btn btn-secondary" onclick="app.clearData()">
            Clear Data 🗑️
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Show personalized recommendations
   */
  showPersonalizedRecommendations() {
    const recommendations = this.recommendations.getRecommendations(APP_STATE.articles, {
      count: 10,
      algorithms: ['contentBased', 'trending', 'recency', 'diversity'],
      diversityLevel: 0.3
    });

    if (recommendations.length === 0) {
      this.ui.showToast('Not enough data for recommendations yet. Read more articles!', 'info');
      return;
    }

    const container = document.getElementById('articles-container');
    if (!container) return;

    container.innerHTML = `
      <div class="recommendations-container">
        <div class="recommendations-header">
          <h2>📈 Personalized for You</h2>
          <p>Based on your reading habits and preferences</p>
        </div>
        
        <div class="recommendation-stats">
          <div class="stat-badge">
            <span class="stat-number">${recommendations.length}</span>
            <span class="stat-label">Recommendations</span>
          </div>
          <div class="stat-badge">
            <span class="stat-number">${Math.round(recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length * 100)}%</span>
            <span class="stat-label">Avg Confidence</span>
          </div>
        </div>
        
        <div class="recommendations-list">
          ${recommendations.map((rec, index) => this.createRecommendationCard(rec, index + 1)).join('')}
        </div>
        
        <div class="recommendations-footer">
          <button class="btn btn-secondary" onclick="app.handleTabChange({detail: {tab: 'home'}})">
            ← Back to Home
          </button>
          <button class="btn btn-primary" onclick="app.refreshRecommendations()">
            🔄 Refresh Recommendations
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Create recommendation card
   */
  createRecommendationCard(recommendation, rank) {
    const { article, recommendationReason, confidence } = recommendation;
    const isSaved = APP_STATE.savedArticles.has(article.id);
    
    return `
      <div class="recommendation-card" data-article-id="${article.id}">
        <div class="recommendation-rank">#${rank}</div>
        <div class="recommendation-content">
          <h3 class="recommendation-title">${this.ui.escapeHtml(article.title)}</h3>
          <p class="recommendation-excerpt">${this.ui.escapeHtml(article.excerpt || '').substring(0, 120)}...</p>
          
          <div class="recommendation-meta">
            <span class="recommendation-category">${this.ui.escapeHtml(article.category || 'general')}</span>
            <span class="recommendation-date">${this.ui.formatDate(article.published_date)}</span>
          </div>
          
          <div class="recommendation-reason">
            <span class="reason-icon">💡</span>
            <span class="reason-text">${this.ui.escapeHtml(recommendationReason)}</span>
          </div>
          
          <div class="recommendation-footer">
            <div class="recommendation-confidence">
              <span class="confidence-label">Confidence:</span>
              <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${Math.round(confidence * 100)}%"></div>
              </div>
              <span class="confidence-value">${Math.round(confidence * 100)}%</span>
            </div>
            
            <div class="recommendation-actions">
              <button class="rec-action-btn save-btn ${isSaved ? 'saved' : ''}" 
                      onclick="app.handleArticleSave(event)" 
                      data-article-id="${article.id}">
                ${isSaved ? '📌' : '📍'}
              </button>
              <button class="rec-action-btn share-btn" 
                      onclick="app.handleShare(event)" 
                      data-article-id="${article.id}">
                📤
              </button>
              <button class="rec-action-btn read-btn" 
                      onclick="app.openRecommendedArticle('${article.id}')">
                📖 Read
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Refresh recommendations
   */
  refreshRecommendations() {
    this.ui.showToast('Updating recommendations...', 'info', 2000);
    
    // Add some delay to simulate processing
    setTimeout(() => {
      this.showPersonalizedRecommendations();
      this.ui.showToast('Recommendations updated!', 'success');
    }, 1000);
  }

  /**
   * Open recommended article
   */
  openRecommendedArticle(articleId) {
    const article = APP_STATE.articles.find(a => a.id === articleId);
    if (article) {
      // Track interaction
      this.recommendations.trackInteraction(articleId, 'view', { article });
      
      // Show article in modal or navigate
      this.ui.showToast(`Opening: ${article.title}`, 'info', 3000);
      
      // Update view count
      APP_STATE.articlesViewed++;
      this.updateUsageStats();
      
      // Mark as viewed
      APP_STATE.savedArticles.add(articleId);
      this.storage.saveArticle(articleId);
    }
  }

  /**
   * Handle filter change
   */
  handleFilterChange(event) {
    const { category } = event.detail;
    APP_STATE.currentFilter = category;
    
    this.telegram.hapticFeedback('selection');
    this.loadArticles();
  }

  /**
   * Handle tab change
   */
  handleTabChange(event) {
    const { tab } = event.detail;
    APP_STATE.currentTab = tab;
    
    this.telegram.hapticFeedback('selection');
    this.loadInitialData();
  }

  /**
   * Handle article save/unsave
   */
  handleArticleSave(event) {
    const button = event.target.closest('.article-save-btn');
    const articleId = button.dataset.articleId;
    
    if (APP_STATE.savedArticles.has(articleId)) {
      APP_STATE.savedArticles.delete(articleId);
      this.storage.unsaveArticle(articleId);
      button.textContent = '📍';
      button.classList.remove('saved');
      this.ui.showToast('Article removed from saved', 'info');
    } else {
      APP_STATE.savedArticles.add(articleId);
      this.storage.saveArticle(articleId);
      button.textContent = '📌';
      button.classList.add('saved');
      this.ui.showToast('Article saved!', 'success');
    }
    
    this.telegram.hapticFeedback('impact', 'light');
    this.updateBottomNavBadge();
  }

  /**
   * Handle article reaction
   */
  async handleArticleReaction(event) {
    const button = event.target.closest('.reaction-btn');
    const articleId = button.dataset.articleId;
    const reaction = button.dataset.reaction;
    
    try {
      // Record interaction
      await this.api.recordInteraction(articleId, 'reaction', { type: reaction });
      
      // Update UI
      const countSpan = button.querySelector('.reaction-count');
      const currentCount = parseInt(countSpan.textContent) || 0;
      countSpan.textContent = currentCount + 1;
      
      // Visual feedback
      button.classList.add('reacted');
      this.telegram.hapticFeedback('impact', 'light');
      
      setTimeout(() => {
        button.classList.remove('reacted');
      }, 1000);
      
    } catch (error) {
      console.warn('Failed to record reaction:', error);
    }
  }

  /**
   * Handle share with enhanced options
   */
  async handleShare(event) {
    const button = event.target.closest('.share-btn');
    const articleId = button.dataset.articleId;
    const article = APP_STATE.articles.find(a => a.id === articleId);
    
    if (article) {
      // Determine share type based on context
      const shareType = this.getOptimalShareType(event);
      
      await this.ui.shareArticle(article, {
        shareType,
        trackSharing: true,
        includeImage: true
      });
      
      this.telegram.hapticFeedback('impact', 'medium');
      
      // Record interaction for recommendations
      this.recommendations.trackInteraction(articleId, 'share', { article });
      
      // Update share count
      if (article.shares) {
        article.shares++;
      } else {
        article.shares = 1;
      }
      
      // Send to real-time service
      this.realTime.sendUserActivity('share', { articleId });
      
      // Record API interaction
      this.api.recordInteraction(articleId, 'share');
    }
  }

  /**
   * Get optimal share type based on context
   */
  getOptimalShareType(event) {
    // Check if user is in Telegram
    if (window.Telegram?.WebApp) {
      return 'telegram';
    }
    
    // Check for long press or right click for advanced options
    if (event.type === 'contextmenu' || event.detail > 1) {
      return 'advanced';
    }
    
    // Default to advanced modal for better UX
    return 'advanced';
  }

  /**
   * Handle refresh
   */
  async handleRefresh() {
    this.telegram.hapticFeedback('impact', 'heavy');
    await this.loadInitialData();
  }

  /**
   * Switch tab (for gestures)
   */
  switchTab(direction) {
    const tabs = Object.keys(APP_CONFIG.TABS);
    const currentIndex = tabs.indexOf(APP_STATE.currentTab);
    let newIndex;
    
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % tabs.length;
    } else {
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }
    
    const newTab = tabs[newIndex];
    document.dispatchEvent(new CustomEvent(EVENTS.TAB_CHANGED, {
      detail: { tab: newTab }
    }));
  }

  /**
   * Check if user can view article
   */
  canViewArticle(article) {
    if (APP_STATE.userTier === 'premium') return true;
    if (!article.isPremium) return true;
    return APP_STATE.articlesViewed < APP_CONFIG.FREE_TIER_LIMIT;
  }

  /**
   * Update usage stats
   */
  updateUsageStats() {
    const container = document.getElementById('usage-stats');
    if (!container || APP_STATE.userTier === 'premium') return;
    
    const progressBar = container.querySelector('.progress-container');
    if (progressBar) {
      this.ui.updateProgressBar(progressBar, APP_STATE.articlesViewed, APP_CONFIG.FREE_TIER_LIMIT);
    }
  }

  /**
   * Update bottom navigation badge
   */
  updateBottomNavBadge() {
    const savedTab = document.querySelector('[data-tab="saved"]');
    if (savedTab) {
      const badge = savedTab.querySelector('.nav-badge');
      const count = APP_STATE.savedArticles.size;
      
      if (count > 0) {
        if (badge) {
          badge.textContent = count;
        } else {
          const newBadge = document.createElement('span');
          newBadge.className = 'nav-badge';
          newBadge.textContent = count;
          savedTab.appendChild(newBadge);
        }
      } else if (badge) {
        badge.remove();
      }
    }
  }

  /**
   * Start auto-refresh
   */
  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = setInterval(() => {
      if (!document.hidden && !APP_STATE.isLoading) {
        this.loadArticles();
      }
    }, APP_CONFIG.REFRESH_INTERVAL);
  }

  /**
   * Show loading state
   */
  showLoading() {
    const container = document.getElementById('articles-container');
    if (container && !APP_STATE.isLoading) {
      const skeleton = this.ui.createSkeletonLoader(3);
      container.appendChild(skeleton);
    }
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    const container = document.getElementById('articles-container');
    if (container) {
      const skeleton = container.querySelector('.skeleton-container');
      if (skeleton) {
        skeleton.remove();
      }
    }
  }

  /**
   * Handle errors
   */
  handleError(error) {
    console.error('App error:', error);
    
    let message = 'Something went wrong';
    if (error.message.includes('Network')) {
      message = 'Network error. Please check your connection.';
    } else if (error.message.includes('timeout')) {
      message = 'Request timed out. Please try again.';
    }
    
    this.ui.showToast(message, 'error');
    APP_STATE.hasError = true;
  }

  /**
   * Check if first time user
   */
  isFirstTime() {
    return !this.storage.getItem('has_visited', false, false);
  }

  /**
   * Show welcome message
   */
  showWelcomeMessage() {
    this.storage.setItem('has_visited', true);
    
    const content = `
      <div class="welcome-content">
        <h2>Welcome to Zone News! 📰</h2>
        <p>Stay updated with the latest news from Adelaide and South Australia.</p>
        <ul>
          <li>📱 Swipe between tabs for easy navigation</li>
          <li>📌 Save articles to read later</li>
          <li>👍 React to articles you like</li>
          <li>📤 Share interesting stories</li>
        </ul>
        <p>Free users get <strong>${APP_CONFIG.FREE_TIER_LIMIT} articles per day</strong>. Upgrade to Premium for unlimited access!</p>
      </div>
    `;
    
    this.ui.showModal(content, {
      title: 'Welcome! 👋',
      actions: '<button class="btn btn-primary modal-close-btn">Get Started</button>'
    });
  }

  /**
   * Show upgrade modal
   */
  showUpgradeModal() {
    const content = `
      <div class="upgrade-content">
        <h2>Upgrade to Premium ⭐</h2>
        <div class="upgrade-benefits">
          <div class="benefit-item">
            <span class="benefit-icon">∞</span>
            <span class="benefit-text">Unlimited daily articles</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-icon">🔒</span>
            <span class="benefit-text">Exclusive premium content</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-icon">📊</span>
            <span class="benefit-text">Advanced analytics</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-icon">🚫</span>
            <span class="benefit-text">No advertisements</span>
          </div>
        </div>
        <p class="upgrade-price">Only $4.99/month</p>
      </div>
    `;
    
    const actions = `
      <button class="btn btn-secondary modal-close-btn">Maybe Later</button>
      <button class="btn btn-primary" onclick="app.upgradeToPremium()">Upgrade Now</button>
    `;
    
    this.ui.showModal(content, {
      title: 'Premium Features',
      actions
    });
  }

  /**
   * Upgrade to premium (placeholder)
   */
  upgradeToPremium() {
    // This would integrate with payment system
    this.ui.showToast('Premium upgrade coming soon!', 'info');
  }

  /**
   * Export user data
   */
  exportData() {
    const data = this.storage.exportData();
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zone-news-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      this.ui.showToast('Data exported successfully!', 'success');
    }
  }

  /**
   * Clear user data
   */
  async clearData() {
    const confirmed = await this.telegram.showConfirm(
      'Are you sure you want to clear all your data? This cannot be undone.'
    );
    
    if (confirmed) {
      this.storage.clear();
      location.reload();
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      app: {
        initialized: this.initialized,
        state: APP_STATE
      },
      telegram: this.telegram.healthCheck(),
      api: await this.api.healthCheck().catch(e => ({ error: e.message })),
      storage: this.storage.healthCheck()
    };
  }

  /**
   * Handle search input
   */
  handleSearch(query) {
    if (!query || query.length < 2) {
      this.clearSearch();
      return;
    }

    try {
      // Perform search using search service
      const searchResults = this.search.search(query, {
        maxResults: 20,
        fuzzyMatch: true,
        boostRecent: true
      });

      // Update articles state with search results
      APP_STATE.searchQuery = query;
      APP_STATE.searchResults = searchResults;
      APP_STATE.isSearching = true;

      // Render search results
      this.renderSearchResults(searchResults);

      // Track search analytics
      this.search.trackSearchQuery(query);

      console.log(`🔍 Search completed: "${query}" - ${searchResults.length} results`);

    } catch (error) {
      console.error('Search failed:', error);
      this.ui.showToast('Search failed. Please try again.', 'error');
    }
  }

  /**
   * Clear search and show all articles
   */
  clearSearch() {
    APP_STATE.searchQuery = '';
    APP_STATE.searchResults = [];
    APP_STATE.isSearching = false;
    
    // Show all articles again
    this.renderArticles(APP_STATE.articles);
  }

  /**
   * Show search suggestions
   */
  showSearchSuggestions(query) {
    const searchSuggestions = document.getElementById('searchSuggestions');
    const suggestionsList = document.getElementById('suggestionsList');
    
    if (!searchSuggestions || !suggestionsList) return;

    // Get suggestions from search service
    const suggestions = this.search.getSuggestions(query, { maxSuggestions: 8 });
    
    // Clear previous suggestions
    suggestionsList.innerHTML = '';

    // Add suggestions
    suggestions.forEach(suggestion => {
      const suggestionItem = document.createElement('div');
      suggestionItem.className = 'suggestion-item';
      suggestionItem.dataset.query = suggestion.text;
      
      suggestionItem.innerHTML = `
        <span class="suggestion-icon">${suggestion.type === 'recent' ? '🕒' : '🔍'}</span>
        <span class="suggestion-text">${this.ui.escapeHtml(suggestion.text)}</span>
        ${suggestion.count ? `<span class="suggestion-count">${suggestion.count}</span>` : ''}
      `;
      
      suggestionsList.appendChild(suggestionItem);
    });

    searchSuggestions.style.display = suggestions.length > 0 ? 'block' : 'none';
  }

  /**
   * Show recent searches
   */
  showRecentSearches() {
    const recentSearches = this.search.getRecentSearches(5);
    if (recentSearches.length > 0) {
      this.showSearchSuggestions('');
    }
  }

  /**
   * Hide search suggestions
   */
  hideSearchSuggestions() {
    const searchSuggestions = document.getElementById('searchSuggestions');
    if (searchSuggestions) {
      searchSuggestions.style.display = 'none';
    }
  }

  /**
   * Toggle advanced filters
   */
  toggleAdvancedFilters() {
    const searchFilters = document.getElementById('searchFilters');
    if (searchFilters) {
      const isVisible = searchFilters.style.display === 'block';
      searchFilters.style.display = isVisible ? 'none' : 'block';
    }
  }

  /**
   * Hide advanced filters
   */
  hideAdvancedFilters() {
    const searchFilters = document.getElementById('searchFilters');
    if (searchFilters) {
      searchFilters.style.display = 'none';
    }
  }

  /**
   * Apply advanced filters
   */
  applyAdvancedFilters() {
    const categoryFilter = document.getElementById('categoryFilter');
    const timeFilter = document.getElementById('timeFilter');
    
    const filters = {
      category: categoryFilter?.value || 'all',
      timeRange: timeFilter?.value || 'all'
    };

    // Apply filters to current search or articles
    if (APP_STATE.isSearching && APP_STATE.searchQuery) {
      const filteredResults = this.search.applyFilters(APP_STATE.searchResults, filters);
      this.renderSearchResults(filteredResults);
    } else {
      this.loadArticles(filters);
    }

    this.hideAdvancedFilters();
    this.ui.showToast('Filters applied', 'success', 2000);
  }

  /**
   * Clear advanced filters
   */
  clearAdvancedFilters() {
    const categoryFilter = document.getElementById('categoryFilter');
    const timeFilter = document.getElementById('timeFilter');
    
    if (categoryFilter) categoryFilter.value = 'all';
    if (timeFilter) timeFilter.value = 'all';

    // Reload without filters
    if (APP_STATE.isSearching) {
      this.handleSearch(APP_STATE.searchQuery);
    } else {
      this.loadArticles();
    }

    this.ui.showToast('Filters cleared', 'info', 2000);
  }

  /**
   * Render search results
   */
  renderSearchResults(results) {
    const container = document.getElementById('articles-container');
    if (!container) return;

    container.innerHTML = '';

    if (results.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No search results</h3>
          <p>No articles found for "${this.ui.escapeHtml(APP_STATE.searchQuery)}"</p>
          <button class="btn btn-secondary" onclick="app.clearSearch()">
            Show All Articles
          </button>
        </div>
      `;
      return;
    }

    // Add search header
    const searchHeader = document.createElement('div');
    searchHeader.className = 'search-results-header';
    searchHeader.innerHTML = `
      <div class="search-results-info">
        <span class="search-results-count">${results.length} results</span>
        <span class="search-results-query">for "${this.ui.escapeHtml(APP_STATE.searchQuery)}"</span>
      </div>
      <button class="search-clear-results" onclick="app.clearSearch()">
        <span>Show All</span>
        <span aria-hidden="true">×</span>
      </button>
    `;
    container.appendChild(searchHeader);

    // Render articles with search highlights
    results.forEach(result => {
      const article = result.article;
      const isSaved = APP_STATE.savedArticles.has(article.id);
      const isPremiumUser = APP_STATE.userTier === 'premium';
      const canView = this.canViewArticle(article);
      
      if (!canView && !isPremiumUser) return;
      
      const card = this.ui.createArticleCard(article, {
        isSaved,
        isPremiumUser,
        canView,
        searchHighlight: result.highlights,
        relevanceScore: result.score
      });
      
      container.appendChild(card);
    });
  }

  /**
   * Handle real-time reaction updates
   */
  handleRealTimeReactionUpdate(data) {
    const { articleId, reactions, reactionType } = data;
    
    // Update local article data
    const article = APP_STATE.articles.find(a => a.id === articleId);
    if (article) {
      article.reactions = { ...article.reactions, ...reactions };
    }

    // Show visual feedback for the reaction
    this.showReactionFeedback(articleId, reactionType);
    
    // Track for recommendations
    this.recommendations.trackInteraction(articleId, 'reaction', {
      type: reactionType,
      article
    });
  }

  /**
   * Handle real-time comment updates
   */
  handleRealTimeCommentUpdate(data) {
    const { articleId, comment, action, totalComments } = data;
    
    // Update comment count in UI
    const articleElement = document.querySelector(`[data-article-id="${articleId}"]`);
    if (articleElement) {
      const commentCount = articleElement.querySelector('.comment-count');
      if (commentCount) {
        commentCount.textContent = totalComments;
      }
    }

    // Show notification for new comments
    if (action === 'add') {
      this.ui.showToast('New comment added', 'info', 3000);
    }
  }

  /**
   * Handle breaking news
   */
  handleBreakingNews(breakingItem) {
    // Show breaking news banner
    this.showBreakingNewsBanner(breakingItem);
    
    // Show notification
    this.ui.showToast(`🚨 Breaking: ${breakingItem.title}`, 'warning', 5000);
    
    // Haptic feedback
    this.telegram.hapticFeedback('impact', 'heavy');
  }

  /**
   * Handle connection state changes
   */
  handleConnectionStateChange(data) {
    const { state } = data;
    
    switch (state) {
      case 'connected':
        this.ui.showToast('🟢 Live updates connected', 'success', 2000);
        break;
      case 'disconnected':
        this.ui.showToast('🔴 Live updates disconnected', 'warning', 3000);
        break;
      case 'reconnecting':
        this.ui.showToast('🟡 Reconnecting...', 'info', 2000);
        break;
    }
  }

  /**
   * Handle user activity updates
   */
  handleUserActivity(data) {
    // Update online user count or other activity indicators
    const { action, userId } = data;
    
    if (action === 'reading') {
      // Show subtle indicator that others are reading
      console.log(`User ${userId} is reading an article`);
    }
  }

  /**
   * Handle real-time article updates
   */
  handleRealTimeArticleUpdate(data) {
    const { articleId, stats } = data;
    
    // Update article statistics
    const article = APP_STATE.articles.find(a => a.id === articleId);
    if (article && stats) {
      Object.assign(article, stats);
    }
  }

  /**
   * Show reaction feedback animation
   */
  showReactionFeedback(articleId, reactionType) {
    const articleElement = document.querySelector(`[data-article-id="${articleId}"]`);
    if (articleElement) {
      const reactionButton = articleElement.querySelector(`[data-reaction="${reactionType}"]`);
      if (reactionButton) {
        reactionButton.classList.add('reaction-pulse');
        setTimeout(() => {
          reactionButton.classList.remove('reaction-pulse');
        }, 1000);
      }
    }
  }

  /**
   * Show breaking news banner
   */
  showBreakingNewsBanner(breakingItem) {
    // Create or update breaking news banner
    let banner = document.querySelector('.breaking-news-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'breaking-news-banner';
      document.body.insertBefore(banner, document.body.firstChild);
    }

    banner.innerHTML = `
      <div class="breaking-news-content">
        <span class="breaking-news-label">🚨 BREAKING</span>
        <span class="breaking-news-text">${this.ui.escapeHtml(breakingItem.title)}</span>
        <button class="breaking-news-close" onclick="this.parentElement.parentElement.remove()">
          ×
        </button>
      </div>
    `;

    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (banner.parentElement) {
        banner.remove();
      }
    }, 10000);
  }

  /**
   * Track article views for real-time analytics
   */
  trackArticleViews() {
    // Set up intersection observer to track when articles come into view
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const articleId = entry.target.dataset.articleId;
          if (articleId && !entry.target.dataset.viewed) {
            entry.target.dataset.viewed = 'true';
            
            // Send real-time view update
            this.realTime.sendUserActivity('reading', { articleId });
            
            // Track for recommendations
            const article = APP_STATE.articles.find(a => a.id === articleId);
            if (article) {
              this.recommendations.trackInteraction(articleId, 'view', { article });
            }

            // Update local view count
            APP_STATE.articlesViewed++;
            this.updateUsageStats();
          }
        }
      });
    }, {
      threshold: 0.5,
      rootMargin: '0px'
    });

    // Observe all article cards
    const observeArticleCards = () => {
      document.querySelectorAll('[data-article-id]').forEach(card => {
        if (!card.dataset.observing) {
          observer.observe(card);
          card.dataset.observing = 'true';
        }
      });
    };

    // Initial observation
    observeArticleCards();

    // Re-observe when new articles are added
    const originalRenderArticles = this.renderArticles.bind(this);
    this.renderArticles = function(articles) {
      originalRenderArticles(articles);
      setTimeout(observeArticleCards, 100);
    };
  }

  /**
   * Cleanup when app is destroyed
   */
  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.api.cancelAllRequests();
    
    // Disconnect real-time service
    this.realTime.disconnect();
    
    // Save recommendation data
    this.recommendations.saveUserData();
    
    // Remove event listeners
    document.removeEventListener(EVENTS.FILTER_CHANGED, this.handleFilterChange);
    document.removeEventListener(EVENTS.TAB_CHANGED, this.handleTabChange);
    window.removeEventListener('telegram:refresh', this.handleRefresh);
    
    this.initialized = false;
  }
}

// ===== APPLICATION INITIALIZATION =====
let app;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

async function initializeApp() {
  try {
    app = new ZoneNewsApp();
    await app.initialize();
    
    // Make app globally available for debugging
    window.app = app;
    
  } catch (error) {
    console.error('Failed to initialize Zone News App:', error);
    
    // Show fallback error message
    document.body.innerHTML = `
      <div class="error-container">
        <h1>🚨 App Failed to Load</h1>
        <p>Sorry, something went wrong. Please try refreshing the page.</p>
        <button onclick="location.reload()" class="btn btn-primary">
          Refresh Page
        </button>
      </div>
    `;
  }
}

export { app };