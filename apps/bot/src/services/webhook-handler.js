const EventEmitter = require('events');
const axios = require('axios');
const crypto = require('crypto');
const WebhookInfo = require('../models/webhook-info');
const logger = require('../utils/logger');

class WebhookHandler extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot;
    this.webhookInfo = null;
    this.secretToken = null;
    this.healthCheckInterval = null;
    this.metricsBuffer = [];
    this.maxMetricsBufferSize = 1000;
    this.autoRecoveryEnabled = true;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 3;
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Get current webhook info from Telegram API
   */
  async getWebhookInfo() {
    try {
      const info = await this.bot.telegram.getWebhookInfo();
      
      // Store or update in database
      this.webhookInfo = await WebhookInfo.findOneAndUpdate(
        { botId: this.bot.botInfo?.id || 'default' },
        {
          ...info,
          lastChecked: new Date(),
          botUsername: this.bot.botInfo?.username
        },
        { upsert: true, new: true }
      );
      
      // Calculate and update health score
      await this.webhookInfo.updateMetrics({
        successfulChecks: 1,
        totalChecks: 1
      });
      
      this.emit('webhook:info:retrieved', this.webhookInfo);
      return this.webhookInfo;
    } catch (error) {
      logger.error('Failed to get webhook info:', error);
      this.emit('webhook:error', error);
      
      // Update failed check metrics
      if (this.webhookInfo) {
        await this.webhookInfo.updateMetrics({
          failedChecks: 1,
          totalChecks: 1
        });
      }
      
      throw error;
    }
  }

  /**
   * Set webhook with enhanced security and monitoring
   */
  async setWebhook(url, options = {}) {
    try {
      // Generate secret token if not provided
      this.secretToken = options.secret_token || crypto.randomBytes(32).toString('hex');
      
      const webhookOptions = {
        ...options,
        secret_token: this.secretToken
      };
      
      // Set webhook
      const result = await this.bot.telegram.setWebhook(url, webhookOptions);
      
      if (result) {
        // Get updated info
        await this.getWebhookInfo();
        
        // Store webhook configuration
        await WebhookInfo.findOneAndUpdate(
          { botId: this.bot.botInfo?.id || 'default' },
          {
            url,
            secretToken: this.secretToken,
            maxConnections: options.max_connections || 40,
            allowedUpdates: options.allowed_updates || [],
            setupDate: new Date(),
            isActive: true
          },
          { upsert: true }
        );
        
        this.emit('webhook:set', { url, options: webhookOptions });
        logger.info(`Webhook set successfully: ${url}`);
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to set webhook:', error);
      this.emit('webhook:error', error);
      throw error;
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(options = {}) {
    try {
      const result = await this.bot.telegram.deleteWebhook(options);
      
      if (result) {
        // Update database
        await WebhookInfo.findOneAndUpdate(
          { botId: this.bot.botInfo?.id || 'default' },
          {
            isActive: false,
            deletedDate: new Date()
          }
        );
        
        // Stop health monitoring
        this.stopHealthMonitoring();
        
        this.emit('webhook:deleted');
        logger.info('Webhook deleted successfully');
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to delete webhook:', error);
      this.emit('webhook:error', error);
      throw error;
    }
  }

  /**
   * Validate webhook secret token
   */
  validateSecretToken(providedToken) {
    if (!this.secretToken) {
      logger.warn('No secret token configured for webhook');
      return false;
    }
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(this.secretToken),
      Buffer.from(providedToken || '')
    );
    
    // Track validation attempts
    this.trackMetric('tokenValidation', { success: isValid });
    
    return isValid;
  }

  /**
   * Process webhook update with metrics tracking
   */
  async processUpdate(update, metadata = {}) {
    const startTime = Date.now();
    
    try {
      // Validate update structure
      if (!update || typeof update !== 'object') {
        throw new Error('Invalid update structure');
      }
      
      // Track update type
      const updateType = this.getUpdateType(update);
      this.trackMetric('updateReceived', { type: updateType });
      
      // Process through bot
      await this.bot.handleUpdate(update);
      
      // Track success
      const processingTime = Date.now() - startTime;
      this.trackMetric('updateProcessed', {
        type: updateType,
        processingTime,
        success: true
      });
      
      // Update webhook metrics
      if (this.webhookInfo) {
        await this.webhookInfo.updateMetrics({
          successfulUpdates: 1,
          totalUpdates: 1,
          totalProcessingTime: processingTime
        });
      }
      
      this.emit('webhook:update:processed', { update, processingTime });
      return true;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Track error
      this.trackMetric('updateFailed', {
        type: this.getUpdateType(update),
        processingTime,
        error: error.message
      });
      
      // Update webhook metrics
      if (this.webhookInfo) {
        await this.webhookInfo.updateMetrics({
          failedUpdates: 1,
          totalUpdates: 1,
          lastError: error.message,
          lastErrorDate: new Date()
        });
      }
      
      logger.error('Failed to process webhook update:', error);
      this.emit('webhook:update:failed', { update, error });
      throw error;
    }
  }

  /**
   * Get update type for metrics
   */
  getUpdateType(update) {
    if (update.message) return 'message';
    if (update.edited_message) return 'edited_message';
    if (update.channel_post) return 'channel_post';
    if (update.edited_channel_post) return 'edited_channel_post';
    if (update.inline_query) return 'inline_query';
    if (update.chosen_inline_result) return 'chosen_inline_result';
    if (update.callback_query) return 'callback_query';
    if (update.shipping_query) return 'shipping_query';
    if (update.pre_checkout_query) return 'pre_checkout_query';
    if (update.poll) return 'poll';
    if (update.poll_answer) return 'poll_answer';
    if (update.my_chat_member) return 'my_chat_member';
    if (update.chat_member) return 'chat_member';
    if (update.chat_join_request) return 'chat_join_request';
    return 'unknown';
  }

  /**
   * Track metrics for monitoring
   */
  trackMetric(type, data) {
    const metric = {
      type,
      data,
      timestamp: new Date()
    };
    
    this.metricsBuffer.push(metric);
    
    // Limit buffer size
    if (this.metricsBuffer.length > this.maxMetricsBufferSize) {
      this.metricsBuffer.shift();
    }
    
    this.emit('webhook:metric', metric);
  }

  /**
   * Get webhook statistics
   */
  async getStatistics(timeRange = '24h') {
    try {
      const webhookInfo = await WebhookInfo.findOne({
        botId: this.bot.botInfo?.id || 'default'
      });
      
      if (!webhookInfo) {
        return null;
      }
      
      // Calculate time range
      const now = new Date();
      const startTime = new Date();
      
      switch (timeRange) {
        case '1h':
          startTime.setHours(now.getHours() - 1);
          break;
        case '24h':
          startTime.setDate(now.getDate() - 1);
          break;
        case '7d':
          startTime.setDate(now.getDate() - 7);
          break;
        case '30d':
          startTime.setDate(now.getDate() - 30);
          break;
        default:
          startTime.setDate(now.getDate() - 1);
      }
      
      // Filter metrics by time range
      const recentMetrics = this.metricsBuffer.filter(
        m => m.timestamp >= startTime
      );
      
      // Calculate statistics
      const stats = {
        healthScore: webhookInfo.healthScore,
        healthStatus: webhookInfo.getHealthStatus(),
        uptime: webhookInfo.uptime,
        successRate: webhookInfo.successRate,
        errorRate: webhookInfo.errorRate,
        totalUpdates: webhookInfo.metrics.totalUpdates,
        successfulUpdates: webhookInfo.metrics.successfulUpdates,
        failedUpdates: webhookInfo.metrics.failedUpdates,
        averageProcessingTime: webhookInfo.metrics.averageProcessingTime,
        recentMetrics: {
          total: recentMetrics.length,
          byType: this.groupMetricsByType(recentMetrics)
        },
        lastError: webhookInfo.lastError,
        lastErrorDate: webhookInfo.lastErrorDate,
        pendingUpdateCount: webhookInfo.pendingUpdateCount,
        lastChecked: webhookInfo.lastChecked
      };
      
      return stats;
    } catch (error) {
      logger.error('Failed to get webhook statistics:', error);
      throw error;
    }
  }

  /**
   * Group metrics by type for statistics
   */
  groupMetricsByType(metrics) {
    return metrics.reduce((acc, metric) => {
      if (!acc[metric.type]) {
        acc[metric.type] = 0;
      }
      acc[metric.type]++;
      return acc;
    }, {});
  }

  /**
   * Get webhook health status
   */
  async getHealthStatus() {
    try {
      await this.getWebhookInfo();
      
      if (!this.webhookInfo) {
        return {
          status: 'unknown',
          score: 0,
          message: 'No webhook information available'
        };
      }
      
      const healthScore = this.webhookInfo.healthScore;
      const status = this.webhookInfo.getHealthStatus();
      
      let message = '';
      if (status === 'healthy') {
        message = 'Webhook is operating normally';
      } else if (status === 'degraded') {
        message = 'Webhook is experiencing minor issues';
      } else if (status === 'unhealthy') {
        message = 'Webhook requires attention';
        
        // Attempt auto-recovery if enabled
        if (this.autoRecoveryEnabled) {
          await this.attemptRecovery();
        }
      }
      
      return {
        status,
        score: healthScore,
        message,
        details: {
          url: this.webhookInfo.url,
          pendingUpdates: this.webhookInfo.pendingUpdateCount,
          lastError: this.webhookInfo.lastError,
          successRate: this.webhookInfo.successRate,
          uptime: this.webhookInfo.uptime
        }
      };
    } catch (error) {
      logger.error('Failed to get health status:', error);
      return {
        status: 'error',
        score: 0,
        message: error.message
      };
    }
  }

  /**
   * Attempt automatic recovery for unhealthy webhook
   */
  async attemptRecovery() {
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      logger.error('Max recovery attempts reached');
      this.emit('webhook:recovery:failed', {
        attempts: this.recoveryAttempts
      });
      return false;
    }
    
    this.recoveryAttempts++;
    logger.info(`Attempting webhook recovery (attempt ${this.recoveryAttempts})`);
    
    try {
      // Get current webhook URL
      const currentInfo = await this.getWebhookInfo();
      
      if (!currentInfo || !currentInfo.url) {
        logger.error('No webhook URL found for recovery');
        return false;
      }
      
      // Delete and re-set webhook
      await this.deleteWebhook();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await this.setWebhook(currentInfo.url, {
        max_connections: currentInfo.maxConnections,
        allowed_updates: currentInfo.allowedUpdates
      });
      
      // Verify recovery
      const newInfo = await this.getWebhookInfo();
      
      if (newInfo.healthScore > 50) {
        logger.info('Webhook recovery successful');
        this.recoveryAttempts = 0;
        this.emit('webhook:recovery:success');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Webhook recovery failed:', error);
      this.emit('webhook:recovery:error', error);
      return false;
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring(interval = 60000) { // Check every minute
    if (this.healthCheckInterval) {
      return;
    }
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealthStatus();
        this.emit('webhook:health:check', health);
        
        // Log warnings for unhealthy webhooks
        if (health.status === 'unhealthy') {
          logger.warn('Webhook unhealthy:', health);
        }
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, interval);
    
    logger.info('Webhook health monitoring started');
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Webhook health monitoring stopped');
    }
  }

  /**
   * Format webhook data for admin interface
   */
  async getAdminData() {
    try {
      const webhookInfo = await WebhookInfo.findOne({
        botId: this.bot.botInfo?.id || 'default'
      });
      
      if (!webhookInfo) {
        return null;
      }
      
      return webhookInfo.toAdminFormat();
    } catch (error) {
      logger.error('Failed to get admin data:', error);
      throw error;
    }
  }

  /**
   * Format webhook data for analytics
   */
  async getAnalyticsData(options = {}) {
    try {
      const webhookInfo = await WebhookInfo.findOne({
        botId: this.bot.botInfo?.id || 'default'
      });
      
      if (!webhookInfo) {
        return null;
      }
      
      return webhookInfo.toAnalyticsFormat();
    } catch (error) {
      logger.error('Failed to get analytics data:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stopHealthMonitoring();
    this.removeAllListeners();
    this.metricsBuffer = [];
    logger.info('Webhook handler cleaned up');
  }
}

module.exports = WebhookHandler;
