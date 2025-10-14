/**
 * Centralized Emoji Configuration
 * Single source of truth for all emoji mappings
 */

const EMOJI_CONFIG = {
    // Reaction emojis
    reactions: {
        like: '👍',
        love: '❤️',
        fire: '🔥',
        party: '🎉',
        happy: '😊',
        wow: '😮'
    },
    
    // Menu and navigation emojis
    menu: {
        back: '🔙',
        home: '🏠',
        next: '➡️',
        previous: '⬅️',
        up: '⬆️',
        down: '⬇️'
    },
    
    // Feature emojis
    features: {
        post: '📝',
        search: '🔍',
        trending: '📈',
        help: '❓',
        settings: '⚙️',
        analytics: '📊',
        channels: '📢',
        groups: '👥',
        schedule: '📅',
        draft: '📄'
    },
    
    // Status emojis
    status: {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️',
        loading: '⏳',
        new: '🆕',
        hot: '🔥',
        star: '⭐'
    }
};

// Helper function to get reaction buttons for inline keyboards
const getReactionButtons = (counts = {}) => {
    const firstRow = [
        { 
            text: `${EMOJI_CONFIG.reactions.like} ${counts.like || ''}`.trim(), 
            callback_data: 'persist_like' 
        },
        { 
            text: `${EMOJI_CONFIG.reactions.love} ${counts.love || ''}`.trim(), 
            callback_data: 'persist_love' 
        },
        { 
            text: `${EMOJI_CONFIG.reactions.fire} ${counts.fire || ''}`.trim(), 
            callback_data: 'persist_fire' 
        }
    ];
    
    const secondRow = [
        { 
            text: `${EMOJI_CONFIG.reactions.party} ${counts.party || ''}`.trim(), 
            callback_data: 'persist_party' 
        },
        { 
            text: `${EMOJI_CONFIG.reactions.happy} ${counts.happy || ''}`.trim(), 
            callback_data: 'persist_happy' 
        },
        { 
            text: `${EMOJI_CONFIG.reactions.wow} ${counts.wow || ''}`.trim(), 
            callback_data: 'persist_wow' 
        }
    ];
    
    return [firstRow, secondRow];
};

// Helper to create back button
const getBackButton = (callbackData = 'back_to_start', text = null) => {
    return {
        text: text || `${EMOJI_CONFIG.menu.back} Back`,
        callback_data: callbackData
    };
};

module.exports = {
    EMOJI_CONFIG,
    getReactionButtons,
    getBackButton
};