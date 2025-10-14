/**
 * Analytics Service - Zone News Bot
 * Tracks user interactions, article engagement, and system metrics
 */

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const client = require('prom-client');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.ANALYTICS_SERVICE_PORT || 4006;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const DB_NAME = 'zone_news_production';

// Prometheus metrics setup
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Custom metrics
const eventCounter = new client.Counter({
    name: 'analytics_events_total',
    help: 'Total number of analytics events tracked',
    labelNames: ['event_type', 'entity_type']
});

const activeUsers = new client.Gauge({
    name: 'analytics_active_users',
    help: 'Number of active users in the last 24 hours'
});

register.registerMetric(eventCounter);
register.registerMetric(activeUsers);

// Middleware
app.use(express.json());
app.use(cors());

// Database connection
let db;
let client_mongo;

// Event buffer for batch inserts
let eventBuffer = [];
const BUFFER_SIZE = 100;
const BUFFER_FLUSH_INTERVAL = 5000; // 5 seconds

async function connectDB() {
    try {
        client_mongo = new MongoClient(MONGODB_URI);
        await client_mongo.connect();
        db = client_mongo.db(DB_NAME);

        // Create indexes for performance
        await db.collection('analytics_events').createIndex({ timestamp: -1 });
        await db.collection('analytics_events').createIndex({ eventType: 1, timestamp: -1 });
        await db.collection('analytics_events').createIndex({ entityType: 1, entityId: 1 });
        await db.collection('analytics_events').createIndex({ userId: 1, timestamp: -1 });
        await db.collection('analytics_daily_summary').createIndex({ date: 1 }, { unique: true });

        // Set TTL index for old events (keep 90 days)
        await db.collection('analytics_events').createIndex(
            { timestamp: 1 },
            { expireAfterSeconds: 90 * 24 * 60 * 60 }
        );

        console.log('✅ Analytics Service connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}

// Privacy-safe hashing for PII
function hashUserId(userId) {
    return crypto.createHash('sha256').update(String(userId)).digest('hex').substring(0, 16);
}

// Buffer management
function addToBuffer(event) {
    eventBuffer.push(event);
    if (eventBuffer.length >= BUFFER_SIZE) {
        flushBuffer();
    }
}

async function flushBuffer() {
    if (eventBuffer.length === 0) return;

    const events = [...eventBuffer];
    eventBuffer = [];

    try {
        await db.collection('analytics_events').insertMany(events, { ordered: false });
        console.log(`📊 Flushed ${events.length} events to database`);
    } catch (error) {
        console.error('Error flushing event buffer:', error);
        // Re-add failed events to buffer (with limit)
        if (eventBuffer.length < BUFFER_SIZE * 2) {
            eventBuffer.push(...events);
        }
    }
}

// Auto-flush buffer periodically
setInterval(flushBuffer, BUFFER_FLUSH_INTERVAL);

// Validation middleware
function validateEvent(req, res, next) {
    const { eventType, entityType, entityId } = req.body;

    if (!eventType || !entityType || !entityId) {
        return res.status(400).json({
            success: false,
            error: 'eventType, entityType, and entityId are required'
        });
    }

    const validEventTypes = ['view', 'click', 'share', 'reaction', 'search', 'bot_start', 'command'];
    const validEntityTypes = ['article', 'channel', 'bot', 'user', 'search'];

    if (!validEventTypes.includes(eventType)) {
        return res.status(400).json({
            success: false,
            error: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}`
        });
    }

    if (!validEntityTypes.includes(entityType)) {
        return res.status(400).json({
            success: false,
            error: `Invalid entityType. Must be one of: ${validEntityTypes.join(', ')}`
        });
    }

    next();
}

// Error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'analytics-service',
        database: db ? 'connected' : 'disconnected',
        bufferSize: eventBuffer.length,
        timestamp: new Date().toISOString()
    });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// POST /api/analytics/track - Track single event
app.post('/api/analytics/track', validateEvent, asyncHandler(async (req, res) => {
    const { eventType, entityType, entityId, userId, metadata = {} } = req.body;

    const event = {
        eventType,
        entityType,
        entityId,
        userId: userId ? hashUserId(userId) : null,
        metadata,
        timestamp: new Date(),
        sessionId: req.body.sessionId || null
    };

    // Update Prometheus metrics
    eventCounter.inc({ event_type: eventType, entity_type: entityType });

    // Add to buffer
    addToBuffer(event);

    res.json({
        success: true,
        message: 'Event tracked',
        eventId: event._id
    });
}));

// POST /api/analytics/batch - Track multiple events
app.post('/api/analytics/batch', asyncHandler(async (req, res) => {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'events array is required'
        });
    }

    const processedEvents = events.map(evt => ({
        eventType: evt.eventType,
        entityType: evt.entityType,
        entityId: evt.entityId,
        userId: evt.userId ? hashUserId(evt.userId) : null,
        metadata: evt.metadata || {},
        timestamp: new Date(),
        sessionId: evt.sessionId || null
    }));

    // Add all to buffer
    processedEvents.forEach(evt => {
        eventCounter.inc({ event_type: evt.eventType, entity_type: evt.entityType });
        addToBuffer(evt);
    });

    res.json({
        success: true,
        message: `${events.length} events queued for processing`
    });
}));

// GET /api/analytics/article/:articleId - Get article analytics
app.get('/api/analytics/article/:articleId', asyncHandler(async (req, res) => {
    const { articleId } = req.params;
    const { startDate, endDate } = req.query;

    const query = {
        entityType: 'article',
        entityId: articleId
    };

    if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Aggregate statistics
    const stats = await db.collection('analytics_events').aggregate([
        { $match: query },
        {
            $group: {
                _id: '$eventType',
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                eventType: '$_id',
                count: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        }
    ]).toArray();

    // Transform to object
    const analytics = stats.reduce((acc, stat) => {
        acc[stat.eventType] = {
            count: stat.count,
            uniqueUsers: stat.uniqueUsers
        };
        return acc;
    }, {});

    res.json({
        success: true,
        articleId,
        analytics,
        period: { startDate, endDate }
    });
}));

// GET /api/analytics/channel/:channelId - Get channel analytics
app.get('/api/analytics/channel/:channelId', asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    const { days = 7 } = req.query;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    const stats = await db.collection('analytics_events').aggregate([
        {
            $match: {
                'metadata.channelId': channelId,
                timestamp: { $gte: daysAgo }
            }
        },
        {
            $group: {
                _id: {
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                    eventType: '$eventType'
                },
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $group: {
                _id: '$_id.date',
                events: {
                    $push: {
                        type: '$_id.eventType',
                        count: '$count',
                        uniqueUsers: { $size: '$uniqueUsers' }
                    }
                }
            }
        },
        { $sort: { _id: 1 } }
    ]).toArray();

    res.json({
        success: true,
        channelId,
        days: parseInt(days),
        dailyStats: stats
    });
}));

// GET /api/analytics/summary - Get aggregated summary
app.get('/api/analytics/summary', asyncHandler(async (req, res) => {
    const { startDate, endDate, granularity = 'daily' } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Check if daily summaries exist
    const summaries = await db.collection('analytics_daily_summary')
        .find({
            date: { $gte: start, $lte: end }
        })
        .sort({ date: 1 })
        .toArray();

    if (summaries.length > 0) {
        return res.json({
            success: true,
            summaries,
            source: 'pre-aggregated'
        });
    }

    // Fall back to real-time aggregation
    const stats = await db.collection('analytics_events').aggregate([
        {
            $match: {
                timestamp: { $gte: start, $lte: end }
            }
        },
        {
            $group: {
                _id: null,
                totalViews: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'view'] }, 1, 0] }
                },
                totalClicks: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] }
                },
                totalShares: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'share'] }, 1, 0] }
                },
                totalReactions: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'reaction'] }, 1, 0] }
                },
                uniqueUsers: { $addToSet: '$userId' }
            }
        }
    ]).toArray();

    const summary = stats[0] || {
        totalViews: 0,
        totalClicks: 0,
        totalShares: 0,
        totalReactions: 0,
        uniqueUsers: []
    };

    summary.uniqueUsers = summary.uniqueUsers.length;

    res.json({
        success: true,
        period: { startDate: start, endDate: end },
        summary,
        source: 'real-time'
    });
}));

// GET /api/analytics/trending - Get trending content
app.get('/api/analytics/trending', asyncHandler(async (req, res) => {
    const { hours = 24, limit = 10 } = req.query;

    const hoursAgo = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const trending = await db.collection('analytics_events').aggregate([
        {
            $match: {
                entityType: 'article',
                timestamp: { $gte: hoursAgo }
            }
        },
        {
            $group: {
                _id: '$entityId',
                views: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'view'] }, 1, 0] }
                },
                clicks: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] }
                },
                shares: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'share'] }, 1, 0] }
                },
                reactions: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'reaction'] }, 1, 0] }
                },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $addFields: {
                engagementScore: {
                    $add: [
                        { $multiply: ['$views', 1] },
                        { $multiply: ['$clicks', 3] },
                        { $multiply: ['$shares', 5] },
                        { $multiply: ['$reactions', 2] }
                    ]
                },
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        },
        { $sort: { engagementScore: -1 } },
        { $limit: parseInt(limit) }
    ]).toArray();

    res.json({
        success: true,
        trending,
        period: { hours: parseInt(hours) }
    });
}));

// POST /api/analytics/aggregate - Manually trigger daily aggregation
app.post('/api/analytics/aggregate', asyncHandler(async (req, res) => {
    const { date } = req.body;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Aggregate events for the day
    const stats = await db.collection('analytics_events').aggregate([
        {
            $match: {
                timestamp: {
                    $gte: targetDate,
                    $lt: nextDay
                }
            }
        },
        {
            $group: {
                _id: null,
                totalViews: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'view'] }, 1, 0] }
                },
                totalClicks: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] }
                },
                totalShares: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'share'] }, 1, 0] }
                },
                totalReactions: {
                    $sum: { $cond: [{ $eq: ['$eventType', 'reaction'] }, 1, 0] }
                },
                uniqueUsers: { $addToSet: '$userId' }
            }
        }
    ]).toArray();

    const metrics = stats[0] || {
        totalViews: 0,
        totalClicks: 0,
        totalShares: 0,
        totalReactions: 0,
        uniqueUsers: []
    };

    // Get top articles
    const topArticles = await db.collection('analytics_events').aggregate([
        {
            $match: {
                entityType: 'article',
                eventType: 'view',
                timestamp: { $gte: targetDate, $lt: nextDay }
            }
        },
        {
            $group: {
                _id: '$entityId',
                views: { $sum: 1 }
            }
        },
        { $sort: { views: -1 } },
        { $limit: 10 }
    ]).toArray();

    const summary = {
        date: targetDate,
        metrics: {
            totalViews: metrics.totalViews,
            totalClicks: metrics.totalClicks,
            totalShares: metrics.totalShares,
            totalReactions: metrics.totalReactions,
            uniqueUsers: metrics.uniqueUsers.length,
            topArticles: topArticles.map(a => ({
                articleId: a._id,
                views: a.views
            }))
        },
        createdAt: new Date(),
        updatedAt: new Date()
    };

    // Upsert summary
    await db.collection('analytics_daily_summary').updateOne(
        { date: targetDate },
        { $set: summary },
        { upsert: true }
    );

    res.json({
        success: true,
        message: 'Daily summary aggregated',
        summary
    });
}));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 Analytics Service running on port ${PORT}`);
        console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
        console.log(`📡 Health check: http://localhost:${PORT}/health`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down Analytics Service...');
    await flushBuffer(); // Flush remaining events
    if (client_mongo) {
        await client_mongo.close();
    }
    process.exit(0);
});

// Start
if (require.main === module) {
    startServer().catch(console.error);
}

module.exports = { app, connectDB };
