const { logger } = require('../utils/logger');

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
    // Log error
    logger.error(`Error in ${req.method} ${req.path}:`, err);

    // Default error status and message
    let status = err.status || 500;
    let message = err.message || 'Internal Server Error';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        status = 400;
        message = 'Validation Error';
    } else if (err.name === 'UnauthorizedError') {
        status = 401;
        message = 'Unauthorized';
    } else if (err.name === 'MongoError' && err.code === 11000) {
        status = 409;
        message = 'Duplicate key error';
    }

    // Send error response
    res.status(status).json({
        error: {
            message,
            status,
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method
        },
        // Include stack trace in development
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

/**
 * Async error wrapper
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Not found handler
 */
function notFound(req, res, next) {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
}

module.exports = {
    errorHandler,
    asyncHandler,
    notFound
};