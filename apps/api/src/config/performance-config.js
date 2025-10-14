/**
 * Performance Monitoring Configuration
 * Environment-based configuration for thresholds and settings
 */

module.exports = {
    // Response time threshold in milliseconds
    RESPONSE_TIME_THRESHOLD: parseInt(process.env.PERF_RESPONSE_TIME_THRESHOLD) || 200,
    
    // Memory threshold in MB
    MEMORY_THRESHOLD_MB: parseInt(process.env.PERF_MEMORY_THRESHOLD_MB) || 100,
    
    // Database query threshold in milliseconds
    DB_QUERY_THRESHOLD: parseInt(process.env.PERF_DB_QUERY_THRESHOLD) || 100,
    
    // Error rate threshold in percentage
    ERROR_RATE_THRESHOLD: parseFloat(process.env.PERF_ERROR_RATE_THRESHOLD) || 5.0,
    
    // Monitoring intervals
    MEMORY_MONITOR_INTERVAL: parseInt(process.env.PERF_MEMORY_INTERVAL) || 5000,
    METRICS_PERSIST_INTERVAL: parseInt(process.env.PERF_PERSIST_INTERVAL) || 60000,
    
    // Buffer sizes
    REQUEST_BUFFER_SIZE: parseInt(process.env.PERF_REQUEST_BUFFER_SIZE) || 1000,
    MEMORY_BUFFER_SIZE: parseInt(process.env.PERF_MEMORY_BUFFER_SIZE) || 500,
    DB_BUFFER_SIZE: parseInt(process.env.PERF_DB_BUFFER_SIZE) || 500,
    
    // Alert settings
    ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL,
    ALERT_EMAIL_ENABLED: process.env.ALERT_EMAIL_ENABLED === 'true',
    ALERT_RATE_LIMIT_MS: parseInt(process.env.ALERT_RATE_LIMIT_MS) || 60000,
    
    // Dashboard settings
    DASHBOARD_ENABLED: process.env.PERF_DASHBOARD_ENABLED !== 'false',
    WEBSOCKET_ENABLED: process.env.PERF_WEBSOCKET_ENABLED !== 'false',
    
    // Enhanced error rate monitoring
    ENDPOINT_ERROR_RATE_THRESHOLD: parseFloat(process.env.PERF_ENDPOINT_ERROR_RATE_THRESHOLD) || 10.0,
    CONSECUTIVE_ERROR_THRESHOLD: parseInt(process.env.PERF_CONSECUTIVE_ERROR_THRESHOLD) || 5,
    ERROR_PATTERN_WINDOW_MINUTES: parseInt(process.env.PERF_ERROR_PATTERN_WINDOW) || 5,
    
    // Performance targets
    TARGET_RESPONSE_TIME: parseInt(process.env.PERF_TARGET_RESPONSE_TIME) || 100,
    TARGET_MEMORY_USAGE: parseInt(process.env.PERF_TARGET_MEMORY) || 75,
    TARGET_ERROR_RATE: parseFloat(process.env.PERF_TARGET_ERROR_RATE) || 0.1,
    
    // Cache monitoring
    CACHE_HIT_RATE_THRESHOLD: parseFloat(process.env.PERF_CACHE_HIT_RATE_THRESHOLD) || 80.0,
    
    // Load testing
    LOAD_TEST_ENABLED: process.env.PERF_LOAD_TEST_ENABLED !== 'false',
    LOAD_TEST_DURATION: parseInt(process.env.PERF_LOAD_TEST_DURATION) || 30,
    LOAD_TEST_CONCURRENT_USERS: parseInt(process.env.PERF_LOAD_TEST_USERS) || 10,
    
    // Security
    DASHBOARD_AUTH_REQUIRED: process.env.PERF_DASHBOARD_AUTH === 'true',
    DASHBOARD_USERNAME: process.env.PERF_DASHBOARD_USERNAME,
    DASHBOARD_PASSWORD: process.env.PERF_DASHBOARD_PASSWORD,
    
    // Get environment-specific configuration
    getEnvironmentConfig() {
        const baseConfig = { ...this };
        
        if (process.env.NODE_ENV === 'production') {
            return {
                ...baseConfig,
                RESPONSE_TIME_THRESHOLD: 150,
                MEMORY_THRESHOLD_MB: 150,
                ERROR_RATE_THRESHOLD: 2.0,
                TARGET_RESPONSE_TIME: 100
            };
        } else if (process.env.NODE_ENV === 'development') {
            return {
                ...baseConfig,
                RESPONSE_TIME_THRESHOLD: 500,
                MEMORY_THRESHOLD_MB: 200,
                ERROR_RATE_THRESHOLD: 10.0,
                TARGET_RESPONSE_TIME: 200
            };
        }
        
        return baseConfig;
    },
    
    // Validate configuration values
    validate() {
        const errors = [];
        
        if (this.RESPONSE_TIME_THRESHOLD <= 0) {
            errors.push('RESPONSE_TIME_THRESHOLD must be positive');
        }
        
        if (this.MEMORY_THRESHOLD_MB <= 0) {
            errors.push('MEMORY_THRESHOLD_MB must be positive');
        }
        
        if (this.ERROR_RATE_THRESHOLD < 0 || this.ERROR_RATE_THRESHOLD > 100) {
            errors.push('ERROR_RATE_THRESHOLD must be between 0 and 100');
        }
        
        if (errors.length > 0) {
            throw new Error(`Performance config validation failed: ${errors.join(', ')}`);
        }
        
        return true;
    }
};