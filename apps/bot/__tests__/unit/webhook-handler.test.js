/**
 * Webhook Handler Test Suite
 * Tests for Telegram webhook handling and WebhookInfo management
 */

const WebhookHandler = require('../../src/services/webhook-handler');
const { createMockContext } = require('../fixtures/telegram');
const { mockDatabase } = require('../mocks/database');

// Mock dependencies
jest.mock('../../src/services/database-service');
jest.mock('../../src/utils/logger');

describe('Webhook Handler', () => {
  let webhookHandler;
  let mockBot;
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = mockDatabase();
    mockBot = {
      telegram: {
        getWebhookInfo: jest.fn(),
        setWebhook: jest.fn(),
        deleteWebhook: jest.fn()
      },
      webhookReply: jest.fn(),
      handleUpdate: jest.fn()
    };
    webhookHandler = new WebhookHandler(mockBot, mockDb);
  });

  describe('WebhookInfo Management', () => {
    it('should retrieve webhook info successfully', async () => {
      const mockWebhookInfo = {
        url: 'https://api.zone.news/webhook',
        has_custom_certificate: false,
        pending_update_count: 0,
        ip_address: '67.219.107.230',
        last_error_date: null,
        last_error_message: null,
        last_synchronization_error_date: null,
        max_connections: 40,
        allowed_updates: ['message', 'callback_query', 'inline_query']
      };

      mockBot.telegram.getWebhookInfo.mockResolvedValue(mockWebhookInfo);

      const info = await webhookHandler.getWebhookInfo();

      expect(info).toEqual(mockWebhookInfo);
      expect(mockBot.telegram.getWebhookInfo).toHaveBeenCalledTimes(1);
    });

    it('should store webhook info in database', async () => {
      const webhookInfo = {
        url: 'https://api.zone.news/webhook',
        ip_address: '67.219.107.230',
        pending_update_count: 5,
        last_error_date: Date.now(),
        last_error_message: 'Connection timeout'
      };

      mockDb.WebhookInfo = {
        findOneAndUpdate: jest.fn().mockResolvedValue(webhookInfo)
      };

      await webhookHandler.storeWebhookInfo(webhookInfo);

      expect(mockDb.WebhookInfo.findOneAndUpdate).toHaveBeenCalledWith(
        { bot_id: expect.any(String) },
        {
          $set: {
            ...webhookInfo,
            updated_at: expect.any(Date)
          }
        },
        { upsert: true, new: true }
      );
    });

    it('should handle webhook info with errors', async () => {
      const webhookInfoWithError = {
        url: 'https://api.zone.news/webhook',
        has_custom_certificate: false,
        pending_update_count: 10,
        last_error_date: Date.now() - 3600000, // 1 hour ago
        last_error_message: 'Wrong response from the webhook: 502 Bad Gateway',
        last_synchronization_error_date: Date.now() - 7200000,
        max_connections: 40
      };

      mockBot.telegram.getWebhookInfo.mockResolvedValue(webhookInfoWithError);

      const info = await webhookHandler.getWebhookInfo();

      expect(info.last_error_message).toBe('Wrong response from the webhook: 502 Bad Gateway');
      expect(info.pending_update_count).toBe(10);
    });

    it('should calculate webhook health status', async () => {
      const webhookInfo = {
        url: 'https://api.zone.news/webhook',
        pending_update_count: 0,
        last_error_date: null,
        last_error_message: null
      };

      const health = webhookHandler.calculateWebhookHealth(webhookInfo);

      expect(health).toEqual({
        status: 'healthy',
        score: 100,
        issues: []
      });
    });

    it('should detect unhealthy webhook', async () => {
      const webhookInfo = {
        url: 'https://api.zone.news/webhook',
        pending_update_count: 100,
        last_error_date: Date.now() - 60000, // 1 minute ago
        last_error_message: 'Connection refused'
      };

      const health = webhookHandler.calculateWebhookHealth(webhookInfo);

      expect(health.status).toBe('unhealthy');
      expect(health.score).toBeLessThan(50);
      expect(health.issues).toContain('High pending update count');
      expect(health.issues).toContain('Recent error occurred');
    });

    it('should format webhook info for admin display', async () => {
      const webhookInfo = {
        url: 'https://api.zone.news/webhook',
        has_custom_certificate: false,
        pending_update_count: 3,
        ip_address: '67.219.107.230',
        last_error_date: Date.now() - 3600000,
        last_error_message: 'Timeout',
        max_connections: 40,
        allowed_updates: ['message', 'callback_query']
      };

      const formatted = webhookHandler.formatForAdmin(webhookInfo);

      expect(formatted).toMatchObject({
        url: 'https://api.zone.news/webhook',
        ip_address: '67.219.107.230',
        pending_updates: 3,
        max_connections: 40,
        allowed_updates: ['message', 'callback_query'],
        has_custom_certificate: false,
        last_error: {
          date: expect.any(String),
          message: 'Timeout',
          time_ago: expect.stringMatching(/ago/)
        },
        health: {
          status: expect.any(String),
          score: expect.any(Number),
          issues: expect.any(Array)
        }
      });
    });
  });

  describe('Webhook Setup', () => {
    it('should set webhook with correct parameters', async () => {
      const webhookUrl = 'https://api.zone.news/webhook';
      const secretToken = 'test-secret-token';

      mockBot.telegram.setWebhook.mockResolvedValue(true);

      const result = await webhookHandler.setupWebhook(webhookUrl, {
        secret_token: secretToken,
        max_connections: 40,
        allowed_updates: ['message', 'callback_query', 'inline_query']
      });

      expect(result).toBe(true);
      expect(mockBot.telegram.setWebhook).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          secret_token: secretToken,
          max_connections: 40,
          allowed_updates: ['message', 'callback_query', 'inline_query']
        })
      );
    });

    it('should handle webhook setup failure', async () => {
      const webhookUrl = 'https://api.zone.news/webhook';
      
      mockBot.telegram.setWebhook.mockRejectedValue(
        new Error('Invalid webhook URL')
      );

      await expect(
        webhookHandler.setupWebhook(webhookUrl)
      ).rejects.toThrow('Invalid webhook URL');
    });

    it('should delete webhook', async () => {
      mockBot.telegram.deleteWebhook.mockResolvedValue(true);

      const result = await webhookHandler.deleteWebhook();

      expect(result).toBe(true);
      expect(mockBot.telegram.deleteWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe('Webhook Update Processing', () => {
    it('should process webhook update', async () => {
      const update = {
        update_id: 123456,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: 'Test' },
          chat: { id: 12345, type: 'private' },
          text: '/start',
          date: Date.now()
        }
      };

      mockBot.handleUpdate.mockResolvedValue(true);

      await webhookHandler.processUpdate(update);

      expect(mockBot.handleUpdate).toHaveBeenCalledWith(
        update,
        expect.any(Object)
      );
    });

    it('should validate webhook secret token', () => {
      const secretToken = 'test-secret-token';
      webhookHandler.setSecretToken(secretToken);

      const validRequest = {
        headers: {
          'x-telegram-bot-api-secret-token': secretToken
        }
      };

      const invalidRequest = {
        headers: {
          'x-telegram-bot-api-secret-token': 'wrong-token'
        }
      };

      expect(webhookHandler.validateSecretToken(validRequest)).toBe(true);
      expect(webhookHandler.validateSecretToken(invalidRequest)).toBe(false);
    });

    it('should handle webhook update with callback query', async () => {
      const update = {
        update_id: 123457,
        callback_query: {
          id: 'cb123',
          from: { id: 12345, first_name: 'Test' },
          message: {
            message_id: 2,
            chat: { id: 12345, type: 'private' }
          },
          data: 'action_subscribe'
        }
      };

      mockBot.handleUpdate.mockResolvedValue(true);

      await webhookHandler.processUpdate(update);

      expect(mockBot.handleUpdate).toHaveBeenCalledWith(
        update,
        expect.any(Object)
      );
    });

    it('should track webhook metrics', async () => {
      const update = {
        update_id: 123458,
        message: {
          message_id: 3,
          from: { id: 12345, first_name: 'Test' },
          chat: { id: 12345, type: 'private' },
          text: 'Hello',
          date: Date.now()
        }
      };

      await webhookHandler.processUpdate(update);

      const metrics = webhookHandler.getMetrics();

      expect(metrics).toMatchObject({
        total_updates: 1,
        successful_updates: 1,
        failed_updates: 0,
        update_types: {
          message: 1
        }
      });
    });
  });

  describe('Webhook Health Monitoring', () => {
    it('should monitor webhook health periodically', async () => {
      jest.useFakeTimers();

      const mockWebhookInfo = {
        url: 'https://api.zone.news/webhook',
        pending_update_count: 0,
        last_error_date: null
      };

      mockBot.telegram.getWebhookInfo.mockResolvedValue(mockWebhookInfo);

      webhookHandler.startHealthMonitoring(30000); // 30 seconds

      // Fast-forward time
      jest.advanceTimersByTime(30000);

      expect(mockBot.telegram.getWebhookInfo).toHaveBeenCalled();

      webhookHandler.stopHealthMonitoring();
      jest.useRealTimers();
    });

    it('should emit webhook health events', async () => {
      const healthListener = jest.fn();
      webhookHandler.on('health-check', healthListener);

      const mockWebhookInfo = {
        url: 'https://api.zone.news/webhook',
        pending_update_count: 50,
        last_error_date: Date.now() - 60000
      };

      await webhookHandler.checkHealth(mockWebhookInfo);

      expect(healthListener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.any(String),
          score: expect.any(Number),
          webhookInfo: mockWebhookInfo
        })
      );
    });

    it('should auto-recover unhealthy webhook', async () => {
      const unhealthyWebhookInfo = {
        url: 'https://api.zone.news/webhook',
        pending_update_count: 200,
        last_error_date: Date.now() - 30000,
        last_error_message: 'Connection timeout'
      };

      mockBot.telegram.getWebhookInfo.mockResolvedValue(unhealthyWebhookInfo);
      mockBot.telegram.deleteWebhook.mockResolvedValue(true);
      mockBot.telegram.setWebhook.mockResolvedValue(true);

      await webhookHandler.autoRecover();

      expect(mockBot.telegram.deleteWebhook).toHaveBeenCalled();
      expect(mockBot.telegram.setWebhook).toHaveBeenCalled();
    });
  });

  describe('Webhook Statistics', () => {
    it('should collect webhook statistics', async () => {
      // Process multiple updates
      const updates = [
        { update_id: 1, message: { text: '/start' } },
        { update_id: 2, callback_query: { data: 'action' } },
        { update_id: 3, inline_query: { query: 'search' } },
        { update_id: 4, message: { text: 'hello' } }
      ];

      for (const update of updates) {
        await webhookHandler.processUpdate(update);
      }

      const stats = webhookHandler.getStatistics();

      expect(stats).toMatchObject({
        total_processed: 4,
        by_type: {
          message: 2,
          callback_query: 1,
          inline_query: 1
        },
        average_processing_time: expect.any(Number),
        success_rate: expect.any(Number)
      });
    });

    it('should reset webhook statistics', () => {
      webhookHandler.recordUpdate('message');
      webhookHandler.recordUpdate('callback_query');

      const statsBefore = webhookHandler.getStatistics();
      expect(statsBefore.total_processed).toBeGreaterThan(0);

      webhookHandler.resetStatistics();

      const statsAfter = webhookHandler.getStatistics();
      expect(statsAfter.total_processed).toBe(0);
    });
  });

  describe('Admin Interface Integration', () => {
    it('should provide webhook data for admin dashboard', async () => {
      const webhookInfo = {
        url: 'https://api.zone.news/webhook',
        pending_update_count: 5,
        ip_address: '67.219.107.230',
        last_error_date: null,
        max_connections: 40
      };

      mockBot.telegram.getWebhookInfo.mockResolvedValue(webhookInfo);

      const adminData = await webhookHandler.getAdminData();

      expect(adminData).toMatchObject({
        webhookInfo: expect.objectContaining({
          url: 'https://api.zone.news/webhook',
          ip_address: '67.219.107.230'
        }),
        health: expect.objectContaining({
          status: expect.any(String),
          score: expect.any(Number)
        }),
        metrics: expect.objectContaining({
          total_updates: expect.any(Number)
        }),
        statistics: expect.objectContaining({
          total_processed: expect.any(Number)
        })
      });
    });

    it('should format webhook info for analytics', async () => {
      const webhookInfo = {
        url: 'https://api.zone.news/webhook',
        pending_update_count: 10,
        last_error_date: Date.now() - 3600000,
        last_error_message: 'Network error'
      };

      const analytics = webhookHandler.formatForAnalytics(webhookInfo);

      expect(analytics).toMatchObject({
        timestamp: expect.any(Number),
        pending_updates: 10,
        has_errors: true,
        error_age_seconds: expect.any(Number),
        health_score: expect.any(Number),
        status: expect.any(String)
      });
    });
  });
});
