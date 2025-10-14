/**
 * Content Handler - Handle article creation, drafts, and content-related callbacks
 */

const ContentPagination = require('./content-pagination');

class ContentHandler {
    constructor(bot, db, articleCreator) {
        this.bot = bot;
        this.db = db;
        this.articleCreator = articleCreator;
        this.pagination = new ContentPagination(bot, db);
    }

    /**
     * Handle content-related callbacks
     */
    async handleContentCallback(ctx, action) {
        try {
            switch (action) {
                case 'cmd_newarticle':
                    await ctx.answerCbQuery();
                    if (this.articleCreator) {
                        await this.articleCreator.startArticleCreation(ctx);
                    } else {
                        await ctx.reply('📝 Article creation is currently unavailable. Please try again later.');
                    }
                    break;
                    
                case 'cmd_drafts':
                    await ctx.answerCbQuery();
                    await this.pagination.showDraftsPaginated(ctx);
                    break;

                default:
                    await ctx.answerCbQuery('Feature coming soon!');
            }
        } catch (error) {
            console.error('Content callback error:', error);
            await ctx.answerCbQuery('❌ Error processing content request');
        }
    }

    /**
     * Handle drafts callback
     */
    async handleDraftsCallback(ctx) {
        const userId = ctx.from.id;
        try {
            const drafts = await this.db.collection('news_articles')
                .find({ 
                    author_id: userId, 
                    status: 'draft' 
                })
                .sort({ created_at: -1 })
                .limit(10)
                .toArray();

            if (drafts.length === 0) {
                return ctx.reply(
                    '📝 **Your Drafts**\n\n' +
                    'No drafts found.\n\n' +
                    'Use ✍️ Create Article to write your first article!',
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✍️ Create Article', callback_data: 'cmd_newarticle' }],
                                [{ text: '🔙 Back to Menu', callback_data: 'back_to_start' }]
                            ]
                        }
                    }
                );
            }

            let message = `📝 **Your Drafts (${drafts.length})**\n\n`;
            const keyboard = [];

            drafts.forEach((draft, index) => {
                message += `${index + 1}. **${draft.title}**\n`;
                message += `   📅 ${draft.created_at.toLocaleDateString()}\n`;
                message += `   📊 ${draft.content?.length || 0} chars\n\n`;
                
                keyboard.push([{
                    text: `✏️ Edit "${draft.title.substring(0, 30)}${draft.title.length > 30 ? '...' : ''}"`,
                    callback_data: `edit_draft:${draft._id}`
                }]);
            });

            keyboard.push([
                { text: '✍️ Create New', callback_data: 'cmd_newarticle' },
                { text: '🔙 Back', callback_data: 'back_to_start' }
            ]);

            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            console.error('Drafts callback error:', error);
            await ctx.reply('❌ Error fetching drafts. Please try again.');
        }
    }
}

module.exports = ContentHandler;