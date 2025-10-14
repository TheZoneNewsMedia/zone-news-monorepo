/**
 * Zone News Mini App - Telegram Integration
 * Handles Telegram WebApp API integration
 */

'use strict';

import { APP_CONFIG, ERROR_TYPES } from './config.js';

// ===== TELEGRAM WEB APP INTEGRATION =====
export class TelegramWebApp {
  constructor() {
    this.webApp = window.Telegram?.WebApp;
    this.user = this.webApp?.initDataUnsafe?.user;
    this.isAvailable = !!this.webApp;
    
    if (this.isAvailable) {
      this.initialize();
    }
  }

  initialize() {
    try {
      // Configure WebApp
      this.webApp.ready();
      this.webApp.expand();
      this.webApp.enableClosingConfirmation();
      
      // Set header color
      if (this.webApp.setHeaderColor) {
        this.webApp.setHeaderColor('#1e3a8a');
      }
      
      // Setup main button
      this.webApp.MainButton.text = 'Refresh News';
      this.webApp.MainButton.onClick(() => {
        window.dispatchEvent(new CustomEvent('telegram:refresh'));
      });
      
      console.log('✅ Telegram WebApp initialized successfully');
    } catch (error) {
      console.warn('⚠️ Telegram WebApp initialization failed:', error);
    }
  }

  showMainButton(text = 'Refresh News') {
    if (this.isAvailable) {
      this.webApp.MainButton.text = text;
      this.webApp.MainButton.show();
    }
  }

  hideMainButton() {
    if (this.isAvailable) {
      this.webApp.MainButton.hide();
    }
  }

  hapticFeedback(type = 'impact', style = 'medium') {
    if (this.isAvailable && this.webApp.HapticFeedback) {
      try {
        if (type === 'impact') {
          this.webApp.HapticFeedback.impactOccurred(style);
        } else if (type === 'notification') {
          this.webApp.HapticFeedback.notificationOccurred(style);
        } else if (type === 'selection') {
          this.webApp.HapticFeedback.selectionChanged();
        }
      } catch (error) {
        console.warn('Haptic feedback failed:', error);
      }
    }
  }

  openLink(url, options = {}) {
    if (this.isAvailable) {
      this.webApp.openLink(url, options);
    } else {
      window.open(url, '_blank');
    }
  }

  openTelegramLink(url) {
    if (this.isAvailable) {
      this.webApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  }

  share(url, text = '') {
    const shareText = text ? `${text}\n\n${url}` : url;
    
    if (navigator.share) {
      return navigator.share({
        title: 'Zone News',
        text: shareText,
        url: url
      });
    } else if (navigator.clipboard) {
      return navigator.clipboard.writeText(shareText).then(() => {
        this.showAlert('Link copied to clipboard! 📋');
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showAlert('Link copied to clipboard! 📋');
    }
  }

  showAlert(message) {
    if (this.isAvailable && this.webApp.showAlert) {
      this.webApp.showAlert(message);
    } else {
      alert(message);
    }
  }

  showConfirm(message) {
    if (this.isAvailable && this.webApp.showConfirm) {
      return new Promise((resolve) => {
        this.webApp.showConfirm(message, resolve);
      });
    } else {
      return Promise.resolve(confirm(message));
    }
  }

  showPopup(params) {
    if (this.isAvailable && this.webApp.showPopup) {
      return new Promise((resolve) => {
        this.webApp.showPopup(params, resolve);
      });
    } else {
      return Promise.resolve(alert(params.message));
    }
  }

  getUserInfo() {
    if (this.user) {
      return {
        id: this.user.id,
        firstName: this.user.first_name,
        lastName: this.user.last_name,
        username: this.user.username,
        languageCode: this.user.language_code,
        isPremium: this.user.is_premium || false
      };
    }
    return null;
  }

  getThemeParams() {
    if (this.isAvailable) {
      return this.webApp.themeParams;
    }
    return {};
  }

  applyTheme() {
    const theme = this.getThemeParams();
    if (Object.keys(theme).length === 0) return;

    const root = document.documentElement;
    
    // Apply Telegram theme colors
    if (theme.bg_color) root.style.setProperty('--tg-bg-color', theme.bg_color);
    if (theme.text_color) root.style.setProperty('--tg-text-color', theme.text_color);
    if (theme.hint_color) root.style.setProperty('--tg-hint-color', theme.hint_color);
    if (theme.link_color) root.style.setProperty('--tg-link-color', theme.link_color);
    if (theme.button_color) root.style.setProperty('--tg-button-color', theme.button_color);
    if (theme.button_text_color) root.style.setProperty('--tg-button-text-color', theme.button_text_color);
  }

  close() {
    if (this.isAvailable) {
      this.webApp.close();
    }
  }

  // Event handlers
  onMainButtonClick(callback) {
    if (this.isAvailable) {
      this.webApp.MainButton.onClick(callback);
    }
  }

  onThemeChanged(callback) {
    if (this.isAvailable) {
      this.webApp.onEvent('themeChanged', callback);
    }
  }

  onViewportChanged(callback) {
    if (this.isAvailable) {
      this.webApp.onEvent('viewportChanged', callback);
    }
  }

  // Health check
  healthCheck() {
    return {
      available: this.isAvailable,
      user: this.getUserInfo(),
      theme: this.getThemeParams(),
      version: this.webApp?.version || 'unknown'
    };
  }
}