/**
 * Unit Tests for StartCommand
 * Tests the sophisticated start command functionality
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const StartCommand = require('../../src/services/commands/start-command');

describe('StartCommand', () => {
    let startCommand;
    let mockBot;
    let mockDb;
    let mockSetupWizard;
    let mockCtx;

    beforeEach(() => {
        // Mock bot
        mockBot = {
            command: jest.fn()
        };

        // Mock database
        mockDb = {
            collection: jest.fn(() => ({
                findOne: jest.fn(),
                updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
            }))
        };

        // Mock setup wizard
        mockSetupWizard = {
            needsSetup: jest.fn(),
            startWizard: jest.fn()
        };

        // Mock context
        mockCtx = {
            from: {
                id: 12345,
                first_name: 'TestUser',
                username: 'testuser'
            },
            chat: {
                id: 12345,
                type: 'private'
            },
            reply: jest.fn().mockResolvedValue({ message_id: 1 })
        };

        // Create StartCommand instance
        startCommand = new StartCommand(mockBot, mockDb, mockSetupWizard);
    });

    describe('Initialization', () => {
        test('should initialize with correct dependencies', () => {
            expect(startCommand.bot).toBe(mockBot);
            expect(startCommand.db).toBe(mockDb);
            expect(startCommand.setupWizard).toBe(mockSetupWizard);
        });
    });

    describe('Group Chat Handling', () => {
        test('should handle group chat with redirect message', async () => {
            mockCtx.chat.type = 'group';

            await startCommand.handle(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                '👋 Hi! Please start me in a private chat for the full experience.'
            );
        });

        test('should handle supergroup chat with redirect message', async () => {
            mockCtx.chat.type = 'supergroup';

            await startCommand.handle(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                '👋 Hi! Please start me in a private chat for the full experience.'
            );
        });
    });

    describe('New User Setup Flow', () => {
        test('should start setup wizard for new users', async () => {
            mockSetupWizard.needsSetup.mockResolvedValue(true);

            await startCommand.handle(mockCtx);

            expect(mockSetupWizard.needsSetup).toHaveBeenCalledWith(12345);
            expect(mockSetupWizard.startWizard).toHaveBeenCalledWith(mockCtx);
            expect(mockCtx.reply).not.toHaveBeenCalled();
        });
    });

    describe('Returning User Experience', () => {
        beforeEach(() => {
            mockSetupWizard.needsSetup.mockResolvedValue(false);
        });

        test('should show personalized welcome for returning user', async () => {
            const mockUser = {
                user_id: 12345,
                city: 'Adelaide',
                categories: ['breaking', 'business'],
                notifications: 'Enabled'
            };

            mockDb.collection().findOne.mockResolvedValue(mockUser);

            await startCommand.handle(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('users');
            expect(mockDb.collection().findOne).toHaveBeenCalledWith({ user_id: 12345 });
            
            const replyCall = mockCtx.reply.mock.calls[0];
            expect(replyCall[0]).toContain('Welcome back, TestUser!');
            expect(replyCall[0]).toContain('City: Adelaide');
            expect(replyCall[0]).toContain('Categories: breaking, business');
            expect(replyCall[0]).toContain('Notifications: Enabled');
        });

        test('should handle user with default values', async () => {
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            const replyCall = mockCtx.reply.mock.calls[0];
            expect(replyCall[0]).toContain('City: Adelaide'); // Default
            expect(replyCall[0]).toContain('Categories: All'); // Default
            expect(replyCall[0]).toContain('Notifications: Enabled'); // Default
        });

        test('should handle missing user record', async () => {
            mockDb.collection().findOne.mockResolvedValue(null);

            await startCommand.handle(mockCtx);

            const replyCall = mockCtx.reply.mock.calls[0];
            expect(replyCall[0]).toContain('Welcome back, TestUser!');
            expect(replyCall[0]).toContain('City: Adelaide');
        });

        test('should handle missing first name', async () => {
            mockCtx.from.first_name = undefined;
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            const replyCall = mockCtx.reply.mock.calls[0];
            expect(replyCall[0]).toContain('Welcome back, there!');
        });

        test('should include correct inline keyboard options', async () => {
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            const replyOptions = mockCtx.reply.mock.calls[0][1];
            expect(replyOptions.parse_mode).toBe('Markdown');
            
            const keyboard = replyOptions.reply_markup.inline_keyboard;
            expect(keyboard).toBeDefined();
            
            // Check for expected buttons
            const buttons = keyboard.flat();
            const buttonTexts = buttons.map(btn => btn.text);
            
            expect(buttonTexts).toContain('📰 Latest News');
            expect(buttonTexts).toContain('🔍 Search');
            expect(buttonTexts).toContain('🎯 Discover');
            expect(buttonTexts).toContain('⚙️ Settings');
            expect(buttonTexts).toContain('📱 Mini App');
            expect(buttonTexts).toContain('❓ Help');
        });

        test('should include admin panel for admin users', async () => {
            process.env.ADMIN_IDS = '12345,67890';
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            const replyOptions = mockCtx.reply.mock.calls[0][1];
            const keyboard = replyOptions.reply_markup.inline_keyboard;
            const buttons = keyboard.flat();
            const buttonTexts = buttons.map(btn => btn.text);
            
            expect(buttonTexts).toContain('👑 Admin Panel');
            
            delete process.env.ADMIN_IDS;
        });

        test('should not include admin panel for non-admin users', async () => {
            process.env.ADMIN_IDS = '67890,99999';
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            const replyOptions = mockCtx.reply.mock.calls[0][1];
            const keyboard = replyOptions.reply_markup.inline_keyboard;
            const buttons = keyboard.flat();
            const buttonTexts = buttons.map(btn => btn.text);
            
            expect(buttonTexts).not.toContain('👑 Admin Panel');
            
            delete process.env.ADMIN_IDS;
        });

        test('should handle missing ADMIN_IDS environment variable', async () => {
            delete process.env.ADMIN_IDS;
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            const replyOptions = mockCtx.reply.mock.calls[0][1];
            const keyboard = replyOptions.reply_markup.inline_keyboard;
            const buttons = keyboard.flat();
            const buttonTexts = buttons.map(btn => btn.text);
            
            expect(buttonTexts).not.toContain('👑 Admin Panel');
        });

        test('should update user last activity', async () => {
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('users');
            expect(mockDb.collection().updateOne).toHaveBeenCalledWith(
                { user_id: 12345 },
                { $set: { last_active: expect.any(Date) } }
            );
        });
    });

    describe('Error Handling', () => {
        test('should handle database errors gracefully', async () => {
            mockSetupWizard.needsSetup.mockRejectedValue(new Error('DB Error'));

            // Should not throw
            await expect(startCommand.handle(mockCtx)).resolves.not.toThrow();
        });

        test('should handle setup wizard errors', async () => {
            mockSetupWizard.needsSetup.mockResolvedValue(true);
            mockSetupWizard.startWizard.mockRejectedValue(new Error('Wizard Error'));

            // Should not throw
            await expect(startCommand.handle(mockCtx)).resolves.not.toThrow();
        });

        test('should handle user lookup errors', async () => {
            mockSetupWizard.needsSetup.mockResolvedValue(false);
            mockDb.collection().findOne.mockRejectedValue(new Error('User lookup failed'));

            // Should still reply with default values
            await startCommand.handle(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalled();
            const replyCall = mockCtx.reply.mock.calls[0];
            expect(replyCall[0]).toContain('Welcome back, TestUser!');
        });

        test('should handle reply errors', async () => {
            mockSetupWizard.needsSetup.mockResolvedValue(false);
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });
            mockCtx.reply.mockRejectedValue(new Error('Reply failed'));

            // Should not throw
            await expect(startCommand.handle(mockCtx)).resolves.not.toThrow();
        });
    });

    describe('Callback Data Structure', () => {
        test('should use correct callback data format', async () => {
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            const replyOptions = mockCtx.reply.mock.calls[0][1];
            const keyboard = replyOptions.reply_markup.inline_keyboard;
            const buttons = keyboard.flat();
            
            // Check callback data format
            const newsButton = buttons.find(btn => btn.text === '📰 Latest News');
            expect(newsButton.callback_data).toBe('news:latest');
            
            const searchButton = buttons.find(btn => btn.text === '🔍 Search');
            expect(searchButton.callback_data).toBe('search:start');
            
            const settingsButton = buttons.find(btn => btn.text === '⚙️ Settings');
            expect(settingsButton.callback_data).toBe('settings:main');
        });
    });

    describe('Message Formatting', () => {
        test('should use proper Markdown formatting', async () => {
            mockDb.collection().findOne.mockResolvedValue({ user_id: 12345 });

            await startCommand.handle(mockCtx);

            const replyOptions = mockCtx.reply.mock.calls[0][1];
            expect(replyOptions.parse_mode).toBe('Markdown');
            
            const message = mockCtx.reply.mock.calls[0][0];
            expect(message).toContain('*Zone News Bot*');
        });

        test('should include all required sections in message', async () => {
            mockDb.collection().findOne.mockResolvedValue({
                user_id: 12345,
                city: 'Adelaide',
                categories: ['breaking'],
                notifications: 'Enabled'
            });

            await startCommand.handle(mockCtx);

            const message = mockCtx.reply.mock.calls[0][0];
            
            expect(message).toContain('Welcome back, TestUser!');
            expect(message).toContain('Zone News Bot');
            expect(message).toContain('Latest news from your preferred categories');
            expect(message).toContain('Current Settings:');
            expect(message).toContain('What would you like to do?');
        });
    });
});