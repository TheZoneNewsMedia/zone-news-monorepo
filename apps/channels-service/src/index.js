/**
 * Channels Service - Zone News Bot
 * Manages Telegram channel configurations and bindings
 */

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.CHANNELS_SERVICE_PORT || 4004;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const DB_NAME = 'zone_news_production';

// Middleware
app.use(express.json());
app.use(cors());

// Database connection
let db;
let client;

async function connectDB() {
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);

        // Create indexes
        await db.collection('channels').createIndex({ channelId: 1 }, { unique: true });
        await db.collection('channels').createIndex({ channelUsername: 1 });
        await db.collection('channels').createIndex({ isPrimary: 1 });
        await db.collection('channels').createIndex({ isActive: 1 });

        console.log('✅ Channels Service connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}

// Validation middleware
function validateChannel(req, res, next) {
    const { channelId, channelName } = req.body;

    if (!channelId || !channelName) {
        return res.status(400).json({
            success: false,
            error: 'channelId and channelName are required'
        });
    }

    // Validate Telegram channel ID format
    if (!channelId.startsWith('@') && !channelId.startsWith('-100')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid channel ID format. Must start with @ or -100'
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
        service: 'channels-service',
        database: db ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// GET /api/channels - Get all channels with optional filters
app.get('/api/channels', asyncHandler(async (req, res) => {
    const { type, active, primary } = req.query;

    // Build query
    const query = {};
    if (type) query.channelType = type;
    if (active !== undefined) query.isActive = active === 'true';
    if (primary !== undefined) query.isPrimary = primary === 'true';

    const channels = await db.collection('channels')
        .find(query)
        .sort({ isPrimary: -1, createdAt: -1 })
        .toArray();

    res.json({
        success: true,
        channels,
        count: channels.length
    });
}));

// GET /api/channels/:id - Get single channel
app.get('/api/channels/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Try to find by MongoDB _id or channelId
    const channel = await db.collection('channels').findOne({
        $or: [
            { _id: ObjectId.isValid(id) ? new ObjectId(id) : null },
            { channelId: id }
        ]
    });

    if (!channel) {
        return res.status(404).json({
            success: false,
            error: 'Channel not found'
        });
    }

    res.json({
        success: true,
        channel
    });
}));

// POST /api/channels - Create new channel
app.post('/api/channels', validateChannel, asyncHandler(async (req, res) => {
    const { channelId, channelName, channelType = 'news', config = {} } = req.body;

    // Extract username from channelId
    const channelUsername = channelId.startsWith('@') ? channelId.substring(1) : channelId;

    // Check if channel already exists
    const existing = await db.collection('channels').findOne({ channelId });
    if (existing) {
        return res.status(409).json({
            success: false,
            error: 'Channel already exists'
        });
    }

    // If this is being set as primary, unset all other primary channels
    const isPrimary = req.body.isPrimary || false;
    if (isPrimary) {
        await db.collection('channels').updateMany(
            { isPrimary: true },
            { $set: { isPrimary: false } }
        );
    }

    // Create channel document
    const channel = {
        channelId,
        channelName,
        channelUsername,
        channelType,
        isActive: true,
        isPrimary,
        config: {
            autoForward: config.autoForward !== false,
            moderationEnabled: config.moderationEnabled !== false,
            reactionTracking: config.reactionTracking !== false,
            notificationsEnabled: config.notificationsEnabled !== false,
            ...config
        },
        statistics: {
            totalMessages: 0,
            totalViews: 0,
            subscriberCount: 0,
            lastPostDate: null
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: req.body.createdBy || 'system',
        lastModifiedBy: req.body.createdBy || 'system'
    };

    const result = await db.collection('channels').insertOne(channel);

    res.status(201).json({
        success: true,
        channel: {
            ...channel,
            _id: result.insertedId
        },
        message: 'Channel created successfully'
    });
}));

// PUT /api/channels/:id - Update channel
app.put('/api/channels/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.createdAt;
    delete updates.createdBy;
    delete updates.statistics;

    // Add update timestamp
    updates.updatedAt = new Date();

    // If setting as primary, unset all other primary channels
    if (updates.isPrimary === true) {
        await db.collection('channels').updateMany(
            { _id: { $ne: ObjectId.isValid(id) ? new ObjectId(id) : null } },
            { $set: { isPrimary: false } }
        );
    }

    const result = await db.collection('channels').findOneAndUpdate(
        {
            $or: [
                { _id: ObjectId.isValid(id) ? new ObjectId(id) : null },
                { channelId: id }
            ]
        },
        { $set: updates },
        { returnDocument: 'after' }
    );

    if (!result) {
        return res.status(404).json({
            success: false,
            error: 'Channel not found'
        });
    }

    res.json({
        success: true,
        channel: result,
        message: 'Channel updated successfully'
    });
}));

// DELETE /api/channels/:id - Soft delete channel
app.delete('/api/channels/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.collection('channels').findOneAndUpdate(
        {
            $or: [
                { _id: ObjectId.isValid(id) ? new ObjectId(id) : null },
                { channelId: id }
            ]
        },
        {
            $set: {
                isActive: false,
                updatedAt: new Date()
            }
        },
        { returnDocument: 'after' }
    );

    if (!result) {
        return res.status(404).json({
            success: false,
            error: 'Channel not found'
        });
    }

    res.json({
        success: true,
        message: 'Channel deactivated successfully',
        channel: result
    });
}));

// GET /api/channels/:id/stats - Get channel statistics
app.get('/api/channels/:id/stats', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const channel = await db.collection('channels').findOne({
        $or: [
            { _id: ObjectId.isValid(id) ? new ObjectId(id) : null },
            { channelId: id }
        ]
    });

    if (!channel) {
        return res.status(404).json({
            success: false,
            error: 'Channel not found'
        });
    }

    // Get article count for this channel
    const articleCount = await db.collection('news_articles').countDocuments({
        'zone_news_data.channel': channel.channelId
    });

    // Get total views from articles
    const viewsAggregation = await db.collection('news_articles').aggregate([
        { $match: { 'zone_news_data.channel': channel.channelId } },
        { $group: { _id: null, totalViews: { $sum: '$views' } } }
    ]).toArray();

    const totalViews = viewsAggregation[0]?.totalViews || 0;

    // Get latest article
    const latestArticle = await db.collection('news_articles')
        .findOne(
            { 'zone_news_data.channel': channel.channelId },
            { sort: { published_date: -1 } }
        );

    res.json({
        success: true,
        statistics: {
            ...channel.statistics,
            totalMessages: articleCount,
            totalViews,
            lastPostDate: latestArticle?.published_date || null,
            channelId: channel.channelId,
            channelName: channel.channelName
        }
    });
}));

// POST /api/channels/:id/sync - Sync channel statistics
app.post('/api/channels/:id/sync', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const channel = await db.collection('channels').findOne({
        $or: [
            { _id: ObjectId.isValid(id) ? new ObjectId(id) : null },
            { channelId: id }
        ]
    });

    if (!channel) {
        return res.status(404).json({
            success: false,
            error: 'Channel not found'
        });
    }

    // Get real-time statistics
    const articleCount = await db.collection('news_articles').countDocuments({
        'zone_news_data.channel': channel.channelId
    });

    const viewsAggregation = await db.collection('news_articles').aggregate([
        { $match: { 'zone_news_data.channel': channel.channelId } },
        { $group: { _id: null, totalViews: { $sum: '$views' } } }
    ]).toArray();

    const totalViews = viewsAggregation[0]?.totalViews || 0;

    const latestArticle = await db.collection('news_articles')
        .findOne(
            { 'zone_news_data.channel': channel.channelId },
            { sort: { published_date: -1 } }
        );

    // Update channel statistics
    await db.collection('channels').updateOne(
        { _id: channel._id },
        {
            $set: {
                'statistics.totalMessages': articleCount,
                'statistics.totalViews': totalViews,
                'statistics.lastPostDate': latestArticle?.published_date || null,
                updatedAt: new Date()
            }
        }
    );

    res.json({
        success: true,
        message: 'Channel statistics synced successfully',
        statistics: {
            totalMessages: articleCount,
            totalViews,
            lastPostDate: latestArticle?.published_date || null
        }
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
        console.log(`🚀 Channels Service running on port ${PORT}`);
        console.log(`📡 Health check: http://localhost:${PORT}/health`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down Channels Service...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});

// Start
if (require.main === module) {
    startServer().catch(console.error);
}

module.exports = { app, connectDB };
