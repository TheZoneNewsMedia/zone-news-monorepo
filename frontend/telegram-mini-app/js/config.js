/**
 * Zone News Mini App - Configuration
 * Global configuration and constants
 */

'use strict';

// ===== GLOBAL CONFIGURATION =====
export const APP_CONFIG = {
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
  },
  CATEGORIES: {
    all: { label: 'All', icon: '📰' },
    local: { label: 'Local', icon: '🏢' },
    business: { label: 'Business', icon: '💼' },
    sports: { label: 'Sports', icon: '⚽' },
    health: { label: 'Health', icon: '🏥' },
    innovations: { label: 'Tech', icon: '💡' }
  },
  TABS: {
    home: { label: 'Home', icon: '🏠' },
    saved: { label: 'Saved', icon: '📌' },
    trending: { label: 'Trending', icon: '🔥' },
    profile: { label: 'Profile', icon: '👤' }
  },
  
  // Premium feature configuration
  PREMIUM_FEATURES: {
    comments: {
      enabled: true,
      freeLimit: 3, // Free users can post 3 comments per day
      premiumUnlimited: true
    },
    advancedSearch: {
      enabled: true,
      freeLimit: 10, // Free users get 10 searches per day
      premiumUnlimited: true
    },
    saveArticles: {
      enabled: true,
      freeLimit: 10, // Free users can save 10 articles
      premiumLimit: 100 // Premium users can save 100 articles
    },
    notifications: {
      enabled: true,
      freeBasic: true, // Basic notifications for free users
      premiumAdvanced: true // Advanced notifications for premium
    }
  },
  
  // User tier definitions
  USER_TIERS: {
    free: {
      name: 'Free',
      price: 0,
      features: ['basic_reading', 'limited_comments', 'limited_saves'],
      limits: {
        comments: 3,
        searches: 10,
        saves: 10
      }
    },
    premium: {
      name: 'Premium',
      price: 4.99,
      features: ['unlimited_comments', 'advanced_search', 'priority_support', 'offline_reading'],
      limits: {
        comments: -1, // Unlimited
        searches: -1, // Unlimited
        saves: 100
      }
    },
    pro: {
      name: 'Pro',
      price: 9.99,
      features: ['everything_premium', 'analytics', 'custom_categories', 'early_access'],
      limits: {
        comments: -1, // Unlimited
        searches: -1, // Unlimited
        saves: -1 // Unlimited
      }
    }
  }
};

// ===== GLOBAL STATE =====
export const APP_STATE = {
  userTier: 'free',
  articlesViewed: 0,
  savedArticles: new Set(),
  currentFilter: 'all',
  currentTab: 'home',
  articles: [],
  isLoading: false,
  currentArticle: null,
  refreshTimer: null,
  hasError: false,
  
  // Premium state tracking
  dailyUsage: {
    comments: 0,
    searches: 0,
    lastReset: new Date().toDateString()
  },
  premiumStatus: {
    isActive: false,
    expiresAt: null,
    features: []
  }
};

// ===== ERROR TYPES =====
export const ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  TELEGRAM_ERROR: 'TELEGRAM_ERROR'
};

// ===== EVENT TYPES =====
export const EVENTS = {
  ARTICLES_LOADED: 'articles:loaded',
  ARTICLE_SAVED: 'article:saved',
  ARTICLE_UNSAVED: 'article:unsaved',
  ARTICLE_SELECTED: 'article:selected',
  FILTER_CHANGED: 'filter:changed',
  TAB_CHANGED: 'tab:changed',
  ERROR_OCCURRED: 'error:occurred',
  TIER_CHANGED: 'tier:changed',
  
  // Module loading events
  MODULE_LOADED: 'module:loaded',
  
  // Sharing events
  SHARE_REQUESTED: 'share:requested',
  SHARING_COMPLETE: 'sharing:complete',
  
  // Form events
  FORM_INTERACTION: 'form:interaction',
  SEARCH_REQUESTED: 'search:requested',
  SEARCH_PERFORMED: 'search:performed',
  SEARCH_ADVANCED_REQUESTED: 'search:advanced_requested',
  COMMENT_REQUESTED: 'comment:requested',
  COMMENT_SUBMITTED: 'comment:submitted',
  COMMENT_CANCELLED: 'comment:cancelled',
  FEEDBACK_SUBMITTED: 'feedback:submitted',
  FEEDBACK_CANCELLED: 'feedback:cancelled',
  
  // Premium events
  PREMIUM_LIMIT_REACHED: 'premium:limit_reached',
  PREMIUM_UPGRADE_REQUESTED: 'premium:upgrade_requested',
  PREMIUM_STATUS_CHANGED: 'premium:status_changed',
  FEATURE_RESTRICTED: 'feature:restricted',
  
  // A/B Testing events
  AB_TEST_INITIALIZED: 'ab_test:initialized',
  AB_TEST_VARIANT_ASSIGNED: 'ab_test:variant_assigned',
  AB_TEST_EVENT_TRACKED: 'ab_test:event_tracked',
  AB_TEST_COMPLETED: 'ab_test:completed',
  AB_TEST_CONFIG_UPDATED: 'ab_test:config_updated'
};