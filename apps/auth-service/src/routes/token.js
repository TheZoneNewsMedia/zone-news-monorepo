const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { generateTokens } = require('../utils/tokens');
const { logger } = require('../utils/logger');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'zone-news-secret-key-2024';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'zone-news-refresh-secret-2024';

/**
 * POST /api/token/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', [
    body('refreshToken').notEmpty()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { refreshToken } = req.body;
        const db = req.db;

        // Verify refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        } catch (error) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Refresh token is invalid or expired'
            });
        }

        // Check if refresh token exists in database
        const storedToken = await db.collection('refresh_tokens').findOne({
            token: refreshToken,
            userId: decoded.userId
        });

        if (!storedToken) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Refresh token not found'
            });
        }

        // Check if token is expired
        if (storedToken.expiresAt < new Date()) {
            await db.collection('refresh_tokens').deleteOne({ _id: storedToken._id });
            return res.status(401).json({
                error: 'Token expired',
                message: 'Refresh token has expired'
            });
        }

        // Get user
        const user = await db.collection('users').findOne({ _id: decoded.userId });
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'User associated with token not found'
            });
        }

        // Generate new tokens
        const tokens = generateTokens(user);

        // Update refresh token in database
        await db.collection('refresh_tokens').updateOne(
            { _id: storedToken._id },
            {
                $set: {
                    token: tokens.refreshToken,
                    updatedAt: new Date(),
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                }
            }
        );

        logger.info(`Token refreshed for user: ${user.email}`);

        res.json({
            message: 'Token refreshed successfully',
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken
            }
        });

    } catch (error) {
        logger.error('Token refresh error:', error);
        next(error);
    }
});

/**
 * POST /api/token/validate
 * Validate access token
 */
router.post('/validate', [
    body('token').notEmpty()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { token } = req.body;
        const db = req.db;

        // Check if token is blacklisted
        const blacklisted = await db.collection('token_blacklist').findOne({ token });
        if (blacklisted) {
            return res.status(401).json({
                valid: false,
                error: 'Token blacklisted',
                message: 'This token has been revoked'
            });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    valid: false,
                    error: 'Token expired',
                    message: 'Access token has expired',
                    expiredAt: error.expiredAt
                });
            }
            return res.status(401).json({
                valid: false,
                error: 'Invalid token',
                message: 'Access token is invalid'
            });
        }

        // Get user to ensure they still exist and are active
        const user = await db.collection('users').findOne({ 
            _id: decoded.userId,
            active: true
        });

        if (!user) {
            return res.status(401).json({
                valid: false,
                error: 'User not found',
                message: 'User not found or inactive'
            });
        }

        res.json({
            valid: true,
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                tier: user.tier
            },
            token: {
                issuedAt: new Date(decoded.iat * 1000),
                expiresAt: new Date(decoded.exp * 1000)
            }
        });

    } catch (error) {
        logger.error('Token validation error:', error);
        next(error);
    }
});

/**
 * POST /api/token/revoke
 * Revoke a token (admin only)
 */
router.post('/revoke', [
    body('token').notEmpty(),
    body('reason').optional()
], async (req, res, next) => {
    try {
        const { token, reason = 'manual revocation' } = req.body;
        const db = req.db;

        // Admin authentication check
        const adminSecret = req.headers['x-admin-secret'];
        if (!process.env.ADMIN_SECRET) {
            return res.status(500).json({ error: 'Server configuration error' });
        }
        if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        // Add token to blacklist
        await db.collection('token_blacklist').insertOne({
            token,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            reason
        });

        logger.info(`Token revoked: ${reason}`);

        res.json({
            message: 'Token revoked successfully'
        });

    } catch (error) {
        logger.error('Token revocation error:', error);
        next(error);
    }
});

/**
 * GET /api/token/public-key
 * Get public key for token verification (for other services)
 */
router.get('/public-key', (req, res) => {
    // In production, use asymmetric keys (RS256)
    // For now, return a success message
    res.json({
        message: 'Public key endpoint',
        algorithm: 'HS256',
        note: 'In production, use RS256 with public/private key pairs'
    });
});

module.exports = router;