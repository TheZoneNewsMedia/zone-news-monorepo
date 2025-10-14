/**
 * Zone News Mini App - Premium Features Manager
 * Handles premium feature gating, usage tracking, and upgrade prompts
 */

'use strict';

import { APP_CONFIG, APP_STATE, EVENTS } from './config.js';

// ===== PREMIUM FEATURES MANAGER =====
export class PremiumFeaturesManager {
  constructor(coreUI) {
    this.core = coreUI;
    this.storageKey = 'zone_premium_data';
    this.usageStorageKey = 'zone_daily_usage';
    this.loadPremiumStatus();
    this.loadDailyUsage();
    this.setupEventListeners();
    console.log('💎 Premium Features Manager initialized');
  }

  /**
   * Setup event listeners for premium feature management
   */
  setupEventListeners() {
    // Listen for feature restriction events
    document.addEventListener(EVENTS.FEATURE_RESTRICTED, (e) => {
      this.showUpgradePrompt(e.detail.feature, e.detail.context);
    });

    // Listen for premium upgrade requests
    document.addEventListener(EVENTS.PREMIUM_UPGRADE_REQUESTED, (e) => {
      this.showUpgradeModal(e.detail.feature);
    });

    // Reset daily usage at midnight
    this.setupDailyReset();
  }

  /**
   * Check if user can access a premium feature
   */
  canAccessFeature(featureName, action = 'use') {
    const userTier = this.getUserTier();
    const feature = APP_CONFIG.PREMIUM_FEATURES[featureName];
    
    if (!feature || !feature.enabled) {
      return { allowed: false, reason: 'feature_disabled' };
    }

    // Check if user has premium access
    if (this.isPremiumUser()) {
      // Premium users have access to all features
      if (feature.premiumUnlimited) {
        return { allowed: true, tier: userTier };
      }
      
      // Check premium-specific limits
      const tierLimits = APP_CONFIG.USER_TIERS[userTier].limits;
      const dailyUsage = this.getDailyUsage();
      
      if (tierLimits[featureName] === -1) {
        return { allowed: true, tier: userTier }; // Unlimited
      }
      
      if (dailyUsage[featureName] < tierLimits[featureName]) {
        return { allowed: true, tier: userTier, remaining: tierLimits[featureName] - dailyUsage[featureName] };
      }
      
      return { allowed: false, reason: 'premium_limit_exceeded', used: dailyUsage[featureName], limit: tierLimits[featureName] };
    }

    // Free user checks
    const freeLimit = feature.freeLimit || 0;
    const dailyUsage = this.getDailyUsage();
    
    if (dailyUsage[featureName] < freeLimit) {
      return { 
        allowed: true, 
        tier: 'free', 
        remaining: freeLimit - dailyUsage[featureName],
        isNearLimit: (freeLimit - dailyUsage[featureName]) <= 1
      };
    }

    return { 
      allowed: false, 
      reason: 'free_limit_exceeded', 
      used: dailyUsage[featureName], 
      limit: freeLimit 
    };
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(featureName, metadata = {}) {
    const dailyUsage = this.getDailyUsage();
    
    // Increment usage count
    dailyUsage[featureName] = (dailyUsage[featureName] || 0) + 1;
    dailyUsage.lastReset = new Date().toDateString();
    
    // Save to storage
    this.saveDailyUsage(dailyUsage);
    
    // Update app state
    APP_STATE.dailyUsage = dailyUsage;
    
    // Analytics tracking
    this.trackFeatureAnalytics(featureName, metadata);
    
    console.log(`📊 Feature usage tracked: ${featureName} (${dailyUsage[featureName]} uses today)`);
  }

  /**
   * Check if user can comment on article
   */
  canComment(articleId = null) {
    const access = this.canAccessFeature('comments');
    
    if (!access.allowed) {
      // Dispatch restriction event
      document.dispatchEvent(new CustomEvent(EVENTS.FEATURE_RESTRICTED, {
        detail: {
          feature: 'comments',
          reason: access.reason,
          context: { articleId }
        }
      }));
    }
    
    return access;
  }

  /**
   * Handle comment submission with premium gating
   */
  async handleCommentSubmission(commentData) {
    const access = this.canComment(commentData.articleId);
    
    if (!access.allowed) {
      return { success: false, error: this.getRestrictionMessage('comments', access) };
    }

    try {
      // Track usage before submission
      this.trackFeatureUsage('comments', {
        articleId: commentData.articleId,
        length: commentData.content.length,
        anonymous: commentData.anonymous
      });

      // Submit comment (would normally go to API)
      const result = await this.submitComment(commentData);
      
      // Show success with remaining usage info
      if (access.remaining !== undefined) {
        const message = access.tier === 'free' 
          ? `Comment posted! ${access.remaining - 1} comments remaining today.`
          : 'Comment posted successfully!';
        
        this.core.showToast(message, 'success');
      }
      
      return { success: true, data: result };
      
    } catch (error) {
      console.error('Comment submission failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Show upgrade prompt for restricted features
   */
  showUpgradePrompt(featureName, context = {}) {
    const feature = APP_CONFIG.PREMIUM_FEATURES[featureName];
    const access = this.canAccessFeature(featureName);
    
    let message = '';
    let title = '';
    
    switch (access.reason) {
      case 'free_limit_exceeded':
        title = '🔒 Daily Limit Reached';
        message = `You've used all ${access.limit} ${featureName} for today. Upgrade to Premium for unlimited access!`;
        break;
      case 'premium_limit_exceeded':
        title = '📊 Usage Limit Reached';
        message = `You've reached your ${featureName} limit. Consider upgrading to Pro for unlimited access.`;
        break;
      default:
        title = '💎 Premium Feature';
        message = `This feature requires a Premium subscription. Upgrade now for unlimited ${featureName}!`;
    }

    const content = `
      <div class="upgrade-prompt">
        <div class="upgrade-icon">💎</div>
        <p class="upgrade-message">${this.core.escapeHtml(message)}</p>
        
        <div class="upgrade-benefits">
          <h4>Premium Benefits:</h4>
          <ul>
            <li>✅ Unlimited comments and searches</li>
            <li>✅ Save up to 100 articles</li>
            <li>✅ Advanced search filters</li>
            <li>✅ Priority support</li>
          </ul>
        </div>
        
        <div class="upgrade-pricing">
          <div class="price-option">
            <span class="price">$4.99/month</span>
            <span class="savings">Most Popular</span>
          </div>
        </div>
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Maybe Later</button>
      <button class="btn btn-primary upgrade-now-btn">Upgrade Now 💎</button>
    `;

    const modal = this.core.showModal(content, {
      title: title,
      actions: actions,
      className: 'upgrade-modal'
    });

    // Setup upgrade button handler
    const upgradeBtn = modal.querySelector('.upgrade-now-btn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => {
        this.initiateUpgrade(featureName);
        this.core.hideModal(modal);
      });
    }

    return modal;
  }

  /**
   * Show detailed upgrade modal with pricing plans
   */
  showUpgradeModal(triggeredBy = null) {
    const content = `
      <div class="upgrade-plans">
        <div class="upgrade-header">
          <h3>Choose Your Plan</h3>
          <p>Unlock the full Zone News experience</p>
        </div>
        
        <div class="plans-grid">
          <div class="plan-card free-plan">
            <div class="plan-header">
              <h4>Free</h4>
              <div class="plan-price">$0<span>/month</span></div>
            </div>
            <div class="plan-features">
              <div class="feature">✅ 3 comments per day</div>
              <div class="feature">✅ 10 searches per day</div>
              <div class="feature">✅ Save 10 articles</div>
              <div class="feature">✅ Basic notifications</div>
            </div>
            <button class="btn btn-secondary plan-btn" disabled>Current Plan</button>
          </div>
          
          <div class="plan-card premium-plan featured">
            <div class="plan-badge">Most Popular</div>
            <div class="plan-header">
              <h4>Premium</h4>
              <div class="plan-price">$4.99<span>/month</span></div>
            </div>
            <div class="plan-features">
              <div class="feature">✅ Unlimited comments</div>
              <div class="feature">✅ Unlimited searches</div>
              <div class="feature">✅ Save 100 articles</div>
              <div class="feature">✅ Advanced search filters</div>
              <div class="feature">✅ Priority support</div>
              <div class="feature">✅ Offline reading</div>
            </div>
            <button class="btn btn-primary plan-btn premium-upgrade-btn">Upgrade to Premium</button>
          </div>
          
          <div class="plan-card pro-plan">
            <div class="plan-header">
              <h4>Pro</h4>
              <div class="plan-price">$9.99<span>/month</span></div>
            </div>
            <div class="plan-features">
              <div class="feature">✅ Everything in Premium</div>
              <div class="feature">✅ Unlimited saved articles</div>
              <div class="feature">✅ Advanced analytics</div>
              <div class="feature">✅ Custom categories</div>
              <div class="feature">✅ Early access features</div>
            </div>
            <button class="btn btn-primary plan-btn pro-upgrade-btn">Upgrade to Pro</button>
          </div>
        </div>
        
        <div class="upgrade-footer">
          <p>💳 Secure payment via Telegram • Cancel anytime</p>
        </div>
      </div>
    `;

    const actions = `
      <button class="btn btn-secondary modal-close-btn">Not Now</button>
    `;

    const modal = this.core.showModal(content, {
      title: '💎 Upgrade Zone News',
      actions: actions,
      className: 'upgrade-plans-modal'
    });

    // Setup plan selection handlers
    const premiumBtn = modal.querySelector('.premium-upgrade-btn');
    const proBtn = modal.querySelector('.pro-upgrade-btn');

    if (premiumBtn) {
      premiumBtn.addEventListener('click', () => {
        this.initiateUpgrade('premium', triggeredBy);
        this.core.hideModal(modal);
      });
    }

    if (proBtn) {
      proBtn.addEventListener('click', () => {
        this.initiateUpgrade('pro', triggeredBy);
        this.core.hideModal(modal);
      });
    }

    return modal;
  }

  /**
   * Initiate premium upgrade process
   */
  async initiateUpgrade(planType, triggeredBy = null) {
    try {
      // Show loading state
      this.core.showToast('Opening payment...', 'info');

      // In a real implementation, this would integrate with Telegram Payments
      if (window.Telegram?.WebApp?.openInvoice) {
        // Use Telegram's payment system
        const invoice = await this.createInvoice(planType);
        window.Telegram.WebApp.openInvoice(invoice.url);
      } else {
        // Fallback to web payment
        this.showPaymentForm(planType);
      }

      // Track upgrade attempt
      this.trackUpgradeAttempt(planType, triggeredBy);

    } catch (error) {
      console.error('Upgrade initiation failed:', error);
      this.core.showToast('Failed to open payment. Please try again.', 'error');
    }
  }

  /**
   * Create payment invoice for Telegram
   */
  async createInvoice(planType) {
    const planConfig = APP_CONFIG.USER_TIERS[planType];
    
    return {
      title: `Zone News ${planConfig.name}`,
      description: `Monthly subscription to Zone News ${planConfig.name}`,
      payload: JSON.stringify({
        type: 'subscription',
        plan: planType,
        userId: this.getUserId()
      }),
      provider_token: process.env.TELEGRAM_PAYMENT_TOKEN,
      currency: 'USD',
      prices: [{
        label: `${planConfig.name} Monthly`,
        amount: Math.round(planConfig.price * 100) // Convert to cents
      }]
    };
  }

  /**
   * Get restriction message for UI display
   */
  getRestrictionMessage(featureName, access) {
    switch (access.reason) {
      case 'free_limit_exceeded':
        return `Daily ${featureName} limit reached (${access.used}/${access.limit}). Upgrade for unlimited access!`;
      case 'premium_limit_exceeded':
        return `${featureName.charAt(0).toUpperCase() + featureName.slice(1)} limit reached. Consider upgrading for more access.`;
      case 'feature_disabled':
        return `${featureName.charAt(0).toUpperCase() + featureName.slice(1)} feature is currently unavailable.`;
      default:
        return `Premium subscription required for ${featureName}.`;
    }
  }

  /**
   * Load premium status from storage
   */
  loadPremiumStatus() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        APP_STATE.premiumStatus = data;
        APP_STATE.userTier = data.tier || 'free';
      }
    } catch (error) {
      console.warn('Failed to load premium status:', error);
    }
  }

  /**
   * Load daily usage from storage
   */
  loadDailyUsage() {
    try {
      const stored = localStorage.getItem(this.usageStorageKey);
      if (stored) {
        const data = JSON.parse(stored);
        
        // Check if we need to reset daily usage
        const today = new Date().toDateString();
        if (data.lastReset !== today) {
          this.resetDailyUsage();
        } else {
          APP_STATE.dailyUsage = data;
        }
      }
    } catch (error) {
      console.warn('Failed to load daily usage:', error);
      this.resetDailyUsage();
    }
  }

  /**
   * Save daily usage to storage
   */
  saveDailyUsage(usage) {
    try {
      localStorage.setItem(this.usageStorageKey, JSON.stringify(usage));
    } catch (error) {
      console.warn('Failed to save daily usage:', error);
    }
  }

  /**
   * Reset daily usage counters
   */
  resetDailyUsage() {
    const resetUsage = {
      comments: 0,
      searches: 0,
      lastReset: new Date().toDateString()
    };
    
    APP_STATE.dailyUsage = resetUsage;
    this.saveDailyUsage(resetUsage);
    console.log('📊 Daily usage counters reset');
  }

  /**
   * Setup automatic daily reset at midnight
   */
  setupDailyReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.resetDailyUsage();
      
      // Set up recurring daily reset
      setInterval(() => {
        this.resetDailyUsage();
      }, 24 * 60 * 60 * 1000); // Every 24 hours
      
    }, msUntilMidnight);
  }

  /**
   * Utility methods
   */
  isPremiumUser() {
    return APP_STATE.userTier === 'premium' || APP_STATE.userTier === 'pro';
  }

  getUserTier() {
    return APP_STATE.userTier || 'free';
  }

  getDailyUsage() {
    return APP_STATE.dailyUsage || { comments: 0, searches: 0, lastReset: new Date().toDateString() };
  }

  getUserId() {
    return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anonymous';
  }

  /**
   * Mock comment submission (would integrate with actual API)
   */
  async submitComment(commentData) {
    // Simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: Date.now(),
          ...commentData,
          status: 'posted'
        });
      }, 500);
    });
  }

  /**
   * Track feature analytics
   */
  trackFeatureAnalytics(featureName, metadata) {
    // Analytics tracking would go here
    if (window.gtag) {
      window.gtag('event', 'feature_usage', {
        'event_category': 'premium',
        'event_label': featureName,
        'value': 1,
        'custom_map': {
          'user_tier': this.getUserTier(),
          'feature_metadata': JSON.stringify(metadata)
        }
      });
    }
  }

  /**
   * Track upgrade attempts
   */
  trackUpgradeAttempt(planType, triggeredBy) {
    if (window.gtag) {
      window.gtag('event', 'upgrade_attempt', {
        'event_category': 'conversion',
        'event_label': planType,
        'value': APP_CONFIG.USER_TIERS[planType].price,
        'custom_map': {
          'triggered_by': triggeredBy,
          'current_tier': this.getUserTier()
        }
      });
    }
  }

  /**
   * Get premium status for display
   */
  getPremiumStatus() {
    return {
      tier: this.getUserTier(),
      isPremium: this.isPremiumUser(),
      dailyUsage: this.getDailyUsage(),
      features: APP_CONFIG.USER_TIERS[this.getUserTier()].features
    };
  }
}

// Export for use in other modules
export default PremiumFeaturesManager;