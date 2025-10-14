/**
 * Circuit Breaker Service for Fault Tolerance
 * Prevents cascading failures and provides graceful degradation
 */

const { EventEmitter } = require('events');
const logger = require('./Logger');

/**
 * Circuit Breaker States
 */
const States = {
    CLOSED: 'CLOSED',      // Normal operation
    OPEN: 'OPEN',          // Failing, reject requests
    HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration
        this.name = options.name || 'default';
        this.timeout = options.timeout || 3000; // Request timeout in ms
        this.threshold = options.threshold || 5; // Failure threshold
        this.resetTimeout = options.resetTimeout || 60000; // Time before retry in ms
        this.rollingWindow = options.rollingWindow || 10000; // Stats window in ms
        this.volumeThreshold = options.volumeThreshold || 10; // Min requests for stats
        this.errorThreshold = options.errorThreshold || 50; // Error percentage threshold
        
        // State
        this.state = States.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.nextAttempt = Date.now();
        
        // Rolling statistics
        this.requests = [];
        this.requestWindow = [];
        
        // Fallback function
        this.fallbackFunction = options.fallback || null;
        
        logger.info(`Circuit breaker initialized: ${this.name}`);
    }
    
    /**
     * Execute function with circuit breaker protection
     */
    async execute(fn, ...args) {
        // Check if circuit should trip
        this.updateState();
        
        if (this.state === States.OPEN) {
            // Circuit is open, use fallback or reject
            return this.handleOpen();
        }
        
        try {
            // Set timeout for the operation
            const result = await this.executeWithTimeout(fn, args);
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            throw error;
        }
    }
    
    /**
     * Execute function with timeout
     */
    async executeWithTimeout(fn, args) {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Circuit breaker timeout: ${this.name}`));
            }, this.timeout);
            
            try {
                const result = await fn(...args);
                clearTimeout(timer);
                resolve(result);
            } catch (error) {
                clearTimeout(timer);
                reject(error);
            }
        });
    }
    
    /**
     * Update circuit state based on statistics
     */
    updateState() {
        const now = Date.now();
        
        // Clean old requests from window
        this.requestWindow = this.requestWindow.filter(
            req => now - req.timestamp < this.rollingWindow
        );
        
        // Check if we should transition from OPEN to HALF_OPEN
        if (this.state === States.OPEN && now >= this.nextAttempt) {
            this.state = States.HALF_OPEN;
            logger.info(`Circuit breaker half-open: ${this.name}`);
            this.emit('half-open', { name: this.name });
        }
        
        // Check if we should open the circuit based on error rate
        if (this.state === States.CLOSED) {
            const totalRequests = this.requestWindow.length;
            
            if (totalRequests >= this.volumeThreshold) {
                const failures = this.requestWindow.filter(r => !r.success).length;
                const errorRate = (failures / totalRequests) * 100;
                
                if (errorRate >= this.errorThreshold) {
                    this.trip();
                }
            }
        }
    }
    
    /**
     * Handle successful execution
     */
    onSuccess() {
        const now = Date.now();
        
        this.requestWindow.push({
            timestamp: now,
            success: true
        });
        
        if (this.state === States.HALF_OPEN) {
            this.successes++;
            
            // Close circuit after successful test
            if (this.successes >= this.threshold) {
                this.reset();
            }
        }
        
        this.emit('success', {
            name: this.name,
            state: this.state
        });
    }
    
    /**
     * Handle failed execution
     */
    onFailure(error) {
        const now = Date.now();
        
        this.requestWindow.push({
            timestamp: now,
            success: false,
            error: error.message
        });
        
        this.failures++;
        this.lastFailureTime = now;
        
        logger.error(`Circuit breaker failure: ${this.name}`, {
            error: error.message,
            failures: this.failures,
            state: this.state
        });
        
        if (this.state === States.HALF_OPEN) {
            // Test failed, reopen circuit
            this.trip();
        } else if (this.state === States.CLOSED && this.failures >= this.threshold) {
            // Threshold exceeded, open circuit
            this.trip();
        }
        
        this.emit('failure', {
            name: this.name,
            state: this.state,
            error: error.message
        });
    }
    
    /**
     * Trip the circuit (open it)
     */
    trip() {
        this.state = States.OPEN;
        this.nextAttempt = Date.now() + this.resetTimeout;
        
        logger.warn(`Circuit breaker opened: ${this.name}`, {
            failures: this.failures,
            nextAttempt: new Date(this.nextAttempt).toISOString()
        });
        
        this.emit('open', {
            name: this.name,
            failures: this.failures
        });
    }
    
    /**
     * Reset the circuit (close it)
     */
    reset() {
        this.state = States.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        
        logger.info(`Circuit breaker closed: ${this.name}`);
        
        this.emit('close', {
            name: this.name
        });
    }
    
    /**
     * Handle open circuit
     */
    async handleOpen() {
        if (this.fallbackFunction) {
            logger.info(`Using fallback for: ${this.name}`);
            return await this.fallbackFunction();
        }
        
        const error = new Error(`Circuit breaker is OPEN: ${this.name}`);
        error.code = 'CIRCUIT_OPEN';
        error.nextAttempt = this.nextAttempt;
        throw error;
    }
    
    /**
     * Get circuit statistics
     */
    getStats() {
        const now = Date.now();
        const recentRequests = this.requestWindow.filter(
            req => now - req.timestamp < this.rollingWindow
        );
        
        const total = recentRequests.length;
        const failures = recentRequests.filter(r => !r.success).length;
        const successes = total - failures;
        const errorRate = total > 0 ? (failures / total) * 100 : 0;
        
        return {
            name: this.name,
            state: this.state,
            requests: {
                total,
                successes,
                failures,
                errorRate: errorRate.toFixed(2) + '%'
            },
            lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
            nextAttempt: this.state === States.OPEN ? new Date(this.nextAttempt).toISOString() : null
        };
    }
    
    /**
     * Force circuit to close
     */
    forceClose() {
        this.reset();
        logger.info(`Circuit breaker force closed: ${this.name}`);
    }
    
    /**
     * Force circuit to open
     */
    forceOpen() {
        this.trip();
        logger.info(`Circuit breaker force opened: ${this.name}`);
    }
}

/**
 * Circuit Breaker Manager for multiple breakers
 */
class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
    }
    
    /**
     * Create or get circuit breaker
     */
    getBreaker(name, options = {}) {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker({
                name,
                ...options
            }));
        }
        return this.breakers.get(name);
    }
    
    /**
     * Get all circuit breaker stats
     */
    getAllStats() {
        const stats = {};
        for (const [name, breaker] of this.breakers) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }
    
    /**
     * Reset all circuit breakers
     */
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
    
    /**
     * Express middleware for circuit breaker protection
     */
    middleware(name, options = {}) {
        return async (req, res, next) => {
            const breaker = this.getBreaker(name, options);
            
            try {
                await breaker.execute(async () => {
                    // Let the request continue
                    await new Promise((resolve, reject) => {
                        const originalNext = next;
                        next = (err) => {
                            if (err) reject(err);
                            else resolve();
                            originalNext(err);
                        };
                        
                        // Continue to next middleware
                        originalNext();
                    });
                });
            } catch (error) {
                if (error.code === 'CIRCUIT_OPEN') {
                    res.status(503).json({
                        error: 'Service temporarily unavailable',
                        retryAfter: new Date(error.nextAttempt).toISOString()
                    });
                } else {
                    next(error);
                }
            }
        };
    }
}

// Export singleton instance
const manager = new CircuitBreakerManager();

module.exports = {
    CircuitBreaker,
    CircuitBreakerManager: manager,
    States
};
