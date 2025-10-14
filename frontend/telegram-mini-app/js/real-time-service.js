/**
 * Zone News Mini App - Real-time Service
 * Live reaction updates, WebSocket connections, and real-time features
 */

'use strict';

import { APP_CONFIG } from './config.js';

// ===== REAL-TIME SERVICE =====
export class RealTimeService {
  constructor() {
    this.websocket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting
    
    // Event listeners
    this.eventListeners = new Map();
    
    // Real-time data caches
    this.liveReactions = new Map(); // articleId -> reactions
    this.onlineUsers = new Set();
    this.liveComments = new Map(); // articleId -> comments[]
    this.breakingNews = [];
    this.notificationQueue = [];
    
    // Fallback for when WebSocket is not available
    this.fallbackMode = false;
    this.fallbackInterval = null;
    
    // Performance monitoring
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      reconnections: 0,
      averageLatency: 0,
      connectionUptime: 0,
      lastConnected: null
    };
    
    this.initialize();
  }

  /**
   * Initialize real-time service
   */
  initialize() {
    // Check if WebSocket is supported
    if (!window.WebSocket) {
      console.warn('WebSocket not supported, falling back to polling');
      this.enableFallbackMode();
      return;
    }

    // Connect to WebSocket server
    this.connect();
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handlePageHidden();
      } else {
        this.handlePageVisible();
      }
    });
    
    // Handle online/offline events
    window.addEventListener('online', () => {
      this.handleOnline();
    });
    
    window.addEventListener('offline', () => {
      this.handleOffline();
    });
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      return;
    }

    this.connectionState = 'connecting';
    this.notifyConnectionState();

    try {
      // Use secure WebSocket if page is HTTPS, otherwise regular WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || 3001}/ws`;
      
      this.websocket = new WebSocket(wsUrl);
      this.setupWebSocketHandlers();
      
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.handleConnectionError();
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupWebSocketHandlers() {
    this.websocket.onopen = (event) => {
      this.handleConnectionOpen(event);
    };

    this.websocket.onmessage = (event) => {
      this.handleMessage(event);
    };

    this.websocket.onclose = (event) => {
      this.handleConnectionClose(event);
    };

    this.websocket.onerror = (error) => {
      this.handleConnectionError(error);
    };
  }

  /**
   * Handle WebSocket connection open
   */
  handleConnectionOpen(event) {
    console.log('✅ Real-time connection established');
    
    this.connectionState = 'connected';
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.metrics.lastConnected = Date.now();
    
    this.notifyConnectionState();
    this.startHeartbeat();
    this.sendAuth();
    this.subscribeToChannels();
    
    // Process any queued messages
    this.processMessageQueue();
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this.metrics.messagesReceived++;
      
      // Calculate latency if message has timestamp
      if (message.timestamp) {
        const latency = Date.now() - message.timestamp;
        this.updateAverageLatency(latency);
      }
      
      this.processMessage(message);
      
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Process different types of real-time messages
   */
  processMessage(message) {
    switch (message.type) {
      case 'heartbeat':
        this.handleHeartbeat(message);
        break;
        
      case 'reaction_update':
        this.handleReactionUpdate(message);
        break;
        
      case 'comment_update':
        this.handleCommentUpdate(message);
        break;
        
      case 'breaking_news':
        this.handleBreakingNews(message);
        break;
        
      case 'user_activity':
        this.handleUserActivity(message);
        break;
        
      case 'article_update':
        this.handleArticleUpdate(message);
        break;
        
      case 'notification':
        this.handleNotification(message);
        break;
        
      case 'system_message':
        this.handleSystemMessage(message);
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
    
    // Emit event for listeners
    this.emit('message', message);
  }

  /**
   * Handle real-time reaction updates
   */
  handleReactionUpdate(message) {
    const { articleId, reactions, userId, reactionType } = message.data;
    
    // Update local reactions cache
    this.liveReactions.set(articleId, reactions);
    
    // Emit specific reaction event
    this.emit('reaction_update', {
      articleId,
      reactions,
      userId,
      reactionType,
      timestamp: message.timestamp
    });
    
    // Update UI with smooth animation
    this.updateReactionUI(articleId, reactions, reactionType);
  }

  /**
   * Handle real-time comment updates
   */
  handleCommentUpdate(message) {
    const { articleId, comment, action } = message.data; // action: 'add', 'update', 'delete'
    
    if (!this.liveComments.has(articleId)) {
      this.liveComments.set(articleId, []);
    }
    
    const comments = this.liveComments.get(articleId);
    
    switch (action) {
      case 'add':
        comments.unshift(comment);
        break;
      case 'update':
        const updateIndex = comments.findIndex(c => c.id === comment.id);
        if (updateIndex !== -1) {
          comments[updateIndex] = comment;
        }
        break;
      case 'delete':
        const deleteIndex = comments.findIndex(c => c.id === comment.id);
        if (deleteIndex !== -1) {
          comments.splice(deleteIndex, 1);
        }
        break;
    }
    
    this.emit('comment_update', {
      articleId,
      comment,
      action,
      totalComments: comments.length
    });
    
    this.updateCommentUI(articleId, comment, action);
  }

  /**
   * Handle breaking news alerts
   */
  handleBreakingNews(message) {
    const breakingItem = message.data;
    this.breakingNews.unshift(breakingItem);
    
    // Keep only last 10 breaking news items
    if (this.breakingNews.length > 10) {
      this.breakingNews = this.breakingNews.slice(0, 10);
    }
    
    this.emit('breaking_news', breakingItem);
    this.showBreakingNewsNotification(breakingItem);
  }

  /**
   * Handle user activity updates
   */
  handleUserActivity(message) {
    const { userId, action, data } = message.data;
    
    switch (action) {
      case 'online':
        this.onlineUsers.add(userId);
        break;
      case 'offline':
        this.onlineUsers.delete(userId);
        break;
      case 'reading':
        this.emit('user_reading', { userId, articleId: data.articleId });
        break;
    }
    
    this.emit('user_activity', message.data);
  }

  /**
   * Handle article updates (views, shares, etc.)
   */
  handleArticleUpdate(message) {
    this.emit('article_update', message.data);
    this.updateArticleStats(message.data);
  }

  /**
   * Handle heartbeat messages
   */
  handleHeartbeat(message) {
    clearTimeout(this.heartbeatTimeout);
    this.scheduleNextHeartbeat();
  }

  /**
   * Send authentication message
   */
  sendAuth() {
    const authMessage = {
      type: 'auth',
      data: {
        userId: this.getUserId(),
        timestamp: Date.now()
      }
    };
    
    this.sendMessage(authMessage);
  }

  /**
   * Subscribe to real-time channels
   */
  subscribeToChannels() {
    const subscribeMessage = {
      type: 'subscribe',
      data: {
        channels: ['reactions', 'comments', 'breaking_news', 'user_activity'],
        timestamp: Date.now()
      }
    };
    
    this.sendMessage(subscribeMessage);
  }

  /**
   * Send message through WebSocket
   */
  sendMessage(message) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      try {
        this.websocket.send(JSON.stringify(message));
        this.metrics.messagesSent++;
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    } else {
      // Queue message for later if not connected
      this.queueMessage(message);
      return false;
    }
  }

  /**
   * Queue message for sending when connection is restored
   */
  queueMessage(message) {
    this.notificationQueue.push({
      message,
      timestamp: Date.now()
    });
    
    // Keep queue size reasonable
    if (this.notificationQueue.length > 50) {
      this.notificationQueue = this.notificationQueue.slice(-25);
    }
  }

  /**
   * Process queued messages
   */
  processMessageQueue() {
    const now = Date.now();
    const maxAge = 30000; // 30 seconds
    
    this.notificationQueue = this.notificationQueue.filter(item => {
      if (now - item.timestamp < maxAge) {
        this.sendMessage(item.message);
        return false;
      }
      return true;
    });
  }

  /**
   * Send reaction update
   */
  sendReaction(articleId, reactionType) {
    const message = {
      type: 'reaction',
      data: {
        articleId,
        reactionType,
        userId: this.getUserId(),
        timestamp: Date.now()
      }
    };
    
    return this.sendMessage(message);
  }

  /**
   * Send comment
   */
  sendComment(articleId, commentText) {
    const message = {
      type: 'comment',
      data: {
        articleId,
        text: commentText,
        userId: this.getUserId(),
        timestamp: Date.now()
      }
    };
    
    return this.sendMessage(message);
  }

  /**
   * Send user activity update
   */
  sendUserActivity(action, data = {}) {
    const message = {
      type: 'user_activity',
      data: {
        action,
        userId: this.getUserId(),
        ...data,
        timestamp: Date.now()
      }
    };
    
    return this.sendMessage(message);
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: 'heartbeat',
          data: { timestamp: Date.now() }
        });
        
        // Set timeout for heartbeat response
        this.heartbeatTimeout = setTimeout(() => {
          console.warn('Heartbeat timeout, connection may be lost');
          this.handleConnectionError();
        }, 5000);
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  /**
   * Schedule next heartbeat check
   */
  scheduleNextHeartbeat() {
    this.heartbeatTimeout = setTimeout(() => {
      console.warn('No heartbeat received, connection may be lost');
      this.handleConnectionError();
    }, 45000); // Expect heartbeat within 45 seconds
  }

  /**
   * Handle connection close
   */
  handleConnectionClose(event) {
    console.log('WebSocket connection closed:', event.code, event.reason);
    
    this.connectionState = 'disconnected';
    this.clearHeartbeat();
    this.notifyConnectionState();
    
    // Attempt to reconnect unless it was a clean close
    if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max reconnection attempts reached, enabling fallback mode');
      this.enableFallbackMode();
    }
  }

  /**
   * Handle connection error
   */
  handleConnectionError(error) {
    console.error('WebSocket error:', error);
    
    this.connectionState = 'disconnected';
    this.clearHeartbeat();
    this.notifyConnectionState();
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.enableFallbackMode();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    this.connectionState = 'reconnecting';
    this.reconnectAttempts++;
    this.metrics.reconnections++;
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);
    
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    
    // Exponential backoff with jitter
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2 + Math.random() * 1000,
      this.maxReconnectDelay
    );
  }

  /**
   * Enable fallback polling mode
   */
  enableFallbackMode() {
    this.fallbackMode = true;
    console.log('Enabling fallback polling mode');
    
    // Poll for updates every 30 seconds
    this.fallbackInterval = setInterval(() => {
      this.pollUpdates();
    }, 30000);
    
    this.emit('fallback_mode_enabled');
  }

  /**
   * Poll for updates in fallback mode
   */
  async pollUpdates() {
    try {
      // This would poll the API for updates
      // Implementation depends on backend API design
      const response = await fetch(`${APP_CONFIG.API_BASE_URL}/api/live-updates`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const updates = await response.json();
        this.processFallbackUpdates(updates);
      }
    } catch (error) {
      console.warn('Fallback polling failed:', error);
    }
  }

  /**
   * Process updates from fallback polling
   */
  processFallbackUpdates(updates) {
    updates.forEach(update => {
      this.processMessage(update);
    });
  }

  /**
   * Clear heartbeat timers
   */
  clearHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Handle page becoming hidden
   */
  handlePageHidden() {
    // Reduce activity when page is hidden to save resources
    if (this.websocket) {
      this.sendUserActivity('away');
    }
  }

  /**
   * Handle page becoming visible
   */
  handlePageVisible() {
    // Resume activity when page becomes visible
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.sendUserActivity('active');
    } else if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      // Try to reconnect if connection was lost
      this.connect();
    }
  }

  /**
   * Handle going online
   */
  handleOnline() {
    console.log('Connection restored, attempting to reconnect');
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    
    if (this.fallbackMode) {
      this.disableFallbackMode();
    }
    
    this.connect();
  }

  /**
   * Handle going offline
   */
  handleOffline() {
    console.log('Connection lost, entering offline mode');
    this.connectionState = 'disconnected';
    this.notifyConnectionState();
  }

  /**
   * Disable fallback mode
   */
  disableFallbackMode() {
    this.fallbackMode = false;
    
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }

  /**
   * Update reaction UI with animations
   */
  updateReactionUI(articleId, reactions, reactionType) {
    const articleElement = document.querySelector(`[data-article-id="${articleId}"]`);
    if (!articleElement) return;
    
    Object.entries(reactions).forEach(([type, count]) => {
      const reactionButton = articleElement.querySelector(`[data-reaction="${type}"]`);
      if (reactionButton) {
        const countElement = reactionButton.querySelector('.reaction-count');
        if (countElement) {
          const oldCount = parseInt(countElement.textContent) || 0;
          countElement.textContent = count;
          
          // Animate if count increased
          if (count > oldCount) {
            reactionButton.classList.add('reaction-updated');
            setTimeout(() => {
              reactionButton.classList.remove('reaction-updated');
            }, 1000);
          }
        }
      }
    });
  }

  /**
   * Update comment UI
   */
  updateCommentUI(articleId, comment, action) {
    // This would update comment sections in real-time
    this.emit('ui_comment_update', { articleId, comment, action });
  }

  /**
   * Update article statistics
   */
  updateArticleStats(data) {
    const { articleId, stats } = data;
    const articleElement = document.querySelector(`[data-article-id="${articleId}"]`);
    
    if (articleElement && stats) {
      // Update view count
      if (stats.views) {
        const viewElement = articleElement.querySelector('.article-views .stat-value');
        if (viewElement) {
          viewElement.textContent = this.formatNumber(stats.views);
        }
      }
      
      // Update other stats as needed
    }
  }

  /**
   * Show breaking news notification
   */
  showBreakingNewsNotification(breakingItem) {
    this.emit('breaking_news_notification', breakingItem);
    
    // Create visual notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚨 Breaking News', {
        body: breakingItem.title,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      });
    }
  }

  /**
   * Get current user ID
   */
  getUserId() {
    // This would get the actual user ID from Telegram or storage
    return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anonymous';
  }

  /**
   * Format numbers for display
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
   * Update average latency metric
   */
  updateAverageLatency(latency) {
    if (this.metrics.averageLatency === 0) {
      this.metrics.averageLatency = latency;
    } else {
      this.metrics.averageLatency = (this.metrics.averageLatency * 0.9) + (latency * 0.1);
    }
  }

  /**
   * Notify connection state change
   */
  notifyConnectionState() {
    this.emit('connection_state_changed', {
      state: this.connectionState,
      timestamp: Date.now()
    });
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      state: this.connectionState,
      isConnected: this.connectionState === 'connected',
      fallbackMode: this.fallbackMode,
      reconnectAttempts: this.reconnectAttempts,
      onlineUsers: this.onlineUsers.size,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Get live data
   */
  getLiveData() {
    return {
      reactions: Object.fromEntries(this.liveReactions),
      comments: Object.fromEntries(this.liveComments),
      breakingNews: this.breakingNews,
      onlineUsers: this.onlineUsers.size
    };
  }

  /**
   * Force reconnect
   */
  forceReconnect() {
    if (this.websocket) {
      this.websocket.close();
    }
    
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.connect();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    this.clearHeartbeat();
    
    if (this.websocket) {
      this.websocket.close(1000, 'Manual disconnect');
      this.websocket = null;
    }
    
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    
    this.connectionState = 'disconnected';
    this.eventListeners.clear();
  }

  /**
   * Health check
   */
  healthCheck() {
    return {
      connectionState: this.connectionState,
      websocketReady: this.websocket?.readyState === WebSocket.OPEN,
      fallbackMode: this.fallbackMode,
      metrics: this.metrics,
      eventListeners: this.eventListeners.size,
      liveDataSize: {
        reactions: this.liveReactions.size,
        comments: this.liveComments.size,
        breakingNews: this.breakingNews.length
      }
    };
  }
}