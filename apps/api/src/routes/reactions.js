const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Allowed reaction types
const REACTION_TYPES = ['like', 'love', 'wow', 'sad', 'angry', 'laugh'];

// POST /api/article/:id/reaction - Add or update reaction
router.post('/article/:id/reaction', async (req, res) => {
    try {
        const { id } = req.params;
        const { reaction, userId } = req.body;
        
        if (!REACTION_TYPES.includes(reaction)) {
            return res.status(400).json({ 
                error: 'Invalid reaction type',
                allowed: REACTION_TYPES 
            });
        }
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }
        
        const db = await req.app.locals.getDb();
        
        // Check if article exists
        const article = await db.collection('news_articles').findOne({
            _id: ObjectId.isValid(id) ? new ObjectId(id) : id
        });
        
        if (!article) {
            return res.status(404).json({ error: 'Article not found' });
        }
        
        // Update or create reaction
        const reactionDoc = {
            articleId: article._id,
            userId: parseInt(userId),
            reaction,
            timestamp: new Date()
        };
        
        // Upsert reaction (user can only have one reaction per article)
        await db.collection('reactions').replaceOne(
            { 
                articleId: article._id, 
                userId: parseInt(userId) 
            },
            reactionDoc,
            { upsert: true }
        );
        
        // Update article reaction counts
        const reactionCounts = await db.collection('reactions').aggregate([
            { $match: { articleId: article._id } },
            { $group: { 
                _id: '$reaction', 
                count: { $sum: 1 } 
            }}
        ]).toArray();
        
        const reactions = {};
        reactionCounts.forEach(r => {
            reactions[r._id] = r.count;
        });
        
        // Update article with new reaction counts
        await db.collection('news_articles').updateOne(
            { _id: article._id },
            { 
                $set: { 
                    reactions,
                    lastReactionAt: new Date()
                }
            }
        );
        
        res.json({
            success: true,
            reaction,
            reactions
        });
        
    } catch (error) {
        console.error('Error adding reaction:', error);
        res.status(500).json({ error: 'Failed to add reaction' });
    }
});

// GET /api/article/:id/reactions - Get all reactions for an article
router.get('/article/:id/reactions', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await req.app.locals.getDb();
        
        // Get article
        const article = await db.collection('news_articles').findOne({
            _id: ObjectId.isValid(id) ? new ObjectId(id) : id
        });
        
        if (!article) {
            return res.status(404).json({ error: 'Article not found' });
        }
        
        // Get reaction counts
        const reactionCounts = await db.collection('reactions').aggregate([
            { $match: { articleId: article._id } },
            { $group: { 
                _id: '$reaction', 
                count: { $sum: 1 } 
            }}
        ]).toArray();
        
        const reactions = {};
        REACTION_TYPES.forEach(type => {
            reactions[type] = 0;
        });
        
        reactionCounts.forEach(r => {
            reactions[r._id] = r.count;
        });
        
        // Get user's reaction if userId provided
        let userReaction = null;
        const userId = req.query.userId;
        if (userId) {
            const reaction = await db.collection('reactions').findOne({
                articleId: article._id,
                userId: parseInt(userId)
            });
            userReaction = reaction?.reaction || null;
        }
        
        res.json({
            reactions,
            total: Object.values(reactions).reduce((a, b) => a + b, 0),
            userReaction
        });
        
    } catch (error) {
        console.error('Error getting reactions:', error);
        res.status(500).json({ error: 'Failed to get reactions' });
    }
});

// DELETE /api/article/:id/reaction - Remove user's reaction
router.delete('/article/:id/reaction', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }
        
        const db = await req.app.locals.getDb();
        
        // Check if article exists
        const article = await db.collection('news_articles').findOne({
            _id: ObjectId.isValid(id) ? new ObjectId(id) : id
        });
        
        if (!article) {
            return res.status(404).json({ error: 'Article not found' });
        }
        
        // Remove reaction
        const result = await db.collection('reactions').deleteOne({
            articleId: article._id,
            userId: parseInt(userId)
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Reaction not found' });
        }
        
        // Update article reaction counts
        const reactionCounts = await db.collection('reactions').aggregate([
            { $match: { articleId: article._id } },
            { $group: { 
                _id: '$reaction', 
                count: { $sum: 1 } 
            }}
        ]).toArray();
        
        const reactions = {};
        reactionCounts.forEach(r => {
            reactions[r._id] = r.count;
        });
        
        // Update article
        await db.collection('news_articles').updateOne(
            { _id: article._id },
            { $set: { reactions } }
        );
        
        res.json({
            success: true,
            reactions
        });
        
    } catch (error) {
        console.error('Error removing reaction:', error);
        res.status(500).json({ error: 'Failed to remove reaction' });
    }
});

// GET /api/trending/reactions - Get trending articles by reactions
router.get('/trending/reactions', async (req, res) => {
    try {
        const db = await req.app.locals.getDb();
        const limit = parseInt(req.query.limit) || 10;
        const timeframe = parseInt(req.query.hours) || 24;
        
        const since = new Date();
        since.setHours(since.getHours() - timeframe);
        
        // Get articles with most reactions in timeframe
        const trending = await db.collection('news_articles').find({
            lastReactionAt: { $gte: since }
        })
        .sort({ 
            'reactions.like': -1,
            'reactions.love': -1 
        })
        .limit(limit)
        .toArray();
        
        res.json({
            articles: trending,
            timeframe: `${timeframe} hours`,
            count: trending.length
        });
        
    } catch (error) {
        console.error('Error getting trending:', error);
        res.status(500).json({ error: 'Failed to get trending articles' });
    }
});

module.exports = router;