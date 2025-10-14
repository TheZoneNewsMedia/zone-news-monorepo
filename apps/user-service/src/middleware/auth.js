const axios = require('axios');
const { logger } = require('../utils/logger');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';

/**
 * Authentication middleware
 * Validates JWT token with auth service
 */
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7);

        // Validate token with auth service
        const response = await axios.post(`${AUTH_SERVICE_URL}/api/token/validate`, {
            token
        });

        if (!response.data.valid) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token'
            });
        }

        // Attach user info to request
        req.user = response.data.user;
        next();

    } catch (error) {
        if (error.response?.status === 401) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: error.response.data.message || 'Invalid token'
            });
        }

        logger.error('Authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: 'Could not validate token'
        });
    }
}

/**
 * Optional authentication
 * Attaches user if token is valid, continues anyway
 */
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.substring(7);

        const response = await axios.post(`${AUTH_SERVICE_URL}/api/token/validate`, {
            token
        });

        if (response.data.valid) {
            req.user = response.data.user;
        }

        next();

    } catch (error) {
        // Continue without user
        next();
    }
}

module.exports = {
    authenticate,
    optionalAuth
};