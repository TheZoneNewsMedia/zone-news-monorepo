/**
 * Zone News Mini App - Interactive Comment System
 * Real-time commenting with Telegram integration
 */

'use strict';

import { APP_CONFIG } from './config.js';
import { StorageService } from './storage-service.js';

// ===== COMMENT SYSTEM =====
export class CommentSystem {
  constructor(realTimeService, storageService) {
    this.realTime = realTimeService;
    this.storage = storageService || new StorageService();
    
    // Comment data
    this.comments = new Map(); // articleId -> comments[]
    this.userComments = new Map(); // userId -> commentIds[]
    this.commentCache = new Map(); // commentId -> comment
    
    // User info
    this.currentUser = this.getCurrentUser();
    
    // Comment features
    this.features = {
      realTimeUpdates: true,
      threadedReplies: true,
      reactions: true,
      moderation: true,
      anonymousComments: false,
      linkPreview: true
    };
    
    // Moderation settings
    this.moderation = {
      maxCommentLength: 500,
      maxCommentsPerHour: 10,
      bannedWords: ['spam', 'scam'],
      requireApproval: false
    };
    
    this.initialize();
  }

  /**
   * Initialize comment system
   */
  initialize() {
    this.loadStoredComments();
    this.setupRealTimeListeners();
    this.startCleanupTimer();
    
    console.log('✅ Comment system initialized');
  }

  /**
   * Setup real-time event listeners
   */
  setupRealTimeListeners() {
    if (this.realTime) {
      this.realTime.on('comment_update', (data) => {
        this.handleRealTimeComment(data);
      });
      
      this.realTime.on('comment_reaction', (data) => {
        this.handleCommentReaction(data);
      });
    }
  }

  /**
   * Show comments for an article
   */
  showComments(articleId, container) {
    if (!container) return;

    const comments = this.getCommentsForArticle(articleId);
    const commentsHTML = this.renderCommentsSection(articleId, comments);
    
    container.innerHTML = commentsHTML;
    this.setupCommentHandlers(container, articleId);
    
    // Load comments from server if needed
    this.loadCommentsFromServer(articleId);
  }

  /**
   * Render complete comments section
   */
  renderCommentsSection(articleId, comments) {
    const sortedComments = this.sortComments(comments);
    const commentCount = comments.length;
    
    return `
      <div class="comments-section" data-article-id="${articleId}">
        <div class="comments-header">
          <h3 class="comments-title">
            💬 Comments (${commentCount})
          </h3>
          <div class="comments-controls">
            <select class="comment-sort" id="commentSort-${articleId}">
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="popular">Most Popular</option>
            </select>
            <button class="refresh-comments-btn" data-article-id="${articleId}">
              🔄
            </button>
          </div>
        </div>
        
        ${this.currentUser ? this.renderCommentForm(articleId) : this.renderLoginPrompt()}
        
        <div class="comments-list" id="commentsList-${articleId}">
          ${sortedComments.length > 0 
            ? sortedComments.map(comment => this.renderComment(comment)).join('')
            : this.renderEmptyComments()
          }
        </div>
        
        ${commentCount > 5 ? this.renderLoadMoreButton(articleId) : ''}
      </div>
    `;
  }

  /**
   * Render comment form
   */
  renderCommentForm(articleId) {
    return `
      <div class="comment-form">
        <div class="comment-form-header">
          <div class="user-avatar">
            ${this.currentUser.avatar || '👤'}
          </div>
          <div class="user-info">
            <span class="user-name">${this.escapeHtml(this.currentUser.name)}</span>
            <span class="user-type">${this.currentUser.isPremium ? '⭐ Premium' : '🆓 Free'}</span>
          </div>
        </div>
        
        <div class="comment-input-container">
          <textarea 
            class="comment-input" 
            id="commentInput-${articleId}"
            placeholder="Share your thoughts..."
            maxlength="${this.moderation.maxCommentLength}"
            rows="3"
          ></textarea>
          <div class="comment-input-footer">
            <div class="character-count">
              <span class="char-count">0</span>/${this.moderation.maxCommentLength}
            </div>
            <div class="comment-actions">
              <button class="comment-cancel-btn" type="button">Cancel</button>
              <button class="comment-submit-btn" type="button" data-article-id="${articleId}" disabled>
                💬 Comment
              </button>
            </div>
          </div>
        </div>
        
        <div class="comment-features">
          <label class="feature-toggle">
            <input type="checkbox" class="anonymous-toggle" ${!this.features.anonymousComments ? 'disabled' : ''}>
            <span>Comment anonymously</span>
          </label>
          <div class="comment-guidelines">
            <button class="guidelines-toggle" type="button">📋 Community Guidelines</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render individual comment
   */
  renderComment(comment, isReply = false) {
    const timeAgo = this.getTimeAgo(comment.timestamp);
    const reactionCount = Object.values(comment.reactions || {}).reduce((sum, count) => sum + count, 0);
    const hasReplies = comment.replies && comment.replies.length > 0;
    const canReply = this.features.threadedReplies && !isReply;
    
    return `
      <div class="comment ${isReply ? 'comment-reply' : ''}" data-comment-id="${comment.id}">
        <div class="comment-main">
          <div class="comment-avatar">
            ${comment.user.avatar || (comment.user.isAnonymous ? '🎭' : '👤')}
          </div>
          
          <div class="comment-content">
            <div class="comment-header">
              <span class="comment-author">
                ${this.escapeHtml(comment.user.name)}
                ${comment.user.isPremium ? '<span class="premium-badge">⭐</span>' : ''}
                ${comment.user.isVerified ? '<span class="verified-badge">✓</span>' : ''}
              </span>
              <span class="comment-time" title="${new Date(comment.timestamp).toLocaleString()}">
                ${timeAgo}
              </span>
              ${comment.isEdited ? '<span class="edited-indicator">(edited)</span>' : ''}
            </div>
            
            <div class="comment-text">
              ${this.formatCommentText(comment.text)}
            </div>
            
            <div class="comment-actions">
              <button class="comment-reaction-btn" data-comment-id="${comment.id}" data-reaction="like">
                👍 <span class="reaction-count">${comment.reactions?.like || 0}</span>
              </button>
              <button class="comment-reaction-btn" data-comment-id="${comment.id}" data-reaction="heart">
                ❤️ <span class="reaction-count">${comment.reactions?.heart || 0}</span>
              </button>
              
              ${canReply ? `
                <button class="comment-reply-btn" data-comment-id="${comment.id}">
                  💬 Reply
                </button>
              ` : ''}
              
              ${this.canModerateComment(comment) ? `
                <div class="comment-moderation">
                  <button class="comment-edit-btn" data-comment-id="${comment.id}">✏️</button>
                  <button class="comment-delete-btn" data-comment-id="${comment.id}">🗑️</button>
                </div>
              ` : ''}
              
              <button class="comment-report-btn" data-comment-id="${comment.id}">
                🚩 Report
              </button>
            </div>
          </div>
        </div>
        
        ${hasReplies ? `
          <div class="comment-replies">
            <div class="replies-header">
              <span class="replies-count">${comment.replies.length} replies</span>
              <button class="toggle-replies-btn" data-comment-id="${comment.id}">
                Show Replies
              </button>
            </div>
            <div class="replies-list" style="display: none;">
              ${comment.replies.map(reply => this.renderComment(reply, true)).join('')}
            </div>
          </div>
        ` : ''}
        
        <div class="reply-form-container" style="display: none;"></div>
      </div>
    `;
  }

  /**
   * Setup comment event handlers
   */
  setupCommentHandlers(container, articleId) {
    // Comment submission
    const submitBtn = container.querySelector('.comment-submit-btn');
    const commentInput = container.querySelector(`#commentInput-${articleId}`);
    const charCount = container.querySelector('.char-count');
    
    if (commentInput) {
      commentInput.addEventListener('input', (e) => {
        const length = e.target.value.length;
        charCount.textContent = length;
        submitBtn.disabled = length === 0 || length > this.moderation.maxCommentLength;
        
        // Visual feedback for character limit
        charCount.parentElement.classList.toggle('limit-warning', length > this.moderation.maxCommentLength * 0.9);
        charCount.parentElement.classList.toggle('limit-error', length > this.moderation.maxCommentLength);
      });
      
      commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.submitComment(articleId, commentInput.value.trim());
        }
      });
    }
    
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.submitComment(articleId, commentInput.value.trim());
      });
    }
    
    // Comment reactions
    container.addEventListener('click', (e) => {
      if (e.target.matches('.comment-reaction-btn, .comment-reaction-btn *')) {
        const btn = e.target.closest('.comment-reaction-btn');
        this.handleCommentReaction({
          commentId: btn.dataset.commentId,
          reaction: btn.dataset.reaction
        });
      }
    });
    
    // Reply functionality
    container.addEventListener('click', (e) => {
      if (e.target.matches('.comment-reply-btn')) {
        const commentId = e.target.dataset.commentId;
        this.showReplyForm(commentId, articleId);
      }
    });
    
    // Toggle replies
    container.addEventListener('click', (e) => {
      if (e.target.matches('.toggle-replies-btn')) {
        const commentId = e.target.dataset.commentId;
        this.toggleReplies(commentId);
      }
    });
    
    // Comment sorting
    const sortSelect = container.querySelector(`#commentSort-${articleId}`);
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortAndRefreshComments(articleId, e.target.value);
      });
    }
    
    // Refresh comments
    const refreshBtn = container.querySelector('.refresh-comments-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshComments(articleId);
      });
    }
  }

  /**
   * Submit a new comment
   */
  async submitComment(articleId, text, parentCommentId = null) {
    if (!text || !this.currentUser) return;
    
    // Check rate limiting
    if (!this.checkRateLimit()) {
      this.showError('You are commenting too frequently. Please wait a moment.');
      return;
    }
    
    // Create comment object
    const comment = {
      id: this.generateCommentId(),
      articleId,
      parentCommentId,
      text: text.trim(),
      user: {
        id: this.currentUser.id,
        name: this.currentUser.name,
        avatar: this.currentUser.avatar,
        isPremium: this.currentUser.isPremium,
        isAnonymous: false
      },
      timestamp: Date.now(),
      reactions: {},
      replies: [],
      isEdited: false,
      moderationStatus: 'approved'
    };
    
    try {
      // Add to local storage immediately (optimistic update)
      this.addCommentLocally(comment);
      
      // Send to server via real-time service
      if (this.realTime) {
        await this.realTime.sendComment(articleId, text);
      }
      
      // Clear the form
      this.clearCommentForm(articleId);
      
      // Show success feedback
      this.showSuccess('Comment posted successfully! 🎉');
      
      // Update rate limiting
      this.updateRateLimit();
      
    } catch (error) {
      // Remove from local storage on error
      this.removeCommentLocally(comment.id);
      this.showError('Failed to post comment. Please try again.');
      console.error('Comment submission failed:', error);
    }
  }

  /**
   * Handle real-time comment updates
   */
  handleRealTimeComment(data) {
    const { articleId, comment, action } = data;
    
    switch (action) {
      case 'add':
        this.addCommentLocally(comment);
        this.refreshCommentsUI(articleId);
        break;
      case 'update':
        this.updateCommentLocally(comment);
        this.refreshCommentsUI(articleId);
        break;
      case 'delete':
        this.removeCommentLocally(comment.id);
        this.refreshCommentsUI(articleId);
        break;
    }
  }

  /**
   * Add comment to local storage
   */
  addCommentLocally(comment) {
    // Add to article comments
    if (!this.comments.has(comment.articleId)) {
      this.comments.set(comment.articleId, []);
    }
    
    if (comment.parentCommentId) {
      // Add as reply
      const parentComment = this.commentCache.get(comment.parentCommentId);
      if (parentComment) {
        parentComment.replies.push(comment);
      }
    } else {
      // Add as top-level comment
      this.comments.get(comment.articleId).unshift(comment);
    }
    
    // Add to cache
    this.commentCache.set(comment.id, comment);
    
    // Add to user comments
    if (!this.userComments.has(comment.user.id)) {
      this.userComments.set(comment.user.id, []);
    }
    this.userComments.get(comment.user.id).push(comment.id);
    
    // Save to storage
    this.saveCommentsToStorage();
  }

  /**
   * Get comments for an article
   */
  getCommentsForArticle(articleId) {
    return this.comments.get(articleId) || [];
  }

  /**
   * Sort comments
   */
  sortComments(comments, sortBy = 'newest') {
    const sorted = [...comments];
    
    switch (sortBy) {
      case 'oldest':
        return sorted.sort((a, b) => a.timestamp - b.timestamp);
      case 'popular':
        return sorted.sort((a, b) => {
          const aScore = Object.values(a.reactions || {}).reduce((sum, count) => sum + count, 0);
          const bScore = Object.values(b.reactions || {}).reduce((sum, count) => sum + count, 0);
          return bScore - aScore;
        });
      case 'newest':
      default:
        return sorted.sort((a, b) => b.timestamp - a.timestamp);
    }
  }

  /**
   * Format comment text with links and mentions
   */
  formatCommentText(text) {
    let formatted = this.escapeHtml(text);
    
    // Convert URLs to links
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="comment-link">$1</a>'
    );
    
    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }

  /**
   * Check if user can moderate comment
   */
  canModerateComment(comment) {
    return this.currentUser && 
           (this.currentUser.id === comment.user.id || 
            this.currentUser.isModerator || 
            this.currentUser.isAdmin);
  }

  /**
   * Rate limiting check
   */
  checkRateLimit() {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    const userCommentIds = this.userComments.get(this.currentUser.id) || [];
    
    const recentComments = userCommentIds
      .map(id => this.commentCache.get(id))
      .filter(comment => comment && comment.timestamp > hourAgo);
    
    return recentComments.length < this.moderation.maxCommentsPerHour;
  }

  /**
   * Update rate limiting counter
   */
  updateRateLimit() {
    // Implementation would track user's comment frequency
    console.log('Rate limit updated for user:', this.currentUser.id);
  }

  /**
   * Generate unique comment ID
   */
  generateCommentId() {
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current user info
   */
  getCurrentUser() {
    // Try to get from Telegram WebApp
    if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
      const telegramUser = window.Telegram.WebApp.initDataUnsafe.user;
      return {
        id: `telegram_${telegramUser.id}`,
        name: `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim(),
        avatar: telegramUser.photo_url ? `🖼️` : '👤',
        isPremium: telegramUser.is_premium || false,
        isVerified: false,
        isModerator: false,
        isAdmin: false
      };
    }
    
    // Fallback to anonymous user
    return {
      id: `anonymous_${Date.now()}`,
      name: 'Anonymous User',
      avatar: '🎭',
      isPremium: false,
      isVerified: false,
      isModerator: false,
      isAdmin: false
    };
  }

  /**
   * Clear comment form
   */
  clearCommentForm(articleId) {
    const input = document.querySelector(`#commentInput-${articleId}`);
    const charCount = document.querySelector('.char-count');
    const submitBtn = document.querySelector('.comment-submit-btn');
    
    if (input) {
      input.value = '';
      if (charCount) charCount.textContent = '0';
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    // This would integrate with the main UI toast system
    console.log('✅', message);
  }

  /**
   * Show error message
   */
  showError(message) {
    // This would integrate with the main UI toast system
    console.error('❌', message);
  }

  /**
   * Get time ago string
   */
  getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Render empty comments state
   */
  renderEmptyComments() {
    return `
      <div class="empty-comments">
        <div class="empty-comments-icon">💬</div>
        <h4>No comments yet</h4>
        <p>Be the first to share your thoughts on this article!</p>
      </div>
    `;
  }

  /**
   * Render login prompt
   */
  renderLoginPrompt() {
    return `
      <div class="comment-login-prompt">
        <div class="login-prompt-content">
          <h4>Join the conversation</h4>
          <p>Log in to share your thoughts and engage with other readers.</p>
          <button class="login-btn">
            📱 Continue with Telegram
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Load and save comments
   */
  loadStoredComments() {
    const stored = this.storage.getItem('comments', true, {});
    if (stored.comments) {
      this.comments = new Map(stored.comments);
    }
    if (stored.commentCache) {
      this.commentCache = new Map(stored.commentCache);
    }
    if (stored.userComments) {
      this.userComments = new Map(stored.userComments);
    }
  }

  saveCommentsToStorage() {
    const data = {
      comments: Array.from(this.comments.entries()),
      commentCache: Array.from(this.commentCache.entries()),
      userComments: Array.from(this.userComments.entries()),
      lastUpdated: Date.now()
    };
    
    this.storage.setItem('comments', data, true);
  }

  /**
   * Start cleanup timer for old comments
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanupOldComments();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Clean up old comments (keep last 1000)
   */
  cleanupOldComments() {
    const maxComments = 1000;
    
    if (this.commentCache.size > maxComments) {
      const sortedComments = Array.from(this.commentCache.values())
        .sort((a, b) => b.timestamp - a.timestamp);
      
      const toKeep = sortedComments.slice(0, maxComments);
      const toRemove = sortedComments.slice(maxComments);
      
      toRemove.forEach(comment => {
        this.commentCache.delete(comment.id);
      });
      
      console.log(`🧹 Cleaned up ${toRemove.length} old comments`);
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      commentsLoaded: this.commentCache.size,
      articlesWithComments: this.comments.size,
      currentUser: !!this.currentUser,
      realTimeEnabled: !!this.realTime,
      features: this.features
    };
  }
}