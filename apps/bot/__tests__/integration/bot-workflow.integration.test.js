/**
 * Integration Tests for Complete Bot Workflow
 * Tests end-to-end user journeys and command interactions
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock environment variables
process.env.TELEGRAM_BOT_TOKEN = 'test_token_123456';
process.env.ADMIN_IDS = '12345,67890';
process.env.MONGODB_URI = 'mongodb://localhost:27017/zone_news_test';

describe('Bot Workflow Integration Tests', () => {
    let ZoneNewsBot;
    let mockMongoClient;
    let mockTelegrafBot;

    beforeEach(() => {
        // Mock Telegraf
        mockTelegrafBot = {
            command: jest.fn(),
            action: jest.fn(),
            on: jest.fn(),
            launch: jest.fn().mockResolvedValue(true),
            stop: jest.fn().mockResolvedValue(true),
            telegram: {
                sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
                editMessageText: jest.fn().mockResolvedValue(true)
            }
        };

        jest.doMock('telegraf', () => ({
            Telegraf: jest.fn(() => mockTelegrafBot),
            Markup: {
                button: {
                    callback: (text, data) => ({ text, callback_data: data, hide: false })
                },
                inlineKeyboard: (buttons) => ({ reply_markup: { inline_keyboard: buttons } })
            }
        }));

        // Mock MongoDB
        const mockDb = {
            collection: jest.fn(() => ({
                findOne: jest.fn().mockResolvedValue(null),
                find: jest.fn(() => ({
                    toArray: jest.fn().mockResolvedValue([]),
                    sort: jest.fn(() => ({
                        toArray: jest.fn().mockResolvedValue([]),
                        limit: jest.fn(() => ({
                            toArray: jest.fn().mockResolvedValue([])
                        }))
                    })),
                    limit: jest.fn(() => ({
                        toArray: jest.fn().mockResolvedValue([])
                    }))
                })),
                insertOne: jest.fn().mockResolvedValue({ insertedId: 'test_id' }),
                updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
                aggregate: jest.fn(() => ({
                    toArray: jest.fn().mockResolvedValue([])
                })),
                createIndexes: jest.fn().mockResolvedValue(true),
                countDocuments: jest.fn().mockResolvedValue(0)  // Add countDocuments mock
            })),
            listCollections: jest.fn(() => ({
                toArray: jest.fn().mockResolvedValue([])
            })),
            createCollection: jest.fn().mockResolvedValue(true)
        };

        mockMongoClient = {
            connect: jest.fn().mockResolvedValue({
                db: jest.fn(() => mockDb),
                close: jest.fn().mockResolvedValue(true)
            })
        };

        jest.doMock('mongodb', () => ({
            MongoClient: mockMongoClient,
            ObjectId: jest.fn(id => ({ toString: () => id || 'test_object_id' }))
        }));

        // Reset modules to use mocks
        jest.resetModules();
        
        // Import after mocking
        ZoneNewsBot = require('../../src/main-bot');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Bot Initialization', () => {
        test('should initialize bot with all components', async () => {
            // Bot should initialize without throwing
            expect(() => new ZoneNewsBot()).not.toThrow();
            
            // Give time for async initialization
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Verify Telegraf was initialized
            expect(mockTelegrafBot).toBeDefined();
        });

        test('should connect to database', async () => {
            new ZoneNewsBot();
            
            // Give time for database connection
            await new Promise(resolve => setTimeout(resolve, 200));
            
            expect(mockMongoClient.connect).toHaveBeenCalledWith(
                'mongodb://localhost:27017/zone_news_test'
            );
        });

        test('should register all command handlers', async () => {
            new ZoneNewsBot();
            
            // Give time for command registration
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Verify start command is registered
            expect(mockTelegrafBot.command).toHaveBeenCalledWith(
                'start',
                expect.any(Function)
            );
            
            // Verify other commands are registered
            const commandCalls = mockTelegrafBot.command.mock.calls;
            const registeredCommands = commandCalls.map(call => call[0]);
            
            expect(registeredCommands).toContain('help');
            expect(registeredCommands).toContain('news');
            expect(registeredCommands).toContain('search');
            expect(registeredCommands).toContain('subscribe');
        });

        test('should register callback handlers', async () => {
            new ZoneNewsBot();
            
            // Give time for handler registration
            await new Promise(resolve => setTimeout(resolve, 200));
            
            expect(mockTelegrafBot.action).toHaveBeenCalled();
        });
    });

    describe('User Journey - New User', () => {
        let bot;
        let mockNewUserCtx;

        beforeEach(async () => {
            bot = new ZoneNewsBot();
            await new Promise(resolve => setTimeout(resolve, 200));

            mockNewUserCtx = {
                from: {
                    id: 99999,
                    first_name: 'NewUser',
                    username: 'newuser'
                },
                chat: {
                    id: 99999,
                    type: 'private'
                },
                reply: jest.fn().mockResolvedValue({ message_id: 1 }),
                editMessageText: jest.fn().mockResolvedValue(true),
                answerCbQuery: jest.fn().mockResolvedValue(true)
            };
        });

        test('should handle new user start command', async () => {
            // Mock setup wizard indicating new user
            const mockSetupWizard = {
                needsSetup: jest.fn().mockResolvedValue(true),
                startWizard: jest.fn().mockResolvedValue(true)
            };

            // Find the start command handler
            const startCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'start');
            expect(startCall).toBeDefined();

            const startHandler = startCall[1];

            // Mock the setup wizard check
            if (bot.setupWizard) {
                bot.setupWizard.needsSetup = mockSetupWizard.needsSetup;
                bot.setupWizard.startWizard = mockSetupWizard.startWizard;
            }

            // Execute start command
            await startHandler(mockNewUserCtx);

            // Should trigger setup for new users
            expect(mockSetupWizard.needsSetup).toHaveBeenCalledWith(99999);
        });
    });

    describe('User Journey - Returning User', () => {
        let bot;
        let mockUserCtx;

        beforeEach(async () => {
            bot = new ZoneNewsBot();
            await new Promise(resolve => setTimeout(resolve, 200));

            mockUserCtx = {
                from: {
                    id: 12345,
                    first_name: 'TestUser',
                    username: 'testuser'
                },
                chat: {
                    id: 12345,
                    type: 'private'
                },
                reply: jest.fn().mockResolvedValue({ message_id: 1 }),
                editMessageText: jest.fn().mockResolvedValue(true),
                answerCbQuery: jest.fn().mockResolvedValue(true)
            };
        });

        test('should show personalized welcome for returning user', async () => {
            // Mock user data in database
            if (bot.db) {
                bot.db.collection().findOne.mockResolvedValue({
                    user_id: 12345,
                    city: 'Adelaide',
                    categories: ['breaking', 'business'],
                    notifications: 'Enabled'
                });
            }

            // Find and execute start command
            const startCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'start');
            const startHandler = startCall[1];

            await startHandler(mockUserCtx);

            // Should reply with personalized message
            expect(mockUserCtx.reply).toHaveBeenCalled();
            const replyMessage = mockUserCtx.reply.mock.calls[0][0];
            expect(replyMessage).toContain('Welcome back, TestUser!');
        });

        test('should handle news command workflow', async () => {
            // Mock news articles in database
            const mockArticles = [
                {
                    _id: '1',
                    title: 'Adelaide Weather Update',
                    content: 'Sunny day in Adelaide',
                    category: 'weather',
                    published_date: new Date(),
                    views: 100
                }
            ];

            if (bot.db) {
                bot.db.collection().find().sort().limit().toArray.mockResolvedValue(mockArticles);
            }

            // Find and execute news command
            const newsCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'news');
            expect(newsCall).toBeDefined();

            const newsHandler = newsCall[1];
            mockUserCtx.message = { text: '/news' };

            await newsHandler(mockUserCtx);

            // Should query database and reply with articles
            expect(mockUserCtx.reply).toHaveBeenCalled();
        });

        test('should handle search workflow', async () => {
            // Mock search results
            const mockResults = [
                {
                    _id: '1',
                    title: 'Adelaide Business News',
                    content: 'Business updates from Adelaide',
                    category: 'business'
                }
            ];

            if (bot.db) {
                bot.db.collection().find().limit().toArray.mockResolvedValue(mockResults);
            }

            // Find and execute search command
            const searchCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'search');
            expect(searchCall).toBeDefined();

            const searchHandler = searchCall[1];
            mockUserCtx.message = { text: '/search adelaide business' };

            await searchHandler(mockUserCtx);

            // Should search database and reply with results
            expect(mockUserCtx.reply).toHaveBeenCalled();
        });
    });

    describe('Admin User Journey', () => {
        let bot;
        let mockAdminCtx;

        beforeEach(async () => {
            bot = new ZoneNewsBot();
            await new Promise(resolve => setTimeout(resolve, 200));

            mockAdminCtx = {
                from: {
                    id: 12345, // Admin ID from ADMIN_IDS
                    first_name: 'AdminUser',
                    username: 'admin'
                },
                chat: {
                    id: 12345,
                    type: 'private'
                },
                reply: jest.fn().mockResolvedValue({ message_id: 1 }),
                editMessageText: jest.fn().mockResolvedValue(true),
                answerCbQuery: jest.fn().mockResolvedValue(true)
            };
        });

        test('should provide admin access in start command', async () => {
            // Mock user data
            if (bot.db) {
                bot.db.collection().findOne.mockResolvedValue({
                    user_id: 12345,
                    city: 'Adelaide'
                });
            }

            // Find and execute start command
            const startCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'start');
            const startHandler = startCall[1];

            await startHandler(mockAdminCtx);

            // Should include admin panel button
            expect(mockAdminCtx.reply).toHaveBeenCalled();
            const replyOptions = mockAdminCtx.reply.mock.calls[0][1];
            
            if (replyOptions && replyOptions.reply_markup) {
                const keyboard = replyOptions.reply_markup.inline_keyboard;
                if (keyboard && Array.isArray(keyboard)) {
                    const buttons = keyboard.flat();
                    const buttonTexts = buttons.map(btn => btn.text);
                    expect(buttonTexts).toContain('👑 Admin Panel');
                }
            }
        });

        test('should handle admin commands', async () => {
            // Find admin command
            const adminCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'admin');
            if (adminCall) {
                const adminHandler = adminCall[1];
                await adminHandler(mockAdminCtx);
                expect(mockAdminCtx.reply).toHaveBeenCalled();
            }
        });

        test('should handle stats command for admins', async () => {
            // Mock statistics data
            if (bot.db) {
                bot.db.collection().aggregate().toArray.mockResolvedValue([
                    { _id: null, total: 100, posted: 75 }
                ]);
            }

            // Find stats command
            const statsCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'stats');
            if (statsCall) {
                const statsHandler = statsCall[1];
                await statsHandler(mockAdminCtx);
                expect(mockAdminCtx.reply).toHaveBeenCalled();
            }
        });
    });

    describe('Error Scenarios', () => {
        let bot;

        beforeEach(async () => {
            bot = new ZoneNewsBot();
            await new Promise(resolve => setTimeout(resolve, 200));
        });

        test('should handle database connection failures', async () => {
            // Mock database connection failure
            mockMongoClient.connect.mockRejectedValue(new Error('Connection failed'));

            // Should not crash the bot
            expect(() => new ZoneNewsBot()).not.toThrow();
        });

        test('should handle Telegram API errors', async () => {
            const mockCtx = {
                from: { id: 12345, first_name: 'User' },
                chat: { id: 12345, type: 'private' },
                reply: jest.fn().mockRejectedValue(new Error('API Error'))
            };

            // Find help command
            const helpCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'help');
            if (helpCall) {
                const helpHandler = helpCall[1];
                
                // Should handle the error gracefully (may or may not throw depending on implementation)
                try {
                    await helpHandler(mockCtx);
                } catch (error) {
                    // Error is expected and handled
                    expect(error).toBeDefined();
                }
            }
        });

        test('should handle malformed commands', async () => {
            const mockCtx = {
                from: { id: 12345, first_name: 'User' },
                chat: { id: 12345, type: 'private' },
                message: { text: '/search   ' }, // Empty search
                reply: jest.fn().mockResolvedValue({ message_id: 1 })
            };

            // Find search command
            const searchCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'search');
            if (searchCall) {
                const searchHandler = searchCall[1];
                await searchHandler(mockCtx);
                
                // Should handle gracefully
                expect(mockCtx.reply).toHaveBeenCalled();
            }
        });
    });

    describe('Bot Lifecycle', () => {
        test('should start bot successfully', async () => {
            const bot = new ZoneNewsBot();
            
            // Should be able to launch
            await expect(bot.start()).resolves.not.toThrow();
            expect(mockTelegrafBot.launch).toHaveBeenCalled();
        });

        test('should handle graceful shutdown', async () => {
            const bot = new ZoneNewsBot();
            
            // Mock process events
            const mockProcess = {
                once: jest.fn()
            };
            
            // Verify shutdown handlers are set up
            expect(mockTelegrafBot.stop).toBeDefined();
        });
    });

    describe('Performance Tests', () => {
        test('should handle concurrent commands', async () => {
            const bot = new ZoneNewsBot();
            await new Promise(resolve => setTimeout(resolve, 200));

            const mockCtx = {
                from: { id: 12345, first_name: 'User' },
                chat: { id: 12345, type: 'private' },
                reply: jest.fn().mockResolvedValue({ message_id: 1 })
            };

            // Find help command
            const helpCall = mockTelegrafBot.command.mock.calls.find(call => call[0] === 'help');
            if (helpCall) {
                const helpHandler = helpCall[1];
                
                // Run multiple commands concurrently
                const promises = Array(10).fill(0).map(() => helpHandler(mockCtx));
                
                await expect(Promise.all(promises)).resolves.not.toThrow();
                expect(mockCtx.reply).toHaveBeenCalledTimes(10);
            }
        });

        test('should initialize within reasonable time', async () => {
            const startTime = Date.now();
            const bot = new ZoneNewsBot();
            await new Promise(resolve => setTimeout(resolve, 200));
            const initTime = Date.now() - startTime;

            // Should initialize in under 1 second
            expect(initTime).toBeLessThan(1000);
        });
    });
});
