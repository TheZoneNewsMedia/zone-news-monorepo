const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { ObjectId } = require('mongodb');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/users/bookmarks
 * Get user bookmarks
 */
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20, sort = 'recent' } = req.query;
        const db = req.db;

        const skip = (page - 1) * limit;
        const sortOrder = sort === 'recent' ? { createdAt: -1 } : { createdAt: 1 };

        const bookmarks = await db.collection('bookmarks')
            .find({ userId: new ObjectId(userId) })
            .sort(sortOrder)
            .skip(skip)
            .limit(parseInt(limit))
            .toArray();

        // Get article details for bookmarks
        const articleIds = bookmarks.map(b => b.articleId);
        const articles = await db.collection('news_articles')
            .find({ _id: { $in: articleIds } })
            .toArray();

        // Map articles to bookmarks
        const bookmarksWithArticles = bookmarks.map(bookmark => {
            const article = articles.find(a => a._id.equals(bookmark.articleId));
            return {
                id: bookmark._id,
                articleId: bookmark.articleId,
                createdAt: bookmark.createdAt,
                tags: bookmark.tags,
                notes: bookmark.notes,
                article: article ? {
                    title: article.title,
                    summary: article.summary,
                    category: article.category,
                    source: article.source,
                    url: article.url,
                    image: article.image,
                    publishedDate: article.published_date
                } : null
            };
        });

        const total = await db.collection('bookmarks')
            .countDocuments({ userId: new ObjectId(userId) });

        res.json({
            bookmarks: bookmarksWithArticles,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        logger.error('Get bookmarks error:', error);
        next(error);
    }
});

/**
 * POST /api/users/bookmarks
 * Add bookmark
 */
router.post('/', [
    body('articleId').notEmpty().isMongoId(),
    body('tags').optional().isArray(),
    body('notes').optional().isString().isLength({ max: 500 })
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.userId;
        const { articleId, tags = [], notes = '' } = req.body;
        const db = req.db;

        // Check if article exists
        const article = await db.collection('news_articles')
            .findOne({ _id: new ObjectId(articleId) });

        if (!article) {
            return res.status(404).json({
                error: 'Article not found'
            });
        }

        // Check if already bookmarked
        const existing = await db.collection('bookmarks').findOne({
            userId: new ObjectId(userId),
            articleId: new ObjectId(articleId)
        });

        if (existing) {
            return res.status(409).json({
                error: 'Already bookmarked',
                bookmarkId: existing._id
            });
        }

        // Create bookmark
        const bookmark = {
            userId: new ObjectId(userId),
            articleId: new ObjectId(articleId),
            tags,
            notes,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('bookmarks').insertOne(bookmark);

        logger.info(`Bookmark added for user: ${userId}, article: ${articleId}`);

        res.status(201).json({
            message: 'Bookmark added successfully',
            bookmark: {
                id: result.insertedId,
                ...bookmark,
                article: {
                    title: article.title,
                    category: article.category
                }
            }
        });

    } catch (error) {
        logger.error('Add bookmark error:', error);
        next(error);
    }
});

/**
 * DELETE /api/users/bookmarks/:id
 * Remove bookmark
 */
router.delete('/:id', [
    param('id').isMongoId()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.userId;
        const bookmarkId = req.params.id;
        const db = req.db;

        const result = await db.collection('bookmarks').deleteOne({
            _id: new ObjectId(bookmarkId),
            userId: new ObjectId(userId)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                error: 'Bookmark not found'
            });
        }

        logger.info(`Bookmark removed for user: ${userId}, bookmark: ${bookmarkId}`);

        res.json({
            message: 'Bookmark removed successfully'
        });

    } catch (error) {
        logger.error('Remove bookmark error:', error);
        next(error);
    }
});

/**
 * PUT /api/users/bookmarks/:id
 * Update bookmark (tags, notes)
 */
router.put('/:id', [
    param('id').isMongoId(),
    body('tags').optional().isArray(),
    body('notes').optional().isString().isLength({ max: 500 })
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.userId;
        const bookmarkId = req.params.id;
        const { tags, notes } = req.body;
        const db = req.db;

        const updateFields = { updatedAt: new Date() };
        if (tags !== undefined) updateFields.tags = tags;
        if (notes !== undefined) updateFields.notes = notes;

        const result = await db.collection('bookmarks').updateOne(
            {
                _id: new ObjectId(bookmarkId),
                userId: new ObjectId(userId)
            },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                error: 'Bookmark not found'
            });
        }

        logger.info(`Bookmark updated for user: ${userId}, bookmark: ${bookmarkId}`);

        res.json({
            message: 'Bookmark updated successfully'
        });

    } catch (error) {
        logger.error('Update bookmark error:', error);
        next(error);
    }
});

/**
 * GET /api/users/bookmarks/check/:articleId
 * Check if article is bookmarked
 */
router.get('/check/:articleId', [
    param('articleId').isMongoId()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.userId;
        const articleId = req.params.articleId;
        const db = req.db;

        const bookmark = await db.collection('bookmarks').findOne({
            userId: new ObjectId(userId),
            articleId: new ObjectId(articleId)
        });

        res.json({
            bookmarked: !!bookmark,
            bookmarkId: bookmark?._id
        });

    } catch (error) {
        logger.error('Check bookmark error:', error);
        next(error);
    }
});

module.exports = router;