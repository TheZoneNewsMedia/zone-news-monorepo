/**
 * Zone News Mini App - UI Components Facade
 * Modular UI system with lazy loading for optimal performance
 * Maintains backward compatibility while providing enhanced functionality
 */

'use strict';

import { APP_CONFIG, APP_STATE, EVENTS } from './config.js';
import { UIUtils, UICoreComponents, uiCore } from './ui-core.js';

// ===== MODULE LOADER =====
class UIModuleLoader {
  constructor() {
    this.loadedModules = new Map();
    this.loadingPromises = new Map();
    this.setupEventListeners();
    console.log('🔧 UI Module Loader initialized');
  }

  /**
   * Setup event listeners for lazy loading triggers
   */
  setupEventListeners() {
    // Listen for share requests to load sharing module
    document.addEventListener(EVENTS.SHARE_REQUESTED, async (e) => {
      const sharingModule = await this.loadSharing();
      if (sharingModule && e.detail.article) {
        await sharingModule.shareArticle(e.detail.article, e.detail.options || {});
      }
    });

    // Listen for form interactions to load forms module
    document.addEventListener(EVENTS.FORM_INTERACTION, async (e) => {
      await this.loadForms();
    });

    // Listen for search requests
    document.addEventListener(EVENTS.SEARCH_REQUESTED, async (e) => {
      await this.loadForms();
    });

    // Listen for comment requests
    document.addEventListener(EVENTS.COMMENT_REQUESTED, async (e) => {
      await this.loadForms();
    });
  }

  /**
   * Load sharing module on demand
   */
  async loadSharing() {
    const moduleKey = 'sharing';
    
    if (this.loadedModules.has(moduleKey)) {
      return this.loadedModules.get(moduleKey);
    }

    if (this.loadingPromises.has(moduleKey)) {
      return await this.loadingPromises.get(moduleKey);
    }

    const loadingPromise = this._loadSharingModule();
    this.loadingPromises.set(moduleKey, loadingPromise);

    try {
      const module = await loadingPromise;
      this.loadedModules.set(moduleKey, module);
      this.loadingPromises.delete(moduleKey);
      
      // Dispatch module loaded event
      document.dispatchEvent(new CustomEvent(EVENTS.MODULE_LOADED, {
        detail: { module: moduleKey, success: true }
      }));
      
      return module;
    } catch (error) {
      console.error('Failed to load sharing module:', error);
      this.loadingPromises.delete(moduleKey);
      
      document.dispatchEvent(new CustomEvent(EVENTS.MODULE_LOADED, {
        detail: { module: moduleKey, success: false, error }
      }));
      
      throw error;
    }
  }

  /**
   * Load forms module on demand
   */
  async loadForms() {
    const moduleKey = 'forms';
    
    if (this.loadedModules.has(moduleKey)) {
      return this.loadedModules.get(moduleKey);
    }

    if (this.loadingPromises.has(moduleKey)) {
      return await this.loadingPromises.get(moduleKey);
    }

    const loadingPromise = this._loadFormsModule();
    this.loadingPromises.set(moduleKey, loadingPromise);

    try {
      const module = await loadingPromise;
      this.loadedModules.set(moduleKey, module);
      this.loadingPromises.delete(moduleKey);
      
      document.dispatchEvent(new CustomEvent(EVENTS.MODULE_LOADED, {
        detail: { module: moduleKey, success: true }
      }));
      
      return module;
    } catch (error) {
      console.error('Failed to load forms module:', error);
      this.loadingPromises.delete(moduleKey);
      
      document.dispatchEvent(new CustomEvent(EVENTS.MODULE_LOADED, {
        detail: { module: moduleKey, success: false, error }
      }));
      
      throw error;
    }
  }

  /**
   * Internal method to load sharing module
   */
  async _loadSharingModule() {
    const startTime = performance.now();
    const module = await import('./ui-sharing.js');
    const loadTime = performance.now() - startTime;
    
    console.log(`📤 Sharing module loaded in ${loadTime.toFixed(2)}ms`);
    return new module.UISharingComponents(uiCore);
  }

  /**
   * Internal method to load forms module
   */
  async _loadFormsModule() {
    const startTime = performance.now();
    const module = await import('./ui-forms.js');
    const loadTime = performance.now() - startTime;
    
    console.log(`📝 Forms module loaded in ${loadTime.toFixed(2)}ms`);
    return new module.UIFormComponents(uiCore);
  }

  /**
   * Get loaded module
   */
  getModule(moduleKey) {
    return this.loadedModules.get(moduleKey);
  }

  /**
   * Check if module is loaded
   */
  isModuleLoaded(moduleKey) {
    return this.loadedModules.has(moduleKey);
  }

  /**
   * Preload modules (for performance optimization)
   */
  async preloadModules(modules = ['sharing', 'forms']) {
    const preloadPromises = modules.map(async (module) => {
      try {
        switch (module) {
          case 'sharing':
            await this.loadSharing();
            break;
          case 'forms':
            await this.loadForms();
            break;
        }
      } catch (error) {
        console.warn(`Failed to preload ${module} module:`, error);
      }
    });

    await Promise.allSettled(preloadPromises);
  }

  /**
   * Clear module cache (for memory management)
   */
  clearCache() {
    this.loadedModules.forEach(module => {
      if (module.clearCaches) {
        module.clearCaches();
      }
    });
    
    this.loadedModules.clear();
    this.loadingPromises.clear();
  }
}

// ===== UNIFIED UI COMPONENTS FACADE =====
export class UIComponents {
  constructor() {
    this.core = uiCore;
    this.moduleLoader = new UIModuleLoader();
    this.initializeCompatibility();
    console.log('🎨 UI Components system initialized with modular loading');
  }

  /**
   * Initialize backward compatibility
   */
  initializeCompatibility() {
    // Ensure all core functionality is immediately available
    this.toastContainer = this.core.toastContainer;
    this.modalContainer = this.core.modalContainer;
  }

  // ===== CORE METHODS (Immediate - delegate to ui-core) =====
  
  showToast(message, type = 'info', duration = APP_CONFIG.TOAST_DURATION) {
    return this.core.showToast(message, type, duration);
  }

  hideToast(toast) {
    return this.core.hideToast(toast);
  }

  showLoading(container, message = 'Loading...') {
    return this.core.showLoading(container, message);
  }

  hideLoading(container) {
    return this.core.hideLoading(container);
  }

  createSkeletonLoader(count = 3) {
    return this.core.createSkeletonLoader(count);
  }

  showModal(content, options = {}) {
    return this.core.showModal(content, options);
  }

  hideModal(modal) {
    return this.core.hideModal(modal);
  }

  createArticleCard(article, options = {}) {
    return this.core.createArticleCard(article, options);
  }

  showArticleModal(article) {
    return this.core.showArticleModal(article);
  }

  createFilterTabs(categories, activeCategory = 'all') {
    return this.core.createFilterTabs(categories, activeCategory);
  }

  setActiveTab(container, activeTab) {
    return this.core.setActiveTab(container, activeTab);
  }

  createBottomNavigation(tabs, activeTab = 'home') {
    return this.core.createBottomNavigation(tabs, activeTab);
  }

  setActiveNavTab(nav, activeTab) {
    return this.core.setActiveNavTab(nav, activeTab);
  }

  createProgressBar(current, max, label = '') {
    return this.core.createProgressBar(current, max, label);
  }

  updateProgressBar(progressBar, current, max) {
    return this.core.updateProgressBar(progressBar, current, max);
  }

  // ===== SHARING METHODS (Lazy-loaded) =====
  
  async shareArticle(article, options = {}) {
    const sharingModule = await this.moduleLoader.loadSharing();
    return sharingModule.shareArticle(article, options);
  }

  async copyToClipboard(text) {
    const sharingModule = await this.moduleLoader.loadSharing();
    return sharingModule.copyToClipboard(text);
  }

  async showAdvancedShareModal(article, shareData) {
    const sharingModule = await this.moduleLoader.loadSharing();
    return sharingModule.showAdvancedShareModal(article, shareData);
  }

  // ===== FORMS METHODS (Lazy-loaded) =====
  
  async createSearchForm(options = {}) {
    const formsModule = await this.moduleLoader.loadForms();
    return formsModule.createSearchForm(options);
  }

  async createCommentForm(articleId, options = {}) {
    const formsModule = await this.moduleLoader.loadForms();
    return formsModule.createCommentForm(articleId, options);
  }

  async createFeedbackForm(options = {}) {
    const formsModule = await this.moduleLoader.loadForms();
    return formsModule.createFeedbackForm(options);
  }

  // ===== UTILITY METHODS (Immediate - delegate to ui-core) =====
  
  escapeHtml(text) {
    return UIUtils.escapeHtml(text);
  }

  formatNumber(num) {
    return UIUtils.formatNumber(num);
  }

  getTimeAgo(date) {
    return UIUtils.getTimeAgo(date);
  }

  animate(element, animation, duration = APP_CONFIG.ANIMATION_DURATION) {
    return UIUtils.animate(element, animation, duration);
  }

  debounce(func, wait) {
    return UIUtils.debounce(func, wait);
  }

  throttle(func, limit) {
    return UIUtils.throttle(func, limit);
  }

  // ===== PERFORMANCE METHODS =====
  
  /**
   * Preload modules for better user experience
   */
  async preloadAllModules() {
    return this.moduleLoader.preloadModules();
  }

  /**
   * Get module loading status
   */
  getModuleStatus() {
    return {
      sharing: this.moduleLoader.isModuleLoaded('sharing'),
      forms: this.moduleLoader.isModuleLoaded('forms'),
      core: true // Always loaded
    };
  }

  /**
   * Clear all caches for memory management
   */
  clearAllCaches() {
    this.moduleLoader.clearCache();
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const status = this.getModuleStatus();
    return {
      modulesLoaded: Object.values(status).filter(Boolean).length,
      totalModules: Object.keys(status).length,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage (rough calculation)
   */
  estimateMemoryUsage() {
    const status = this.getModuleStatus();
    let estimatedKB = 60; // Core module base
    
    if (status.sharing) estimatedKB += 40; // Sharing module
    if (status.forms) estimatedKB += 20; // Forms module
    
    return `~${estimatedKB}KB`;
  }
}

// ===== BACKWARD COMPATIBILITY EXPORTS =====
export { UIUtils, UICoreComponents };
export const uiComponents = new UIComponents();

// Make singleton globally available for compatibility
if (typeof window !== 'undefined') {
  window.UIComponents = UIComponents;
  window.uiComponents = uiComponents;
}

// Default export for compatibility
export default UIComponents;