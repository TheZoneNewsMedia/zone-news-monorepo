const express = require('express');
const { body, validationResult } = require('express-validator');
const { ObjectId } = require('mongodb');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/users/profile
 * Get current user profile
 */
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const db = req.db;

        const user = await db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { 
                projection: { 
                    password: 0, 
                    refreshTokens: 0 
                } 
            }
        );

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        // Get additional stats
        const stats = await getUserStats(db, userId);

        res.json({
            profile: {
                id: user._id,
                email: user.email,
                username: user.username,
                tier: user.tier,
                telegramId: user.telegramId,
                displayName: user.profile?.displayName,
                avatar: user.profile?.avatar,
                bio: user.profile?.bio,
                createdAt: user.createdAt,
                emailVerified: user.emailVerified
            },
            stats,
            preferences: user.preferences,
            metadata: {
                lastLogin: user.metadata?.lastLogin,
                loginCount: user.metadata?.loginCount
            }
        });

    } catch (error) {
        logger.error('Get profile error:', error);
        next(error);
    }
});

/**
 * PUT /api/users/profile
 * Update user profile
 */
router.put('/', [
    body('displayName').optional().isLength({ min: 1, max: 50 }),
    body('bio').optional().isLength({ max: 500 }),
    body('avatar').optional().isURL()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.userId;
        const { displayName, bio, avatar } = req.body;
        const db = req.db;

        const updateFields = {};
        if (displayName !== undefined) updateFields['profile.displayName'] = displayName;
        if (bio !== undefined) updateFields['profile.bio'] = bio;
        if (avatar !== undefined) updateFields['profile.avatar'] = avatar;
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

        logger.info(`Profile updated for user: ${userId}`);

        res.json({
            message: 'Profile updated successfully',
            updated: Object.keys(updateFields).filter(k => k !== 'updatedAt')
        });

    } catch (error) {
        logger.error('Update profile error:', error);
        next(error);
    }
});

/**
 * GET /api/users/profile/:username
 * Get public user profile by username
 */
router.get('/:username', async (req, res, next) => {
    try {
        const { username } = req.params;
        const db = req.db;

        const user = await db.collection('users').findOne(
            { username },
            { 
                projection: { 
                    'profile': 1,
                    'username': 1,
                    'tier': 1,
                    'createdAt': 1
                } 
            }
        );

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({
            username: user.username,
            displayName: user.profile?.displayName || user.username,
            avatar: user.profile?.avatar,
            bio: user.profile?.bio,
            tier: user.tier,
            memberSince: user.createdAt
        });

    } catch (error) {
        logger.error('Get public profile error:', error);
        next(error);
    }
});

/**
 * DELETE /api/users/profile
 * Delete user account
 */
router.delete('/', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const db = req.db;

        // Soft delete - mark as inactive
        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { 
                $set: { 
                    active: false,
                    deletedAt: new Date()
                } 
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        // Invalidate all refresh tokens
        await db.collection('refresh_tokens').deleteMany({ userId: new ObjectId(userId) });

        logger.info(`Account deleted for user: ${userId}`);

        res.json({
            message: 'Account deleted successfully'
        });

    } catch (error) {
        logger.error('Delete account error:', error);
        next(error);
    }
});

/**
 * Helper function to get user statistics
 */
async function getUserStats(db, userId) {
    const [bookmarks, articles, reactions] = await Promise.all([
        db.collection('bookmarks').countDocuments({ userId: new ObjectId(userId) }),
        db.collection('user_articles').countDocuments({ userId: new ObjectId(userId) }),
        db.collection('reactions').countDocuments({ userId: new ObjectId(userId) })
    ]);

    return {
        bookmarks,
        articlesRead: articles,
        reactions
    };
}

module.exports = router;