const express = require('express');
const { body, validationResult } = require('express-validator');
const { ObjectId } = require('mongodb');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/users/preferences
 * Get user preferences
 */
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const db = req.db;

        const user = await db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { preferences: 1 } }
        );

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({
            preferences: user.preferences || {
                notifications: true,
                newsletter: true,
                theme: 'light',
                language: 'en',
                categories: [],
                sources: []
            }
        });

    } catch (error) {
        logger.error('Get preferences error:', error);
        next(error);
    }
});

/**
 * PUT /api/users/preferences
 * Update user preferences
 */
router.put('/', [
    body('notifications').optional().isBoolean(),
    body('newsletter').optional().isBoolean(),
    body('theme').optional().isIn(['light', 'dark', 'auto']),
    body('language').optional().isIn(['en', 'es', 'fr', 'de', 'it']),
    body('categories').optional().isArray(),
    body('sources').optional().isArray(),
    body('autoBookmark').optional().isBoolean(),
    body('readingTime').optional().isBoolean(),
    body('fontSize').optional().isIn(['small', 'medium', 'large'])
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.userId;
        const preferences = req.body;
        const db = req.db;

        // Build update object
        const updateFields = {};
        Object.keys(preferences).forEach(key => {
            updateFields[`preferences.${key}`] = preferences[key];
        });
        updateFields.updatedAt = new Date();

        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        logger.info(`Preferences updated for user: ${userId}`);

        res.json({
            message: 'Preferences updated successfully',
            updated: Object.keys(preferences)
        });

    } catch (error) {
        logger.error('Update preferences error:', error);
        next(error);
    }
});

/**
 * POST /api/users/preferences/reset
 * Reset preferences to defaults
 */
router.post('/reset', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const db = req.db;

        const defaultPreferences = {
            notifications: true,
            newsletter: true,
            theme: 'light',
            language: 'en',
            categories: [],
            sources: [],
            autoBookmark: false,
            readingTime: true,
            fontSize: 'medium'
        };

        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { 
                $set: { 
                    preferences: defaultPreferences,
                    updatedAt: new Date()
                } 
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        logger.info(`Preferences reset for user: ${userId}`);

        res.json({
            message: 'Preferences reset to defaults',
            preferences: defaultPreferences
        });

    } catch (error) {
        logger.error('Reset preferences error:', error);
        next(error);
    }
});

/**
 * GET /api/users/preferences/notifications
 * Get notification preferences
 */
router.get('/notifications', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const db = req.db;

        const user = await db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { 'preferences.notifications': 1, 'notificationSettings': 1 } }
        );

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        const notificationSettings = user.notificationSettings || {
            email: {
                enabled: true,
                frequency: 'daily',
                types: ['newsletter', 'updates', 'alerts']
            },
            push: {
                enabled: false,
                types: []
            },
            telegram: {
                enabled: !!user.telegramId,
                types: ['breaking', 'daily_digest']
            }
        };

        res.json({
            enabled: user.preferences?.notifications ?? true,
            settings: notificationSettings
        });

    } catch (error) {
        logger.error('Get notification preferences error:', error);
        next(error);
    }
});

/**
 * PUT /api/users/preferences/notifications
 * Update notification preferences
 */
router.put('/notifications', [
    body('enabled').optional().isBoolean(),
    body('email.enabled').optional().isBoolean(),
    body('email.frequency').optional().isIn(['immediate', 'hourly', 'daily', 'weekly']),
    body('email.types').optional().isArray(),
    body('push.enabled').optional().isBoolean(),
    body('push.types').optional().isArray(),
    body('telegram.enabled').optional().isBoolean(),
    body('telegram.types').optional().isArray()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.userId;
        const { enabled, ...settings } = req.body;
        const db = req.db;

        const updateFields = {
            updatedAt: new Date()
        };

        if (enabled !== undefined) {
            updateFields['preferences.notifications'] = enabled;
        }

        // Update notification settings
        if (settings.email) {
            Object.keys(settings.email).forEach(key => {
                updateFields[`notificationSettings.email.${key}`] = settings.email[key];
            });
        }
        if (settings.push) {
            Object.keys(settings.push).forEach(key => {
                updateFields[`notificationSettings.push.${key}`] = settings.push[key];
            });
        }
        if (settings.telegram) {
            Object.keys(settings.telegram).forEach(key => {
                updateFields[`notificationSettings.telegram.${key}`] = settings.telegram[key];
            });
        }

        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        logger.info(`Notification preferences updated for user: ${userId}`);

        res.json({
            message: 'Notification preferences updated successfully'
        });

    } catch (error) {
        logger.error('Update notification preferences error:', error);
        next(error);
    }
});

module.exports = router;