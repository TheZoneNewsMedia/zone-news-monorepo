/**
 * Centralized Error Handling Middleware
 * Production-grade error handling with logging, monitoring, and client-safe responses
 */

const { 
    APIError, 
    ValidationError, 
    DatabaseError, 
    getErrorMetadata, 
    shouldAlert 
} = require('../types/error.types');
const ErrorLogger = require('../utils/error-logger.util');

class ErrorHandlingMiddleware {
    constructor(metricsService = null, alertingService = null) {
        this.errorLogger = new ErrorLogger(metricsService, alertingService);
        this.retryableErrors = new Set([
            'ECONNRESET',
            'ETIMEDOUT', 
            'ENOTFOUND',
            'EAI_AGAIN',
            'ECONNREFUSED'
        ]);
    }
    
    /**
     * Main error handling middleware
     */
    handleError() {
        return (error, req, res, next) => {
            // Extract request context for logging
            const context = this.extractRequestContext(req);
            
            // Convert unknown errors to APIError
            const apiError = this.normalizeError(error);
            
            // Log the error with context
            this.errorLogger.logError(apiError, context);
            
            // Record error metrics
            this.recordErrorMetrics(apiError, context);
            
            // Generate client-safe response
            const response = this.generateClientResponse(apiError, req);
            
            // Send response
            res.status(apiError.statusCode || 500).json(response);
        };
    }
    
    /**
     * Async error wrapper for route handlers
     */
    asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }
    
    /**
     * Database error wrapper
     */
    dbErrorHandler(operation) {
        return (error) => {
            if (error.name === 'MongoError' || error.name === 'MongoServerError') {
                return new DatabaseError(`Database ${operation} failed`, operation);
            }
            return error;
        };
    }
    
    /**
     * Extract request context for error logging
     */
    extractRequestContext(req) {
        return {
            requestId: req.id || req.headers['x-request-id'] || this.generateRequestId(),
            method: req.method,
            endpoint: req.path,
            url: req.originalUrl,
            query: this.sanitizeQuery(req.query),
            headers: this.sanitizeHeaders(req.headers),
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress,
            userId: req.user?.id || req.body?.telegram_id,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Normalize different error types to APIError
     */
    normalizeError(error) {
        // If already an APIError, return as-is
        if (error instanceof APIError) {
            return error;
        }
        
        // Handle specific error types
        if (error.name === 'ValidationError') {
            return new ValidationError(error.message, error.path, error.value);
        }
        
        if (error.name === 'CastError') {
            return new ValidationError(`Invalid ${error.path}: ${error.value}`, error.path, error.value);
        }
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return new ValidationError(`${field} already exists`, field);
        }
        
        if (error.name === 'MongoError' || error.name === 'MongoServerError') {
            return new DatabaseError(error.message, 'database_operation');
        }
        
        if (error.code && this.retryableErrors.has(error.code)) {
            return new APIError('Service temporarily unavailable', 503, 'NETWORK_ERROR', {
                code: error.code,
                retryable: true
            });
        }
        
        // Handle JWT errors
        if (error.name === 'JsonWebTokenError') {
            return new ValidationError('Invalid token format');
        }
        
        if (error.name === 'TokenExpiredError') {
            return new ValidationError('Token expired');
        }
        
        // Default to generic API error
        return new APIError(
            process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
            500,
            'INTERNAL_ERROR',
            process.env.NODE_ENV === 'production' ? null : { stack: error.stack }
        );
    }
    
    /**
     * Generate client-safe error response
     */
    generateClientResponse(error, req) {
        const metadata = getErrorMetadata(error);
        const isProduction = process.env.NODE_ENV === 'production';
        
        const response = {
            success: false,
            error: {
                message: error.message,
                code: error.errorCode,
                statusCode: error.statusCode,
                timestamp: new Date().toISOString()
            }
        };
        
        // Add error details for client debugging (non-production)
        if (!isProduction && error.details) {
            response.error.details = error.details;
        }
        
        // Add retry information for retryable errors
        if (error.details?.retryable) {
            response.error.retryable = true;
            response.error.retryAfter = 30; // seconds
        }
        
        // Add rate limit information
        if (error.statusCode === 429) {
            response.error.retryAfter = error.details?.resetTime;
        }
        
        // Add request ID for debugging
        if (req.id || req.headers['x-request-id']) {
            response.error.requestId = req.id || req.headers['x-request-id'];
        }
        
        return response;
    }
    
    /**
     * Record error metrics for monitoring
     */
    recordErrorMetrics(error, context) {
        const metadata = getErrorMetadata(error);
        
        // Create error metric entry
        const errorMetric = {
            type: 'api_error',
            errorType: metadata.type,
            category: metadata.category,
            severity: metadata.severity,
            statusCode: metadata.statusCode,
            endpoint: context.endpoint,
            method: context.method,
            timestamp: new Date(),
            duration: 0, // Error occurred, no meaningful duration
            requestId: context.requestId
        };
        
        // If metrics service is available, record the error
        if (this.errorLogger.metricsService?.recordRequest) {
            this.errorLogger.metricsService.recordRequest(errorMetric);
        }
    }
    
    /**
     * Sanitize query parameters for logging
     */
    sanitizeQuery(query) {
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'api_key'];
        const sanitized = { ...query };
        
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }
    
    /**
     * Sanitize headers for logging
     */
    sanitizeHeaders(headers) {
        const sensitiveHeaders = [
            'authorization', 
            'cookie', 
            'x-api-key', 
            'x-auth-token',
            'x-telegram-bot-api-secret-token'
        ];
        
        const sanitized = {};
        
        for (const [key, value] of Object.entries(headers)) {
            if (sensitiveHeaders.includes(key.toLowerCase())) {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }
    
    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Not found handler for undefined routes
     */
    notFoundHandler() {
        return (req, res, next) => {
            const error = new APIError(
                `Cannot ${req.method} ${req.path}`,
                404,
                'ROUTE_NOT_FOUND',
                {
                    method: req.method,
                    path: req.path,
                    availableRoutes: this.getAvailableRoutes(req.app)
                }
            );
            next(error);
        };
    }
    
    /**
     * Get available routes for debugging
     */
    getAvailableRoutes(app) {
        const routes = [];
        
        if (app._router && app._router.stack) {
            app._router.stack.forEach((layer) => {
                if (layer.route) {
                    const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
                    routes.push(`${methods} ${layer.route.path}`);
                }
            });
        }
        
        return routes.slice(0, 10); // Limit to prevent response bloat
    }
    
    /**
     * Unhandled promise rejection handler
     */
    handleUnhandledRejection() {
        process.on('unhandledRejection', (reason, promise) => {
            this.errorLogger.logError(
                new APIError('Unhandled Promise Rejection', 500, 'UNHANDLED_REJECTION'),
                { reason: reason?.toString(), promise: promise?.toString() }
            );
            
            // In production, might want to gracefully shutdown
            if (process.env.NODE_ENV === 'production') {
                console.error('Unhandled rejection, shutting down gracefully...');
                process.exit(1);
            }
        });
    }
    
    /**
     * Uncaught exception handler
     */
    handleUncaughtException() {
        process.on('uncaughtException', (error) => {
            this.errorLogger.logError(
                new APIError('Uncaught Exception', 500, 'UNCAUGHT_EXCEPTION'),
                { error: error.toString(), stack: error.stack }
            );
            
            console.error('Uncaught exception, shutting down...');
            process.exit(1);
        });
    }
    
    /**
     * Get error statistics for monitoring
     */
    getErrorStats() {
        return this.errorLogger.getErrorStats();
    }
    
    /**
     * Health check for error handling system
     */
    healthCheck() {
        return this.errorLogger.healthCheck();
    }
    
    /**
     * Generate error report
     */
    generateErrorReport() {
        return this.errorLogger.generateErrorReport();
    }
}

module.exports = ErrorHandlingMiddleware;