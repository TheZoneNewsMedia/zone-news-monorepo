/**
 * Zone News Mini App - Performance Optimized Application
 * Implements code splitting and lazy loading for better performance
 */

'use strict';

// Core imports - always loaded
import { APP_CONFIG, APP_STATE, EVENTS } from './config.js';
import { TelegramWebApp } from './telegram-integration.js';
import { ApiService } from './api-service.js';
import { StorageService } from './storage-service.js';
import { moduleLoader, featureLoader } from './module-loader.js';

// ===== PERFORMANCE OPTIMIZED APPLICATION =====
export class ZoneNewsAppOptimized {
  constructor() {
    // Core services - always loaded
    this.telegram = new TelegramWebApp();
    this.api = new ApiService();
    this.storage = new StorageService();
    
    // Lazy-loaded services - loaded on demand
    this.ui = null;
    this.search = null;
    this.realTime = null;
    this.recommendations = null;
    this.comments = null;
    
    // Performance tracking
    this.startTime = performance.now();
    this.initialized = false;
    this.refreshTimer = null;
    this.loadingStates = new Map();
    
    // Module loading configuration
    this.setupModuleConfigs();
    
    // Bind methods
    this.handleFilterChange = this.handleFilterChange.bind(this);
    this.handleTabChange = this.handleTabChange.bind(this);
    this.handleArticleSave = this.handleArticleSave.bind(this);
    this.handleArticleReaction = this.handleArticleReaction.bind(this);
    this.handleShare = this.handleShare.bind(this);
    this.handleRefresh = this.handleRefresh.bind(this);
  }

  /**
   * Setup module loading configurations
   */
  setupModuleConfigs() {
    // Register features with their module requirements
    featureLoader.registerFeature('ui', {
      path: './ui-components.js',
      options: { timeout: 5000 }
    });

    featureLoader.registerFeature('search', {
      path: './search-service.js',
      options: { timeout: 3000 },
      condition: () => APP_STATE.currentTab === 'home' || document.querySelector('#searchInput')
    });

    featureLoader.registerFeature('realtime', {
      path: './real-time-service.js',
      options: { timeout: 5000 },
      condition: () => navigator.onLine
    });

    featureLoader.registerFeature('recommendations', {
      path: './recommendation-service.js',
      options: { timeout: 3000 },
      condition: () => APP_STATE.currentTab === 'profile' || APP_STATE.articlesViewed > 3
    });

    featureLoader.registerFeature('comments', {
      path: './comment-system.js',
      options: { timeout: 3000 },
      condition: () => APP_STATE.userTier === 'premium' || APP_STATE.articlesViewed > 1
    });
  }

  /**
   * Initialize the application with performance optimization
   */
  async initialize() {
    if (this.initialized) return;

    try {
      console.log('🚀 Initializing optimized Zone News App...');
      
      // Apply Telegram theme immediately
      this.telegram.applyTheme();
      
      // Load user state from storage
      this.loadUserState();
      
      // Load UI components first (essential for app function)
      await this.loadUIComponents();
      
      // Setup essential UI
      this.setupEssentialUI();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Start loading non-critical modules in background
      this.preloadModules();
      
      // Load initial data
      await this.loadInitialData();
      
      // Start auto-refresh
      this.startAutoRefresh();
      
      // Mark as initialized
      this.initialized = true;
      
      const initTime = performance.now() - this.startTime;
      console.log(`✅ Optimized app initialized in ${initTime.toFixed(2)}ms`);
      
      // Show welcome message for first-time users
      if (this.isFirstTime()) {
        this.showWelcomeMessage();
      }
      
      // Report initialization performance
      this.reportInitializationMetrics(initTime);
      
    } catch (error) {
      console.error('❌ Failed to initialize optimized app:', error);
      this.handleError(error);
    }
  }

  /**
   * Load UI components with error handling
   */
  async loadUIComponents() {
    try {
      this.setLoadingState('ui', true);
      const UIModule = await featureLoader.loadFeature('ui');
      this.ui = new UIModule.UIComponents();
      console.log('✅ UI components loaded');
    } catch (error) {
      console.error('❌ Failed to load UI components:', error);
      // Fallback to basic UI
      this.ui = this.createFallbackUI();
    } finally {
      this.setLoadingState('ui', false);
    }
  }

  /**
   * Preload modules that might be needed soon
   */
  async preloadModules() {
    // Preload modules based on user context and behavior
    const preloadConfigs = [];

    // Always preload search if on home page
    if (APP_STATE.currentTab === 'home') {
      preloadConfigs.push({ name: 'search', path: './search-service.js' });
    }

    // Preload real-time if online
    if (navigator.onLine) {
      preloadConfigs.push({ name: 'realtime', path: './real-time-service.js' });
    }

    // Preload recommendations for engaged users
    if (APP_STATE.articlesViewed > 2) {
      preloadConfigs.push({ name: 'recommendations', path: './recommendation-service.js' });
    }

    // Preload comments for interactive users
    if (APP_STATE.userTier === 'premium' || APP_STATE.savedArticles.size > 0) {
      preloadConfigs.push({ name: 'comments', path: './comment-system.js' });
    }

    if (preloadConfigs.length > 0) {
      moduleLoader.preloadModules(preloadConfigs).catch(error => {
        console.warn('Preloading failed:', error);
      });
    }
  }

  /**
   * Lazy load search service when needed
   */
  async getSearchService() {
    if (!this.search) {
      try {
        this.setLoadingState('search', true);
        const SearchModule = await featureLoader.loadFeature('search');
        this.search = new SearchModule.SearchService(this.storage);
        console.log('✅ Search service loaded on demand');
      } catch (error) {
        console.error('❌ Failed to load search service:', error);
        this.search = this.createFallbackSearch();
      } finally {
        this.setLoadingState('search', false);
      }
    }
    return this.search;
  }

  /**
   * Lazy load real-time service when needed
   */
  async getRealTimeService() {
    if (!this.realTime && navigator.onLine) {
      try {
        this.setLoadingState('realtime', true);
        const RealTimeModule = await featureLoader.loadFeature('realtime');
        this.realTime = new RealTimeModule.RealTimeService();
        await this.setupRealTimeFeatures();
        console.log('✅ Real-time service loaded on demand');
      } catch (error) {
        console.error('❌ Failed to load real-time service:', error);
        this.realTime = this.createFallbackRealTime();
      } finally {
        this.setLoadingState('realtime', false);
      }
    }
    return this.realTime;
  }

  /**
   * Lazy load recommendations service when needed
   */
  async getRecommendationsService() {
    if (!this.recommendations) {
      try {
        this.setLoadingState('recommendations', true);
        const RecommendationsModule = await featureLoader.loadFeature('recommendations');
        this.recommendations = new RecommendationsModule.RecommendationService(this.storage);
        console.log('✅ Recommendations service loaded on demand');
      } catch (error) {
        console.error('❌ Failed to load recommendations service:', error);
        this.recommendations = this.createFallbackRecommendations();
      } finally {
        this.setLoadingState('recommendations', false);
      }
    }
    return this.recommendations;
  }

  /**
   * Lazy load comment system when needed
   */
  async getCommentSystem() {
    if (!this.comments) {
      try {
        this.setLoadingState('comments', true);
        const CommentsModule = await featureLoader.loadFeature('comments');
        this.comments = new CommentsModule.CommentSystem(await this.getRealTimeService(), this.storage);
        console.log('✅ Comment system loaded on demand');
      } catch (error) {
        console.error('❌ Failed to load comment system:', error);
        this.comments = this.createFallbackComments();
      } finally {
        this.setLoadingState('comments', false);
      }
    }
    return this.comments;
  }

  /**
   * Setup essential UI (minimal initially)
   */
  setupEssentialUI() {
    // Get main containers
    const filterContainer = document.getElementById('filter-tabs');
    const bottomNavContainer = document.getElementById('bottom-navigation');
    const usageContainer = document.getElementById('usage-stats');

    // Create filter tabs
    if (filterContainer && this.ui) {
      const filterTabs = this.ui.createFilterTabs(APP_CONFIG.CATEGORIES, APP_STATE.currentFilter);
      filterContainer.appendChild(filterTabs);
    }

    // Create bottom navigation
    if (bottomNavContainer && this.ui) {
      const savedCount = APP_STATE.savedArticles.size;
      const tabs = {
        ...APP_CONFIG.TABS,
        saved: { ...APP_CONFIG.TABS.saved, badge: savedCount > 0 ? savedCount : null }
      };
      const bottomNav = this.ui.createBottomNavigation(tabs, APP_STATE.currentTab);
      bottomNavContainer.appendChild(bottomNav);
    }

    // Create usage stats for free tier
    if (usageContainer && APP_STATE.userTier === 'free' && this.ui) {
      const progressBar = this.ui.createProgressBar(
        APP_STATE.articlesViewed,
        APP_CONFIG.FREE_TIER_LIMIT,
        'Daily articles viewed'
      );
      usageContainer.appendChild(progressBar);
    }

    // Setup main button
    this.telegram.showMainButton('Refresh News');
  }

  /**
   * Setup search UI with lazy loading
   */
  async setupSearchUI() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    // Add loading indicator for search
    const searchContainer = searchInput.closest('.search-container');
    if (searchContainer) {
      searchContainer.classList.add('search-loading');
    }

    try {
      const search = await this.getSearchService();
      
      // Initialize search service with current articles
      search.indexArticles(APP_STATE.articles);

      // Setup search event handlers (same as original but with lazy loading)
      this.setupSearchEventHandlers(searchInput, search);

      if (searchContainer) {
        searchContainer.classList.remove('search-loading');
        searchContainer.classList.add('search-ready');
      }

      console.log('✅ Enhanced search UI initialized with lazy loading');
    } catch (error) {
      console.error('❌ Failed to setup search UI:', error);
      if (searchContainer) {
        searchContainer.classList.remove('search-loading');
        searchContainer.classList.add('search-error');
      }
    }
  }

  /**
   * Setup real-time features with lazy loading
   */
  async setupRealTimeFeatures() {
    if (!this.realTime) return;

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

    // Send initial user activity
    this.realTime.sendUserActivity('active', {
      currentPage: APP_STATE.currentTab,
      userTier: APP_STATE.userTier
    });

    console.log('✅ Real-time features initialized with lazy loading');
  }

  /**
   * Show personalized recommendations with lazy loading
   */
  async showPersonalizedRecommendations() {
    try {
      this.showLoadingSpinner('Loading personalized recommendations...');
      
      const recommendations = await this.getRecommendationsService();
      const recs = recommendations.getRecommendations(APP_STATE.articles, {
        count: 10,
        algorithms: ['contentBased', 'trending', 'recency', 'diversity'],
        diversityLevel: 0.3
      });

      this.hideLoadingSpinner();

      if (recs.length === 0) {
        this.ui?.showToast('Not enough data for recommendations yet. Read more articles!', 'info');
        return;
      }

      // Render recommendations (similar to original implementation)
      this.renderRecommendations(recs);
      
    } catch (error) {
      this.hideLoadingSpinner();
      console.error('Failed to load recommendations:', error);
      this.ui?.showToast('Failed to load recommendations', 'error');
    }
  }

  /**
   * Show article comments with lazy loading
   */
  async showArticleComments(articleId) {
    try {
      this.showLoadingSpinner('Loading comments...');
      
      const comments = await this.getCommentSystem();
      const article = APP_STATE.articles.find(a => a.id === articleId);
      
      if (!article) {
        this.hideLoadingSpinner();
        return;
      }

      this.hideLoadingSpinner();

      // Create comments modal (similar to original implementation)
      const content = this.createCommentsModalContent(article);
      const modal = this.ui.showModal(content, {
        title: '💬 Comments',
        className: 'comments-modal'
      });

      // Initialize comments in the modal
      const commentsContainer = modal.querySelector(`#commentsContainer-${articleId}`);
      comments.showComments(articleId, commentsContainer);

    } catch (error) {
      this.hideLoadingSpinner();
      console.error('Failed to load comments:', error);
      this.ui?.showToast('Failed to load comments', 'error');
    }
  }

  /**
   * Handle search with lazy loading
   */
  async handleSearch(query) {
    if (!query || query.length < 2) {
      this.clearSearch();
      return;
    }

    try {
      const search = await this.getSearchService();
      
      // Perform search using search service
      const searchResults = search.search(query, {
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
      search.trackSearchQuery(query);

      console.log(`🔍 Search completed: "${query}" - ${searchResults.length} results`);

    } catch (error) {
      console.error('Search failed:', error);
      this.ui?.showToast('Search failed. Please try again.', 'error');
    }
  }

  /**
   * Set loading state for a module
   */
  setLoadingState(moduleName, loading) {
    this.loadingStates.set(moduleName, loading);
    
    // Update UI to show loading state
    if (loading) {
      this.showModuleLoading(moduleName);
    } else {
      this.hideModuleLoading(moduleName);
    }
  }

  /**
   * Show loading indicator for specific module
   */
  showModuleLoading(moduleName) {
    const indicator = document.createElement('div');
    indicator.className = `module-loading module-loading-${moduleName}`;
    indicator.innerHTML = `<span class="loading-spinner"></span> Loading ${moduleName}...`;
    indicator.id = `loading-${moduleName}`;
    
    // Add to appropriate container based on module
    const containers = {
      search: document.querySelector('.search-container'),
      ui: document.body,
      realtime: document.querySelector('.connection-status'),
      recommendations: document.getElementById('articles-container'),
      comments: document.querySelector('.comment-section')
    };
    
    const container = containers[moduleName] || document.body;
    container.appendChild(indicator);
  }

  /**
   * Hide loading indicator for specific module
   */
  hideModuleLoading(moduleName) {
    const indicator = document.getElementById(`loading-${moduleName}`);
    if (indicator) {
      indicator.remove();
    }
  }

  /**
   * Show general loading spinner
   */
  showLoadingSpinner(message = 'Loading...') {
    if (this.ui) {
      const container = document.getElementById('articles-container') || document.body;
      this.ui.showLoading(container, message);
    }
  }

  /**
   * Hide general loading spinner
   */
  hideLoadingSpinner() {
    if (this.ui) {
      const container = document.getElementById('articles-container') || document.body;
      this.ui.hideLoading(container);
    }
  }

  /**
   * Report initialization metrics
   */
  reportInitializationMetrics(initTime) {
    const metrics = {
      initializationTime: initTime,
      moduleStats: moduleLoader.getLoadingStats(),
      memoryUsage: moduleLoader.estimateMemoryUsage(),
      userAgent: navigator.userAgent,
      connectionType: navigator.connection?.effectiveType || 'unknown'
    };

    // Report to analytics if available
    if (window.gtag) {
      window.gtag('event', 'app_initialization', {
        event_category: 'performance',
        value: Math.round(initTime),
        custom_parameters: {
          modules_loaded: metrics.moduleStats.moduleCount,
          connection_type: metrics.connectionType
        }
      });
    }

    console.log('📊 Initialization Metrics:', metrics);
    return metrics;
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
   * Create fallback services for failed module loads
   */
  createFallbackUI() {
    return {
      showToast: (message, type) => console.log(`Toast (${type}): ${message}`),
      showModal: (content, options) => console.log('Modal:', content),
      createFilterTabs: () => document.createElement('div'),
      createBottomNavigation: () => document.createElement('div'),
      createProgressBar: () => document.createElement('div'),
      showLoading: () => {},
      hideLoading: () => {}
    };
  }

  createFallbackSearch() {
    return {
      search: () => [],
      indexArticles: () => {},
      trackSearchQuery: () => {},
      getSuggestions: () => []
    };
  }

  createFallbackRealTime() {
    return {
      on: () => {},
      sendUserActivity: () => {},
      sendComment: () => Promise.resolve()
    };
  }

  createFallbackRecommendations() {
    return {
      getRecommendations: () => [],
      trackInteraction: () => {}
    };
  }

  createFallbackComments() {
    return {
      showComments: () => {},
      submitComment: () => Promise.resolve()
    };
  }

  // ... (Include other essential methods from original app.js with lazy loading optimizations)

  /**
   * Health check with performance metrics
   */
  async healthCheck() {
    const baseHealth = {
      app: {
        initialized: this.initialized,
        state: APP_STATE
      },
      telegram: this.telegram.healthCheck(),
      api: await this.api.healthCheck().catch(e => ({ error: e.message })),
      storage: this.storage.healthCheck()
    };

    // Add performance metrics
    return {
      ...baseHealth,
      performance: {
        moduleLoader: moduleLoader.healthCheck(),
        loadingStates: Object.fromEntries(this.loadingStates),
        initializationTime: this.startTime ? performance.now() - this.startTime : null
      }
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
    
    // Disconnect real-time service if loaded
    if (this.realTime) {
      this.realTime.disconnect();
    }
    
    // Save recommendation data if service loaded
    if (this.recommendations) {
      this.recommendations.saveUserData();
    }
    
    // Clear module loader
    moduleLoader.clearModules();
    
    // Remove event listeners
    document.removeEventListener(EVENTS.FILTER_CHANGED, this.handleFilterChange);
    document.removeEventListener(EVENTS.TAB_CHANGED, this.handleTabChange);
    window.removeEventListener('telegram:refresh', this.handleRefresh);
    
    this.initialized = false;
  }

  // Include essential methods from original app.js with performance optimizations
  // ... (handleFilterChange, handleTabChange, etc. with lazy loading support)
}