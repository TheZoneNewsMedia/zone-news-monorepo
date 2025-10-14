/**
 * Bot Service - Core Bot Logic
 */

class BotService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.userStates = new Map();
        this.STATE_TTL = 5 * 60 * 1000; // 5 minutes
    }
    
    // State management
    setState(userId, state) {
        this.userStates.set(userId, {
            ...state,
            timestamp: Date.now()
        });
        
        // Auto-cleanup
        setTimeout(() => {
            this.clearState(userId);
        }, this.STATE_TTL);
    }
    
    getState(userId) {
        const state = this.userStates.get(userId);
        if (!state) return null;
        
        // Check expiry
        if (Date.now() - state.timestamp > this.STATE_TTL) {
            this.clearState(userId);
            return null;
        }
        
        return state;
    }
    
    clearState(userId) {
        this.userStates.delete(userId);
    }
    
    // Article formatting
    formatArticle(article) {
        const date = new Date(article.published_date).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short'
        });
        
        return `📰 *${article.title}*\n\n` +
               `${article.summary || article.content?.substring(0, 200)}...\n\n` +
               `📅 ${date} | 📂 ${article.category || 'General'}\n` +
               `👁 ${article.views || 0} views`;
    }
    
    // Error messages
    getErrorMessage(err) {
        if (err.message?.includes('not enough rights')) {
            return '❌ Bot needs admin rights in the destination';
        } else if (err.message?.includes('TOPIC_CLOSED')) {
            return '❌ Topic is closed for posting';
        } else if (err.message?.includes('CHAT_NOT_FOUND')) {
            return '❌ Destination not found';
        } else if (err.message?.includes('429')) {
            return '⚠️ Too many requests. Please wait a moment';
        }
        return '❌ An error occurred. Please try again.';
    }
}

module.exports = BotService;