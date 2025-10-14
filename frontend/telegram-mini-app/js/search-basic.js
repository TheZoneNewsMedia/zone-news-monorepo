/**
 * Zone News Mini App - Basic Search Module
 * Essential search functionality loaded immediately
 * Advanced features are lazy-loaded for performance
 */

'use strict';

import { APP_CONFIG, EVENTS } from './config.js';
import { UIUtils } from './ui-core.js';

// ===== BASIC SEARCH FUNCTIONALITY =====
export class BasicSearchService {
  constructor() {
    this.searchHistory = this.loadSearchHistory();
    this.recentSearches = new Set();
    this.searchCache = new Map();
    this.setupEventListeners();
    console.log('🔍 Basic Search Service initialized');
  }

  /**
   * Setup basic search event listeners
   */
  setupEventListeners() {
    // Listen for advanced search requests to trigger lazy loading
    document.addEventListener(EVENTS.SEARCH_ADVANCED_REQUESTED, (e) => {
      this.loadAdvancedSearch(e.detail);
    });

    // Listen for search performance monitoring
    document.addEventListener(EVENTS.SEARCH_PERFORMED, (e) => {
      this.trackSearchPerformance(e.detail);
    });
  }

  /**
   * Create basic search interface
   */
  createBasicSearchBar(container, options = {}) {
    const {
      placeholder = 'Search Adelaide news...',
      showSuggestions = true,
      enableHistory = true,
      maxSuggestions = 5
    } = options;

    const searchBar = document.createElement('div');
    searchBar.className = 'basic-search-bar';
    searchBar.innerHTML = `
      <div class="search-input-container">
        <span class="search-icon">🔍</span>
        <input 
          type="search" 
          class="basic-search-input" 
          placeholder="${UIUtils.escapeHtml(placeholder)}"
          autocomplete="off"
          spellcheck="false"
        >
        <button class="search-clear-btn" style="display: none;" aria-label="Clear search">×</button>
        ${showSuggestions ? `
          <button class="search-advanced-btn" aria-label="Advanced search options" title="Advanced Search">
            ⚙️
          </button>
        ` : ''}
      </div>
      
      ${showSuggestions ? `
        <div class="basic-search-suggestions" style="display: none;">
          <div class="suggestions-content"></div>
        </div>
      ` : ''}
    `;

    // Setup basic search handlers
    this.setupBasicSearchHandlers(searchBar, options);
    
    // Insert into container
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    container.appendChild(searchBar);

    return searchBar;
  }

  /**
   * Setup basic search event handlers
   */
  setupBasicSearchHandlers(searchBar, options) {
    const input = searchBar.querySelector('.basic-search-input');
    const clearBtn = searchBar.querySelector('.search-clear-btn');
    const advancedBtn = searchBar.querySelector('.search-advanced-btn');
    const suggestions = searchBar.querySelector('.basic-search-suggestions');
    const suggestionsContent = searchBar.querySelector('.suggestions-content');

    // Debounced search handler
    const debouncedSearch = UIUtils.debounce(async (query) => {
      if (query.length >= 2) {
        await this.handleBasicSearch(query, suggestionsContent, options);
      } else if (suggestions) {
        suggestions.style.display = 'none';
      }
    }, 300);

    // Input event handlers
    input.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      
      // Show/hide clear button
      clearBtn.style.display = value ? 'block' : 'none';
      
      // Handle search
      if (value) {
        debouncedSearch(value);
      } else if (suggestions) {
        suggestions.style.display = 'none';
      }
    });

    // Clear button handler
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        if (suggestions) {
          suggestions.style.display = 'none';
        }
        input.focus();
      });
    }

    // Advanced search button handler
    if (advancedBtn) {
      advancedBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent(EVENTS.SEARCH_ADVANCED_REQUESTED, {
          detail: { 
            query: input.value.trim(),
            source: 'advanced_button',
            context: options 
          }
        }));
      });
    }

    // Enter key handler
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = input.value.trim();
        if (query) {
          this.executeBasicSearch(query, options);
        }
      }
    });

    // Focus handlers for suggestions
    input.addEventListener('focus', () => {
      if (input.value.trim() && suggestions) {
        suggestions.style.display = 'block';
      }
    });

    // Click outside to close suggestions
    document.addEventListener('click', (e) => {
      if (suggestions && !searchBar.contains(e.target)) {
        suggestions.style.display = 'none';
      }
    });
  }

  /**
   * Handle basic search with simple suggestions
   */
  async handleBasicSearch(query, suggestionsContainer, options = {}) {
    try {
      // Check cache first
      const cacheKey = `basic_${query.toLowerCase()}`;
      if (this.searchCache.has(cacheKey)) {
        this.displayBasicSuggestions(this.searchCache.get(cacheKey), suggestionsContainer, query);
        return;
      }

      // Show basic loading
      if (suggestionsContainer) {
        suggestionsContainer.innerHTML = '<div class="search-loading">Searching...</div>';
        suggestionsContainer.parentElement.style.display = 'block';
      }

      // Basic search functionality (simple keyword matching)
      const suggestions = await this.performBasicSearch(query, options);
      
      // Cache results
      this.searchCache.set(cacheKey, suggestions);
      
      // Display suggestions
      this.displayBasicSuggestions(suggestions, suggestionsContainer, query);

    } catch (error) {
      console.error('Basic search failed:', error);
      if (suggestionsContainer) {
        suggestionsContainer.innerHTML = '<div class="search-error">Search temporarily unavailable</div>';
      }
    }
  }

  /**
   * Perform basic search (simplified algorithm)
   */
  async performBasicSearch(query, options = {}) {
    // Simulate basic search with cached/recent articles
    // In a real implementation, this would call a simplified API endpoint
    
    const basicResults = {
      suggestions: this.generateBasicSuggestions(query),
      recentSearches: this.getRecentSearches(query),
      quickActions: this.getQuickActions(query)
    };

    return basicResults;
  }

  /**
   * Generate basic search suggestions
   */
  generateBasicSuggestions(query) {
    const commonTerms = [
      'Adelaide news', 'local events', 'business updates', 'sports results',
      'weather forecast', 'traffic updates', 'council news', 'community events'
    ];

    return commonTerms
      .filter(term => term.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3)
      .map(term => ({
        text: term,
        type: 'suggestion',
        icon: '💡'
      }));
  }

  /**
   * Get recent searches matching query
   */
  getRecentSearches(query) {
    return Array.from(this.recentSearches)
      .filter(search => search.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 2)
      .map(search => ({
        text: search,
        type: 'recent',
        icon: '🕒'
      }));
  }

  /**
   * Get quick actions for query
   */
  getQuickActions(query) {
    const actions = [];
    
    if (query.length >= 3) {
      actions.push({
        text: `Search all articles for "${query}"`,
        type: 'action',
        icon: '🔍',
        action: 'full_search'
      });
    }

    if (query.length >= 2) {
      actions.push({
        text: 'Advanced search options',
        type: 'action',
        icon: '⚙️',
        action: 'advanced_search'
      });
    }

    return actions;
  }

  /**
   * Display basic search suggestions
   */
  displayBasicSuggestions(results, container, query) {
    if (!container) return;

    const { suggestions = [], recentSearches = [], quickActions = [] } = results;
    const allItems = [...suggestions, ...recentSearches, ...quickActions];

    if (allItems.length === 0) {
      container.innerHTML = `
        <div class="no-suggestions">
          <span class="no-suggestions-text">No suggestions found</span>
          <button class="try-advanced-btn" data-query="${UIUtils.escapeHtml(query)}">
            Try Advanced Search
          </button>
        </div>
      `;
    } else {
      const itemsHtml = allItems.map(item => `
        <div class="suggestion-item ${item.type}" data-text="${UIUtils.escapeHtml(item.text)}" data-action="${item.action || ''}">
          <span class="suggestion-icon">${item.icon}</span>
          <span class="suggestion-text">${UIUtils.escapeHtml(item.text)}</span>
          ${item.type === 'recent' ? '<span class="suggestion-remove">×</span>' : ''}
        </div>
      `).join('');

      container.innerHTML = `
        <div class="suggestions-list">
          ${itemsHtml}
        </div>
        <div class="suggestions-footer">
          <button class="advanced-search-link" data-query="${UIUtils.escapeHtml(query)}">
            <span class="advanced-icon">⚙️</span>
            <span class="advanced-text">Advanced Search</span>
          </button>
        </div>
      `;
    }

    // Setup suggestion click handlers
    this.setupSuggestionHandlers(container, query);
    
    // Show suggestions
    container.parentElement.style.display = 'block';
  }

  /**
   * Setup suggestion click handlers
   */
  setupSuggestionHandlers(container, originalQuery) {
    // Suggestion item clicks
    container.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const text = item.dataset.text;
        const action = item.dataset.action;

        if (action === 'full_search') {
          this.executeBasicSearch(originalQuery);
        } else if (action === 'advanced_search') {
          this.triggerAdvancedSearch(originalQuery);
        } else {
          this.executeBasicSearch(text);
        }
      });
    });

    // Remove recent search items
    container.querySelectorAll('.suggestion-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.suggestion-item');
        const text = item.dataset.text;
        this.removeRecentSearch(text);
        item.remove();
      });
    });

    // Advanced search links
    container.querySelectorAll('.advanced-search-link, .try-advanced-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const query = btn.dataset.query || originalQuery;
        this.triggerAdvancedSearch(query);
      });
    });
  }

  /**
   * Execute basic search
   */
  async executeBasicSearch(query, options = {}) {
    if (!query || query.length < 2) return;

    // Add to recent searches
    this.addRecentSearch(query);

    // Hide suggestions
    const suggestions = document.querySelector('.basic-search-suggestions');
    if (suggestions) {
      suggestions.style.display = 'none';
    }

    // Dispatch search event
    document.dispatchEvent(new CustomEvent(EVENTS.SEARCH_PERFORMED, {
      detail: { 
        query, 
        type: 'basic',
        timestamp: Date.now(),
        options 
      }
    }));

    console.log(`🔍 Basic search executed: "${query}"`);
  }

  /**
   * Trigger advanced search loading
   */
  async triggerAdvancedSearch(query = '') {
    document.dispatchEvent(new CustomEvent(EVENTS.SEARCH_ADVANCED_REQUESTED, {
      detail: { 
        query,
        source: 'suggestion_click',
        loadAdvanced: true
      }
    }));
  }

  /**
   * Load advanced search module (lazy loading)
   */
  async loadAdvancedSearch(detail = {}) {
    try {
      console.log('🔄 Loading advanced search module...');
      
      // Dynamic import of advanced search
      const module = await import('./search-advanced.js');
      const AdvancedSearchService = module.AdvancedSearchService;
      
      // Initialize advanced search
      const advancedSearch = new AdvancedSearchService(this);
      
      // Pass control to advanced search
      advancedSearch.handleAdvancedSearchRequest(detail);
      
      console.log('✅ Advanced search module loaded');
      
    } catch (error) {
      console.error('❌ Failed to load advanced search:', error);
      
      // Fallback to basic search
      if (detail.query) {
        this.executeBasicSearch(detail.query);
      }
    }
  }

  /**
   * Recent searches management
   */
  addRecentSearch(query) {
    this.recentSearches.add(query);
    
    // Keep only last 10 searches
    if (this.recentSearches.size > 10) {
      const first = this.recentSearches.values().next().value;
      this.recentSearches.delete(first);
    }
    
    this.saveSearchHistory();
  }

  removeRecentSearch(query) {
    this.recentSearches.delete(query);
    this.saveSearchHistory();
  }

  getRecentSearchesList() {
    return Array.from(this.recentSearches).reverse(); // Most recent first
  }

  /**
   * Search history persistence
   */
  loadSearchHistory() {
    try {
      const stored = localStorage.getItem('zone_search_history');
      if (stored) {
        const data = JSON.parse(stored);
        this.recentSearches = new Set(data.recent || []);
        return data;
      }
    } catch (error) {
      console.warn('Failed to load search history:', error);
    }
    return { recent: [] };
  }

  saveSearchHistory() {
    try {
      const data = {
        recent: Array.from(this.recentSearches),
        lastUpdated: Date.now()
      };
      localStorage.setItem('zone_search_history', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save search history:', error);
    }
  }

  /**
   * Search performance tracking
   */
  trackSearchPerformance(detail) {
    const performance = {
      query: detail.query,
      type: detail.type || 'basic',
      timestamp: detail.timestamp || Date.now(),
      source: detail.source || 'input'
    };

    // Analytics tracking
    if (window.gtag) {
      window.gtag('event', 'search', {
        'event_category': 'engagement',
        'event_label': performance.type,
        'value': 1,
        'custom_map': {
          'search_query': performance.query,
          'search_source': performance.source
        }
      });
    }

    console.log('📊 Search tracked:', performance);
  }

  /**
   * Cache management
   */
  clearSearchCache() {
    this.searchCache.clear();
    console.log('🗑️ Search cache cleared');
  }

  /**
   * Get search statistics
   */
  getSearchStats() {
    return {
      recentSearches: this.recentSearches.size,
      cacheSize: this.searchCache.size,
      totalSearches: Array.from(this.recentSearches).length
    };
  }
}

// Export singleton for immediate use
export const basicSearch = new BasicSearchService();
export default BasicSearchService;