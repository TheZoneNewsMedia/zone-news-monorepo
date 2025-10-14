/**
 * State Management Service
 * Handles user states with automatic timeout cleanup
 */

class StateService {
    constructor(bot) {
        this.bot = bot;
        this.states = new Map();
        this.timeouts = new Map();
        this.TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    }
    
    set(userId, state) {
        // Clear existing timeout
        this.clearTimeout(userId);
        
        // Set new state
        this.states.set(userId, {
            ...state,
            created_at: Date.now()
        });
        
        // Set new timeout
        const timeout = setTimeout(() => {
            this.clear(userId);
            // Notify user of timeout
            this.bot.telegram.sendMessage(userId, 
                '⏱️ Session expired due to inactivity. Please start again.'
            ).catch((error) => {
                console.error(`Failed to send timeout message to user ${userId}:`, error);
            });
        }, this.TIMEOUT_MS);
        
        this.timeouts.set(userId, timeout);
    }
    
    get(userId) {
        const state = this.states.get(userId);
        
        // Reset timeout on access (user is active)
        if (state) {
            this.set(userId, state);
        }
        
        return state;
    }
    
    clear(userId) {
        this.states.delete(userId);
        this.clearTimeout(userId);
    }
    
    clearTimeout(userId) {
        if (this.timeouts.has(userId)) {
            clearTimeout(this.timeouts.get(userId));
            this.timeouts.delete(userId);
        }
    }
    
    has(userId) {
        return this.states.has(userId);
    }
    
    // Clean up old states periodically
    startCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [userId, state] of this.states.entries()) {
                if (now - state.created_at > this.TIMEOUT_MS) {
                    this.clear(userId);
                }
            }
        }, 60 * 1000); // Check every minute
    }
}

module.exports = StateService;