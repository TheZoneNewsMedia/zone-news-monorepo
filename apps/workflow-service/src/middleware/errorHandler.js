/**
 * Enhanced Error Handler with Circuit Breaker Protection
 */

const { logger } = require('../utils/logger');

class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000) {
        this.threshold = threshold;
        this.timeout = timeout;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
        }
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime
        };
    }
}

const workflowCircuitBreaker = new CircuitBreaker(5, 60000);
const databaseCircuitBreaker = new CircuitBreaker(3, 30000);

class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        
        Error.captureStackTrace(this, this.constructor);
    }
}

const handleDatabaseError = (error) => {
    logger.error('Database error:', {
        message: error.message,
        code: error.code,
        stack: error.stack
    });

    if (error.code === 'ECONNREFUSED') {
        return new AppError('Database connection failed', 503);
    }
    
    if (error.code === 11000) {
        return new AppError('Duplicate key error', 409);
    }
    
    return new AppError('Database operation failed', 500);
};

const handleValidationError = (error) => {
    const errors = Object.values(error.errors).map(val => val.message);
    return new AppError(`Validation Error: ${errors.join(', ')}`, 400);
};

const handleCastError = (error) => {
    return new AppError(`Invalid ${error.path}: ${error.value}`, 400);
};

const handleJWTError = () => {
    return new AppError('Invalid token. Please log in again', 401);
};

const handleJWTExpiredError = () => {
    return new AppError('Token expired. Please log in again', 401);
};

const sendErrorDev = (err, res) => {
    logger.error('DEV Error:', {
        error: err,
        stack: err.stack,
        circuitBreakerState: workflowCircuitBreaker.getState()
    });

    res.status(err.statusCode).json({
        status: 'error',
        error: err,
        message: err.message,
        stack: err.stack,
        circuitBreaker: workflowCircuitBreaker.getState()
    });
};

const sendErrorProd = (err, res) => {
    if (err.isOperational) {
        res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
            timestamp: err.timestamp
        });
    } else {
        logger.error('Programming Error:', {
            error: err,
            stack: err.stack
        });

        res.status(500).json({
            status: 'error',
            message: 'Something went wrong',
            timestamp: new Date().toISOString()
        });
    }
};

const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (error.name === 'CastError') error = handleCastError(error);
    if (error.code === 11000) error = handleDatabaseError(error);
    if (error.name === 'ValidationError') error = handleValidationError(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    if (error.name === 'MongoError') error = handleDatabaseError(error);

    // Circuit breaker logic
    if (error.statusCode >= 500) {
        workflowCircuitBreaker.onFailure();
    }

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(error, res);
    } else {
        sendErrorProd(error, res);
    }
};

const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

const protectedHandler = (fn) => {
    return asyncHandler(async (req, res, next) => {
        try {
            await workflowCircuitBreaker.execute(async () => {
                return await fn(req, res, next);
            });
        } catch (error) {
            if (error.message === 'Circuit breaker is OPEN') {
                return res.status(503).json({
                    status: 'error',
                    message: 'Service temporarily unavailable',
                    timestamp: new Date().toISOString()
                });
            }
            throw error;
        }
    });
};

const databaseHandler = (fn) => {
    return asyncHandler(async (req, res, next) => {
        try {
            await databaseCircuitBreaker.execute(async () => {
                return await fn(req, res, next);
            });
        } catch (error) {
            if (error.message === 'Circuit breaker is OPEN') {
                return res.status(503).json({
                    status: 'error',
                    message: 'Database temporarily unavailable',
                    timestamp: new Date().toISOString()
                });
            }
            throw error;
        }
    });
};

module.exports = {
    AppError,
    errorHandler,
    asyncHandler,
    protectedHandler,
    databaseHandler,
    workflowCircuitBreaker,
    databaseCircuitBreaker
};