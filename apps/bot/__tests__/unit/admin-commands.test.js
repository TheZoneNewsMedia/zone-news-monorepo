/**
 * Unit Tests for AdminCommands
 * Tests admin-only functionality and permissions
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const AdminCommands = require('../../src/services/admin-commands');

describe('AdminCommands', () => {
    let adminCommands;
    let mockBot;
    let mockDb;
    let mockCtx;
    let mockAdminCtx;

    beforeEach(() => {
        // Set test environment to avoid posting to real channels
        process.env.NODE_ENV = 'test';
        process.env.ADMIN_IDS = '12345,67890';
        process.env.TEST_CHANNEL_ID = '@TestChannel';
        process.env.TEST_GROUP_ID = '@TestGroup';

        // Mock bot
        mockBot = {
            command: jest.fn(),
            action: jest.fn(),
            telegram: {
                sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
                editMessageText: jest.fn().mockResolvedValue(true)
            }
        };

        // Mock database
        mockDb = {
            collection: jest.fn(() => ({
                findOne: jest.fn(),
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
                deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
                aggregate: jest.fn(() => ({
                    toArray: jest.fn().mockResolvedValue([])
                })),
                countDocuments: jest.fn().mockResolvedValue(0)
            }))
        };

        // Mock regular user context
        mockCtx = {
            from: {
                id: 99999, // Not in ADMIN_IDS
                first_name: 'RegularUser',
                username: 'user'
            },
            chat: {
                id: 99999,
                type: 'private'
            },
            reply: jest.fn().mockResolvedValue({ message_id: 1 }),
            editMessageText: jest.fn().mockResolvedValue(true),
            answerCbQuery: jest.fn().mockResolvedValue(true)
        };

        // Mock admin user context
        mockAdminCtx = {
            from: {
                id: 12345, // In ADMIN_IDS
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

        adminCommands = new AdminCommands(mockBot, mockDb);
    });

    afterEach(() => {
        delete process.env.NODE_ENV;
        delete process.env.ADMIN_IDS;
        delete process.env.TEST_CHANNEL_ID;
        delete process.env.TEST_GROUP_ID;
    });

    describe('Initialization and Registration', () => {
        test('should initialize with correct dependencies', () => {
            expect(adminCommands.bot).toBe(mockBot);
            expect(adminCommands.db).toBe(mockDb);
        });

        test('should register all admin commands', () => {
            adminCommands.register();

            const expectedCommands = [
                'admin', 'broadcast', 'stats', 'users', 'post',
                'add', 'remove', 'backup', 'restore', 'logs',
                'health', 'config'
            ];

            expectedCommands.forEach(command => {
                expect(mockBot.command).toHaveBeenCalledWith(
                    command,
                    expect.any(Function)
                );
            });
        });
    });

    describe('Permission Checking', () => {
        test('should allow admin users to access admin commands', async () => {
            const isAdmin = adminCommands.isAdmin(12345);
            expect(isAdmin).toBe(true);
        });

        test('should deny non-admin users access to admin commands', async () => {
            const isAdmin = adminCommands.isAdmin(99999);
            expect(isAdmin).toBe(false);
        });

        test('should handle missing ADMIN_IDS environment variable', async () => {
            delete process.env.ADMIN_IDS;
            
            const isAdmin = adminCommands.isAdmin(12345);
            expect(isAdmin).toBe(false);
        });

        test('should handle non-numeric user IDs in ADMIN_IDS', async () => {
            process.env.ADMIN_IDS = '12345,invalid,67890';
            
            const isAdmin = adminCommands.isAdmin(12345);
            expect(isAdmin).toBe(true);
            
            const isInvalidAdmin = adminCommands.isAdmin(99999);
            expect(isInvalidAdmin).toBe(false);
        });
    });

    describe('Admin Panel Command', () => {
        test('should show admin panel for authorized users', async () => {
            await adminCommands.handleAdminPanel(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('👑 Admin Control Panel'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        test('should deny access to non-admin users', async () => {
            await adminCommands.handleAdminPanel(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('❌ Admin access only')
            );
        });
    });

    describe('Broadcasting Command', () => {
        test('should handle broadcast to all users for admins', async () => {
            mockAdminCtx.message = { text: '/broadcast Important announcement!' };
            
            // Mock user list
            const mockUsers = [
                { user_id: 111, first_name: 'User1' },
                { user_id: 222, first_name: 'User2' },
                { user_id: 333, first_name: 'User3' }
            ];
            
            mockDb.collection().find().toArray.mockResolvedValue(mockUsers);

            await adminCommands.handleBroadcast(mockAdminCtx);

            // Should send message to all users
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(3);
            expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
                111,
                expect.stringContaining('Important announcement!')
            );
        });

        test('should deny broadcast access to non-admin users', async () => {
            mockCtx.message = { text: '/broadcast Test message' };

            await adminCommands.handleBroadcast(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('❌ Admin access only')
            );
            expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
        });

        test('should handle empty broadcast message', async () => {
            mockAdminCtx.message = { text: '/broadcast' };

            await adminCommands.handleBroadcast(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Usage: /broadcast <message>')
            );
        });

        test('should handle broadcast errors gracefully', async () => {
            mockAdminCtx.message = { text: '/broadcast Test message' };
            mockDb.collection().find().toArray.mockResolvedValue([
                { user_id: 111 }
            ]);
            
            // Mock send error for one user
            mockBot.telegram.sendMessage.mockRejectedValue(new Error('User blocked bot'));

            await adminCommands.handleBroadcast(mockAdminCtx);

            // Should report errors but continue
            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Broadcast completed')
            );
        });
    });

    describe('Statistics Command', () => {
        test('should show comprehensive bot statistics for admins', async () => {
            // Mock statistics data
            mockDb.collection().aggregate().toArray
                .mockResolvedValueOnce([{ _id: null, total: 150, posted: 120 }]) // articles
                .mockResolvedValueOnce([{ _id: null, count: 350 }]) // users
                .mockResolvedValueOnce([{ _id: null, count: 1250 }]); // interactions

            await adminCommands.handleStats(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('📊 Bot Statistics'),
                expect.objectContaining({ parse_mode: 'Markdown' })
            );

            const statsMessage = mockAdminCtx.reply.mock.calls[0][0];
            expect(statsMessage).toContain('150'); // articles
            expect(statsMessage).toContain('350'); // users
            expect(statsMessage).toContain('1250'); // interactions
        });

        test('should deny stats access to non-admin users', async () => {
            await adminCommands.handleStats(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('❌ Admin access only')
            );
        });
    });

    describe('User Management Command', () => {
        test('should show user management for admins', async () => {
            const mockUsers = [
                { 
                    user_id: 111, 
                    first_name: 'User1', 
                    last_active: new Date(),
                    subscribed_categories: ['breaking', 'business']
                },
                { 
                    user_id: 222, 
                    first_name: 'User2', 
                    last_active: new Date(),
                    subscribed_categories: ['sports']
                }
            ];

            mockDb.collection().find().sort().limit().toArray.mockResolvedValue(mockUsers);

            await adminCommands.handleUsers(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('👥 User Management'),
                expect.objectContaining({ parse_mode: 'Markdown' })
            );
        });

        test('should deny user management access to non-admin users', async () => {
            await adminCommands.handleUsers(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('❌ Admin access only')
            );
        });
    });

    describe('Test Channel Configuration', () => {
        test('should use test channels in test environment', async () => {
            mockAdminCtx.message = { text: '/post Test message for development' };

            await adminCommands.handlePost(mockAdminCtx);

            // In test environment, should not post to real channels
            if (mockBot.telegram.sendMessage.mock.calls.length > 0) {
                const calls = mockBot.telegram.sendMessage.mock.calls;
                calls.forEach(call => {
                    const chatId = call[0];
                    // Should not be real channel IDs
                    expect(chatId).not.toBe('@ZoneNewsAdl');
                    expect(chatId).not.toBe('@ZONENEWSGROUP');
                    expect(chatId).not.toBe(-1002393922251); // TBC chat
                });
            }
        });

        test('should warn about test environment', async () => {
            await adminCommands.handlePost(mockAdminCtx);

            const replyMessage = mockAdminCtx.reply.mock.calls[0][0];
            expect(replyMessage).toContain('TEST ENVIRONMENT');
        });
    });

    describe('Health Check Command', () => {
        test('should show system health for admins', async () => {
            await adminCommands.handleHealth(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('🏥 System Health Check'),
                expect.objectContaining({ parse_mode: 'Markdown' })
            );

            const healthMessage = mockAdminCtx.reply.mock.calls[0][0];
            expect(healthMessage).toContain('Database');
            expect(healthMessage).toContain('Bot Status');
        });

        test('should deny health check access to non-admin users', async () => {
            await adminCommands.handleHealth(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('❌ Admin access only')
            );
        });
    });

    describe('Backup and Restore', () => {
        test('should handle backup request for admins', async () => {
            await adminCommands.handleBackup(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('💾 Database Backup')
            );
        });

        test('should handle restore request for admins', async () => {
            mockAdminCtx.message = { text: '/restore backup_20250818.json' };

            await adminCommands.handleRestore(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('🔄 Database Restore')
            );
        });

        test('should deny backup/restore to non-admin users', async () => {
            await adminCommands.handleBackup(mockCtx);
            await adminCommands.handleRestore(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('❌ Admin access only')
            );
        });
    });

    describe('Error Handling', () => {
        test('should handle database errors in statistics', async () => {
            mockDb.collection().aggregate.mockImplementation(() => {
                throw new Error('Database error');
            });

            await adminCommands.handleStats(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Error retrieving statistics')
            );
        });

        test('should handle Telegram API errors in broadcast', async () => {
            mockAdminCtx.message = { text: '/broadcast Test' };
            mockDb.collection().find().toArray.mockResolvedValue([{ user_id: 111 }]);
            mockBot.telegram.sendMessage.mockRejectedValue(new Error('API Error'));

            await adminCommands.handleBroadcast(mockAdminCtx);

            // Should complete despite errors
            expect(mockAdminCtx.reply).toHaveBeenCalled();
        });
    });

    describe('Configuration Management', () => {
        test('should show configuration for admins', async () => {
            await adminCommands.handleConfig(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('⚙️ Bot Configuration'),
                expect.objectContaining({ parse_mode: 'Markdown' })
            );

            const configMessage = mockAdminCtx.reply.mock.calls[0][0];
            expect(configMessage).toContain('Environment');
            expect(configMessage).toContain('Database');
        });

        test('should hide sensitive information in config display', async () => {
            await adminCommands.handleConfig(mockAdminCtx);

            const configMessage = mockAdminCtx.reply.mock.calls[0][0];
            // Should not contain actual tokens or passwords
            expect(configMessage).not.toContain(process.env.TELEGRAM_BOT_TOKEN);
            expect(configMessage).toContain('***'); // Should show masked values
        });
    });

    describe('Logs Command', () => {
        test('should show recent logs for admins', async () => {
            await adminCommands.handleLogs(mockAdminCtx);

            expect(mockAdminCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('📋 Recent Logs')
            );
        });

        test('should limit log output length', async () => {
            await adminCommands.handleLogs(mockAdminCtx);

            const logMessage = mockAdminCtx.reply.mock.calls[0][0];
            // Should not exceed Telegram message limits
            expect(logMessage.length).toBeLessThan(4096);
        });
    });
});