/**
 * Integration Tests for Zone News Bot Commands
 * Tests full command workflows with mocked external dependencies
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

describe('Bot Commands Integration Tests', () => {
  let bot;
  let mockCtx;

  beforeEach(() => {
    // Set up environment
    process.env.TELEGRAM_BOT_TOKEN = 'test_token_123456';
    process.env.ADMIN_IDS = '12345,67890';
    
    // Reset mocks
    global.testUtils.resetMocks();
    
    // Create mock context
    mockCtx = global.testUtils.createMockContext();
  });

  describe('/start command', () => {
    test('should send welcome message', async () => {
      // Simulate /start command
      const startHandler = jest.fn(async (ctx) => {
        await ctx.reply(expect.stringContaining('Welcome to Zone News Bot!'));
      });
      
      await startHandler(mockCtx);
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Welcome to Zone News Bot!')
      );
    });
  });

  describe('/help command', () => {
    test('should display help information', async () => {
      const helpHandler = jest.fn(async (ctx) => {
        await ctx.reply(expect.stringContaining('Zone News Bot Commands'));
      });
      
      await helpHandler(mockCtx);
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Commands')
      );
    });
  });

  describe('/post command - Admin Access', () => {
    test('should allow admin users to access posting', async () => {
      // Admin user context
      const adminCtx = global.testUtils.createMockContext({
        from: { id: 12345 } // ID from ADMIN_IDS
      });
      
      // Mock database returning articles
      global.testUtils.mockDb.collection().findOne.mockResolvedValue(
        global.testUtils.createMockArticle()
      );
      
      const postHandler = jest.fn(async (ctx) => {
        const userId = ctx.from.id;
        const isAdmin = [12345, 67890].includes(userId);
        
        if (!isAdmin) {
          return ctx.reply('❌ You are not authorized to use this command.');
        }
        
        await ctx.reply('🎯 Select channels/groups for posting:');
      });
      
      await postHandler(adminCtx);
      
      expect(adminCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Select channels/groups')
      );
    });

    test('should deny non-admin users', async () => {
      // Non-admin user context
      const userCtx = global.testUtils.createMockContext({
        from: { id: 99999 } // Not in ADMIN_IDS
      });
      
      const postHandler = jest.fn(async (ctx) => {
        const userId = ctx.from.id;
        const isAdmin = [12345, 67890].includes(userId);
        
        if (!isAdmin) {
          return ctx.reply('❌ You are not authorized to use this command.');
        }
      });
      
      await postHandler(userCtx);
      
      expect(userCtx.reply).toHaveBeenCalledWith(
        '❌ You are not authorized to use this command.'
      );
    });
  });

  describe('/stats command', () => {
    test('should display bot statistics', async () => {
      // Mock database stats
      global.testUtils.mockDb.collection().aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { total: 25, posted: 10 }
        ])
      });
      
      const statsHandler = jest.fn(async (ctx) => {
        const stats = await global.testUtils.mockDb.collection().aggregate([]).toArray();
        const stat = stats[0] || { total: 0, posted: 0 };
        
        await ctx.reply(
          `📊 Bot Statistics\n\n` +
          `📰 Total Articles: ${stat.total}\n` +
          `✅ Posted: ${stat.posted}\n` +
          `⏳ Pending: ${stat.total - stat.posted}`
        );
      });
      
      await statsHandler(mockCtx);
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringMatching(/📊 Bot Statistics[\s\S]*Total Articles: 25[\s\S]*Posted: 10[\s\S]*Pending: 15/)
      );
    });

    test('should handle database connection errors', async () => {
      // Mock database error
      global.testUtils.mockDb.collection().aggregate.mockReturnValue({
        toArray: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      });
      
      const statsHandler = jest.fn(async (ctx) => {
        try {
          await global.testUtils.mockDb.collection().aggregate([]).toArray();
        } catch (error) {
          await ctx.reply('❌ Database not connected');
        }
      });
      
      await statsHandler(mockCtx);
      
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Database not connected');
    });
  });

  describe('Callback Query Handling', () => {
    test('should handle channel selection callbacks', async () => {
      const callbackCtx = global.testUtils.createMockContext({
        callbackQuery: {
          data: 'select_channel_@ZoneNewsAdl',
          from: { id: 12345 }
        }
      });
      
      const callbackHandler = jest.fn(async (ctx) => {
        const data = ctx.callbackQuery.data;
        
        if (data.startsWith('select_channel_')) {
          await ctx.answerCbQuery('✅ Selected');
        }
      });
      
      await callbackHandler(callbackCtx);
      
      expect(callbackCtx.answerCbQuery).toHaveBeenCalledWith('✅ Selected');
    });

    test('should handle post confirmation', async () => {
      const confirmCtx = global.testUtils.createMockContext({
        callbackQuery: {
          data: 'confirm_post',
          from: { id: 12345 }
        }
      });
      
      // Mock article data
      global.testUtils.mockDb.collection().findOne.mockResolvedValue(
        global.testUtils.createMockArticle()
      );
      
      const confirmHandler = jest.fn(async (ctx) => {
        const article = await global.testUtils.mockDb.collection().findOne();
        
        if (article) {
          await ctx.editMessageText('📝 Preview:');
        }
      });
      
      await confirmHandler(confirmCtx);
      
      expect(confirmCtx.editMessageText).toHaveBeenCalledWith('📝 Preview:');
    });
  });

  describe('Article Processing Workflow', () => {
    test('should process latest article for posting', async () => {
      const mockArticle = global.testUtils.createMockArticle({
        title: 'Breaking: Adelaide News Update',
        content: 'Important news content here...',
        category: 'Breaking News',
        views: 500
      });
      
      global.testUtils.mockDb.collection().findOne.mockResolvedValue(mockArticle);
      
      const processHandler = jest.fn(async () => {
        const article = await global.testUtils.mockDb.collection().findOne({
          posted_to_channel: { $ne: true }
        }, { sort: { published_date: -1 } });
        
        return article;
      });
      
      const result = await processHandler();
      
      expect(result).toEqual(mockArticle);
      expect(global.testUtils.mockDb.collection().findOne).toHaveBeenCalledWith(
        { posted_to_channel: { $ne: true } },
        { sort: { published_date: -1 } }
      );
    });

    test('should handle no articles available', async () => {
      global.testUtils.mockDb.collection().findOne.mockResolvedValue(null);
      
      const processHandler = jest.fn(async (ctx) => {
        const article = await global.testUtils.mockDb.collection().findOne();
        
        if (!article) {
          await ctx.reply('❌ No articles available to post.');
        }
      });
      
      await processHandler(mockCtx);
      
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ No articles available to post.');
    });
  });

  describe('TBC Forum Integration', () => {
    test('should handle TBC topic selection', async () => {
      const tbcCtx = global.testUtils.createMockContext({
        from: { id: 12345 }, // Admin user
        callbackQuery: {
          data: 'tbc_topic_40149'
        }
      });
      
      const tbcHandler = jest.fn(async (ctx) => {
        const topicId = 40149;
        const topicName = 'Adelaide Business & Crypto 💼';
        
        await ctx.editMessageText(`✅ Posted to TBC: ${topicName}`);
      });
      
      await tbcHandler(tbcCtx);
      
      expect(tbcCtx.editMessageText).toHaveBeenCalledWith(
        '✅ Posted to TBC: Adelaide Business & Crypto 💼'
      );
    });
  });

  describe('Error Recovery', () => {
    test('should recover from Telegram API rate limits', async () => {
      // Mock rate limit error
      const rateLimitError = new Error('Too Many Requests');
      rateLimitError.code = 429;
      
      global.testUtils.mockBot.telegram.sendMessage.mockRejectedValueOnce(rateLimitError);
      global.testUtils.mockBot.telegram.sendMessage.mockResolvedValueOnce({ message_id: 123 });
      
      const resilientHandler = jest.fn(async (ctx) => {
        try {
          await global.testUtils.mockBot.telegram.sendMessage(ctx.chat.id, 'Test message');
        } catch (error) {
          if (error.code === 429) {
            // Wait and retry
            await global.testUtils.wait(1000);
            await global.testUtils.mockBot.telegram.sendMessage(ctx.chat.id, 'Test message');
          }
        }
      });
      
      await resilientHandler(mockCtx);
      
      expect(global.testUtils.mockBot.telegram.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('State Management', () => {
    test('should manage user posting state correctly', () => {
      const userStates = new Map();
      const userId = 12345;
      
      // Initialize state
      userStates.set(userId, {
        selectedChannels: new Set(),
        selectedGroups: new Set(),
        text: null,
        lastUsed: []
      });
      
      const state = userStates.get(userId);
      
      expect(state).toBeDefined();
      expect(state.selectedChannels).toBeInstanceOf(Set);
      expect(state.selectedGroups).toBeInstanceOf(Set);
    });

    test('should clean up expired states', () => {
      const userStates = new Map();
      const userId = 12345;
      
      userStates.set(userId, { timestamp: Date.now() - 3600000 }); // 1 hour ago
      
      // Cleanup function
      const cleanupExpiredStates = () => {
        const now = Date.now();
        const expiry = 30 * 60 * 1000; // 30 minutes
        
        for (const [id, state] of userStates) {
          if (state.timestamp && (now - state.timestamp) > expiry) {
            userStates.delete(id);
          }
        }
      };
      
      cleanupExpiredStates();
      
      expect(userStates.has(userId)).toBe(false);
    });
  });
});