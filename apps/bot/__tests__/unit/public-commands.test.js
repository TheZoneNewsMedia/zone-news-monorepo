/**
 * Unit Tests for PublicCommands
 * Tests all public user-facing commands
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const PublicCommands = require('../../src/services/public-commands');

describe('PublicCommands', () => {
    let publicCommands;
    let mockBot;
    let mockDb;
    let mockCtx;

    beforeEach(() => {
        // Mock bot
        mockBot = {
            command: jest.fn(),
            action: jest.fn(),
            on: jest.fn()
        };

        // Mock database with collections
        mockDb = {
            collection: jest.fn((name) => ({
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
                }))
            }))
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
            message: {
                text: '/test',
                date: Math.floor(Date.now() / 1000)
            },
            reply: jest.fn().mockResolvedValue({ message_id: 1 }),
            editMessageText: jest.fn().mockResolvedValue(true),
            answerCbQuery: jest.fn().mockResolvedValue(true)
        };

        // Create PublicCommands instance
        publicCommands = new PublicCommands(mockBot, mockDb);
    });

    describe('Initialization', () => {
        test('should initialize with correct dependencies', () => {
            expect(publicCommands.bot).toBe(mockBot);
            expect(publicCommands.db).toBe(mockDb);
            expect(publicCommands.supportedCategories).toBeDefined();
            expect(publicCommands.supportedReactions).toBeDefined();
        });

        test('should have correct default configuration', () => {
            expect(publicCommands.itemsPerPage).toBe(5);
            expect(publicCommands.maxSearchResults).toBe(20);
            expect(publicCommands.supportedCategories).toContain('breaking');
            expect(publicCommands.supportedCategories).toContain('business');
            expect(publicCommands.supportedReactions).toContain('👍');
        });
    });

    describe('Command Registration', () => {
        test('should register all public commands', () => {
            publicCommands.register();

            const expectedCommands = [
                'help', 'news', 'subscribe', 'unsubscribe', 'mystats',
                'settings', 'about', 'categories', 'search', 'trending',
                'saved', 'share', 'feedback', 'report'
            ];

            expectedCommands.forEach(command => {
                expect(mockBot.command).toHaveBeenCalledWith(
                    command,
                    expect.any(Function)
                );
            });
        });
    });

    describe('User Activity Tracking', () => {
        test('should update user activity', async () => {
            await publicCommands.updateUserActivity(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('users');
            expect(mockDb.collection().updateOne).toHaveBeenCalledWith(
                { user_id: 12345 },
                {
                    $set: {
                        user_id: 12345,
                        first_name: 'TestUser',
                        username: 'testuser',
                        last_active: expect.any(Date)
                    }
                },
                { upsert: true }
            );
        });

        test('should handle missing user data gracefully', async () => {
            const incompleteCtx = {
                from: { id: 12345 },
                chat: { id: 12345 }
            };

            await publicCommands.updateUserActivity(incompleteCtx);

            expect(mockDb.collection().updateOne).toHaveBeenCalledWith(
                { user_id: 12345 },
                {
                    $set: {
                        user_id: 12345,
                        first_name: undefined,
                        username: undefined,
                        last_active: expect.any(Date)
                    }
                },
                { upsert: true }
            );
        });
    });

    describe('Help Command', () => {
        test('should display comprehensive help message', async () => {
            await publicCommands.handleHelp(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Zone News Bot Commands'),
                expect.objectContaining({ parse_mode: 'Markdown' })
            );

            const helpMessage = mockCtx.reply.mock.calls[0][0];
            expect(helpMessage).toContain('/news');
            expect(helpMessage).toContain('/search');
            expect(helpMessage).toContain('/subscribe');
            expect(helpMessage).toContain('/categories');
        });
    });

    describe('News Command', () => {
        test('should show latest news articles', async () => {
            const mockArticles = [
                { _id: '1', title: 'Test Article 1', category: 'breaking' },
                { _id: '2', title: 'Test Article 2', category: 'business' }
            ];

            mockDb.collection().find().sort().limit().toArray.mockResolvedValue(mockArticles);

            await publicCommands.handleNews(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('news_articles');
            expect(mockCtx.reply).toHaveBeenCalled();
        });

        test('should handle category filtering', async () => {
            mockCtx.message.text = '/news business';
            const mockArticles = [
                { _id: '1', title: 'Business Article', category: 'business' }
            ];

            mockDb.collection().find().sort().limit().toArray.mockResolvedValue(mockArticles);

            await publicCommands.handleNews(mockCtx);

            // Verify category filter was applied
            const findCall = mockDb.collection().find.mock.calls[0][0];
            expect(findCall.category).toBe('business');
        });

        test('should handle no articles found', async () => {
            mockDb.collection().find().sort().limit().toArray.mockResolvedValue([]);

            await publicCommands.handleNews(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('No articles found')
            );
        });
    });

    describe('Search Command', () => {
        test('should handle search with query', async () => {
            mockCtx.message.text = '/search adelaide weather';
            const mockResults = [
                { _id: '1', title: 'Adelaide Weather Update', content: 'Sunny day' }
            ];

            mockDb.collection().find().limit().toArray.mockResolvedValue(mockResults);

            await publicCommands.handleSearch(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('news_articles');
            expect(mockCtx.reply).toHaveBeenCalled();
        });

        test('should handle empty search query', async () => {
            mockCtx.message.text = '/search';

            await publicCommands.handleSearch(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Usage: /search <your search terms>')
            );
        });

        test('should limit search results', async () => {
            mockCtx.message.text = '/search test';
            const mockResults = new Array(25).fill(0).map((_, i) => ({
                _id: i.toString(),
                title: `Article ${i}`
            }));

            mockDb.collection().find().limit().toArray.mockResolvedValue(mockResults);

            await publicCommands.handleSearch(mockCtx);

            expect(mockDb.collection().find().limit).toHaveBeenCalledWith(20);
        });
    });

    describe('Subscribe/Unsubscribe Commands', () => {
        test('should handle category subscription', async () => {
            mockCtx.message.text = '/subscribe breaking';
            mockDb.collection().findOne.mockResolvedValue({ 
                user_id: 12345, 
                subscribed_categories: ['business'] 
            });

            await publicCommands.handleSubscribe(mockCtx);

            expect(mockDb.collection().updateOne).toHaveBeenCalledWith(
                { user_id: 12345 },
                { $addToSet: { subscribed_categories: 'breaking' } }
            );
        });

        test('should handle subscription to invalid category', async () => {
            mockCtx.message.text = '/subscribe invalid_category';

            await publicCommands.handleSubscribe(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Invalid category')
            );
        });

        test('should handle unsubscribe from category', async () => {
            mockCtx.message.text = '/unsubscribe breaking';
            mockDb.collection().findOne.mockResolvedValue({ 
                user_id: 12345, 
                subscribed_categories: ['breaking', 'business'] 
            });

            await publicCommands.handleUnsubscribe(mockCtx);

            expect(mockDb.collection().updateOne).toHaveBeenCalledWith(
                { user_id: 12345 },
                { $pull: { subscribed_categories: 'breaking' } }
            );
        });

        test('should show available categories when no category provided', async () => {
            mockCtx.message.text = '/subscribe';

            await publicCommands.handleSubscribe(mockCtx);

            const replyMessage = mockCtx.reply.mock.calls[0][0];
            expect(replyMessage).toContain('Available categories:');
            expect(replyMessage).toContain('breaking');
            expect(replyMessage).toContain('business');
        });
    });

    describe('Categories Command', () => {
        test('should show user subscriptions', async () => {
            mockDb.collection().findOne.mockResolvedValue({
                user_id: 12345,
                subscribed_categories: ['breaking', 'business']
            });

            await publicCommands.handleCategories(mockCtx);

            const replyMessage = mockCtx.reply.mock.calls[0][0];
            expect(replyMessage).toContain('Your Subscriptions:');
            expect(replyMessage).toContain('breaking');
            expect(replyMessage).toContain('business');
        });

        test('should handle user with no subscriptions', async () => {
            mockDb.collection().findOne.mockResolvedValue({
                user_id: 12345,
                subscribed_categories: []
            });

            await publicCommands.handleCategories(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('not subscribed to any categories')
            );
        });
    });

    describe('User Statistics', () => {
        test('should show user personal statistics', async () => {
            const mockStats = [
                { _id: null, articles_read: 25, total_reactions: 10 }
            ];
            mockDb.collection().aggregate().toArray.mockResolvedValue(mockStats);

            await publicCommands.handleMyStats(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('user_interactions');
            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Your Statistics')
            );
        });

        test('should handle user with no statistics', async () => {
            mockDb.collection().aggregate().toArray.mockResolvedValue([]);

            await publicCommands.handleMyStats(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('No activity recorded yet')
            );
        });
    });

    describe('Trending Command', () => {
        test('should show trending articles', async () => {
            const mockTrending = [
                { _id: '1', title: 'Trending Article', views: 1000, reactions: 50 }
            ];

            mockDb.collection().find().sort().limit().toArray.mockResolvedValue(mockTrending);

            await publicCommands.handleTrending(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalled();
            const replyMessage = mockCtx.reply.mock.calls[0][0];
            expect(replyMessage).toContain('🔥 Trending News');
        });
    });

    describe('Saved Articles', () => {
        test('should show user saved articles', async () => {
            const mockSaved = [
                { _id: '1', title: 'Saved Article', saved_at: new Date() }
            ];

            mockDb.collection().find().sort().toArray.mockResolvedValue(mockSaved);

            await publicCommands.handleSaved(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('saved_articles');
            expect(mockCtx.reply).toHaveBeenCalled();
        });

        test('should handle user with no saved articles', async () => {
            mockDb.collection().find().sort().toArray.mockResolvedValue([]);

            await publicCommands.handleSaved(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining("haven't saved any articles")
            );
        });
    });

    describe('Feedback and Reporting', () => {
        test('should handle feedback submission', async () => {
            mockCtx.message.text = '/feedback Great bot!';

            await publicCommands.handleFeedback(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('feedback');
            expect(mockDb.collection().insertOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: 12345,
                    feedback: 'Great bot!',
                    type: 'feedback'
                })
            );
        });

        test('should handle report submission', async () => {
            mockCtx.message.text = '/report spam article';

            await publicCommands.handleReport(mockCtx);

            expect(mockDb.collection).toHaveBeenCalledWith('feedback');
            expect(mockDb.collection().insertOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: 12345,
                    feedback: 'spam article',
                    type: 'report',
                    priority: 'high'
                })
            );
        });

        test('should handle empty feedback', async () => {
            mockCtx.message.text = '/feedback';

            await publicCommands.handleFeedback(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Usage: /feedback')
            );
        });
    });

    describe('Error Handling', () => {
        test('should handle database errors gracefully', async () => {
            mockDb.collection().find.mockImplementation(() => {
                throw new Error('Database error');
            });

            await publicCommands.handleNews(mockCtx);

            expect(mockCtx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Sorry, something went wrong')
            );
        });

        test('should handle reply errors', async () => {
            mockCtx.reply.mockRejectedValue(new Error('Reply failed'));

            // Should not throw
            await expect(publicCommands.handleHelp(mockCtx)).resolves.not.toThrow();
        });
    });

    describe('Message Formatting', () => {
        test('should format article display correctly', async () => {
            const mockArticle = {
                _id: '1',
                title: 'Test Article',
                content: 'Test content',
                category: 'breaking',
                published_date: new Date(),
                views: 100,
                reactions: { '👍': 5, '❤️': 3 }
            };

            const formatted = publicCommands.formatArticleForDisplay(mockArticle);

            expect(formatted).toContain('Test Article');
            expect(formatted).toContain('breaking');
            expect(formatted).toContain('100 views');
        });

        test('should handle article with missing data', async () => {
            const incompleteArticle = {
                _id: '1',
                title: 'Test Article'
            };

            const formatted = publicCommands.formatArticleForDisplay(incompleteArticle);

            expect(formatted).toContain('Test Article');
            expect(formatted).not.toContain('undefined');
        });
    });
});