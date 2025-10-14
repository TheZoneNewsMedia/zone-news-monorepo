/**
 * Zone News Mini App - UI Forms Module
 * Form components, validation, and user input handling
 * Lazy-loaded on form interaction for optimal performance
 */

'use strict';

import { APP_CONFIG, EVENTS } from './config.js';
import { UIUtils } from './ui-core.js';
import PremiumFeaturesManager from './premium-manager.js';

// ===== FORM COMPONENTS =====
export class UIFormComponents {
  constructor(coreModule) {
    this.core = coreModule;
    this.validators = new Map();
    this.formStates = new Map();
    this.premiumManager = new PremiumFeaturesManager(coreModule);
    console.log('📝 UI Forms module loaded with premium integration');
  }

  /**
   * Create search form
   */
  createSearchForm(options = {}) {
    const {
      placeholder = 'Search articles...',
      debounceMs = 300,
      minLength = 2,
      onSearch = null
    } = options;

    const searchForm = document.createElement('div');
    searchForm.className = 'search-form';
    searchForm.innerHTML = `
      <div class="search-input-container">
        <span class="search-icon">🔍</span>
        <input 
          type="text" 
          class="search-input" 
          placeholder="${UIUtils.escapeHtml(placeholder)}"
          autocomplete="off"
          spellcheck="false"
        >
        <button class="search-clear-btn" style="display: none;" aria-label="Clear search">×</button>
      </div>
      <div class="search-suggestions" style="display: none;"></div>
    `;

    const input = searchForm.querySelector('.search-input');
    const clearBtn = searchForm.querySelector('.search-clear-btn');
    const suggestions = searchForm.querySelector('.search-suggestions');

    // Debounced search handler
    const debouncedSearch = UIUtils.debounce(async (query) => {
      if (query.length >= minLength) {
        this.handleSearch(query, suggestions, onSearch);
      } else {
        suggestions.style.display = 'none';
      }
    }, debounceMs);

    // Input event handlers
    input.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      
      // Show/hide clear button
      clearBtn.style.display = value ? 'block' : 'none';
      
      // Trigger search
      if (value) {
        debouncedSearch(value);
      } else {
        suggestions.style.display = 'none';
      }
    });

    // Clear button handler
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      suggestions.style.display = 'none';
      input.focus();
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      this.handleSearchKeyboard(e, suggestions);
    });

    return searchForm;
  }

  /**
   * Handle search functionality
   */
  async handleSearch(query, suggestionsContainer, onSearch) {
    try {
      // Check search access with premium manager
      const searchAccess = this.premiumManager.canAccessFeature('advancedSearch');
      
      if (!searchAccess.allowed) {
        suggestionsContainer.innerHTML = `
          <div class="search-restricted">
            <div class="restriction-message">
              <span class="restriction-icon">🔒</span>
              <span class="restriction-text">${this.premiumManager.getRestrictionMessage('advancedSearch', searchAccess)}</span>
              <button type="button" class="btn btn-primary upgrade-btn" data-feature="advancedSearch">
                Upgrade Now 💎
              </button>
            </div>
          </div>
        `;
        suggestionsContainer.style.display = 'block';
        
        // Setup upgrade button
        const upgradeBtn = suggestionsContainer.querySelector('.upgrade-btn');
        if (upgradeBtn) {
          upgradeBtn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent(EVENTS.PREMIUM_UPGRADE_REQUESTED, {
              detail: { feature: 'advancedSearch', context: { query } }
            }));
          });
        }
        
        return;
      }
      
      // Track search usage
      this.premiumManager.trackFeatureUsage('advancedSearch', { query, length: query.length });
      
      // Show loading
      suggestionsContainer.innerHTML = '<div class="search-loading">Searching...</div>';
      suggestionsContainer.style.display = 'block';

      // Execute search callback
      if (onSearch) {
        const results = await onSearch(query);
        this.displaySearchResults(results, suggestionsContainer, query, searchAccess);
      }

      // Dispatch search event
      document.dispatchEvent(new CustomEvent(EVENTS.SEARCH_PERFORMED, {
        detail: { query, access: searchAccess }
      }));

    } catch (error) {
      console.error('Search failed:', error);
      suggestionsContainer.innerHTML = '<div class="search-error">Search failed. Please try again.</div>';
    }
  }

  /**
   * Display search results with premium status
   */
  displaySearchResults(results, container, query, searchAccess = null) {
    if (!results || results.length === 0) {
      container.innerHTML = `<div class="search-no-results">No results found for "${UIUtils.escapeHtml(query)}"</div>`;
      return;
    }

    const resultsHtml = results.map(result => `
      <div class="search-result-item" data-article-id="${result.id}">
        <div class="search-result-header">
          <span class="search-result-category">${UIUtils.escapeHtml(result.category)}</span>
          <time class="search-result-time">${UIUtils.getTimeAgo(new Date(result.published_date))}</time>
        </div>
        <h4 class="search-result-title">${this.highlightSearchTerms(result.title, query)}</h4>
        <p class="search-result-excerpt">${this.highlightSearchTerms(result.excerpt || '', query)}</p>
      </div>
    `).join('');

    // Add usage information to results header
    const usageInfo = searchAccess && searchAccess.remaining !== undefined 
      ? ` • ${searchAccess.remaining} searches remaining today`
      : '';
    
    container.innerHTML = `
      <div class="search-results-header">
        <span>${results.length} result${results.length === 1 ? '' : 's'} found${usageInfo}</span>
        ${searchAccess && searchAccess.isNearLimit ? `
          <div class="search-limit-warning">
            ⚠️ Running low on searches. <a href="#" class="upgrade-link" data-feature="advancedSearch">Upgrade for unlimited</a>
          </div>
        ` : ''}
      </div>
      <div class="search-results-list">
        ${resultsHtml}
      </div>
    `;

    // Add click handlers for results
    container.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const articleId = item.dataset.articleId;
        document.dispatchEvent(new CustomEvent(EVENTS.ARTICLE_SELECTED, {
          detail: { articleId }
        }));
      });
    });
    
    // Add click handler for upgrade link
    const upgradeLink = container.querySelector('.upgrade-link');
    if (upgradeLink) {
      upgradeLink.addEventListener('click', (e) => {
        e.preventDefault();
        const feature = upgradeLink.dataset.feature;
        document.dispatchEvent(new CustomEvent(EVENTS.PREMIUM_UPGRADE_REQUESTED, {
          detail: { feature, context: { query, source: 'search_limit_warning' } }
        }));
      });
    }
  }

  /**
   * Highlight search terms in text
   */
  highlightSearchTerms(text, searchQuery) {
    if (!text || !searchQuery) return UIUtils.escapeHtml(text);
    
    const escapedText = UIUtils.escapeHtml(text);
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Handle keyboard navigation in search
   */
  handleSearchKeyboard(event, suggestionsContainer) {
    const results = suggestionsContainer.querySelectorAll('.search-result-item');
    let currentIndex = Array.from(results).findIndex(item => item.classList.contains('highlighted'));

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        currentIndex = Math.min(currentIndex + 1, results.length - 1);
        this.highlightSearchResult(results, currentIndex);
        break;
      case 'ArrowUp':
        event.preventDefault();
        currentIndex = Math.max(currentIndex - 1, 0);
        this.highlightSearchResult(results, currentIndex);
        break;
      case 'Enter':
        event.preventDefault();
        if (currentIndex >= 0 && results[currentIndex]) {
          results[currentIndex].click();
        }
        break;
      case 'Escape':
        suggestionsContainer.style.display = 'none';
        break;
    }
  }

  /**
   * Highlight search result for keyboard navigation
   */
  highlightSearchResult(results, index) {
    results.forEach((result, i) => {
      result.classList.toggle('highlighted', i === index);
    });
  }

  /**
   * Create comment form with premium gating
   */
  createCommentForm(articleId, options = {}) {
    const {
      placeholder = 'Share your thoughts...',
      maxLength = 500,
      allowAnonymous = true
    } = options;

    // Check if user can access comments
    const commentAccess = this.premiumManager.canAccessFeature('comments');
    
    const form = document.createElement('form');
    form.className = 'comment-form';
    
    // Add premium status indicator
    const premiumStatus = this.premiumManager.getPremiumStatus();
    const usageInfo = commentAccess.allowed && commentAccess.remaining !== undefined 
      ? `${commentAccess.remaining} comments remaining today`
      : commentAccess.allowed 
        ? 'Unlimited comments' 
        : 'Daily limit reached';
    
    form.innerHTML = `
      <div class="comment-form-header">
        <h4>Add Comment</h4>
        <div class="comment-form-status">
          <span class="comment-form-info">Share your thoughts respectfully</span>
          <div class="usage-indicator ${commentAccess.allowed ? 'allowed' : 'restricted'}">
            <span class="usage-text">${usageInfo}</span>
            ${!commentAccess.allowed ? `
              <button type="button" class="upgrade-btn-small" data-feature="comments">
                Upgrade 💎
              </button>
            ` : ''}
          </div>
        </div>
      </div>
      
      <div class="comment-form-body">
        <textarea 
          class="comment-textarea" 
          placeholder="${UIUtils.escapeHtml(placeholder)}"
          maxlength="${maxLength}"
          ${commentAccess.allowed ? 'required' : 'disabled'}
          ${!commentAccess.allowed ? 'data-restricted="true"' : ''}
        ></textarea>
        <div class="comment-char-counter">
          <span class="char-count">0</span>/${maxLength}
        </div>
        ${!commentAccess.allowed ? `
          <div class="comment-restriction-overlay">
            <div class="restriction-message">
              <span class="restriction-icon">🔒</span>
              <span class="restriction-text">${this.premiumManager.getRestrictionMessage('comments', commentAccess)}</span>
              <button type="button" class="btn btn-primary upgrade-btn" data-feature="comments">
                Upgrade Now 💎
              </button>
            </div>
          </div>
        ` : ''}
      </div>
      
      ${allowAnonymous ? `
        <div class="comment-form-options">
          <label class="comment-anonymous-label">
            <input type="checkbox" class="comment-anonymous-checkbox">
            <span>Post anonymously</span>
          </label>
        </div>
      ` : ''}
      
      <div class="comment-form-actions">
        <button type="button" class="btn btn-secondary comment-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary comment-submit-btn" 
                ${commentAccess.allowed ? 'disabled' : 'disabled data-restricted="true"'}>
          ${commentAccess.allowed ? 'Post Comment' : 'Upgrade to Comment'}
        </button>
      </div>
    `;

    // Setup form handlers with premium integration
    this.setupCommentFormHandlers(form, articleId, commentAccess);
    
    return form;
  }

  /**
   * Setup comment form event handlers with premium integration
   */
  setupCommentFormHandlers(form, articleId, commentAccess) {
    const textarea = form.querySelector('.comment-textarea');
    const charCount = form.querySelector('.char-count');
    const submitBtn = form.querySelector('.comment-submit-btn');
    const cancelBtn = form.querySelector('.comment-cancel-btn');
    const upgradeButtons = form.querySelectorAll('.upgrade-btn, .upgrade-btn-small');

    // Character counter with premium awareness
    textarea.addEventListener('input', (e) => {
      const length = e.target.value.length;
      charCount.textContent = length;
      
      // Enable/disable submit button based on access and content
      const canSubmit = commentAccess.allowed && length > 0 && length <= parseInt(textarea.maxLength);
      submitBtn.disabled = !canSubmit;
      
      // Visual feedback for character limit
      charCount.parentElement.classList.toggle('limit-warning', length > 450);
      charCount.parentElement.classList.toggle('limit-error', length > 500);
    });
    
    // Handle upgrade button clicks
    upgradeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const feature = btn.dataset.feature || 'comments';
        document.dispatchEvent(new CustomEvent(EVENTS.PREMIUM_UPGRADE_REQUESTED, {
          detail: { feature, context: { articleId } }
        }));
      });
    });

    // Form submission with premium gating
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Double-check access before submission
      const currentAccess = this.premiumManager.canAccessFeature('comments');
      if (!currentAccess.allowed) {
        document.dispatchEvent(new CustomEvent(EVENTS.FEATURE_RESTRICTED, {
          detail: { feature: 'comments', reason: currentAccess.reason, context: { articleId } }
        }));
        return;
      }
      
      await this.handleCommentSubmission(form, articleId);
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent(EVENTS.COMMENT_CANCELLED, {
        detail: { articleId }
      }));
    });
  }

  /**
   * Handle comment form submission with premium integration
   */
  async handleCommentSubmission(form, articleId) {
    const textarea = form.querySelector('.comment-textarea');
    const anonymousCheckbox = form.querySelector('.comment-anonymous-checkbox');
    const submitBtn = form.querySelector('.comment-submit-btn');
    
    const commentData = {
      articleId,
      content: textarea.value.trim(),
      anonymous: anonymousCheckbox?.checked || false,
      timestamp: Date.now()
    };

    try {
      // Show loading state
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting...';

      // Handle submission through premium manager
      const result = await this.premiumManager.handleCommentSubmission(commentData);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Dispatch submission event
      document.dispatchEvent(new CustomEvent(EVENTS.COMMENT_SUBMITTED, {
        detail: { ...commentData, result: result.data }
      }));
      
      // Reset form
      form.reset();
      form.querySelector('.char-count').textContent = '0';
      
      // Update form to reflect new usage limits
      this.updateFormUsageIndicator(form);

    } catch (error) {
      console.error('Comment submission failed:', error);
      this.core.showToast(error.message || 'Failed to post comment', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Comment';
    }
  }
  
  /**
   * Update form usage indicator after submission
   */
  updateFormUsageIndicator(form) {
    const usageIndicator = form.querySelector('.usage-indicator');
    const usageText = form.querySelector('.usage-text');
    
    if (usageIndicator && usageText) {
      const commentAccess = this.premiumManager.canAccessFeature('comments');
      
      if (commentAccess.allowed && commentAccess.remaining !== undefined) {
        usageText.textContent = `${commentAccess.remaining} comments remaining today`;
      } else if (!commentAccess.allowed) {
        usageIndicator.className = 'usage-indicator restricted';
        usageText.textContent = 'Daily limit reached';
        
        // Add upgrade button if not present
        if (!usageIndicator.querySelector('.upgrade-btn-small')) {
          const upgradeBtn = document.createElement('button');
          upgradeBtn.type = 'button';
          upgradeBtn.className = 'upgrade-btn-small';
          upgradeBtn.dataset.feature = 'comments';
          upgradeBtn.textContent = 'Upgrade 💎';
          usageIndicator.appendChild(upgradeBtn);
        }
      }
    }
  }

  /**
   * Validate comment content
   */
  validateComment(commentData) {
    if (!commentData.content || commentData.content.length === 0) {
      return { isValid: false, error: 'Comment cannot be empty' };
    }

    if (commentData.content.length > 500) {
      return { isValid: false, error: 'Comment is too long' };
    }

    // Check for spam patterns
    if (this.isSpamContent(commentData.content)) {
      return { isValid: false, error: 'Comment appears to be spam' };
    }

    return { isValid: true };
  }

  /**
   * Simple spam detection
   */
  isSpamContent(content) {
    const spamPatterns = [
      /http[s]?:\/\/[^\s]+/gi, // URLs
      /(.)\1{10,}/gi, // Repeated characters
      /\b(buy|sell|cheap|free|click|download)\b.*\b(now|here|link)\b/gi // Spam phrases
    ];

    return spamPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Create feedback form
   */
  createFeedbackForm(options = {}) {
    const {
      type = 'general',
      placeholder = 'Your feedback is valuable to us...',
      includeCategorySelect = true
    } = options;

    const form = document.createElement('form');
    form.className = 'feedback-form';
    form.innerHTML = `
      <div class="feedback-form-header">
        <h4>Send Feedback</h4>
        <p>Help us improve Zone News</p>
      </div>
      
      ${includeCategorySelect ? `
        <div class="feedback-form-field">
          <label for="feedback-category">Category</label>
          <select id="feedback-category" class="feedback-select" required>
            <option value="">Select category...</option>
            <option value="bug">Bug Report</option>
            <option value="feature">Feature Request</option>
            <option value="content">Content Issue</option>
            <option value="performance">Performance</option>
            <option value="other">Other</option>
          </select>
        </div>
      ` : ''}
      
      <div class="feedback-form-field">
        <label for="feedback-content">Your Feedback</label>
        <textarea 
          id="feedback-content"
          class="feedback-textarea" 
          placeholder="${UIUtils.escapeHtml(placeholder)}"
          maxlength="1000"
          required
        ></textarea>
        <div class="feedback-char-counter">
          <span class="char-count">0</span>/1000
        </div>
      </div>
      
      <div class="feedback-form-actions">
        <button type="button" class="btn btn-secondary feedback-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary feedback-submit-btn" disabled>Send Feedback</button>
      </div>
    `;

    // Setup form handlers
    this.setupFeedbackFormHandlers(form);
    
    return form;
  }

  /**
   * Setup feedback form handlers
   */
  setupFeedbackFormHandlers(form) {
    const textarea = form.querySelector('.feedback-textarea');
    const charCount = form.querySelector('.char-count');
    const submitBtn = form.querySelector('.feedback-submit-btn');
    const cancelBtn = form.querySelector('.feedback-cancel-btn');
    const categorySelect = form.querySelector('.feedback-select');

    // Character counter
    textarea.addEventListener('input', (e) => {
      const length = e.target.value.length;
      charCount.textContent = length;
      
      // Check if form is valid
      const hasCategory = !categorySelect || categorySelect.value;
      submitBtn.disabled = length === 0 || !hasCategory;
    });

    // Category selection
    if (categorySelect) {
      categorySelect.addEventListener('change', () => {
        const hasContent = textarea.value.trim().length > 0;
        submitBtn.disabled = !categorySelect.value || !hasContent;
      });
    }

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleFeedbackSubmission(form);
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent(EVENTS.FEEDBACK_CANCELLED));
    });
  }

  /**
   * Handle feedback submission
   */
  async handleFeedbackSubmission(form) {
    const textarea = form.querySelector('.feedback-textarea');
    const categorySelect = form.querySelector('.feedback-select');
    const submitBtn = form.querySelector('.feedback-submit-btn');
    
    const feedbackData = {
      category: categorySelect?.value || 'general',
      content: textarea.value.trim(),
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    try {
      // Show loading state
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      // Dispatch feedback event
      document.dispatchEvent(new CustomEvent(EVENTS.FEEDBACK_SUBMITTED, {
        detail: feedbackData
      }));

      // Show success message
      this.core.showToast('Feedback sent successfully! Thank you.', 'success');
      
      // Reset form
      form.reset();
      form.querySelector('.char-count').textContent = '0';

    } catch (error) {
      console.error('Feedback submission failed:', error);
      this.core.showToast('Failed to send feedback. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Feedback';
    }
  }

  /**
   * Register custom validator
   */
  registerValidator(name, validatorFn) {
    this.validators.set(name, validatorFn);
  }

  /**
   * Validate form field
   */
  validateField(fieldName, value, validatorName = null) {
    if (validatorName && this.validators.has(validatorName)) {
      return this.validators.get(validatorName)(value);
    }
    
    // Default validation
    return { isValid: value && value.trim().length > 0, error: null };
  }

  /**
   * Clear form states (for memory management)
   */
  clearFormStates() {
    this.formStates.clear();
  }
}

// Export singleton
export const uiForms = new UIFormComponents();