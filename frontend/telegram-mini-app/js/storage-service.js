/**
 * Zone News Mini App - Storage Service
 * Handles local storage with encryption and error handling
 */

'use strict';

import { APP_CONFIG, ERROR_TYPES } from './config.js';

// ===== STORAGE SERVICE =====
export class StorageService {
  constructor() {
    this.isAvailable = this.checkStorageAvailability();
    this.prefix = 'zone_news_';
  }

  /**
   * Check if localStorage is available
   */
  checkStorageAvailability() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, 'test');
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      console.warn('localStorage not available:', error);
      return false;
    }
  }

  /**
   * Simple encryption for sensitive data
   */
  encrypt(data) {
    try {
      // Simple XOR encryption (for basic obfuscation)
      const key = 'ZoneNews2025';
      const jsonStr = JSON.stringify(data);
      let encrypted = '';
      
      for (let i = 0; i < jsonStr.length; i++) {
        encrypted += String.fromCharCode(
          jsonStr.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
      }
      
      return btoa(encrypted);
    } catch (error) {
      console.warn('Encryption failed:', error);
      return JSON.stringify(data);
    }
  }

  /**
   * Simple decryption
   */
  decrypt(encryptedData) {
    try {
      const key = 'ZoneNews2025';
      const encrypted = atob(encryptedData);
      let decrypted = '';
      
      for (let i = 0; i < encrypted.length; i++) {
        decrypted += String.fromCharCode(
          encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
      }
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.warn('Decryption failed:', error);
      return JSON.parse(encryptedData);
    }
  }

  /**
   * Set item in localStorage with optional encryption
   */
  setItem(key, value, encrypt = false) {
    if (!this.isAvailable) {
      console.warn('Storage not available');
      return false;
    }

    try {
      const fullKey = this.prefix + key;
      const dataToStore = encrypt ? this.encrypt(value) : JSON.stringify(value);
      
      localStorage.setItem(fullKey, dataToStore);
      return true;
    } catch (error) {
      console.error('Failed to set storage item:', key, error);
      return false;
    }
  }

  /**
   * Get item from localStorage with optional decryption
   */
  getItem(key, encrypted = false, defaultValue = null) {
    if (!this.isAvailable) {
      return defaultValue;
    }

    try {
      const fullKey = this.prefix + key;
      const storedData = localStorage.getItem(fullKey);
      
      if (storedData === null) {
        return defaultValue;
      }
      
      return encrypted ? this.decrypt(storedData) : JSON.parse(storedData);
    } catch (error) {
      console.error('Failed to get storage item:', key, error);
      return defaultValue;
    }
  }

  /**
   * Remove item from localStorage
   */
  removeItem(key) {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const fullKey = this.prefix + key;
      localStorage.removeItem(fullKey);
      return true;
    } catch (error) {
      console.error('Failed to remove storage item:', key, error);
      return false;
    }
  }

  /**
   * Clear all app-related storage
   */
  clear() {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('Failed to clear storage:', error);
      return false;
    }
  }

  /**
   * Get user tier
   */
  getUserTier() {
    return this.getItem(APP_CONFIG.STORAGE_KEYS.USER_TIER, false, 'free');
  }

  /**
   * Set user tier
   */
  setUserTier(tier) {
    return this.setItem(APP_CONFIG.STORAGE_KEYS.USER_TIER, tier);
  }

  /**
   * Get articles viewed count
   */
  getArticlesViewed() {
    const data = this.getItem(APP_CONFIG.STORAGE_KEYS.ARTICLES_VIEWED, false, {
      count: 0,
      date: new Date().toDateString()
    });
    
    // Reset count if it's a new day
    const today = new Date().toDateString();
    if (data.date !== today) {
      data.count = 0;
      data.date = today;
      this.setArticlesViewed(data.count);
    }
    
    return data.count;
  }

  /**
   * Set articles viewed count
   */
  setArticlesViewed(count) {
    const data = {
      count,
      date: new Date().toDateString()
    };
    return this.setItem(APP_CONFIG.STORAGE_KEYS.ARTICLES_VIEWED, data);
  }

  /**
   * Increment articles viewed
   */
  incrementArticlesViewed() {
    const current = this.getArticlesViewed();
    this.setArticlesViewed(current + 1);
    return current + 1;
  }

  /**
   * Get saved articles
   */
  getSavedArticles() {
    const saved = this.getItem(APP_CONFIG.STORAGE_KEYS.SAVED_ARTICLES, true, []);
    return new Set(saved);
  }

  /**
   * Save article
   */
  saveArticle(articleId) {
    const saved = this.getSavedArticles();
    saved.add(articleId);
    return this.setItem(APP_CONFIG.STORAGE_KEYS.SAVED_ARTICLES, Array.from(saved), true);
  }

  /**
   * Unsave article
   */
  unsaveArticle(articleId) {
    const saved = this.getSavedArticles();
    saved.delete(articleId);
    return this.setItem(APP_CONFIG.STORAGE_KEYS.SAVED_ARTICLES, Array.from(saved), true);
  }

  /**
   * Check if article is saved
   */
  isArticleSaved(articleId) {
    const saved = this.getSavedArticles();
    return saved.has(articleId);
  }

  /**
   * Get user preferences
   */
  getUserPreferences() {
    return this.getItem(APP_CONFIG.STORAGE_KEYS.USER_PREFERENCES, true, {
      theme: 'auto',
      notifications: true,
      autoRefresh: true,
      preferredCategories: ['all'],
      language: 'en'
    });
  }

  /**
   * Set user preferences
   */
  setUserPreferences(preferences) {
    return this.setItem(APP_CONFIG.STORAGE_KEYS.USER_PREFERENCES, preferences, true);
  }

  /**
   * Update specific preference
   */
  updatePreference(key, value) {
    const preferences = this.getUserPreferences();
    preferences[key] = value;
    return this.setUserPreferences(preferences);
  }

  /**
   * Get last refresh timestamp
   */
  getLastRefresh() {
    return this.getItem(APP_CONFIG.STORAGE_KEYS.LAST_REFRESH, false, 0);
  }

  /**
   * Set last refresh timestamp
   */
  setLastRefresh(timestamp = Date.now()) {
    return this.setItem(APP_CONFIG.STORAGE_KEYS.LAST_REFRESH, timestamp);
  }

  /**
   * Check if refresh is needed
   */
  isRefreshNeeded() {
    const lastRefresh = this.getLastRefresh();
    const now = Date.now();
    return (now - lastRefresh) > APP_CONFIG.REFRESH_INTERVAL;
  }

  /**
   * Get storage usage statistics
   */
  getStorageStats() {
    if (!this.isAvailable) {
      return { available: false };
    }

    try {
      const keys = Object.keys(localStorage);
      const appKeys = keys.filter(key => key.startsWith(this.prefix));
      let totalSize = 0;

      appKeys.forEach(key => {
        totalSize += localStorage.getItem(key).length;
      });

      return {
        available: true,
        totalKeys: appKeys.length,
        totalSize: totalSize,
        formattedSize: this.formatBytes(totalSize),
        keys: appKeys.map(key => key.replace(this.prefix, ''))
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Export all data for backup
   */
  exportData() {
    if (!this.isAvailable) {
      return null;
    }

    try {
      const data = {};
      const keys = Object.keys(localStorage);
      
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          const shortKey = key.replace(this.prefix, '');
          data[shortKey] = localStorage.getItem(key);
        }
      });

      return {
        timestamp: new Date().toISOString(),
        data: data
      };
    } catch (error) {
      console.error('Failed to export data:', error);
      return null;
    }
  }

  /**
   * Import data from backup
   */
  importData(backupData) {
    if (!this.isAvailable || !backupData || !backupData.data) {
      return false;
    }

    try {
      Object.entries(backupData.data).forEach(([key, value]) => {
        const fullKey = this.prefix + key;
        localStorage.setItem(fullKey, value);
      });
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      available: this.isAvailable,
      canWrite: this.setItem('health_check', 'test'),
      canRead: this.getItem('health_check') === 'test',
      stats: this.getStorageStats()
    };
  }
}