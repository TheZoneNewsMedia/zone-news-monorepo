/**
 * Zone News Mini App - Search Service
 * Advanced search functionality with auto-complete, recent searches, and filters
 */

'use strict';

import { APP_CONFIG, APP_STATE } from './config.js';
import { StorageService } from './storage-service.js';

// ===== SEARCH SERVICE =====
export class SearchService {
  constructor(storageService) {
    this.storage = storageService || new StorageService();
    this.searchIndex = new Map();
    this.recentSearches = this.loadRecentSearches();
    this.searchHistory = this.loadSearchHistory();
    this.debounceTimeout = null;
    this.maxRecentSearches = 10;
    this.maxSuggestions = 8;
    
    // Initialize search analytics
    this.searchAnalytics = {
      totalSearches: 0,
      popularTerms: new Map(),
      averageResultsClicked: 0,
      searchToClickRatio: 0
    };
    
    this.loadSearchAnalytics();
  }

  /**
   * Initialize search index for fast searching
   */
  buildSearchIndex(articles) {
    this.searchIndex.clear();
    
    articles.forEach(article => {
      const searchableText = [
        article.title || '',
        article.excerpt || '',
        article.content || '',
        article.category || '',
        article.source || '',
        article.tags?.join(' ') || ''
      ].join(' ').toLowerCase();
      
      // Create keyword index
      const keywords = this.extractKeywords(searchableText);
      keywords.forEach(keyword => {
        if (!this.searchIndex.has(keyword)) {
          this.searchIndex.set(keyword, new Set());
        }
        this.searchIndex.get(keyword).add(article.id);
      });
      
      // Store full text for ranking
      this.searchIndex.set(`full_${article.id}`, searchableText);
    });
  }

  /**
   * Extract keywords from text for indexing
   */
  extractKeywords(text) {
    // Remove punctuation and split into words
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .map(word => word.toLowerCase());
    
    // Add n-grams for better matching
    const keywords = new Set(words);
    
    // Add bigrams
    for (let i = 0; i < words.length - 1; i++) {
      keywords.add(`${words[i]} ${words[i + 1]}`);
    }
    
    // Add trigrams for important phrases
    for (let i = 0; i < words.length - 2; i++) {
      keywords.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
    
    return Array.from(keywords);
  }

  /**
   * Advanced search with ranking and filtering
   */
  search(query, filters = {}, articles = []) {
    if (!query || query.trim().length < 2) {
      return this.getFilteredArticles(articles, filters);
    }
    
    const startTime = performance.now();
    const normalizedQuery = query.toLowerCase().trim();
    
    // Record search
    this.recordSearch(normalizedQuery);
    
    // Get matching article IDs
    const matchingIds = this.findMatchingArticles(normalizedQuery);
    
    // Filter articles by matching IDs
    let results = articles.filter(article => matchingIds.has(article.id));
    
    // Apply additional filters
    results = this.applyFilters(results, filters);
    
    // Rank results by relevance
    results = this.rankResults(results, normalizedQuery);
    
    const searchTime = performance.now() - startTime;
    
    return {
      results,
      query: normalizedQuery,
      totalResults: results.length,
      searchTime: Math.round(searchTime),
      suggestions: this.generateSuggestions(normalizedQuery),
      filters: this.generateFilterSuggestions(results)
    };
  }

  /**
   * Find articles matching search query
   */
  findMatchingArticles(query) {
    const matchingIds = new Set();
    const queryWords = query.split(/\s+/);
    
    // Exact phrase matching (highest priority)
    if (this.searchIndex.has(query)) {
      this.searchIndex.get(query).forEach(id => matchingIds.add(id));
    }
    
    // Individual word matching
    queryWords.forEach(word => {
      if (this.searchIndex.has(word)) {
        this.searchIndex.get(word).forEach(id => matchingIds.add(id));
      }
    });
    
    // Fuzzy matching for typos
    this.searchIndex.forEach((ids, keyword) => {
      if (this.calculateSimilarity(query, keyword) > 0.7) {
        ids.forEach(id => matchingIds.add(id));
      }
    });
    
    return matchingIds;
  }

  /**
   * Apply advanced filters to search results
   */
  applyFilters(articles, filters) {
    let filtered = [...articles];
    
    // Category filter
    if (filters.category && filters.category !== 'all') {
      filtered = filtered.filter(article => 
        article.category?.toLowerCase() === filters.category.toLowerCase()
      );
    }
    
    // Date range filter
    if (filters.dateRange) {
      const now = new Date();
      const cutoffDate = new Date();
      
      switch (filters.dateRange) {
        case 'today':
          cutoffDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoffDate.setMonth(now.getMonth() - 1);
          break;
      }
      
      filtered = filtered.filter(article => 
        new Date(article.published_date) >= cutoffDate
      );
    }
    
    // Source filter
    if (filters.source) {
      filtered = filtered.filter(article => 
        article.source?.toLowerCase().includes(filters.source.toLowerCase())
      );
    }
    
    // Content length filter
    if (filters.contentLength) {
      filtered = filtered.filter(article => {
        const contentLength = (article.content || article.excerpt || '').length;
        switch (filters.contentLength) {
          case 'short':
            return contentLength < 500;
          case 'medium':
            return contentLength >= 500 && contentLength < 1500;
          case 'long':
            return contentLength >= 1500;
          default:
            return true;
        }
      });
    }
    
    // Reading time filter
    if (filters.readingTime) {
      filtered = filtered.filter(article => {
        const readingTime = this.calculateReadingTime(article);
        switch (filters.readingTime) {
          case 'quick':
            return readingTime <= 2;
          case 'medium':
            return readingTime > 2 && readingTime <= 5;
          case 'long':
            return readingTime > 5;
          default:
            return true;
        }
      });
    }
    
    return filtered;
  }

  /**
   * Rank search results by relevance
   */
  rankResults(articles, query) {
    const queryWords = query.split(/\s+/);
    
    return articles
      .map(article => ({
        ...article,
        relevanceScore: this.calculateRelevanceScore(article, query, queryWords)
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Calculate relevance score for ranking
   */
  calculateRelevanceScore(article, query, queryWords) {
    let score = 0;
    const fullText = this.searchIndex.get(`full_${article.id}`) || '';
    
    // Title matches (highest weight)
    const titleMatches = (article.title || '').toLowerCase().includes(query);
    if (titleMatches) score += 100;
    
    // Exact phrase in title
    if ((article.title || '').toLowerCase().includes(query)) score += 200;
    
    // Word matches in title
    queryWords.forEach(word => {
      if ((article.title || '').toLowerCase().includes(word)) score += 50;
    });
    
    // Excerpt matches
    queryWords.forEach(word => {
      if ((article.excerpt || '').toLowerCase().includes(word)) score += 30;
    });
    
    // Content matches
    queryWords.forEach(word => {
      const matches = (fullText.match(new RegExp(word, 'gi')) || []).length;
      score += matches * 10;
    });
    
    // Category relevance
    if ((article.category || '').toLowerCase().includes(query)) score += 40;
    
    // Freshness boost (newer articles get slight boost)
    const daysSincePublished = (Date.now() - new Date(article.published_date)) / (1000 * 60 * 60 * 24);
    if (daysSincePublished < 1) score += 20;
    else if (daysSincePublished < 7) score += 10;
    
    // Popularity boost
    const views = article.views || 0;
    const reactions = Object.values(article.reactions || {}).reduce((sum, count) => sum + count, 0);
    score += Math.log(views + 1) * 5;
    score += reactions * 15;
    
    return score;
  }

  /**
   * Generate search suggestions
   */
  generateSuggestions(query) {
    const suggestions = [];
    
    // Recent searches that match
    this.recentSearches.forEach(search => {
      if (search.toLowerCase().includes(query.toLowerCase()) && search !== query) {
        suggestions.push({
          type: 'recent',
          text: search,
          icon: '🕒'
        });
      }
    });
    
    // Popular terms
    this.searchAnalytics.popularTerms.forEach((count, term) => {
      if (term.includes(query.toLowerCase()) && term !== query.toLowerCase()) {
        suggestions.push({
          type: 'popular',
          text: term,
          icon: '🔥',
          count
        });
      }
    });
    
    // Auto-complete based on search index
    this.searchIndex.forEach((ids, keyword) => {
      if (keyword.startsWith(query.toLowerCase()) && keyword !== query.toLowerCase()) {
        suggestions.push({
          type: 'autocomplete',
          text: keyword,
          icon: '💡',
          resultCount: ids.size
        });
      }
    });
    
    // Limit and sort suggestions
    return suggestions
      .slice(0, this.maxSuggestions)
      .sort((a, b) => {
        if (a.type === 'recent' && b.type !== 'recent') return -1;
        if (b.type === 'recent' && a.type !== 'recent') return 1;
        return (b.count || b.resultCount || 0) - (a.count || a.resultCount || 0);
      });
  }

  /**
   * Generate filter suggestions based on results
   */
  generateFilterSuggestions(results) {
    const categories = new Map();
    const sources = new Map();
    const dateRanges = new Map();
    
    results.forEach(article => {
      // Count categories
      if (article.category) {
        categories.set(article.category, (categories.get(article.category) || 0) + 1);
      }
      
      // Count sources
      if (article.source) {
        sources.set(article.source, (sources.get(article.source) || 0) + 1);
      }
      
      // Count date ranges
      const daysSince = (Date.now() - new Date(article.published_date)) / (1000 * 60 * 60 * 24);
      let dateRange;
      if (daysSince < 1) dateRange = 'today';
      else if (daysSince < 7) dateRange = 'week';
      else if (daysSince < 30) dateRange = 'month';
      else dateRange = 'older';
      
      dateRanges.set(dateRange, (dateRanges.get(dateRange) || 0) + 1);
    });
    
    return {
      categories: Array.from(categories.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      sources: Array.from(sources.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      dateRanges: Array.from(dateRanges.entries())
        .sort((a, b) => b[1] - a[1])
    };
  }

  /**
   * Get filtered articles without search
   */
  getFilteredArticles(articles, filters) {
    return {
      results: this.applyFilters(articles, filters),
      query: '',
      totalResults: articles.length,
      searchTime: 0,
      suggestions: [],
      filters: this.generateFilterSuggestions(articles)
    };
  }

  /**
   * Record search for analytics
   */
  recordSearch(query) {
    this.searchAnalytics.totalSearches++;
    
    // Update popular terms
    const currentCount = this.searchAnalytics.popularTerms.get(query) || 0;
    this.searchAnalytics.popularTerms.set(query, currentCount + 1);
    
    // Add to recent searches
    this.recentSearches = this.recentSearches.filter(search => search !== query);
    this.recentSearches.unshift(query);
    this.recentSearches = this.recentSearches.slice(0, this.maxRecentSearches);
    
    // Add to search history with timestamp
    this.searchHistory.unshift({
      query,
      timestamp: Date.now(),
      resultsCount: 0 // Will be updated when results are available
    });
    this.searchHistory = this.searchHistory.slice(0, 100); // Keep last 100 searches
    
    // Save to storage
    this.saveSearchData();
  }

  /**
   * Record search result click for analytics
   */
  recordSearchClick(query, articleId) {
    // Update search history with click
    const searchEntry = this.searchHistory.find(entry => 
      entry.query === query && Date.now() - entry.timestamp < 300000 // 5 minutes
    );
    
    if (searchEntry) {
      searchEntry.clickedArticles = searchEntry.clickedArticles || [];
      searchEntry.clickedArticles.push({
        articleId,
        timestamp: Date.now()
      });
      
      this.saveSearchData();
    }
  }

  /**
   * Get search suggestions for auto-complete
   */
  getSearchSuggestions(query) {
    if (!query || query.length < 2) {
      return this.recentSearches.slice(0, 5).map(search => ({
        type: 'recent',
        text: search,
        icon: '🕒'
      }));
    }
    
    return this.generateSuggestions(query);
  }

  /**
   * Get popular search terms
   */
  getPopularSearches(limit = 10) {
    return Array.from(this.searchAnalytics.popularTerms.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term, count]) => ({ term, count }));
  }

  /**
   * Get search analytics
   */
  getSearchAnalytics() {
    return {
      ...this.searchAnalytics,
      recentSearches: this.recentSearches.length,
      searchHistory: this.searchHistory.length,
      averageSearchLength: this.calculateAverageSearchLength(),
      mostActiveSearchTime: this.getMostActiveSearchTime()
    };
  }

  /**
   * Clear search history
   */
  clearSearchHistory() {
    this.recentSearches = [];
    this.searchHistory = [];
    this.saveSearchData();
  }

  /**
   * Calculate string similarity for fuzzy matching
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.calculateEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate edit distance for fuzzy matching
   */
  calculateEditDistance(str1, str2) {
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
   * Calculate estimated reading time
   */
  calculateReadingTime(article) {
    const text = (article.content || article.excerpt || '');
    const wordsPerMinute = 200; // Average reading speed
    const words = text.split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
  }

  /**
   * Calculate average search length
   */
  calculateAverageSearchLength() {
    if (this.searchHistory.length === 0) return 0;
    
    const totalLength = this.searchHistory.reduce((sum, entry) => sum + entry.query.length, 0);
    return Math.round(totalLength / this.searchHistory.length);
  }

  /**
   * Get most active search time
   */
  getMostActiveSearchTime() {
    const hourCounts = new Array(24).fill(0);
    
    this.searchHistory.forEach(entry => {
      const hour = new Date(entry.timestamp).getHours();
      hourCounts[hour]++;
    });
    
    const maxCount = Math.max(...hourCounts);
    const mostActiveHour = hourCounts.indexOf(maxCount);
    
    return {
      hour: mostActiveHour,
      count: maxCount,
      percentage: Math.round((maxCount / this.searchHistory.length) * 100) || 0
    };
  }

  /**
   * Load search data from storage
   */
  loadRecentSearches() {
    return this.storage.getItem('recent_searches', false, []);
  }

  loadSearchHistory() {
    return this.storage.getItem('search_history', false, []);
  }

  loadSearchAnalytics() {
    const stored = this.storage.getItem('search_analytics', false, {});
    Object.assign(this.searchAnalytics, stored);
    
    // Convert Map data
    if (stored.popularTerms) {
      this.searchAnalytics.popularTerms = new Map(stored.popularTerms);
    }
  }

  /**
   * Save search data to storage
   */
  saveSearchData() {
    this.storage.setItem('recent_searches', this.recentSearches);
    this.storage.setItem('search_history', this.searchHistory);
    
    // Convert Map for storage
    const analyticsForStorage = {
      ...this.searchAnalytics,
      popularTerms: Array.from(this.searchAnalytics.popularTerms.entries())
    };
    
    this.storage.setItem('search_analytics', analyticsForStorage);
  }

  /**
   * Debounced search for real-time results
   */
  debouncedSearch(query, filters, articles, callback, delay = 300) {
    clearTimeout(this.debounceTimeout);
    
    this.debounceTimeout = setTimeout(() => {
      const results = this.search(query, filters, articles);
      callback(results);
    }, delay);
  }

  /**
   * Export search data for backup
   */
  exportSearchData() {
    return {
      recentSearches: this.recentSearches,
      searchHistory: this.searchHistory,
      analytics: {
        ...this.searchAnalytics,
        popularTerms: Array.from(this.searchAnalytics.popularTerms.entries())
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Import search data from backup
   */
  importSearchData(data) {
    if (data.recentSearches) {
      this.recentSearches = data.recentSearches;
    }
    
    if (data.searchHistory) {
      this.searchHistory = data.searchHistory;
    }
    
    if (data.analytics) {
      Object.assign(this.searchAnalytics, data.analytics);
      if (data.analytics.popularTerms) {
        this.searchAnalytics.popularTerms = new Map(data.analytics.popularTerms);
      }
    }
    
    this.saveSearchData();
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      indexSize: this.searchIndex.size,
      recentSearches: this.recentSearches.length,
      searchHistory: this.searchHistory.length,
      totalSearches: this.searchAnalytics.totalSearches,
      popularTerms: this.searchAnalytics.popularTerms.size,
      isHealthy: this.searchIndex.size > 0
    };
  }
}