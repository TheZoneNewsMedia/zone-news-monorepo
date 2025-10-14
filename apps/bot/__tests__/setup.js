/**
 * Jest Test Setup for Zone News Bot
 * Production-grade test configuration and utilities
 */

// Jest is globally available in test environment

// Environment variables for testing
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token_123456';
process.env.MONGODB_URI = 'mongodb://localhost:27017/zone_news_test';
process.env.ADMIN_IDS = '12345,67890';

// Global test timeout
jest.setTimeout(30000);

// Mock Telegram Bot API calls by default
const mockBot = {
  telegram: {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
    editMessageText: jest.fn().mockResolvedValue(true),
    deleteMessage: jest.fn().mockResolvedValue(true),
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
    setWebhook: jest.fn().mockResolvedValue(true),
    getWebhookInfo: jest.fn().mockResolvedValue({ url: '' })
  },
  launch: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
  on: jest.fn(),
  command: jest.fn(),
  action: jest.fn()
};

// Mock Telegraf
jest.mock('telegraf', () => {
  return {
    Telegraf: jest.fn(() => mockBot)
  };
});

// Mock MongoDB
const mockDb = {
  collection: jest.fn(() => ({
    findOne: jest.fn(),
    find: jest.fn(() => ({
      toArray: jest.fn().mockResolvedValue([]),
      sort: jest.fn(() => ({ toArray: jest.fn().mockResolvedValue([]) }))
    })),
    insertOne: jest.fn().mockResolvedValue({ insertedId: 'test_id' }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    createIndexes: jest.fn().mockResolvedValue(true),
    aggregate: jest.fn(() => ({
      toArray: jest.fn().mockResolvedValue([])
    }))
  })),
  listCollections: jest.fn(() => ({
    toArray: jest.fn().mockResolvedValue([])
  })),
  createCollection: jest.fn().mockResolvedValue(true)
};

jest.mock('mongodb', () => ({
  MongoClient: {
    connect: jest.fn().mockResolvedValue({
      db: jest.fn(() => mockDb),
      close: jest.fn().mockResolvedValue(true)
    })
  },
  ObjectId: jest.fn(id => ({ toString: () => id || 'test_object_id' }))
}));

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Global test utilities
global.testUtils = {
  mockBot,
  mockDb,
  
  // Create a mock Telegram context
  createMockContext: (overrides = {}) => ({
    from: { id: 12345, username: 'testuser' },
    chat: { id: -67890, type: 'group' },
    message: {
      message_id: 1,
      text: '/test',
      date: Math.floor(Date.now() / 1000)
    },
    reply: jest.fn().mockResolvedValue({ message_id: 2 }),
    editMessageText: jest.fn().mockResolvedValue(true),
    answerCbQuery: jest.fn().mockResolvedValue(true),
    ...overrides
  }),
  
  // Create mock article data
  createMockArticle: (overrides = {}) => ({
    _id: 'test_article_id',
    title: 'Test Article Title',
    content: 'Test article content goes here...',
    category: 'Test Category',
    source: 'Test Source',
    published_date: new Date(),
    views: 100,
    zone_news_data: {
      channel: '@ZoneNewsAdl',
      message_id: 123
    },
    posted_to_channel: false,
    ...overrides
  }),
  
  // Wait for promises to resolve
  wait: (ms = 0) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Reset all mocks
  resetMocks: () => {
    jest.clearAllMocks();
    console.log.mockClear();
    console.error.mockClear();
    console.warn.mockClear();
    console.info.mockClear();
  }
};

// Global setup before each test
beforeEach(() => {
  // Clear all mocks
  global.testUtils.resetMocks();
});

// Global teardown after each test
afterEach(() => {
  // Additional cleanup if needed
});

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('🧪 Jest test environment initialized for Zone News Bot');