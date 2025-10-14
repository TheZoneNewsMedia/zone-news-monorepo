const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { generateTokens, generateRefreshToken } = require('../utils/tokens');
const { logger } = require('../utils/logger');

const router = express.Router();

// JWT secret from environment - MUST be set in production
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
    throw new Error('JWT secrets must be set in environment variables');
}

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters')
], async (req, res, next) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, username } = req.body;
        const db = req.db;

        // Check if user exists
        const existingUser = await db.collection('users').findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(409).json({
                error: 'User already exists',
                message: existingUser.email === email 
                    ? 'Email already registered' 
                    : 'Username already taken'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = {
            email,
            username,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
            tier: 'free',
            active: true,
            emailVerified: false,
            telegramId: null,
            profile: {
                displayName: username,
                avatar: null,
                bio: null
            },
            preferences: {
                notifications: true,
                newsletter: true,
                theme: 'light'
            },
            metadata: {
                lastLogin: null,
                loginCount: 0,
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }
        };

        // Insert user
        const result = await db.collection('users').insertOne(user);
        user._id = result.insertedId;

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Store refresh token
        await db.collection('refresh_tokens').insertOne({
            userId: user._id,
            token: refreshToken,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        logger.info(`User registered: ${email}`);

        // Return user data and tokens
        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                tier: user.tier
            },
            tokens: {
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        logger.error('Registration error:', error);
        next(error);
    }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', [
    body('email').optional().isEmail().normalizeEmail(),
    body('username').optional(),
    body('password').notEmpty()
], async (req, res, next) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, username, password } = req.body;
        const db = req.db;

        if (!email && !username) {
            return res.status(400).json({
                error: 'Missing credentials',
                message: 'Email or username required'
            });
        }

        // Find user
        const query = email ? { email } : { username };
        const user = await db.collection('users').findOne(query);

        if (!user) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'User not found'
            });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Incorrect password'
            });
        }

        // Check if user is active
        if (!user.active) {
            return res.status(403).json({
                error: 'Account disabled',
                message: 'Your account has been disabled'
            });
        }

        // Update login metadata
        await db.collection('users').updateOne(
            { _id: user._id },
            {
                $set: {
                    'metadata.lastLogin': new Date(),
                    'metadata.ipAddress': req.ip,
                    'metadata.userAgent': req.get('user-agent')
                },
                $inc: { 'metadata.loginCount': 1 }
            }
        );

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Store refresh token
        await db.collection('refresh_tokens').insertOne({
            userId: user._id,
            token: refreshToken,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        logger.info(`User logged in: ${user.email}`);

        // Return user data and tokens
        res.json({
            message: 'Login successful',
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                tier: user.tier,
                profile: user.profile
            },
            tokens: {
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        logger.error('Login error:', error);
        next(error);
    }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const db = req.db;

        if (refreshToken) {
            // Invalidate refresh token
            await db.collection('refresh_tokens').deleteOne({ token: refreshToken });
            logger.info('Refresh token invalidated');
        }

        // Get authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            // Add token to blacklist (expires after token expiry)
            await db.collection('token_blacklist').insertOne({
                token,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
                reason: 'logout'
            });
        }

        res.json({
            message: 'Logout successful'
        });

    } catch (error) {
        logger.error('Logout error:', error);
        next(error);
    }
});

/**
 * POST /api/auth/verify-email
 * Verify user email
 */
router.post('/verify-email', [
    body('token').notEmpty()
], async (req, res, next) => {
    try {
        const { token } = req.body;
        const db = req.db;

        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Update user
        await db.collection('users').updateOne(
            { _id: decoded.userId },
            { $set: { emailVerified: true } }
        );

        res.json({
            message: 'Email verified successfully'
        });

    } catch (error) {
        logger.error('Email verification error:', error);
        res.status(400).json({
            error: 'Invalid token',
            message: 'Email verification failed'
        });
    }
});

/**
 * POST /api/auth/reset-password
 * Request password reset
 */
router.post('/reset-password', [
    body('email').isEmail().normalizeEmail()
], async (req, res, next) => {
    try {
        const { email } = req.body;
        const db = req.db;

        // Find user
        const user = await db.collection('users').findOne({ email });
        
        if (!user) {
            // Don't reveal if user exists
            return res.json({
                message: 'If the email exists, a reset link has been sent'
            });
        }

        // Generate reset token
        const resetToken = jwt.sign(
            { userId: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Store reset token
        await db.collection('password_resets').insertOne({
            userId: user._id,
            token: resetToken,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
            used: false
        });

        // Send email with reset link
        if (process.env.EMAIL_SERVICE_ENABLED === 'true') {
            try {
                const emailService = require('../services/email-service');
                await emailService.sendPasswordReset(email, resetToken);
                logger.info(`Password reset email sent to: ${email}`);
            } catch (emailError) {
                logger.error('Failed to send password reset email:', emailError);
                // Continue execution - don't expose email service errors to user
            }
        } else {
            logger.info(`Password reset requested for: ${email} (email service disabled)`);
        }

        res.json({
            message: 'If the email exists, a reset link has been sent'
        });

    } catch (error) {
        logger.error('Password reset error:', error);
        next(error);
    }
});

module.exports = router;