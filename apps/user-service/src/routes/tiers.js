const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Tier definitions
const TIERS = {
    free: {
        name: 'Free',
        limits: {
            articlesPerDay: 10,
            savedArticles: 5,
            historyDays: 7,
            aiSummaries: false,
            earlyAccess: 0,
            apiAccess: false
        }
    },
    pro: {
        name: 'Pro',
        price: 14.99,
        limits: {
            articlesPerDay: 50,
            savedArticles: 50,
            historyDays: 30,
            aiSummaries: true,
            earlyAccess: 30, // minutes
            apiAccess: false
        }
    },
    business: {
        name: 'Business',
        price: 29.99,
        limits: {
            articlesPerDay: 200,
            savedArticles: -1, // unlimited
            historyDays: 90,
            aiSummaries: true,
            earlyAccess: 60,
            apiAccess: true
        }
    },
    enterprise: {
        name: 'Enterprise',
        price: 99.99,
        limits: {
            articlesPerDay: -1, // unlimited
            savedArticles: -1,
            historyDays: -1,
            aiSummaries: true,
            earlyAccess: 90,
            apiAccess: true
        }
    }
};

// GET /user/:userId/tier - Get user's current tier
router.get('/:userId/tier', async (req, res) => {
    try {
        const { userId } = req.params;
        const db = req.db;
        
        // Find user
        const user = await db.collection('users').findOne({
            telegramId: parseInt(userId)
        });
        
        if (!user) {
            // Create new user with free tier
            const newUser = {
                telegramId: parseInt(userId),
                tier: 'free',
                tierExpiry: null,
                usage: {
                    articlesRead: 0,
                    lastReset: new Date(),
                    savedArticles: []
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            await db.collection('users').insertOne(newUser);
            
            return res.json({
                tier: 'free',
                limits: TIERS.free.limits,
                usage: {
                    articlesRead: 0,
                    savedCount: 0
                }
            });
        }
        
        // Check if tier expired
        const tier = user.tierExpiry && user.tierExpiry < new Date() ? 'free' : user.tier || 'free';
        
        // Reset daily usage if needed
        const lastReset = user.usage?.lastReset || new Date();
        const now = new Date();
        const isNewDay = lastReset.toDateString() !== now.toDateString();
        
        if (isNewDay) {
            await db.collection('users').updateOne(
                { telegramId: parseInt(userId) },
                {
                    $set: {
                        'usage.articlesRead': 0,
                        'usage.lastReset': now
                    }
                }
            );
            user.usage.articlesRead = 0;
        }
        
        return res.json({
            tier,
            limits: TIERS[tier].limits,
            usage: {
                articlesRead: user.usage?.articlesRead || 0,
                savedCount: user.usage?.savedArticles?.length || 0
            },
            expiry: user.tierExpiry
        });
        
    } catch (error) {
        console.error('Error getting user tier:', error);
        res.status(500).json({ error: 'Failed to get user tier' });
    }
});

// POST /user/:userId/upgrade - Upgrade user tier
router.post('/:userId/upgrade', async (req, res) => {
    try {
        const { userId } = req.params;
        const { tier, paymentId } = req.body;
        const db = req.db;
        
        if (!TIERS[tier] || tier === 'free') {
            return res.status(400).json({ error: 'Invalid tier' });
        }
        
        // Calculate expiry (30 days from now)
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        
        // Update user tier
        const result = await db.collection('users').updateOne(
            { telegramId: parseInt(userId) },
            {
                $set: {
                    tier,
                    tierExpiry: expiry,
                    paymentId,
                    updatedAt: new Date()
                },
                $push: {
                    payments: {
                        tier,
                        amount: TIERS[tier].price,
                        paymentId,
                        date: new Date()
                    }
                }
            },
            { upsert: true }
        );
        
        res.json({
            success: true,
            tier,
            expiry,
            limits: TIERS[tier].limits
        });
        
    } catch (error) {
        console.error('Error upgrading tier:', error);
        res.status(500).json({ error: 'Failed to upgrade tier' });
    }
});

// POST /user/:userId/usage/increment - Track article read
router.post('/:userId/usage/increment', async (req, res) => {
    try {
        const { userId } = req.params;
        const { action = 'article_read' } = req.body;
        const db = req.db;
        
        // Get user and check limits
        const user = await db.collection('users').findOne({
            telegramId: parseInt(userId)
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const tier = user.tier || 'free';
        const limits = TIERS[tier].limits;
        
        // Check daily limit
        if (limits.articlesPerDay !== -1 && user.usage?.articlesRead >= limits.articlesPerDay) {
            return res.status(429).json({
                error: 'Daily limit reached',
                limit: limits.articlesPerDay,
                used: user.usage.articlesRead,
                tier
            });
        }
        
        // Increment usage
        await db.collection('users').updateOne(
            { telegramId: parseInt(userId) },
            {
                $inc: { 'usage.articlesRead': 1 },
                $set: { 'usage.lastActivity': new Date() }
            }
        );
        
        res.json({
            success: true,
            usage: {
                articlesRead: (user.usage?.articlesRead || 0) + 1,
                limit: limits.articlesPerDay
            }
        });
        
    } catch (error) {
        console.error('Error tracking usage:', error);
        res.status(500).json({ error: 'Failed to track usage' });
    }
});

// GET /tiers - Get all available tiers
router.get('/', async (req, res) => {
    const tiersInfo = Object.entries(TIERS).map(([key, value]) => ({
        id: key,
        name: value.name,
        price: value.price,
        limits: value.limits
    }));
    
    res.json({ tiers: tiersInfo });
});

module.exports = router;