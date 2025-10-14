/**
 * Content Pagination Handler
 * Provides pagination support for drafts and articles
 */

const { getBackButton } = require('../config/emoji.config');

class ContentPagination {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.pageSize = 5;
        this.userPages = new Map(); // Track current page per user
    }
    
    /**
     * Handle paginated drafts display
     */
    async showDraftsPaginated(ctx, page = 1) {
        const userId = ctx.from.id;
        this.userPages.set(userId, page);
        
        try {
            // Get total count
            const totalCount = await this.db.collection('news_articles').countDocuments({
                author_id: userId,
                status: 'draft'
            });
            
            if (totalCount === 0) {
                const message = '📄 **Your Drafts**\n\n' +
                               '_No drafts found._\n\n' +
                               'Create your first article with /newarticle';
                
                if (ctx.editMessageText) {
                    await ctx.editMessageText(message, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Create Article', callback_data: 'cmd_newarticle' }],
                                [getBackButton()]
                            ]
                        }
                    });
                } else {
                    await ctx.reply(message, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Create Article', callback_data: 'cmd_newarticle' }],
                                [getBackButton()]
                            ]
                        }
                    });
                }
                return;
            }
            
            const totalPages = Math.ceil(totalCount / this.pageSize);
            const skip = (page - 1) * this.pageSize;
            
            // Get paginated drafts
            const drafts = await this.db.collection('news_articles').find({
                author_id: userId,
                status: 'draft'
            })
            .sort({ updated_at: -1 })
            .skip(skip)
            .limit(this.pageSize)
            .toArray();
            
            // Build drafts list
            let message = `📄 **Your Drafts** (Page ${page}/${totalPages})\n\n`;
            
            drafts.forEach((draft, index) => {
                const num = skip + index + 1;
                const date = draft.updated_at ? 
                    new Date(draft.updated_at).toLocaleDateString() : 
                    'No date';
                const preview = draft.content ? 
                    draft.content.substring(0, 50) + '...' : 
                    'No content';
                    
                message += `**${num}. ${draft.title || 'Untitled'}**\n`;
                message += `   📅 ${date}\n`;
                message += `   _${preview}_\n\n`;
            });
            
            // Build keyboard
            const keyboard = [];
            
            // Add draft buttons
            drafts.forEach(draft => {
                keyboard.push([{
                    text: `✏️ ${draft.title || 'Untitled'}`,
                    callback_data: `edit_draft:${draft._id}`
                }]);
            });
            
            // Add pagination buttons
            const paginationRow = [];
            if (page > 1) {
                paginationRow.push({
                    text: '⬅️ Previous',
                    callback_data: `drafts_page:${page - 1}`
                });
            }
            
            paginationRow.push({
                text: `📄 ${page}/${totalPages}`,
                callback_data: 'current_page'
            });
            
            if (page < totalPages) {
                paginationRow.push({
                    text: 'Next ➡️',
                    callback_data: `drafts_page:${page + 1}`
                });
            }
            
            if (paginationRow.length > 0) {
                keyboard.push(paginationRow);
            }
            
            // Add action buttons
            keyboard.push([
                { text: '📝 New Article', callback_data: 'cmd_newarticle' },
                { text: '🗑️ Delete Draft', callback_data: 'delete_draft_menu' }
            ]);
            
            keyboard.push([getBackButton()]);
            
            // Send or edit message
            const messageOptions = {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            };
            
            if (ctx.editMessageText) {
                await ctx.editMessageText(message, messageOptions);
            } else {
                await ctx.reply(message, messageOptions);
            }
            
        } catch (error) {
            console.error('Error showing paginated drafts:', error);
            const errorMessage = '❌ Error loading drafts. Please try again.';
            
            if (ctx.editMessageText) {
                await ctx.editMessageText(errorMessage);
            } else {
                await ctx.reply(errorMessage);
            }
        }
    }
    
    /**
     * Handle draft page navigation
     */
    async handleDraftPageNavigation(ctx) {
        const data = ctx.callbackQuery.data;
        const page = parseInt(data.split(':')[1]);
        
        await ctx.answerCbQuery();
        await this.showDraftsPaginated(ctx, page);
    }
    
    /**
     * Show paginated search results
     */
    async showSearchResultsPaginated(ctx, results, query, page = 1) {
        const userId = ctx.from.id;
        const totalPages = Math.ceil(results.length / this.pageSize);
        const start = (page - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageResults = results.slice(start, end);
        
        let message = `🔍 **Search Results for "${query}"**\n`;
        message += `📊 Found ${results.length} articles (Page ${page}/${totalPages})\n\n`;
        
        if (pageResults.length === 0) {
            message += '_No results on this page._';
        } else {
            pageResults.forEach((article, index) => {
                const num = start + index + 1;
                const date = article.published_date ? 
                    new Date(article.published_date).toLocaleDateString() : '';
                    
                message += `**${num}. ${article.title}**\n`;
                message += `   📂 ${article.category} | 👁️ ${article.views || 0} views\n`;
                if (date) message += `   📅 ${date}\n`;
                message += `   _${article.content.substring(0, 60)}..._\n\n`;
            });
        }
        
        // Build keyboard
        const keyboard = [];
        
        // Add article view buttons (max 3 per page for cleaner UI)
        pageResults.slice(0, 3).forEach(article => {
            keyboard.push([{
                text: `📖 ${article.title.substring(0, 30)}...`,
                callback_data: `view_article:${article._id}`
            }]);
        });
        
        // Pagination row
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push({
                text: '⬅️ Previous',
                callback_data: `search_page:${query}:${page - 1}`
            });
        }
        
        paginationRow.push({
            text: `📄 ${page}/${totalPages}`,
            callback_data: 'current_page'
        });
        
        if (page < totalPages) {
            paginationRow.push({
                text: 'Next ➡️',
                callback_data: `search_page:${query}:${page + 1}`
            });
        }
        
        if (paginationRow.length > 0) {
            keyboard.push(paginationRow);
        }
        
        // Action buttons
        keyboard.push([
            { text: '🔍 New Search', callback_data: 'cmd_search' },
            { text: '🔬 Advanced', callback_data: 'advanced_search' }
        ]);
        
        keyboard.push([getBackButton()]);
        
        const messageOptions = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        };
        
        if (ctx.editMessageText) {
            await ctx.editMessageText(message, messageOptions);
        } else {
            await ctx.reply(message, messageOptions);
        }
    }
    
    /**
     * Handle delete draft menu
     */
    async showDeleteDraftMenu(ctx, page = 1) {
        const userId = ctx.from.id;
        
        try {
            const drafts = await this.db.collection('news_articles').find({
                author_id: userId,
                status: 'draft'
            })
            .sort({ updated_at: -1 })
            .limit(10)
            .toArray();
            
            if (drafts.length === 0) {
                await ctx.editMessageText(
                    '📭 **No Drafts to Delete**\n\n' +
                    'You don\'t have any drafts.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[getBackButton('cmd_drafts')]]
                        }
                    }
                );
                return;
            }
            
            const keyboard = drafts.map(draft => [{
                text: `🗑️ ${draft.title || 'Untitled'}`,
                callback_data: `confirm_delete:${draft._id}`
            }]);
            
            keyboard.push([getBackButton('cmd_drafts')]);
            
            await ctx.editMessageText(
                '🗑️ **Delete Draft**\n\n' +
                'Select a draft to delete:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                }
            );
        } catch (error) {
            console.error('Error showing delete menu:', error);
            await ctx.editMessageText('❌ Error loading drafts.');
        }
    }
    
    /**
     * Clear user's page tracking
     */
    clearUserPage(userId) {
        this.userPages.delete(userId);
    }
    
    /**
     * Get current page for user
     */
    getUserPage(userId) {
        return this.userPages.get(userId) || 1;
    }
}

module.exports = ContentPagination;