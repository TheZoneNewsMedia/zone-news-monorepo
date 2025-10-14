/**
 * Zone News Mini App - Advanced Search Module
 * Comprehensive search functionality with filters, sorting, and premium features
 * Lazy-loaded only when advanced search is requested
 */

'use strict';

import { APP_CONFIG, EVENTS } from './config.js';
import { UIUtils } from './ui-core.js';
import PremiumFeaturesManager from './premium-manager.js';

// ===== ADVANCED SEARCH SERVICE =====
export class AdvancedSearchService {
  constructor(basicSearchService, coreUI) {
    this.basicSearch = basicSearchService;
    this.core = coreUI;
    this.premiumManager = new PremiumFeaturesManager(coreUI);
    this.searchIndex = new Map();
    this.searchFilters = new Map();
    this.searchResults = [];
    this.currentQuery = '';
    this.isActive = false;
    
    this.initializeAdvancedFeatures();
    console.log('🔍✨ Advanced Search Service loaded');
  }

  /**
   * Initialize advanced search features
   */
  initializeAdvancedFeatures() {
    // Setup advanced search algorithms
    this.setupSearchAlgorithms();
    
    // Initialize search filters
    this.initializeFilters();
    
    // Setup search indexing for better performance
    this.buildSearchIndex();
  }

  /**
   * Handle advanced search request from basic search
   */
  async handleAdvancedSearchRequest(detail = {}) {
    const { query = '', source = 'unknown', loadAdvanced = false } = detail;
    
    // Check premium access for advanced search
    const searchAccess = this.premiumManager.canAccessFeature('advancedSearch');
    
    if (!searchAccess.allowed) {
      this.showAdvancedSearchUpgrade(query, searchAccess);
      return;
    }

    // Track advanced search usage
    this.premiumManager.trackFeatureUsage('advancedSearch', {
      query,
      source,
      timestamp: Date.now()
    });

    // Show advanced search interface
    this.showAdvancedSearchModal(query);
  }

  /**
   * Show advanced search modal interface
   */
  showAdvancedSearchModal(initialQuery = '') {
    const content = `
      <div class="advanced-search-container">
        <div class="advanced-search-header">
          <h3>Advanced Search</h3>
          <p>Find exactly what you're looking for with powerful filters and options</p>
        </div>
        
        <div class="advanced-search-form">
          <!-- Main Search Input -->
          <div class="search-field-group">
            <label for="advanced-query">Search Terms</label>
            <div class="advanced-search-input-container">
              <input 
                type="text" 
                id="advanced-query" 
                class="advanced-search-input"
                placeholder="Enter keywords, phrases, or exact matches..."
                value="${UIUtils.escapeHtml(initialQuery)}"
              >
              <div class="search-operators">
                <button type="button" class="operator-btn" data-operator='AND' title="All words must appear">AND</button>
                <button type="button" class="operator-btn" data-operator='OR' title="Any word can appear">OR</button>
                <button type="button" class="operator-btn" data-operator='"' title="Exact phrase">"phrase"</button>
              </div>
            </div>
          </div>

          <!-- Category Filter -->
          <div class="search-field-group">
            <label for="search-category">Category</label>
            <select id="search-category" class="advanced-select">
              <option value="">All Categories</option>
              <option value="local">Local News</option>
              <option value="business">Business</option>
              <option value="sports">Sports</option>
              <option value="health">Health</option>
              <option value="technology">Technology</option>
              <option value="entertainment">Entertainment</option>
            </select>
          </div>

          <!-- Date Range Filter -->
          <div class="search-field-group">
            <label>Date Range</label>
            <div class="date-range-container">
              <select id="date-preset" class="advanced-select date-preset">
                <option value="">Custom Range</option>
                <option value="today">Today</option>
                <option value="week">Past Week</option>
                <option value="month">Past Month</option>
                <option value="quarter">Past 3 Months</option>
              </select>
              <div class="custom-date-range">
                <input type="date" id="date-from" class="date-input" placeholder="From">
                <span class="date-separator">to</span>
                <input type="date" id="date-to" class="date-input" placeholder="To">
              </div>
            </div>
          </div>

          <!-- Source Filter -->
          <div class="search-field-group">
            <label for="search-source">Source</label>
            <select id="search-source" class="advanced-select">
              <option value="">All Sources</option>
              <option value="adelaide_now">Adelaide Now</option>
              <option value="abc_adelaide">ABC Adelaide</option>
              <option value="advertiser">The Advertiser</option>
              <option value="city_council">Adelaide City Council</option>
              <option value="community">Community Posts</option>
            </select>
          </div>

          <!-- Sort Options -->
          <div class="search-field-group">
            <label for="search-sort">Sort By</label>
            <select id="search-sort" class="advanced-select">
              <option value="relevance">Relevance</option>
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="popularity">Most Popular</option>
              <option value="comments">Most Discussed</option>
            </select>
          </div>

          <!-- Advanced Options -->
          <div class="search-field-group">
            <label>Advanced Options</label>
            <div class="advanced-options">
              <label class="checkbox-label">
                <input type="checkbox" id="include-archived" class="advanced-checkbox">
                <span class="checkmark"></span>
                <span class="checkbox-text">Include archived articles</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" id="exact-match" class="advanced-checkbox">
                <span class="checkmark"></span>
                <span class="checkbox-text">Exact phrase matching</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" id="case-sensitive" class="advanced-checkbox">
                <span class="checkmark"></span>
                <span class="checkbox-text">Case sensitive</span>
              </label>
            </div>
          </div>

          <!-- Search Stats -->
          <div class="search-stats">
            <div class="search-stat">
              <span class="stat-label">Available:</span>
              <span class="stat-value" id="total-articles">Loading...</span>
            </div>
            <div class="search-stat">
              <span class="stat-label">Usage:</span>
              <span class="stat-value" id="search-usage">${this.getSearchUsageText()}</span>
            </div>
          </div>
        </div>

        <!-- Search Results Preview -->
        <div class="search-results-preview" style="display: none;">
          <div class="results-header">
            <h4>Search Results</h4>
            <span class="results-count">0 results found</span>
          </div>
          <div class="results-list"></div>
          <div class="results-pagination" style="display: none;">
            <button class="pagination-btn prev-btn" disabled>Previous</button>
            <span class="pagination-info">Page 1 of 1</span>
            <button class="pagination-btn next-btn" disabled>Next</button>
          </div>
        </div>
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Cancel</button>
      <button class="btn btn-outline search-preview-btn">Preview Results</button>
      <button class="btn btn-primary search-execute-btn">Search</button>
    `;

    const modal = this.core.showModal(content, {
      title: '🔍 Advanced Search',
      actions: actions,
      className: 'advanced-search-modal'
    });

    // Setup advanced search handlers
    this.setupAdvancedSearchHandlers(modal);
    this.loadTotalArticlesCount();
    
    return modal;
  }

  /**
   * Setup advanced search modal handlers
   */
  setupAdvancedSearchHandlers(modal) {
    const queryInput = modal.querySelector('#advanced-query');
    const categorySelect = modal.querySelector('#search-category');
    const datePreset = modal.querySelector('#date-preset');
    const dateFrom = modal.querySelector('#date-from');
    const dateTo = modal.querySelector('#date-to');
    const sourceSelect = modal.querySelector('#search-source');
    const sortSelect = modal.querySelector('#search-sort');
    const previewBtn = modal.querySelector('.search-preview-btn');
    const executeBtn = modal.querySelector('.search-execute-btn');
    const resultsPreview = modal.querySelector('.search-results-preview');

    // Operator button handlers
    modal.querySelectorAll('.operator-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const operator = btn.dataset.operator;
        const input = modal.querySelector('#advanced-query');
        const cursorPos = input.selectionStart;
        const currentValue = input.value;
        
        let insertText = '';
        switch (operator) {
          case 'AND':
            insertText = ' AND ';
            break;
          case 'OR':
            insertText = ' OR ';
            break;
          case '"':
            insertText = '""';
            break;
        }
        
        const newValue = currentValue.slice(0, cursorPos) + insertText + currentValue.slice(cursorPos);
        input.value = newValue;
        
        // Position cursor appropriately
        const newCursorPos = operator === '"' ? cursorPos + 1 : cursorPos + insertText.length;
        input.focus();
        input.setSelectionRange(newCursorPos, newCursorPos);
      });
    });

    // Date preset handler
    datePreset.addEventListener('change', () => {
      const preset = datePreset.value;
      const today = new Date();
      let fromDate = null;
      
      switch (preset) {
        case 'today':
          fromDate = new Date(today);
          break;
        case 'week':
          fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          fromDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          fromDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
      }
      
      if (fromDate) {
        dateFrom.value = fromDate.toISOString().split('T')[0];
        dateTo.value = today.toISOString().split('T')[0];
      } else {
        dateFrom.value = '';
        dateTo.value = '';
      }
    });

    // Preview button handler
    previewBtn.addEventListener('click', async () => {
      const searchParams = this.gatherSearchParameters(modal);
      await this.previewSearchResults(searchParams, resultsPreview);
    });

    // Execute button handler
    executeBtn.addEventListener('click', async () => {
      const searchParams = this.gatherSearchParameters(modal);
      await this.executeAdvancedSearch(searchParams);
      this.core.hideModal(modal);
    });

    // Real-time validation
    queryInput.addEventListener('input', () => {
      const hasQuery = queryInput.value.trim().length >= 2;
      previewBtn.disabled = !hasQuery;
      executeBtn.disabled = !hasQuery;
    });

    // Initialize button states
    const hasInitialQuery = queryInput.value.trim().length >= 2;
    previewBtn.disabled = !hasInitialQuery;
    executeBtn.disabled = !hasInitialQuery;
  }

  /**
   * Gather search parameters from modal
   */
  gatherSearchParameters(modal) {
    return {
      query: modal.querySelector('#advanced-query').value.trim(),
      category: modal.querySelector('#search-category').value,
      dateFrom: modal.querySelector('#date-from').value,
      dateTo: modal.querySelector('#date-to').value,
      source: modal.querySelector('#search-source').value,
      sortBy: modal.querySelector('#search-sort').value,
      includeArchived: modal.querySelector('#include-archived').checked,
      exactMatch: modal.querySelector('#exact-match').checked,
      caseSensitive: modal.querySelector('#case-sensitive').checked,
      timestamp: Date.now()
    };
  }

  /**
   * Preview search results in modal
   */
  async previewSearchResults(searchParams, previewContainer) {
    try {
      previewContainer.style.display = 'block';
      const resultsList = previewContainer.querySelector('.results-list');
      const resultsCount = previewContainer.querySelector('.results-count');
      
      // Show loading
      resultsList.innerHTML = '<div class="search-loading">Searching...</div>';
      resultsCount.textContent = 'Searching...';
      
      // Perform search
      const results = await this.performAdvancedSearch(searchParams, { limit: 5, preview: true });
      
      // Display results
      if (results.articles.length === 0) {
        resultsList.innerHTML = `
          <div class="no-results">
            <span class="no-results-icon">🔍</span>
            <span class="no-results-text">No articles found matching your criteria</span>
            <div class="search-suggestions">
              <p>Try:</p>
              <ul>
                <li>Using fewer filters</li>
                <li>Checking your spelling</li>
                <li>Using more general terms</li>
              </ul>
            </div>
          </div>
        `;
        resultsCount.textContent = '0 results found';
      } else {
        const resultsHtml = results.articles.map(article => `
          <div class="preview-result-item">
            <div class="result-header">
              <span class="result-category">${UIUtils.escapeHtml(article.category)}</span>
              <time class="result-date">${UIUtils.getTimeAgo(new Date(article.published_date))}</time>
            </div>
            <h5 class="result-title">${this.highlightSearchTerms(article.title, searchParams.query)}</h5>
            <p class="result-excerpt">${this.highlightSearchTerms(article.excerpt || '', searchParams.query)}</p>
            <div class="result-meta">
              <span class="result-source">${UIUtils.escapeHtml(article.source || 'Zone News')}</span>
              <span class="result-relevance">Relevance: ${Math.round(article.relevanceScore || 85)}%</span>
            </div>
          </div>
        `).join('');
        
        resultsList.innerHTML = resultsHtml;
        resultsCount.textContent = `${results.total} result${results.total === 1 ? '' : 's'} found`;
      }

    } catch (error) {
      console.error('Search preview failed:', error);
      previewContainer.querySelector('.results-list').innerHTML = 
        '<div class="search-error">Preview failed. Please try again.</div>';
    }
  }

  /**
   * Execute advanced search and show full results
   */
  async executeAdvancedSearch(searchParams) {
    try {
      // Perform full search
      const results = await this.performAdvancedSearch(searchParams);
      
      // Dispatch search results event
      document.dispatchEvent(new CustomEvent(EVENTS.SEARCH_PERFORMED, {
        detail: {
          query: searchParams.query,
          type: 'advanced',
          parameters: searchParams,
          results: results,
          timestamp: Date.now()
        }
      }));

      // Show results in main interface
      this.displayAdvancedSearchResults(results, searchParams);
      
      console.log(`🔍✨ Advanced search executed: "${searchParams.query}" (${results.total} results)`);

    } catch (error) {
      console.error('Advanced search execution failed:', error);
      this.core.showToast('Search failed. Please try again.', 'error');
    }
  }

  /**
   * Perform advanced search with sophisticated algorithms
   */
  async performAdvancedSearch(searchParams, options = {}) {
    const { limit = 20, offset = 0, preview = false } = options;
    
    // Simulate advanced search algorithm
    // In a real implementation, this would call the API with advanced parameters
    
    const mockResults = await this.simulateAdvancedSearch(searchParams, { limit, offset, preview });
    
    return {
      articles: mockResults.articles,
      total: mockResults.total,
      searchTime: mockResults.searchTime,
      facets: mockResults.facets,
      suggestions: mockResults.suggestions
    };
  }

  /**
   * Simulate advanced search (replace with real API call)
   */
  async simulateAdvancedSearch(params, options) {
    // Simulate search delay
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
    
    const mockArticles = [
      {
        id: 1,
        title: 'Adelaide CBD Development Plans Unveiled',
        excerpt: 'The Adelaide City Council has announced major development plans for the CBD area...',
        category: 'local',
        source: 'Adelaide Now',
        published_date: '2024-01-15T10:30:00Z',
        relevanceScore: 95
      },
      {
        id: 2,
        title: 'Business Growth in Adelaide Reaches New Heights',
        excerpt: 'Local businesses in Adelaide are experiencing unprecedented growth this quarter...',
        category: 'business',
        source: 'The Advertiser',
        published_date: '2024-01-14T14:20:00Z',
        relevanceScore: 88
      }
    ];

    // Apply filters based on search parameters
    let filteredArticles = mockArticles;
    
    if (params.category) {
      filteredArticles = filteredArticles.filter(a => a.category === params.category);
    }
    
    if (params.source) {
      filteredArticles = filteredArticles.filter(a => 
        a.source.toLowerCase().includes(params.source.toLowerCase())
      );
    }

    // Apply date filters
    if (params.dateFrom || params.dateTo) {
      filteredArticles = filteredArticles.filter(article => {
        const articleDate = new Date(article.published_date);
        const fromDate = params.dateFrom ? new Date(params.dateFrom) : new Date('2000-01-01');
        const toDate = params.dateTo ? new Date(params.dateTo) : new Date();
        
        return articleDate >= fromDate && articleDate <= toDate;
      });
    }

    // Sort results
    switch (params.sortBy) {
      case 'date_desc':
        filteredArticles.sort((a, b) => new Date(b.published_date) - new Date(a.published_date));
        break;
      case 'date_asc':
        filteredArticles.sort((a, b) => new Date(a.published_date) - new Date(b.published_date));
        break;
      case 'relevance':
      default:
        filteredArticles.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        break;
    }

    // Apply pagination
    const startIndex = options.offset || 0;
    const endIndex = startIndex + (options.limit || 20);
    const paginatedArticles = filteredArticles.slice(startIndex, endIndex);

    return {
      articles: paginatedArticles,
      total: filteredArticles.length,
      searchTime: Math.round(50 + Math.random() * 100), // ms
      facets: {
        categories: { local: 12, business: 8, sports: 5 },
        sources: { 'Adelaide Now': 15, 'The Advertiser': 10 }
      },
      suggestions: params.query.length > 0 ? [`${params.query} news`, `${params.query} updates`] : []
    };
  }

  /**
   * Display advanced search results in main interface
   */
  displayAdvancedSearchResults(results, searchParams) {
    // Create or update results container
    let resultsContainer = document.querySelector('.advanced-search-results');
    
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.className = 'advanced-search-results';
      
      // Insert after main content
      const mainContent = document.querySelector('.news-container') || document.body;
      mainContent.parentNode.insertBefore(resultsContainer, mainContent.nextSibling);
    }

    // Generate results HTML
    const resultsHtml = `
      <div class="search-results-header">
        <h3>Search Results</h3>
        <div class="search-summary">
          <span class="results-count">${results.total} result${results.total === 1 ? '' : 's'}</span>
          <span class="search-time">in ${results.searchTime}ms</span>
          <span class="search-query">for "${UIUtils.escapeHtml(searchParams.query)}"</span>
        </div>
        <button class="close-results-btn" aria-label="Close search results">×</button>
      </div>
      
      <div class="search-results-content">
        ${results.articles.length === 0 ? `
          <div class="no-results-full">
            <span class="no-results-icon">🔍</span>
            <h4>No results found</h4>
            <p>Try adjusting your search criteria or using different keywords.</p>
            <button class="new-search-btn">New Search</button>
          </div>
        ` : `
          <div class="results-grid">
            ${results.articles.map(article => `
              <article class="search-result-card" data-article-id="${article.id}">
                <div class="result-card-header">
                  <span class="result-category">${UIUtils.escapeHtml(article.category)}</span>
                  <span class="result-relevance">${Math.round(article.relevanceScore || 0)}% match</span>
                </div>
                <h4 class="result-card-title">${this.highlightSearchTerms(article.title, searchParams.query)}</h4>
                <p class="result-card-excerpt">${this.highlightSearchTerms(article.excerpt || '', searchParams.query)}</p>
                <div class="result-card-footer">
                  <span class="result-source">${UIUtils.escapeHtml(article.source || 'Zone News')}</span>
                  <time class="result-date">${UIUtils.getTimeAgo(new Date(article.published_date))}</time>
                </div>
              </article>
            `).join('')}
          </div>
        `}
      </div>
    `;

    resultsContainer.innerHTML = resultsHtml;

    // Setup result handlers
    this.setupResultsHandlers(resultsContainer, searchParams);

    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Setup search results event handlers
   */
  setupResultsHandlers(container, searchParams) {
    // Close results button
    const closeBtn = container.querySelector('.close-results-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        container.remove();
      });
    }

    // New search button
    const newSearchBtn = container.querySelector('.new-search-btn');
    if (newSearchBtn) {
      newSearchBtn.addEventListener('click', () => {
        this.showAdvancedSearchModal();
      });
    }

    // Result card clicks
    container.querySelectorAll('.search-result-card').forEach(card => {
      card.addEventListener('click', () => {
        const articleId = card.dataset.articleId;
        document.dispatchEvent(new CustomEvent(EVENTS.ARTICLE_SELECTED, {
          detail: { articleId, source: 'advanced_search' }
        }));
      });
    });
  }

  /**
   * Highlight search terms in text
   */
  highlightSearchTerms(text, searchQuery) {
    if (!text || !searchQuery) return UIUtils.escapeHtml(text);
    
    const escapedText = UIUtils.escapeHtml(text);
    
    // Handle different search operators
    let terms = [];
    
    if (searchQuery.includes('"')) {
      // Extract exact phrases
      const phrases = searchQuery.match(/"([^"]*)"/g);
      if (phrases) {
        terms = phrases.map(phrase => phrase.replace(/"/g, ''));
      }
    } else if (searchQuery.includes(' OR ')) {
      terms = searchQuery.split(' OR ').map(term => term.trim());
    } else if (searchQuery.includes(' AND ')) {
      terms = searchQuery.split(' AND ').map(term => term.trim());
    } else {
      terms = searchQuery.split(' ').filter(term => term.length > 1);
    }

    // Highlight each term
    let highlightedText = escapedText;
    terms.forEach(term => {
      if (term.length > 1) {
        const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
      }
    });

    return highlightedText;
  }

  /**
   * Show upgrade prompt for advanced search
   */
  showAdvancedSearchUpgrade(query, access) {
    const content = `
      <div class="upgrade-prompt advanced-search-upgrade">
        <div class="upgrade-icon">🔍✨</div>
        <h3>Unlock Advanced Search</h3>
        <p class="upgrade-message">${this.premiumManager.getRestrictionMessage('advancedSearch', access)}</p>
        
        <div class="advanced-search-features">
          <h4>Advanced Search Includes:</h4>
          <div class="features-grid">
            <div class="feature-item">
              <span class="feature-icon">🎯</span>
              <span class="feature-text">Precise filtering by category, date, and source</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">⚡</span>
              <span class="feature-text">Lightning-fast search with relevance scoring</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📊</span>
              <span class="feature-text">Search analytics and saved searches</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🔄</span>
              <span class="feature-text">Search alerts for new matching articles</span>
            </div>
          </div>
        </div>
        
        ${query ? `
          <div class="fallback-search">
            <p>In the meantime, try a basic search:</p>
            <button class="btn btn-outline basic-search-fallback" data-query="${UIUtils.escapeHtml(query)}">
              Search "${UIUtils.escapeHtml(query)}" (Basic)
            </button>
          </div>
        ` : ''}
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Maybe Later</button>
      <button class="btn btn-primary upgrade-now-btn">Upgrade Now 💎</button>
    `;

    const modal = this.core.showModal(content, {
      title: '🔍 Advanced Search - Premium Feature',
      actions: actions,
      className: 'advanced-search-upgrade-modal'
    });

    // Setup upgrade handlers
    const upgradeBtn = modal.querySelector('.upgrade-now-btn');
    const fallbackBtn = modal.querySelector('.basic-search-fallback');

    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent(EVENTS.PREMIUM_UPGRADE_REQUESTED, {
          detail: { feature: 'advancedSearch', context: { query } }
        }));
        this.core.hideModal(modal);
      });
    }

    if (fallbackBtn) {
      fallbackBtn.addEventListener('click', () => {
        const fallbackQuery = fallbackBtn.dataset.query;
        this.basicSearch.executeBasicSearch(fallbackQuery);
        this.core.hideModal(modal);
      });
    }
  }

  /**
   * Setup search algorithms for better results
   */
  setupSearchAlgorithms() {
    this.algorithms = {
      fuzzyMatch: (query, text) => {
        // Simple fuzzy matching algorithm
        const queryLower = query.toLowerCase();
        const textLower = text.toLowerCase();
        
        if (textLower.includes(queryLower)) return 1.0;
        
        // Calculate Levenshtein distance for fuzzy matching
        const distance = this.calculateLevenshteinDistance(queryLower, textLower);
        return Math.max(0, 1 - (distance / Math.max(queryLower.length, textLower.length)));
      },
      
      relevanceScore: (query, article) => {
        // Calculate relevance score based on multiple factors
        let score = 0;
        
        // Title match (highest weight)
        score += this.algorithms.fuzzyMatch(query, article.title) * 0.5;
        
        // Excerpt match
        score += this.algorithms.fuzzyMatch(query, article.excerpt || '') * 0.3;
        
        // Category relevance
        if (article.category && query.toLowerCase().includes(article.category.toLowerCase())) {
          score += 0.1;
        }
        
        // Recency bonus (newer articles get slight boost)
        const articleDate = new Date(article.published_date);
        const daysSincePublished = (Date.now() - articleDate.getTime()) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 0.1 - (daysSincePublished / 365) * 0.1);
        
        return Math.min(1, score);
      }
    };
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  calculateLevenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Initialize search filters
   */
  initializeFilters() {
    this.searchFilters.set('category', {
      type: 'select',
      options: Object.keys(APP_CONFIG.CATEGORIES),
      default: ''
    });
    
    this.searchFilters.set('dateRange', {
      type: 'date_range',
      default: { from: null, to: null }
    });
    
    this.searchFilters.set('source', {
      type: 'select',
      options: ['adelaide_now', 'abc_adelaide', 'advertiser', 'city_council'],
      default: ''
    });
  }

  /**
   * Build search index for performance
   */
  async buildSearchIndex() {
    // In a real implementation, this would build an inverted index
    // For now, we'll just initialize the structure
    this.searchIndex.clear();
    console.log('🗂️ Search index initialized');
  }

  /**
   * Get search usage text for display
   */
  getSearchUsageText() {
    const access = this.premiumManager.canAccessFeature('advancedSearch');
    
    if (!access.allowed) {
      return `${access.used || 0}/${access.limit || 0} searches used today`;
    }
    
    if (access.remaining !== undefined) {
      return `${access.remaining} searches remaining today`;
    }
    
    return 'Unlimited searches';
  }

  /**
   * Load total articles count for display
   */
  async loadTotalArticlesCount() {
    // Simulate API call to get total articles count
    setTimeout(() => {
      const totalElement = document.querySelector('#total-articles');
      if (totalElement) {
        totalElement.textContent = '2,847 articles';
      }
    }, 500);
  }

  /**
   * Cleanup when advanced search is closed
   */
  cleanup() {
    this.isActive = false;
    this.searchResults = [];
    this.currentQuery = '';
    
    // Remove results container if exists
    const resultsContainer = document.querySelector('.advanced-search-results');
    if (resultsContainer) {
      resultsContainer.remove();
    }
  }
}

export default AdvancedSearchService;