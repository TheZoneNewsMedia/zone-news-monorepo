/**
 * Error Logger Utility
 * Structured error logging with Winston for production monitoring
 */

const winston = require('winston');
const { getErrorMetadata, shouldAlert } = require('../types/error.types');

// Define log levels and colors
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue'
};

winston.addColors(logColors);

// Create logger instance
const logger = winston.createLogger({
    levels: logLevels,
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: {
        service: 'zone-news-api',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        // File transport for errors
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        
        // File transport for all logs
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        })
    ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                return `${timestamp} [${service}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
            })
        )
    }));
}

class ErrorLogger {
    constructor(metricsService = null, alertingService = null) {
        this.metricsService = metricsService;
        this.alertingService = alertingService;
        this.errorCounts = new Map();
        this.lastErrorReset = new Date();
    }
    
    /**
     * Log an error with structured data
     */
    logError(error, context = {}) {
        const errorMetadata = getErrorMetadata(error);
        const logData = {
            ...errorMetadata,
            message: error.message,
            stack: error.stack,
            context,
            requestId: context.requestId,
            userId: context.userId,
            endpoint: context.endpoint,
            method: context.method,
            userAgent: context.userAgent,
            ip: context.ip
        };
        
        // Log with appropriate level based on severity
        switch (errorMetadata.severity) {
            case 'critical':
                logger.error('CRITICAL ERROR', logData);
                break;
            case 'high':
                logger.error('HIGH SEVERITY ERROR', logData);
                break;
            case 'medium':
                logger.warn('MEDIUM SEVERITY ERROR', logData);
                break;
            default:
                logger.info('LOW SEVERITY ERROR', logData);
        }
        
        // Record metrics if available
        if (this.metricsService) {
            this.recordErrorMetrics(error, context);
        }
        
        // Send alerts for severe errors
        if (shouldAlert(error) && this.alertingService) {
            this.sendErrorAlert(error, context, errorMetadata);
        }
        
        return logData;
    }
    
    /**
     * Log warning messages
     */
    logWarning(message, context = {}) {
        logger.warn(message, {
            context,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log info messages
     */
    logInfo(message, context = {}) {
        logger.info(message, {
            context,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Log debug messages
     */
    logDebug(message, context = {}) {
        logger.debug(message, {
            context,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Record error metrics for monitoring
     */
    recordErrorMetrics(error, context) {
        const errorMetadata = getErrorMetadata(error);
        
        const metrics = {
            type: 'error',
            errorType: errorMetadata.type,
            category: errorMetadata.category,
            severity: errorMetadata.severity,
            statusCode: errorMetadata.statusCode,
            endpoint: context.endpoint,
            method: context.method,
            timestamp: new Date(),
            requestId: context.requestId,
            // Add default memory usage to prevent errors
            memoryUsage: {
                heapUsed: process.memoryUsage().heapUsed,
                heapTotal: process.memoryUsage().heapTotal,
                external: process.memoryUsage().external,
                rss: process.memoryUsage().rss
            },
            duration: 0
        };
        
        // Use the existing metrics recording pattern
        if (typeof this.metricsService.recordRequest === 'function') {
            this.metricsService.recordRequest(metrics);
        }
        
        // Track error frequency
        this.updateErrorCounts(errorMetadata.type, context.endpoint);
    }
    
    /**
     * Update error frequency tracking
     */
    updateErrorCounts(errorType, endpoint) {
        const key = `${errorType}:${endpoint || 'unknown'}`;
        const current = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, current + 1);
        
        // Reset counts every hour
        const now = new Date();
        if (now - this.lastErrorReset > 60 * 60 * 1000) {
            this.errorCounts.clear();
            this.lastErrorReset = now;
        }
    }
    
    /**
     * Send error alerts for severe issues
     */
    async sendErrorAlert(error, context, metadata) {
        try {
            const alertData = {
                errorType: metadata.type,
                message: error.message,
                severity: metadata.severity,
                endpoint: context.endpoint,
                timestamp: metadata.timestamp,
                stackTrace: error.stack,
                details: error.details || {}
            };
            
            await this.alertingService.sendAlert('error_alert', alertData);
        } catch (alertError) {
            // Don't throw here to prevent alert failures from breaking error handling
            logger.error('Failed to send error alert', { 
                originalError: error.message,
                alertError: alertError.message 
            });
        }
    }
    
    /**
     * Get error statistics
     */
    getErrorStats() {
        const stats = {
            totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
            errorsByType: {},
            errorsByEndpoint: {},
            lastReset: this.lastErrorReset
        };
        
        for (const [key, count] of this.errorCounts.entries()) {
            const [errorType, endpoint] = key.split(':');
            
            stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + count;
            stats.errorsByEndpoint[endpoint] = (stats.errorsByEndpoint[endpoint] || 0) + count;
        }
        
        return stats;
    }
    
    /**
     * Check if error rate is concerning
     */
    isErrorRateHigh(threshold = 10) {
        const stats = this.getErrorStats();
        return stats.totalErrors > threshold;
    }
    
    /**
     * Generate error report
     */
    generateErrorReport() {
        const stats = this.getErrorStats();
        const report = {
            ...stats,
            reportTime: new Date().toISOString(),
            isHighErrorRate: this.isErrorRateHigh(),
            topErrors: Object.entries(stats.errorsByType)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5),
            topEndpoints: Object.entries(stats.errorsByEndpoint)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
        };
        
        return report;
    }
    
    /**
     * Health check for error logging
     */
    healthCheck() {
        try {
            const stats = this.getErrorStats();
            const isHealthy = !this.isErrorRateHigh() && 
                            logger.transports.every(transport => !transport.silent);
            
            return {
                healthy: isHealthy,
                errorRate: stats.totalErrors,
                transportsActive: logger.transports.length,
                lastReset: this.lastErrorReset
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }
}

module.exports = ErrorLogger;