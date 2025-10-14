/**
 * Zone News Mini App - API Service
 * Handles all API communications with the backend
 */

'use strict';

import { APP_CONFIG, ERROR_TYPES } from './config.js';

// ===== API SERVICE =====
export class ApiService {
  constructor() {
    this.baseURL = APP_CONFIG.API_BASE_URL;
    this.cache = new Map();
    this.abortControllers = new Map();
  }

  /**
   * Generic fetch wrapper with error handling and timeout
   */
  async fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const requestId = `${options.method || 'GET'}_${url}_${Date.now()}`;
    
    // Store controller for potential cancellation
    this.abortControllers.set(requestId, controller);
    
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      this.abortControllers.delete(requestId);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      this.abortControllers.delete(requestId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout or cancelled');
      }
      throw error;
    }
  }

  /**
   * Get news articles with caching
   */
  async getNews(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${this.baseURL}/api/news${queryString ? `?${queryString}` : ''}`;
    const cacheKey = `news_${queryString}`;
    
    // Check cache first (5 minute TTL)
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.data;
    }
    
    try {
      const response = await this.fetchWithTimeout(url);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch news');
      }
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (error) {
      console.error('Failed to fetch news:', error);
      throw new Error(`Network error: ${error.message}`);
    }
  }

  /**
   * Get trending articles
   */
  async getTrending() {
    const url = `${this.baseURL}/api/trending`;
    const cacheKey = 'trending';
    
    // Check cache (10 minute TTL for trending)
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return cached.data;
    }
    
    try {
      const response = await this.fetchWithTimeout(url);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch trending articles');
      }
      
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (error) {
      console.error('Failed to fetch trending:', error);
      throw new Error(`Network error: ${error.message}`);
    }
  }

  /**
   * Get breaking news
   */
  async getBreaking() {
    const url = `${this.baseURL}/api/breaking`;
    const cacheKey = 'breaking';
    
    // Check cache (2 minute TTL for breaking news)
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 2 * 60 * 1000) {
      return cached.data;
    }
    
    try {
      const response = await this.fetchWithTimeout(url);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch breaking news');
      }
      
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (error) {
      console.error('Failed to fetch breaking news:', error);
      throw new Error(`Network error: ${error.message}`);
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    const url = `${this.baseURL}/api/stats`;
    const cacheKey = 'stats';
    
    // Check cache (15 minute TTL for stats)
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return cached.data;
    }
    
    try {
      const response = await this.fetchWithTimeout(url);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch statistics');
      }
      
      this.cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      throw new Error(`Network error: ${error.message}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    const url = `${this.baseURL}/health`;
    
    try {
      const response = await this.fetchWithTimeout(url, {}, 5000);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  /**
   * Record article interaction (view, reaction, etc.)
   */
  async recordInteraction(articleId, type, data = {}) {
    const url = `${this.baseURL}/api/interactions`;
    
    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        body: JSON.stringify({
          articleId,
          type,
          data,
          timestamp: new Date().toISOString()
        })
      });
      
      return await response.json();
    } catch (error) {
      // Don't throw for analytics failures
      console.warn('Failed to record interaction:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search articles (future feature)
   */
  async searchArticles(query, filters = {}) {
    const params = {
      search: query,
      ...filters
    };
    
    return this.getNews(params);
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests() {
    this.abortControllers.forEach(controller => {
      controller.abort();
    });
    this.abortControllers.clear();
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache status
   */
  getCacheStatus() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      pendingRequests: this.abortControllers.size
    };
  }

  /**
   * Prefetch commonly used data
   */
  async prefetchData() {
    try {
      // Prefetch news and trending in parallel
      await Promise.allSettled([
        this.getNews(),
        this.getTrending(),
        this.getBreaking()
      ]);
    } catch (error) {
      console.warn('Prefetch failed:', error);
    }
  }

  /**
   * Retry failed request with exponential backoff
   */
  async retryRequest(requestFn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}