/**
 * Zone News Mini App - Advanced Sharing UI Components
 * Lazy-loaded sharing functionality with platform integrations
 */

'use strict';

import { APP_CONFIG } from './config.js';

// ===== ADVANCED SHARING COMPONENTS =====
export class UISharingComponents {
  constructor(coreUI) {
    this.core = coreUI;
    this.shareCache = new Map();
    this.shareAnalytics = [];
    
    // Performance tracking
    this.performanceMetrics = {
      shareModalOpens: 0,
      shareCompletions: 0,
      platformUsage: {},
      avgOpenTime: 0
    };
    
    console.log('📤 Advanced sharing module loaded');
  }

  /**
   * Enhanced share article with multiple options
   */
  async shareArticle(article, options = {}) {
    const { 
      shareType = 'advanced',
      customText = null,
      includeImage = true,
      trackSharing = true
    } = options;

    // Track share modal open
    const startTime = performance.now();
    this.performanceMetrics.shareModalOpens++;

    // Enhanced sharing content
    const shareData = this.prepareShareData(article, { customText, includeImage });
    
    try {
      switch (shareType) {
        case 'telegram':
          await this.shareToTelegram(shareData, article);
          break;
        case 'advanced':
          this.showAdvancedShareModal(article, shareData, startTime);
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
      this.core.showToast('Share failed. Please try again.', 'error');
    }
  }

  /**
   * Prepare enhanced share data with caching
   */
  prepareShareData(article, options = {}) {
    // Check cache first
    const cacheKey = `${article.id}_${JSON.stringify(options)}`;
    if (this.shareCache.has(cacheKey)) {
      return this.shareCache.get(cacheKey);
    }

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
    
    const shareData = {
      title: article.title,
      text: shareText,
      url: shareUrl,
      image: shareImage,
      fullText: `${shareText}\n\n${shareUrl}`,
      socialContent
    };

    // Cache the result (with TTL)
    this.shareCache.set(cacheKey, shareData);
    setTimeout(() => this.shareCache.delete(cacheKey), 5 * 60 * 1000); // 5 min TTL

    return shareData;
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
      utm_content: article.category || 'general',
      share_time: Date.now()
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
   * Show advanced share modal with multiple options
   */
  showAdvancedShareModal(article, shareData, startTime) {
    const content = `
      <div class="advanced-share-container">
        <div class="share-preview">
          <div class="share-preview-header">
            <h3>${this.core.escapeHtml(article.title)}</h3>
            <span class="share-category">${this.core.escapeHtml(article.category || 'News')}</span>
          </div>
          <p class="share-preview-text">${this.core.escapeHtml(article.excerpt?.substring(0, 120) || '')}...</p>
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
            <span class="char-count">${shareData.text.length}</span>/500 characters
          </div>
        </div>
        
        <div class="share-analytics">
          <div class="share-stat">
            <span class="stat-icon">👁️</span>
            <span>Views: ${this.core.formatNumber(article.views || 0)}</span>
          </div>
          <div class="share-stat">
            <span class="stat-icon">📤</span>
            <span>Shares: ${this.core.formatNumber(article.shares || 0)}</span>
          </div>
          <div class="share-stat">
            <span class="stat-icon">👍</span>
            <span>Reactions: ${this.core.formatNumber(Object.values(article.reactions || {}).reduce((a, b) => a + b, 0))}</span>
          </div>
        </div>
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Cancel</button>
      <button class="btn btn-primary share-confirm-btn">Share Now 🚀</button>
    `;

    const modal = this.core.showModal(content, {
      title: '📤 Share Article',
      actions,
      className: 'share-modal'
    });

    // Setup advanced share handlers
    this.setupAdvancedShareHandlers(modal, article, shareData, startTime);
    
    return modal;
  }

  /**
   * Setup advanced share modal handlers
   */
  setupAdvancedShareHandlers(modal, article, shareData, startTime) {
    const customTextArea = modal.querySelector('.share-custom-text');
    const charCount = modal.querySelector('.char-count');
    const shareButtons = modal.querySelectorAll('.share-platform-btn');
    const confirmBtn = modal.querySelector('.share-confirm-btn');
    
    let selectedPlatform = null;
    let customText = shareData.text;

    // Character counter with performance optimization
    if (customTextArea && charCount) {
      const updateCounter = this.core.debounce((e) => {
        const length = e.target.value.length;
        charCount.textContent = length;
        customText = e.target.value;
        
        // Visual feedback for character limit
        charCount.parentElement.classList.toggle('limit-warning', length > 450);
        charCount.parentElement.classList.toggle('limit-error', length > 500);
      }, 100);

      customTextArea.addEventListener('input', updateCounter);
      
      // Initial count
      charCount.textContent = customText.length;
    }

    // Platform selection with visual feedback
    shareButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remove previous selection
        shareButtons.forEach(b => b.classList.remove('selected'));
        
        // Select current platform
        btn.classList.add('selected');
        selectedPlatform = btn.dataset.platform;
        
        // Track platform selection
        this.trackPlatformSelection(selectedPlatform);
        
        // Haptic feedback if available
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.selectionChanged();
        }
        
        // Update confirm button
        if (confirmBtn) {
          confirmBtn.textContent = `Share to ${btn.querySelector('.platform-name').textContent} 🚀`;
          confirmBtn.disabled = false;
        }
      });
    });

    // Confirm share with performance tracking
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.addEventListener('click', async () => {
        if (selectedPlatform) {
          const updatedShareData = { ...shareData, text: customText };
          
          // Track time to share completion
          const timeToShare = performance.now() - startTime;
          this.performanceMetrics.avgOpenTime = 
            (this.performanceMetrics.avgOpenTime + timeToShare) / 2;
          
          await this.executePlatformShare(selectedPlatform, updatedShareData, article);
          this.core.hideModal(modal);
        }
      });
    }

    // Quick share buttons (double-click for instant share)
    shareButtons.forEach(btn => {
      let clickCount = 0;
      btn.addEventListener('click', () => {
        clickCount++;
        setTimeout(() => {
          if (clickCount === 2) {
            // Double-click detected - instant share
            const platform = btn.dataset.platform;
            this.executePlatformShare(platform, shareData, article);
            this.core.hideModal(modal);
          }
          clickCount = 0;
        }, 300);
      });
    });

    // Keyboard shortcuts
    modal.addEventListener('keydown', (e) => {
      const shortcuts = {
        't': 'telegram',
        'w': 'whatsapp', 
        'x': 'twitter',
        'f': 'facebook',
        'l': 'linkedin',
        'c': 'copy'
      };
      
      if (e.key.toLowerCase() in shortcuts && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const platform = shortcuts[e.key.toLowerCase()];
        this.executePlatformShare(platform, { ...shareData, text: customText }, article);
        this.core.hideModal(modal);
      }
    });
  }

  /**
   * Execute platform-specific sharing with error handling
   */
  async executePlatformShare(platform, shareData, article) {
    try {
      const content = shareData.socialContent[platform] || shareData;
      
      // Track platform usage
      this.performanceMetrics.platformUsage[platform] = 
        (this.performanceMetrics.platformUsage[platform] || 0) + 1;
      
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
      
      this.core.showToast(`Opening ${platform}...`, 'info', 2000);
      this.trackShareEvent(article, platform);
      this.performanceMetrics.shareCompletions++;
      
    } catch (error) {
      console.error(`Failed to share to ${platform}:`, error);
      this.core.showToast(`Failed to open ${platform}. Trying copy instead...`, 'warning');
      await this.copyToClipboard(shareData.fullText);
    }
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
      'health': '#Health #Wellness',
      'technology': '#Tech #Innovation',
      'entertainment': '#Entertainment #Arts'
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
   * Native share API
   */
  async nativeShare(shareData) {
    if (navigator.share) {
      await navigator.share({
        title: shareData.title,
        text: shareData.text,
        url: shareData.url
      });
      this.core.showToast('Article shared successfully! 🚀', 'success');
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
        this.core.showToast('Opening Telegram to share...', 'info');
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
      this.core.showToast('Link copied to clipboard! 📋', 'success', 3000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.core.showToast('Link copied! 📋', 'success', 3000);
    }
  }

  /**
   * Track share events with batching
   */
  trackShareEvent(article, platform) {
    const event = {
      timestamp: Date.now(),
      articleId: article.id,
      platform,
      category: article.category,
      userId: window.app?.telegram?.getUserInfo()?.id || 'anonymous'
    };

    // Add to analytics batch
    this.shareAnalytics.push(event);

    // Send to analytics if available
    if (window.gtag) {
      window.gtag('event', 'share', {
        'event_category': 'social',
        'event_label': platform,
        'value': article.id
      });
    }

    // Batch send analytics (reduce API calls)
    if (this.shareAnalytics.length >= 5) {
      this.flushAnalytics();
    }

    console.log(`📊 Share tracked: ${article.id} via ${platform}`);
  }

  /**
   * Track platform selection for analytics
   */
  trackPlatformSelection(platform) {
    // Track which platforms users consider but don't complete
    if (window.gtag) {
      window.gtag('event', 'share_platform_selected', {
        'event_category': 'user_interaction',
        'event_label': platform
      });
    }
  }

  /**
   * Flush analytics batch
   */
  async flushAnalytics() {
    if (this.shareAnalytics.length === 0) return;

    try {
      // Send batch to analytics endpoint
      if (window.fetch) {
        await fetch('/api/analytics/share-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            events: this.shareAnalytics,
            timestamp: Date.now()
          })
        });
      }
      
      // Clear batch
      this.shareAnalytics = [];
      
    } catch (error) {
      console.warn('Failed to send share analytics:', error);
    }
  }

  /**
   * Get sharing performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheSize: this.shareCache.size,
      pendingAnalytics: this.shareAnalytics.length,
      mostPopularPlatform: Object.entries(this.performanceMetrics.platformUsage)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none'
    };
  }

  /**
   * Clear cache and analytics (memory management)
   */
  cleanup() {
    this.shareCache.clear();
    this.flushAnalytics();
    console.log('📤 Sharing module cleaned up');
  }
}