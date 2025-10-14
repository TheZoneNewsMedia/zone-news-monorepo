/**
 * Error Types and Custom Error Classes
 * Standardized error handling for Zone News API
 */

/**
 * Base API Error Class
 */
class APIError extends Error {
    constructor(message, statusCode = 500, errorCode = null, details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
        this.isOperational = true; // Marks this as an expected error
        
        Error.captureStackTrace(this, this.constructor);
    }
    
    toJSON() {
        return {
            error: {
                name: this.name,
                message: this.message,
                statusCode: this.statusCode,
                errorCode: this.errorCode,
                details: this.details,
                timestamp: this.timestamp
            }
        };
    }
}

/**
 * Validation Error - 400 Bad Request
 */
class ValidationError extends APIError {
    constructor(message, field = null, value = null) {
        super(message, 400, 'VALIDATION_ERROR', {
            field,
            value: value ? String(value).substring(0, 100) : null // Limit value length for security
        });
    }
}

/**
 * Authentication Error - 401 Unauthorized
 */
class AuthenticationError extends APIError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

/**
 * Authorization Error - 403 Forbidden
 */
class AuthorizationError extends APIError {
    constructor(message = 'Insufficient permissions') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

/**
 * Not Found Error - 404 Not Found
 */
class NotFoundError extends APIError {
    constructor(resource = 'Resource', identifier = null) {
        const message = identifier ? 
            `${resource} with identifier '${identifier}' not found` :
            `${resource} not found`;
        super(message, 404, 'NOT_FOUND_ERROR', { resource, identifier });
    }
}

/**
 * Conflict Error - 409 Conflict
 */
class ConflictError extends APIError {
    constructor(message, conflictingField = null) {
        super(message, 409, 'CONFLICT_ERROR', { conflictingField });
    }
}

/**
 * Rate Limit Error - 429 Too Many Requests
 */
class RateLimitError extends APIError {
    constructor(resetTime = null) {
        super('Rate limit exceeded', 429, 'RATE_LIMIT_ERROR', {
            resetTime: resetTime || new Date(Date.now() + 60000).toISOString()
        });
    }
}

/**
 * Database Error - 500 Internal Server Error
 */
class DatabaseError extends APIError {
    constructor(message = 'Database operation failed', operation = null) {
        super(message, 500, 'DATABASE_ERROR', { operation });
    }
}

/**
 * Cache Error - 500 Internal Server Error
 */
class CacheError extends APIError {
    constructor(message = 'Cache operation failed', operation = null) {
        super(message, 500, 'CACHE_ERROR', { operation });
    }
}

/**
 * External Service Error - 502 Bad Gateway
 */
class ExternalServiceError extends APIError {
    constructor(service, message = 'External service unavailable') {
        super(message, 502, 'EXTERNAL_SERVICE_ERROR', { service });
    }
}

/**
 * Service Unavailable Error - 503 Service Unavailable
 */
class ServiceUnavailableError extends APIError {
    constructor(message = 'Service temporarily unavailable', retryAfter = 60) {
        super(message, 503, 'SERVICE_UNAVAILABLE_ERROR', { retryAfter });
    }
}

/**
 * Configuration Error - 500 Internal Server Error
 */
class ConfigurationError extends APIError {
    constructor(setting, message = 'Invalid configuration') {
        super(`${message}: ${setting}`, 500, 'CONFIGURATION_ERROR', { setting });
    }
}

/**
 * Error Severity Levels
 */
const ERROR_SEVERITY = {
    LOW: 'low',
    MEDIUM: 'medium', 
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Error Categories for Analytics
 */
const ERROR_CATEGORIES = {
    CLIENT_ERROR: 'client_error',      // 4xx errors
    SERVER_ERROR: 'server_error',      // 5xx errors
    VALIDATION: 'validation',          // Input validation failures
    AUTH: 'authentication',            // Authentication/authorization
    DATABASE: 'database',              // Database-related errors
    CACHE: 'cache',                    // Cache-related errors
    EXTERNAL: 'external_service',      // Third-party service errors
    CONFIGURATION: 'configuration',    // Configuration/setup errors
    RATE_LIMIT: 'rate_limit'          // Rate limiting errors
};

/**
 * Map error types to categories and severity
 */
const ERROR_MAPPING = {
    ValidationError: { category: ERROR_CATEGORIES.VALIDATION, severity: ERROR_SEVERITY.LOW },
    AuthenticationError: { category: ERROR_CATEGORIES.AUTH, severity: ERROR_SEVERITY.MEDIUM },
    AuthorizationError: { category: ERROR_CATEGORIES.AUTH, severity: ERROR_SEVERITY.MEDIUM },
    NotFoundError: { category: ERROR_CATEGORIES.CLIENT_ERROR, severity: ERROR_SEVERITY.LOW },
    ConflictError: { category: ERROR_CATEGORIES.CLIENT_ERROR, severity: ERROR_SEVERITY.LOW },
    RateLimitError: { category: ERROR_CATEGORIES.RATE_LIMIT, severity: ERROR_SEVERITY.MEDIUM },
    DatabaseError: { category: ERROR_CATEGORIES.DATABASE, severity: ERROR_SEVERITY.HIGH },
    CacheError: { category: ERROR_CATEGORIES.CACHE, severity: ERROR_SEVERITY.MEDIUM },
    ExternalServiceError: { category: ERROR_CATEGORIES.EXTERNAL, severity: ERROR_SEVERITY.HIGH },
    ServiceUnavailableError: { category: ERROR_CATEGORIES.SERVER_ERROR, severity: ERROR_SEVERITY.HIGH },
    ConfigurationError: { category: ERROR_CATEGORIES.CONFIGURATION, severity: ERROR_SEVERITY.CRITICAL },
    APIError: { category: ERROR_CATEGORIES.SERVER_ERROR, severity: ERROR_SEVERITY.MEDIUM }
};

/**
 * Get error metadata for analytics and monitoring
 */
function getErrorMetadata(error) {
    const errorType = error.constructor.name;
    const mapping = ERROR_MAPPING[errorType] || ERROR_MAPPING.APIError;
    
    return {
        type: errorType,
        category: mapping.category,
        severity: mapping.severity,
        statusCode: error.statusCode || 500,
        errorCode: error.errorCode,
        timestamp: error.timestamp || new Date().toISOString(),
        isOperational: error.isOperational || false
    };
}

/**
 * Check if error should trigger alerts
 */
function shouldAlert(error) {
    const metadata = getErrorMetadata(error);
    return metadata.severity === ERROR_SEVERITY.HIGH || 
           metadata.severity === ERROR_SEVERITY.CRITICAL;
}

module.exports = {
    // Error Classes
    APIError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    DatabaseError,
    CacheError,
    ExternalServiceError,
    ServiceUnavailableError,
    ConfigurationError,
    
    // Constants
    ERROR_SEVERITY,
    ERROR_CATEGORIES,
    ERROR_MAPPING,
    
    // Utilities
    getErrorMetadata,
    shouldAlert
};