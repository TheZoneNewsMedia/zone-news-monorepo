const { logger } = require('../utils/logger');

function errorHandler(err, req, res, next) {
    logger.error(`Error in ${req.method} ${req.path}:`, err);

    let status = err.status || 500;
    let message = err.message || 'Internal Server Error';

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

    res.status(status).json({
        error: {
            message,
            status,
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method
        },
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

module.exports = {
    errorHandler
};