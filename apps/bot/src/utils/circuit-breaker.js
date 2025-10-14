/**
 * Circuit Breaker Implementation for Bot Service
 * Prevents cascading failures and provides fallback mechanisms
 */

class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000, name = 'default') {
        this.threshold = threshold;
        this.timeout = timeout;
        this.name = name;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.successCount = 0;
    }

    async execute(fn, fallback = null) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                if (fallback && typeof fallback === 'function') {
                    console.log(`Circuit breaker ${this.name} is OPEN, executing fallback`);
                    return await fallback();
                }
                throw new Error(`Circuit breaker ${this.name} is OPEN`);
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            
            if (this.state === 'OPEN' && fallback && typeof fallback === 'function') {
                console.log(`Circuit breaker ${this.name} opened, executing fallback`);
                return await fallback();
            }
            
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;
        
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            // Require 3 consecutive successes to close the circuit
            if (this.successCount >= 3) {
                this.state = 'CLOSED';
                console.log(`Circuit breaker ${this.name} closed after successful recovery`);
            }
        } else {
            this.state = 'CLOSED';
        }
    }

    onFailure(error) {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            console.error(`Circuit breaker ${this.name} opened due to ${this.failureCount} failures. Last error:`, error.message);
        }
    }

    getState() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
            threshold: this.threshold,
            timeout: this.timeout
        };
    }

    reset() {
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED';
        console.log(`Circuit breaker ${this.name} manually reset`);
    }

    isOpen() {
        return this.state === 'OPEN';
    }

    isClosed() {
        return this.state === 'CLOSED';
    }

    isHalfOpen() {
        return this.state === 'HALF_OPEN';
    }
}

/**
 * Circuit Breaker Manager for multiple services
 */
class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
        this.initializeBreakers();
    }

    initializeBreakers() {
        // Database operations
        this.breakers.set('database', new CircuitBreaker(3, 30000, 'database'));
        
        // External API calls
        this.breakers.set('telegram_api', new CircuitBreaker(5, 60000, 'telegram_api'));
        this.breakers.set('news_api', new CircuitBreaker(3, 45000, 'news_api'));
        
        // Internal services
        this.breakers.set('post_manager', new CircuitBreaker(3, 30000, 'post_manager'));
        this.breakers.set('user_service', new CircuitBreaker(3, 30000, 'user_service'));
        this.breakers.set('settings_service', new CircuitBreaker(3, 30000, 'settings_service'));
        
        // File operations
        this.breakers.set('file_operations', new CircuitBreaker(3, 15000, 'file_operations'));
        
        // Payment operations
        this.breakers.set('payment_service', new CircuitBreaker(2, 60000, 'payment_service'));
    }

    getBreaker(name) {
        if (!this.breakers.has(name)) {
            console.warn(`Circuit breaker ${name} not found, creating default one`);
            this.breakers.set(name, new CircuitBreaker(5, 60000, name));
        }
        return this.breakers.get(name);
    }

    async executeWithBreaker(breakerName, fn, fallback = null) {
        const breaker = this.getBreaker(breakerName);
        return await breaker.execute(fn, fallback);
    }

    getAllStates() {
        const states = {};
        for (const [name, breaker] of this.breakers) {
            states[name] = breaker.getState();
        }
        return states;
    }

    getHealthStatus() {
        const states = this.getAllStates();
        let healthy = 0;
        let degraded = 0;
        let failed = 0;

        for (const state of Object.values(states)) {
            switch (state.state) {
                case 'CLOSED':
                    healthy++;
                    break;
                case 'HALF_OPEN':
                    degraded++;
                    break;
                case 'OPEN':
                    failed++;
                    break;
            }
        }

        return {
            total: this.breakers.size,
            healthy,
            degraded,
            failed,
            overallStatus: failed > 0 ? 'critical' : (degraded > 0 ? 'degraded' : 'healthy')
        };
    }

    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
        console.log('All circuit breakers reset');
    }

    resetBreaker(name) {
        const breaker = this.getBreaker(name);
        breaker.reset();
    }

    // Fallback functions for common operations
    static async databaseFallback() {
        console.log('Database circuit breaker open - using cached/default data');
        return {
            error: 'Database temporarily unavailable',
            cached: true,
            timestamp: new Date().toISOString()
        };
    }

    static async telegramApiFallback() {
        console.log('Telegram API circuit breaker open - deferring message');
        return {
            success: false,
            deferred: true,
            message: 'Message will be sent when service recovers'
        };
    }

    static async newsApiFallback() {
        console.log('News API circuit breaker open - using cached news');
        return {
            articles: [],
            cached: true,
            message: 'Using cached news data due to service unavailability'
        };
    }

    static async postManagerFallback() {
        console.log('Post Manager circuit breaker open - queuing for later');
        return {
            queued: true,
            message: 'Post queued for when service recovers'
        };
    }

    static async userServiceFallback() {
        console.log('User Service circuit breaker open - using basic defaults');
        return {
            tier: 'free',
            preferences: {},
            cached: true
        };
    }

    static async settingsServiceFallback() {
        console.log('Settings Service circuit breaker open - using defaults');
        return {
            features: {
                newUI: true,
                aiSummaries: false,
                premiumTiers: true
            },
            config: {},
            cached: true
        };
    }

    static async paymentServiceFallback() {
        console.log('Payment Service circuit breaker open - deferring payment');
        return {
            success: false,
            deferred: true,
            message: 'Payment will be processed when service recovers'
        };
    }
}

module.exports = {
    CircuitBreaker,
    CircuitBreakerManager
};