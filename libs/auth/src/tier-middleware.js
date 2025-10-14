const { MongoClient } = require('mongodb');

// Tier limits configuration
const TIER_LIMITS = {
    free: {
        articlesPerDay: 10,
        savedArticles: 5,
        historyDays: 7,
        aiSummaries: false,
        earlyAccessMinutes: 0,
        apiAccess: false,
        searchesPerDay: 5
    },
    pro: {
        articlesPerDay: 50,
        savedArticles: 50,
        historyDays: 30,
        aiSummaries: true,
        earlyAccessMinutes: 30,
        apiAccess: false,
        searchesPerDay: 50
    },
    business: {
        articlesPerDay: 200,
        savedArticles: -1, // unlimited
        historyDays: 90,
        aiSummaries: true,
        earlyAccessMinutes: 60,
        apiAccess: true,
        searchesPerDay: -1
    },
    enterprise: {
        articlesPerDay: -1,
        savedArticles: -1,
        historyDays: -1,
        aiSummaries: true,
        earlyAccessMinutes: 90,
        apiAccess: true,
        searchesPerDay: -1
    }
};

/**
 * Get user's tier and usage from database
 */
async function getUserTierData(db, userId) {
    const user = await db.collection('users').findOne({
        telegramId: parseInt(userId)
    });
    
    if (!user) {
        // Create new free user
        const newUser = {
            telegramId: parseInt(userId),
            tier: 'free',
            tierExpiry: null,
            usage: {
                articlesRead: 0,
                searchesToday: 0,
                lastReset: new Date(),
                savedArticles: []
            },
            createdAt: new Date()
        };
        
        await db.collection('users').insertOne(newUser);
        return newUser;
    }
    
    // Check if tier expired
    if (user.tierExpiry && user.tierExpiry < new Date()) {
        user.tier = 'free';
        await db.collection('users').updateOne(
            { telegramId: parseInt(userId) },
            { $set: { tier: 'free', tierExpiry: null } }
        );
    }
    
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
                    'usage.searchesToday': 0,
                    'usage.lastReset': now
                }
            }
        );
        user.usage.articlesRead = 0;
        user.usage.searchesToday = 0;
    }
    
    return user;
}

/**
 * Check if user has reached their tier limit for a specific action
 */
async function checkTierLimit(db, userId, action) {
    const user = await getUserTierData(db, userId);
    const tier = user.tier || 'free';
    const limits = TIER_LIMITS[tier];
    const usage = user.usage || {};
    
    switch (action) {
        case 'article_read':
            if (limits.articlesPerDay === -1) return { allowed: true, tier, limit: -1 };
            const articlesRead = usage.articlesRead || 0;
            return {
                allowed: articlesRead < limits.articlesPerDay,
                tier,
                limit: limits.articlesPerDay,
                used: articlesRead,
                remaining: Math.max(0, limits.articlesPerDay - articlesRead)
            };
            
        case 'save_article':
            if (limits.savedArticles === -1) return { allowed: true, tier, limit: -1 };
            const savedCount = usage.savedArticles?.length || 0;
            return {
                allowed: savedCount < limits.savedArticles,
                tier,
                limit: limits.savedArticles,
                used: savedCount,
                remaining: Math.max(0, limits.savedArticles - savedCount)
            };
            
        case 'search':
            if (limits.searchesPerDay === -1) return { allowed: true, tier, limit: -1 };
            const searchesToday = usage.searchesToday || 0;
            return {
                allowed: searchesToday < limits.searchesPerDay,
                tier,
                limit: limits.searchesPerDay,
                used: searchesToday,
                remaining: Math.max(0, limits.searchesPerDay - searchesToday)
            };
            
        case 'ai_summary':
            return {
                allowed: limits.aiSummaries,
                tier,
                feature: 'AI Summaries'
            };
            
        case 'api_access':
            return {
                allowed: limits.apiAccess,
                tier,
                feature: 'API Access'
            };
            
        default:
            return { allowed: true, tier };
    }
}

/**
 * Increment usage counter for an action
 */
async function incrementUsage(db, userId, action) {
    const updateField = {
        'article_read': 'usage.articlesRead',
        'search': 'usage.searchesToday'
    }[action];
    
    if (updateField) {
        await db.collection('users').updateOne(
            { telegramId: parseInt(userId) },
            {
                $inc: { [updateField]: 1 },
                $set: { 'usage.lastActivity': new Date() }
            }
        );
    }
}

/**
 * Express middleware to enforce tier limits
 * @param {string} action - The action to check (article_read, save_article, etc.)
 * @param {boolean} autoIncrement - Whether to auto-increment usage on success
 */
function tierLimitMiddleware(action, autoIncrement = true) {
    return async (req, res, next) => {
        try {
            // Get user ID from request (set by auth middleware)
            const userId = req.userId || req.telegramUser?.id || req.body?.userId || req.query?.userId;
            
            if (!userId) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'User ID not found in request'
                });
            }
            
            // Get database connection
            const db = req.db || req.app.locals.db;
            if (!db) {
                console.error('Database not available in request');
                return next(); // Allow request but log error
            }
            
            // Check tier limit
            const limitCheck = await checkTierLimit(db, userId, action);
            
            if (!limitCheck.allowed) {
                return res.status(429).json({
                    error: 'Tier limit exceeded',
                    message: `You have reached your ${limitCheck.tier} tier limit`,
                    tier: limitCheck.tier,
                    limit: limitCheck.limit,
                    used: limitCheck.used,
                    remaining: 0,
                    upgradeUrl: '/upgrade'
                });
            }
            
            // Attach tier info to request
            req.tierInfo = {
                tier: limitCheck.tier,
                limits: TIER_LIMITS[limitCheck.tier],
                usage: limitCheck
            };
            
            // Auto-increment usage if enabled
            if (autoIncrement && limitCheck.limit !== -1) {
                await incrementUsage(db, userId, action);
            }
            
            next();
        } catch (error) {
            console.error('Tier middleware error:', error);
            // Allow request on error but log it
            next();
        }
    };
}

/**
 * Express middleware to require a specific tier or higher
 * @param {string} requiredTier - Minimum tier required (pro, business, enterprise)
 */
function requireTier(requiredTier) {
    const tierOrder = ['free', 'pro', 'business', 'enterprise'];
    const requiredIndex = tierOrder.indexOf(requiredTier);
    
    return async (req, res, next) => {
        try {
            const userId = req.userId || req.telegramUser?.id;
            
            if (!userId) {
                return res.status(401).json({
                    error: 'Authentication required'
                });
            }
            
            const db = req.db || req.app.locals.db;
            const user = await getUserTierData(db, userId);
            const userTier = user.tier || 'free';
            const userIndex = tierOrder.indexOf(userTier);
            
            if (userIndex < requiredIndex) {
                return res.status(403).json({
                    error: 'Insufficient tier',
                    message: `This feature requires ${requiredTier} tier or higher`,
                    currentTier: userTier,
                    requiredTier,
                    upgradeUrl: '/upgrade'
                });
            }
            
            req.tierInfo = {
                tier: userTier,
                limits: TIER_LIMITS[userTier]
            };
            
            next();
        } catch (error) {
            console.error('Tier requirement check error:', error);
            res.status(500).json({ error: 'Failed to verify tier' });
        }
    };
}

module.exports = {
    TIER_LIMITS,
    getUserTierData,
    checkTierLimit,
    incrementUsage,
    tierLimitMiddleware,
    requireTier
};