/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by breaking connections to failing services
 */

class CircuitBreaker {
    constructor(options = {}) {
        this.name = options.name || 'Unknown Service';
        this.failureThreshold = options.failureThreshold || 5;
        this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
        this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
        
        // Circuit states
        this.STATES = {
            CLOSED: 'CLOSED',     // Normal operation
            OPEN: 'OPEN',         // Circuit broken, rejecting requests
            HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
        };
        
        this.state = this.STATES.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.nextAttempt = null;
        
        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rejectedRequests: 0,
            stateChanges: []
        };
        
        // Callbacks
        this.onStateChange = options.onStateChange || (() => {});
        this.onFailure = options.onFailure || (() => {});
        
        // Start monitoring
        this.startMonitoring();
    }
    
    /**
     * Execute function with circuit breaker protection
     */
    async execute(fn, fallback = null) {
        this.metrics.totalRequests++;
        
        // Check if circuit is open
        if (this.state === this.STATES.OPEN) {
            if (Date.now() < this.nextAttempt) {
                this.metrics.rejectedRequests++;
                
                if (fallback) {
                    console.log(`Circuit ${this.name} is OPEN, using fallback`);
                    return await this.executeFallback(fallback);
                }
                
                throw new Error(`Circuit breaker is OPEN for ${this.name}`);
            }
            
            // Try half-open state
            this.setState(this.STATES.HALF_OPEN);
        }
        
        try {
            const result = await this.executeWithTimeout(fn, 30000); // 30s timeout
            this.onSuccess();
            return result;
            
        } catch (error) {
            this.onError(error);
            
            if (fallback) {
                console.log(`Executing fallback for ${this.name} due to:`, error.message);
                return await this.executeFallback(fallback);
            }
            
            throw error;
        }
    }
    
    /**
     * Execute function with timeout
     */
    async executeWithTimeout(fn, timeout) {
        return Promise.race([
            fn(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Circuit breaker timeout')), timeout)
            )
        ]);
    }
    
    /**
     * Execute fallback function safely
     */
    async executeFallback(fallback) {
        try {
            return await fallback();
        } catch (error) {
            console.error(`Fallback failed for ${this.name}:`, error);
            throw new Error(`Both primary and fallback failed for ${this.name}`);
        }
    }
    
    /**
     * Handle successful execution
     */
    onSuccess() {
        this.metrics.successfulRequests++;
        this.successCount++;
        this.failureCount = 0; // Reset failure count
        
        if (this.state === this.STATES.HALF_OPEN) {
            this.setState(this.STATES.CLOSED);
            console.log(`Circuit ${this.name} recovered, closing circuit`);
        }
    }
    
    /**
     * Handle failed execution
     */
    onError(error) {
        this.metrics.failedRequests++;
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        console.error(`Circuit ${this.name} error (${this.failureCount}/${this.failureThreshold}):`, error.message);
        
        // Notify failure callback
        this.onFailure(error, this.failureCount);
        
        if (this.state === this.STATES.HALF_OPEN) {
            this.setState(this.STATES.OPEN);
            console.log(`Circuit ${this.name} still failing, reopening circuit`);
            return;
        }
        
        if (this.failureCount >= this.failureThreshold) {
            this.setState(this.STATES.OPEN);
            console.error(`Circuit ${this.name} OPENED after ${this.failureCount} failures`);
        }
    }
    
    /**
     * Set circuit state
     */
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        
        if (newState === this.STATES.OPEN) {
            this.nextAttempt = Date.now() + this.recoveryTimeout;
        }
        
        // Record state change
        this.metrics.stateChanges.push({
            from: oldState,
            to: newState,
            timestamp: Date.now(),
            failureCount: this.failureCount
        });
        
        // Notify state change
        this.onStateChange(oldState, newState, this.name);
        
        console.log(`Circuit ${this.name}: ${oldState} -> ${newState}`);
    }
    
    /**
     * Reset circuit breaker
     */
    reset() {
        this.state = this.STATES.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.nextAttempt = null;
        console.log(`Circuit ${this.name} has been reset`);
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            nextAttempt: this.nextAttempt,
            canExecute: this.state !== this.STATES.OPEN || Date.now() >= this.nextAttempt
        };
    }
    
    /**
     * Get metrics
     */
    getMetrics() {
        const successRate = this.metrics.totalRequests > 0
            ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)
            : 0;
            
        return {
            ...this.metrics,
            successRate: `${successRate}%`,
            currentState: this.state,
            uptime: this.calculateUptime()
        };
    }
    
    /**
     * Calculate circuit uptime percentage
     */
    calculateUptime() {
        if (this.metrics.stateChanges.length === 0) {
            return '100%';
        }
        
        let closedTime = 0;
        let lastTime = this.metrics.stateChanges[0].timestamp;
        let lastState = this.STATES.CLOSED;
        
        for (const change of this.metrics.stateChanges) {
            if (lastState === this.STATES.CLOSED) {
                closedTime += change.timestamp - lastTime;
            }
            lastTime = change.timestamp;
            lastState = change.to;
        }
        
        // Add time since last change
        if (this.state === this.STATES.CLOSED) {
            closedTime += Date.now() - lastTime;
        }
        
        const totalTime = Date.now() - this.metrics.stateChanges[0].timestamp;
        return `${(closedTime / totalTime * 100).toFixed(2)}%`;
    }
    
    /**
     * Start periodic monitoring
     */
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            // Auto-recovery check
            if (this.state === this.STATES.OPEN && Date.now() >= this.nextAttempt) {
                console.log(`Circuit ${this.name} recovery timeout reached, will try HALF_OPEN on next request`);
            }
            
            // Reset metrics periodically to prevent memory growth
            if (this.metrics.stateChanges.length > 100) {
                this.metrics.stateChanges = this.metrics.stateChanges.slice(-50);
            }
        }, this.monitoringPeriod);
    }
    
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
    }
}

/**
 * Circuit Breaker Manager - Manages multiple circuit breakers
 */
class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
        this.globalMetrics = {
            totalBreakers: 0,
            openBreakers: 0,
            halfOpenBreakers: 0,
            closedBreakers: 0
        };
    }
    
    /**
     * Create or get a circuit breaker
     */
    getBreaker(name, options = {}) {
        if (!this.breakers.has(name)) {
            const breaker = new CircuitBreaker({
                ...options,
                name,
                onStateChange: (from, to, breakerName) => {
                    this.updateGlobalMetrics();
                    this.notifyStateChange(from, to, breakerName);
                }
            });
            
            this.breakers.set(name, breaker);
            this.globalMetrics.totalBreakers++;
        }
        
        return this.breakers.get(name);
    }
    
    /**
     * Execute with circuit breaker
     */
    async execute(name, fn, options = {}) {
        const breaker = this.getBreaker(name, options);
        return breaker.execute(fn, options.fallback);
    }
    
    /**
     * Update global metrics
     */
    updateGlobalMetrics() {
        this.globalMetrics.openBreakers = 0;
        this.globalMetrics.halfOpenBreakers = 0;
        this.globalMetrics.closedBreakers = 0;
        
        for (const breaker of this.breakers.values()) {
            switch (breaker.state) {
                case 'OPEN':
                    this.globalMetrics.openBreakers++;
                    break;
                case 'HALF_OPEN':
                    this.globalMetrics.halfOpenBreakers++;
                    break;
                case 'CLOSED':
                    this.globalMetrics.closedBreakers++;
                    break;
            }
        }
    }
    
    /**
     * Notify state change (can be used for alerting)
     */
    notifyStateChange(from, to, breakerName) {
        if (to === 'OPEN') {
            console.error(`⚠️ ALERT: Circuit breaker ${breakerName} is now OPEN`);
            // Could send alert to monitoring system
        } else if (from === 'OPEN' && to === 'CLOSED') {
            console.log(`✅ RECOVERY: Circuit breaker ${breakerName} has recovered`);
        }
    }
    
    /**
     * Get all breaker statuses
     */
    getAllStatuses() {
        const statuses = {};
        for (const [name, breaker] of this.breakers) {
            statuses[name] = breaker.getStatus();
        }
        return statuses;
    }
    
    /**
     * Get global metrics
     */
    getGlobalMetrics() {
        this.updateGlobalMetrics();
        return {
            ...this.globalMetrics,
            breakers: this.getAllStatuses()
        };
    }
    
    /**
     * Reset all breakers
     */
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
        console.log('All circuit breakers have been reset');
    }
    
    /**
     * Shutdown all breakers
     */
    shutdown() {
        for (const breaker of this.breakers.values()) {
            breaker.stopMonitoring();
        }
        this.breakers.clear();
        console.log('Circuit breaker manager shut down');
    }
}

// Export singleton instance
const circuitBreakerManager = new CircuitBreakerManager();

module.exports = {
    CircuitBreaker,
    CircuitBreakerManager,
    circuitBreakerManager
};