/**
 * Zone News Mini App - UI Components
 * Reusable UI components and interactions
 */

'use strict';

import { APP_CONFIG, APP_STATE, EVENTS } from './config.js';

// ===== UI COMPONENTS =====
export class UIComponents {
  constructor() {
    this.toastContainer = null;
    this.modalContainer = null;
    this.setupToastContainer();
    this.setupModalContainer();
  }

  /**
   * Setup toast notification container
   */
  setupToastContainer() {
    this.toastContainer = document.createElement('div');
    this.toastContainer.className = 'toast-container';
    this.toastContainer.setAttribute('aria-live', 'polite');
    this.toastContainer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(this.toastContainer);
  }

  /**
   * Setup modal container
   */
  setupModalContainer() {
    this.modalContainer = document.createElement('div');
    this.modalContainer.className = 'modal-container';
    this.modalContainer.style.display = 'none';
    document.body.appendChild(this.modalContainer);
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info', duration = APP_CONFIG.TOAST_DURATION) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${this.getToastIcon(type)}</span>
        <span class="toast-message">${this.escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Close notification">×</button>
      </div>
    `;

    // Add to container
    this.toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // Setup close handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.hideToast(toast));

    // Auto hide
    if (duration > 0) {
      setTimeout(() => this.hideToast(toast), duration);
    }

    return toast;
  }

  /**
   * Hide toast notification
   */
  hideToast(toast) {
    toast.classList.add('toast-hide');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, APP_CONFIG.ANIMATION_DURATION);
  }

  /**
   * Get toast icon based on type
   */
  getToastIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  /**
   * Show loading spinner
   */
  showLoading(container, message = 'Loading...') {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.innerHTML = `
      <div class="spinner-animation"></div>
      <p class="loading-text">${this.escapeHtml(message)}</p>
    `;
    
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    
    container.appendChild(spinner);
    return spinner;
  }

  /**
   * Hide loading spinner
   */
  hideLoading(container) {
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    
    const spinner = container.querySelector('.loading-spinner');
    if (spinner) {
      spinner.remove();
    }
  }

  /**
   * Create skeleton loader
   */
  createSkeletonLoader(count = 3) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-container';
    
    for (let i = 0; i < count; i++) {
      const item = document.createElement('div');
      item.className = 'skeleton-item';
      item.innerHTML = `
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-subtitle"></div>
        <div class="skeleton-line skeleton-content"></div>
      `;
      skeleton.appendChild(item);
    }
    
    return skeleton;
  }

  /**
   * Show modal dialog
   */
  showModal(content, options = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h3 id="modal-title">${this.escapeHtml(options.title || 'Modal')}</h3>
          <button class="modal-close" aria-label="Close modal">×</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        ${options.actions ? `<div class="modal-footer">${options.actions}</div>` : ''}
      </div>
    `;

    this.modalContainer.appendChild(modal);
    this.modalContainer.style.display = 'flex';

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('modal-show');
    });

    // Setup close handlers
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');
    
    const closeHandler = () => this.hideModal(modal);
    closeBtn.addEventListener('click', closeHandler);
    backdrop.addEventListener('click', closeHandler);

    // Focus management
    const dialog = modal.querySelector('.modal-dialog');
    dialog.focus();

    // Escape key handler
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeHandler();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    return modal;
  }

  /**
   * Hide modal dialog
   */
  hideModal(modal) {
    modal.classList.add('modal-hide');
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      if (this.modalContainer.children.length === 0) {
        this.modalContainer.style.display = 'none';
      }
    }, APP_CONFIG.ANIMATION_DURATION);
  }

  /**
   * Create article card
   */
  createArticleCard(article, options = {}) {
    const card = document.createElement('article');
    card.className = 'article-card';
    card.setAttribute('data-article-id', article.id);
    
    const publishedDate = new Date(article.published_date);
    const timeAgo = this.getTimeAgo(publishedDate);
    
    card.innerHTML = `
      <div class="article-card-header">
        <div class="article-meta">
          <span class="article-category">${this.escapeHtml(article.category)}</span>
          <span class="article-scope">${this.escapeHtml(article.scope)}</span>
          <time class="article-time" datetime="${article.published_date}">${timeAgo}</time>
        </div>
        <button class="article-save-btn ${options.isSaved ? 'saved' : ''}" 
                aria-label="${options.isSaved ? 'Remove from saved' : 'Save article'}"
                data-article-id="${article.id}">
          ${options.isSaved ? '📌' : '📍'}
        </button>
      </div>
      
      <h3 class="article-title">${this.escapeHtml(article.title)}</h3>
      
      <p class="article-excerpt">${this.escapeHtml(article.excerpt || '')}</p>
      
      <div class="article-footer">
        <div class="article-stats">
          <span class="article-views">
            <span class="stat-icon">👁️</span>
            <span class="stat-value">${this.formatNumber(article.views || 0)}</span>
          </span>
          <span class="article-source">${this.escapeHtml(article.source || 'Zone News')}</span>
        </div>
        
        <div class="article-actions">
          <button class="reaction-btn" data-reaction="like" data-article-id="${article.id}">
            👍 <span class="reaction-count">${article.reactions?.likes || 0}</span>
          </button>
          <button class="reaction-btn" data-reaction="heart" data-article-id="${article.id}">
            ❤️ <span class="reaction-count">${article.reactions?.hearts || 0}</span>
          </button>
          <button class="comment-btn" data-article-id="${article.id}" aria-label="View comments">
            💬 <span class="comment-count">${article.comments || 0}</span>
          </button>
          <button class="share-btn" data-article-id="${article.id}" aria-label="Share article">
            📤
          </button>
        </div>
      </div>
      
      ${article.isPremium && !options.isPremiumUser ? 
        '<div class="premium-overlay">🔒 Premium Content</div>' : ''
      }
    `;

    // Add click handler for full article view
    card.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        this.showArticleModal(article);
      }
    });

    return card;
  }

  /**
   * Show article in modal
   */
  showArticleModal(article) {
    const content = `
      <div class="article-modal-content">
        <div class="article-modal-header">
          <span class="article-category">${this.escapeHtml(article.category)}</span>
          <time class="article-time">${this.getTimeAgo(new Date(article.published_date))}</time>
        </div>
        
        <h2 class="article-modal-title">${this.escapeHtml(article.title)}</h2>
        
        <div class="article-modal-body">
          ${this.escapeHtml(article.content || article.excerpt || '')}
        </div>
        
        <div class="article-modal-footer">
          <div class="article-stats">
            <span>👁️ ${this.formatNumber(article.views || 0)} views</span>
            <span>📰 ${this.escapeHtml(article.source || 'Zone News')}</span>
          </div>
          
          ${article.channelUrl ? 
            `<a href="${article.channelUrl}" target="_blank" class="channel-link">
              View on Telegram 📱
            </a>` : ''
          }
        </div>
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Close</button>
      <button class="btn btn-primary share-article-btn" data-article-id="${article.id}">
        Share 📤
      </button>
    `;

    const modal = this.showModal(content, {
      title: 'Article Details',
      actions: actions
    });

    // Setup action handlers
    const shareBtn = modal.querySelector('.share-article-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        this.shareArticle(article);
      });
    }

    return modal;
  }

  /**
   * Create filter tabs
   */
  createFilterTabs(categories, activeCategory = 'all') {
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'filter-tabs';
    tabsContainer.setAttribute('role', 'tablist');

    Object.entries(categories).forEach(([key, config]) => {
      const tab = document.createElement('button');
      tab.className = `filter-tab ${key === activeCategory ? 'active' : ''}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', key === activeCategory);
      tab.setAttribute('data-category', key);
      tab.innerHTML = `
        <span class="tab-icon">${config.icon}</span>
        <span class="tab-label">${config.label}</span>
      `;

      tab.addEventListener('click', () => {
        this.setActiveTab(tabsContainer, tab);
        document.dispatchEvent(new CustomEvent(EVENTS.FILTER_CHANGED, {
          detail: { category: key }
        }));
      });

      tabsContainer.appendChild(tab);
    });

    return tabsContainer;
  }

  /**
   * Set active tab
   */
  setActiveTab(container, activeTab) {
    const tabs = container.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    });

    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
  }

  /**
   * Create bottom navigation
   */
  createBottomNavigation(tabs, activeTab = 'home') {
    const nav = document.createElement('nav');
    nav.className = 'bottom-navigation';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');

    Object.entries(tabs).forEach(([key, config]) => {
      const tab = document.createElement('button');
      tab.className = `nav-tab ${key === activeTab ? 'active' : ''}`;
      tab.setAttribute('data-tab', key);
      tab.innerHTML = `
        <span class="nav-icon">${config.icon}</span>
        <span class="nav-label">${config.label}</span>
        ${config.badge ? `<span class="nav-badge">${config.badge}</span>` : ''}
      `;

      tab.addEventListener('click', () => {
        this.setActiveNavTab(nav, tab);
        document.dispatchEvent(new CustomEvent(EVENTS.TAB_CHANGED, {
          detail: { tab: key }
        }));
      });

      nav.appendChild(tab);
    });

    return nav;
  }

  /**
   * Set active navigation tab
   */
  setActiveNavTab(nav, activeTab) {
    const tabs = nav.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.classList.remove('active');
    });
    activeTab.classList.add('active');
  }

  /**
   * Create progress bar
   */
  createProgressBar(current, max, label = '') {
    const progress = document.createElement('div');
    progress.className = 'progress-container';
    
    const percentage = Math.min((current / max) * 100, 100);
    
    progress.innerHTML = `
      <div class="progress-label">
        <span>${this.escapeHtml(label)}</span>
        <span>${current}/${max}</span>
      </div>
      <div class="progress-bar" role="progressbar" aria-valuenow="${current}" aria-valuemin="0" aria-valuemax="${max}">
        <div class="progress-fill" style="width: ${percentage}%"></div>
      </div>
    `;

    return progress;
  }

  /**
   * Update progress bar
   */
  updateProgressBar(progressBar, current, max) {
    const percentage = Math.min((current / max) * 100, 100);
    const fill = progressBar.querySelector('.progress-fill');
    const valueSpan = progressBar.querySelector('.progress-label span:last-child');
    
    fill.style.width = percentage + '%';
    valueSpan.textContent = `${current}/${max}`;
    
    progressBar.querySelector('.progress-bar').setAttribute('aria-valuenow', current);
  }

  /**
   * Enhanced share article with multiple options
   */
  async shareArticle(article, options = {}) {
    const { 
      shareType = 'native',
      customText = null,
      includeImage = true,
      trackSharing = true
    } = options;

    // Enhanced sharing content
    const shareData = this.prepareShareData(article, { customText, includeImage });
    
    try {
      switch (shareType) {
        case 'telegram':
          await this.shareToTelegram(shareData, article);
          break;
        case 'advanced':
          this.showAdvancedShareModal(article, shareData);
          break;
        case 'copy':
          await this.copyToClipboard(shareData.fullText);
          break;
        default:
          await this.nativeShare(shareData);
      }
      
      // Track sharing analytics
      if (trackSharing) {
        this.trackShareEvent(article, shareType);
      }
      
    } catch (error) {
      console.warn('Share failed:', error);
      this.showToast('Share failed. Please try again.', 'error');
    }
  }

  /**
   * Prepare enhanced share data
   */
  prepareShareData(article, options = {}) {
    const { customText, includeImage } = options;
    
    // Generate share URL with tracking parameters
    const shareUrl = this.generateShareUrl(article);
    
    // Create rich text content
    const shareText = customText || this.generateShareText(article);
    
    // Prepare image for sharing (if available)
    const shareImage = includeImage && article.image ? article.image : null;
    
    // Generate social media specific content
    const socialContent = {
      twitter: this.generateTwitterContent(article, shareUrl),
      facebook: this.generateFacebookContent(article, shareUrl),
      whatsapp: this.generateWhatsAppContent(article, shareUrl),
      telegram: this.generateTelegramContent(article, shareUrl),
      linkedin: this.generateLinkedInContent(article, shareUrl)
    };
    
    return {
      title: article.title,
      text: shareText,
      url: shareUrl,
      image: shareImage,
      fullText: `${shareText}\n\n${shareUrl}`,
      socialContent
    };
  }

  /**
   * Generate share URL with tracking
   */
  generateShareUrl(article) {
    const baseUrl = article.channelUrl || `${APP_CONFIG.API_BASE_URL}/article/${article.id}`;
    const params = new URLSearchParams({
      utm_source: 'telegram_mini_app',
      utm_medium: 'social_share',
      utm_campaign: 'zone_news',
      utm_content: article.category || 'general'
    });
    
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Generate enhanced share text
   */
  generateShareText(article) {
    const emoji = this.getCategoryEmoji(article.category);
    const readingTime = article.reading_time ? ` • ${article.reading_time} min read` : '';
    const excerpt = article.excerpt ? `\n\n${article.excerpt.substring(0, 150)}...` : '';
    
    return `${emoji} ${article.title}${readingTime}${excerpt}\n\n📍 Adelaide, SA • Zone News`;
  }

  /**
   * Native share API
   */
  async nativeShare(shareData) {
    if (navigator.share) {
      await navigator.share({
        title: shareData.title,
        text: shareData.text,
        url: shareData.url
      });
      this.showToast('Article shared successfully! 🚀', 'success');
    } else {
      await this.copyToClipboard(shareData.fullText);
    }
  }

  /**
   * Share to Telegram using WebApp API
   */
  async shareToTelegram(shareData, article) {
    if (window.Telegram?.WebApp) {
      try {
        // Use Telegram's native sharing
        window.Telegram.WebApp.openTelegramLink(
          `https://t.me/share/url?url=${encodeURIComponent(shareData.url)}&text=${encodeURIComponent(shareData.text)}`
        );
        this.showToast('Opening Telegram to share...', 'info');
      } catch (error) {
        // Fallback to advanced modal
        this.showAdvancedShareModal(article, shareData);
      }
    } else {
      // Fallback for non-Telegram environments
      this.showAdvancedShareModal(article, shareData);
    }
  }

  /**
   * Copy to clipboard with enhanced feedback
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Link copied to clipboard! 📋', 'success', 3000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showToast('Link copied! 📋', 'success', 3000);
    }
  }

  /**
   * Show advanced share modal with multiple options
   */
  showAdvancedShareModal(article, shareData) {
    const content = `
      <div class="advanced-share-container">
        <div class="share-preview">
          <div class="share-preview-header">
            <h3>${this.escapeHtml(article.title)}</h3>
            <span class="share-category">${this.escapeHtml(article.category || 'News')}</span>
          </div>
          <p class="share-preview-text">${this.escapeHtml(article.excerpt?.substring(0, 120) || '')}...</p>
          <div class="share-preview-meta">
            <span>📍 Adelaide, SA</span>
            <span>•</span>
            <span>Zone News</span>
          </div>
        </div>
        
        <div class="share-options">
          <h4>Share Options</h4>
          <div class="share-buttons-grid">
            <button class="share-platform-btn telegram-btn" data-platform="telegram">
              <span class="platform-icon">📱</span>
              <span class="platform-name">Telegram</span>
            </button>
            <button class="share-platform-btn whatsapp-btn" data-platform="whatsapp">
              <span class="platform-icon">💬</span>
              <span class="platform-name">WhatsApp</span>
            </button>
            <button class="share-platform-btn twitter-btn" data-platform="twitter">
              <span class="platform-icon">🐦</span>
              <span class="platform-name">Twitter</span>
            </button>
            <button class="share-platform-btn facebook-btn" data-platform="facebook">
              <span class="platform-icon">📘</span>
              <span class="platform-name">Facebook</span>
            </button>
            <button class="share-platform-btn linkedin-btn" data-platform="linkedin">
              <span class="platform-icon">💼</span>
              <span class="platform-name">LinkedIn</span>
            </button>
            <button class="share-platform-btn copy-btn" data-platform="copy">
              <span class="platform-icon">📋</span>
              <span class="platform-name">Copy Link</span>
            </button>
          </div>
        </div>
        
        <div class="share-customization">
          <h4>Customize Message</h4>
          <textarea 
            class="share-custom-text" 
            placeholder="Add your own message..."
            maxlength="500"
          >${shareData.text}</textarea>
          <div class="text-counter">
            <span class="char-count">0</span>/500 characters
          </div>
        </div>
        
        <div class="share-analytics">
          <div class="share-stat">
            <span class="stat-icon">👁️</span>
            <span>Views: ${this.formatNumber(article.views || 0)}</span>
          </div>
          <div class="share-stat">
            <span class="stat-icon">📤</span>
            <span>Shares: ${this.formatNumber(article.shares || 0)}</span>
          </div>
          <div class="share-stat">
            <span class="stat-icon">👍</span>
            <span>Reactions: ${this.formatNumber(Object.values(article.reactions || {}).reduce((a, b) => a + b, 0))}</span>
          </div>
        </div>
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Cancel</button>
      <button class="btn btn-primary share-confirm-btn">Share Now 🚀</button>
    `;

    const modal = this.showModal(content, {
      title: '📤 Share Article',
      actions,
      className: 'share-modal'
    });

    // Setup advanced share handlers
    this.setupAdvancedShareHandlers(modal, article, shareData);
    
    return modal;
  }

  /**
   * Setup advanced share modal handlers
   */
  setupAdvancedShareHandlers(modal, article, shareData) {
    const customTextArea = modal.querySelector('.share-custom-text');
    const charCount = modal.querySelector('.char-count');
    const shareButtons = modal.querySelectorAll('.share-platform-btn');
    const confirmBtn = modal.querySelector('.share-confirm-btn');
    
    let selectedPlatform = null;
    let customText = shareData.text;

    // Character counter
    if (customTextArea && charCount) {
      customTextArea.addEventListener('input', (e) => {
        const length = e.target.value.length;
        charCount.textContent = length;
        customText = e.target.value;
        
        // Visual feedback for character limit
        charCount.parentElement.classList.toggle('limit-warning', length > 450);
        charCount.parentElement.classList.toggle('limit-error', length > 500);
      });
      
      // Initial count
      charCount.textContent = customText.length;
    }

    // Platform selection
    shareButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remove previous selection
        shareButtons.forEach(b => b.classList.remove('selected'));
        
        // Select current platform
        btn.classList.add('selected');
        selectedPlatform = btn.dataset.platform;
        
        // Update confirm button
        if (confirmBtn) {
          confirmBtn.textContent = `Share to ${btn.querySelector('.platform-name').textContent} 🚀`;
          confirmBtn.disabled = false;
        }
      });
    });

    // Confirm share
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.addEventListener('click', async () => {
        if (selectedPlatform) {
          const updatedShareData = { ...shareData, text: customText };
          await this.executePlatformShare(selectedPlatform, updatedShareData, article);
          this.hideModal();
        }
      });
    }
  }

  /**
   * Execute platform-specific sharing
   */
  async executePlatformShare(platform, shareData, article) {
    const content = shareData.socialContent[platform] || shareData;
    
    switch (platform) {
      case 'telegram':
        window.open(`https://t.me/share/url?url=${encodeURIComponent(shareData.url)}&text=${encodeURIComponent(content.text || shareData.text)}`, '_blank');
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(`${content.text || shareData.text}\n\n${shareData.url}`)}`, '_blank');
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(content.text || shareData.text)}&url=${encodeURIComponent(shareData.url)}`, '_blank');
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}&quote=${encodeURIComponent(content.text || shareData.text)}`, '_blank');
        break;
      case 'linkedin':
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareData.url)}&title=${encodeURIComponent(shareData.title)}&summary=${encodeURIComponent(content.text || shareData.text)}`, '_blank');
        break;
      case 'copy':
        await this.copyToClipboard(shareData.fullText);
        return;
    }
    
    this.showToast(`Opening ${platform}...`, 'info', 2000);
    this.trackShareEvent(article, platform);
  }

  /**
   * Generate platform-specific content
   */
  generateTwitterContent(article, shareUrl) {
    const hashtags = this.generateHashtags(article);
    const text = `📰 ${article.title}${hashtags}\n\nRead more on Zone News Adelaide`;
    return { text, url: shareUrl };
  }

  generateFacebookContent(article, shareUrl) {
    const text = `📰 ${article.title}\n\n${article.excerpt?.substring(0, 100) || ''}...\n\n#ZoneNews #Adelaide`;
    return { text, url: shareUrl };
  }

  generateWhatsAppContent(article, shareUrl) {
    const emoji = this.getCategoryEmoji(article.category);
    const text = `${emoji} *${article.title}*\n\n${article.excerpt?.substring(0, 120) || ''}...\n\n📍 Adelaide News • Zone News`;
    return { text, url: shareUrl };
  }

  generateTelegramContent(article, shareUrl) {
    const text = `📰 *${article.title}*\n\n${article.excerpt?.substring(0, 150) || ''}...\n\n📍 Adelaide, SA\n🔗 Zone News`;
    return { text, url: shareUrl };
  }

  generateLinkedInContent(article, shareUrl) {
    const text = `📰 ${article.title}\n\n${article.excerpt?.substring(0, 200) || ''}...\n\nStay informed with Adelaide's local news. #Adelaide #News #Australia`;
    return { text, url: shareUrl };
  }

  /**
   * Generate hashtags for article
   */
  generateHashtags(article) {
    const categoryTags = {
      'local': '#Adelaide #Local',
      'business': '#Business #Adelaide',
      'sports': '#Sports #Adelaide',
      'health': '#Health #Wellness'
    };
    
    return ` ${categoryTags[article.category] || '#Adelaide'} #ZoneNews`;
  }

  /**
   * Get category emoji
   */
  getCategoryEmoji(category) {
    const emojis = {
      'local': '🏛️',
      'business': '💼',
      'sports': '⚽',
      'health': '🏥',
      'technology': '💻',
      'entertainment': '🎭'
    };
    
    return emojis[category] || '📰';
  }

  /**
   * Track share events
   */
  trackShareEvent(article, platform) {
    // Send tracking data to analytics
    if (window.gtag) {
      window.gtag('event', 'share', {
        'event_category': 'social',
        'event_label': platform,
        'value': article.id
      });
    }
    
    // Custom analytics tracking
    console.log(`📊 Share tracked: ${article.id} via ${platform}`);
  }

  /**
   * Utility: Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Utility: Format number
   */
  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Utility: Get time ago
   */
  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Animate element
   */
  animate(element, animation, duration = APP_CONFIG.ANIMATION_DURATION) {
    return new Promise((resolve) => {
      element.style.animation = `${animation} ${duration}ms ease-in-out`;
      
      const handleAnimationEnd = () => {
        element.style.animation = '';
        element.removeEventListener('animationend', handleAnimationEnd);
        resolve();
      };
      
      element.addEventListener('animationend', handleAnimationEnd);
    });
  }

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function
   */
  throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}