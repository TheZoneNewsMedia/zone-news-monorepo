/**
 * Pagination Service - Handles pagination for news and lists
 */

class PaginationService {
    constructor(db) {
        this.db = db;
        this.pageSize = 5;
        this.userPages = new Map(); // Track current page per user
    }
    
    /**
     * Get paginated articles
     */
    async getPaginatedArticles(userId, page = 1, query = {}) {
        const skip = (page - 1) * this.pageSize;
        
        // Get total count
        const totalCount = await this.db.collection('news_articles')
            .countDocuments(query);
        
        // Get articles for current page
        const articles = await this.db.collection('news_articles')
            .find(query)
            .sort({ published_date: -1 })
            .skip(skip)
            .limit(this.pageSize)
            .toArray();
        
        const totalPages = Math.ceil(totalCount / this.pageSize);
        
        // Store user's current page
        this.userPages.set(userId, { page, query, totalPages });
        
        return {
            articles,
            currentPage: page,
            totalPages,
            totalCount,
            hasNext: page < totalPages,
            hasPrev: page > 1
        };
    }
    
    /**
     * Generate pagination keyboard
     */
    generatePaginationKeyboard(currentPage, totalPages, callbackPrefix = 'page') {
        const buttons = [];
        const row = [];
        
        // Previous button
        if (currentPage > 1) {
            row.push({
                text: '⬅️ Previous',
                callback_data: `${callbackPrefix}:${currentPage - 1}`
            });
        }
        
        // Page indicator
        row.push({
            text: `📄 ${currentPage}/${totalPages}`,
            callback_data: 'noop'
        });
        
        // Next button
        if (currentPage < totalPages) {
            row.push({
                text: 'Next ➡️',
                callback_data: `${callbackPrefix}:${currentPage + 1}`
            });
        }
        
        if (row.length > 0) {
            buttons.push(row);
        }
        
        // Load more button (for mobile convenience)
        if (currentPage < totalPages) {
            buttons.push([{
                text: '📥 Load More',
                callback_data: `loadmore:${currentPage + 1}`
            }]);
        }
        
        // Jump to page buttons for long lists
        if (totalPages > 5) {
            const jumpButtons = [];
            
            // First page
            if (currentPage > 2) {
                jumpButtons.push({
                    text: '⏮ First',
                    callback_data: `${callbackPrefix}:1`
                });
            }
            
            // Last page
            if (currentPage < totalPages - 1) {
                jumpButtons.push({
                    text: 'Last ⏭',
                    callback_data: `${callbackPrefix}:${totalPages}`
                });
            }
            
            if (jumpButtons.length > 0) {
                buttons.push(jumpButtons);
            }
        }
        
        return buttons;
    }
    
    /**
     * Handle page navigation
     */
    async handlePageNavigation(ctx, page) {
        const userId = ctx.from.id;
        const userState = this.userPages.get(userId);
        
        if (!userState) {
            await ctx.answerCbQuery('Session expired. Please start over.');
            return null;
        }
        
        // Validate page number
        if (page < 1 || page > userState.totalPages) {
            await ctx.answerCbQuery('Invalid page number');
            return null;
        }
        
        // Get articles for the requested page
        const result = await this.getPaginatedArticles(userId, page, userState.query);
        
        await ctx.answerCbQuery(`Page ${page} of ${result.totalPages}`);
        
        return result;
    }
    
    /**
     * Handle load more (append articles)
     */
    async handleLoadMore(ctx, page) {
        const userId = ctx.from.id;
        const userState = this.userPages.get(userId);
        
        if (!userState) {
            await ctx.answerCbQuery('Session expired. Please start over.');
            return null;
        }
        
        const result = await this.getPaginatedArticles(userId, page, userState.query);
        
        await ctx.answerCbQuery(`Loading ${result.articles.length} more articles...`);
        
        return result;
    }
    
    /**
     * Clear user pagination state
     */
    clearUserState(userId) {
        this.userPages.delete(userId);
    }
    
    /**
     * Clean up old states (run periodically)
     */
    cleanupOldStates() {
        // Clear states older than 30 minutes
        const now = Date.now();
        for (const [userId, state] of this.userPages.entries()) {
            if (!state.timestamp || now - state.timestamp > 30 * 60 * 1000) {
                this.userPages.delete(userId);
            }
        }
    }
    
    /**
     * Get paginated list (generic)
     */
    async getPaginatedList(collection, query, page, pageSize = 10, sort = { _id: -1 }) {
        const skip = (page - 1) * pageSize;
        
        const [items, totalCount] = await Promise.all([
            this.db.collection(collection)
                .find(query)
                .sort(sort)
                .skip(skip)
                .limit(pageSize)
                .toArray(),
            this.db.collection(collection)
                .countDocuments(query)
        ]);
        
        return {
            items,
            currentPage: page,
            totalPages: Math.ceil(totalCount / pageSize),
            totalCount,
            hasNext: skip + items.length < totalCount,
            hasPrev: page > 1
        };
    }
}

module.exports = PaginationService;