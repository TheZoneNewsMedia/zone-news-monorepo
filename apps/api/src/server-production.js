/**
 * Zone News API Server - Production Hardened
 */

const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const MonitoringClient = require('../../../libs/monitoring-client');

// Performance monitoring
const PerformanceMonitoringMiddleware = require('./middleware/performance-monitoring.middleware');

// Redis caching
const RedisCacheService = require('./services/redis-cache.service');
const CacheMiddleware = require('./middleware/cache.middleware');

// Error handling
const ErrorHandlingMiddleware = require('./middleware/error-handling.middleware');

// Safe rate limiting
const SafeRateLimitingMiddleware = require('./middleware/safe-rate-limiting.middleware');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const DB_NAME = 'zone_news_production';

// Initialize centralized monitoring client
const monitoringClient = new MonitoringClient('zone-api');

// Middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Add monitoring middleware
app.use(monitoringClient.trackRequest());

// Initialize services
const performanceMiddleware = new PerformanceMonitoringMiddleware();
const cacheService = new RedisCacheService();
const errorHandling = new ErrorHandlingMiddleware(
    performanceMiddleware.getMetricsService(),
    performanceMiddleware.getAlertingService()
);
const rateLimiting = new SafeRateLimitingMiddleware();

// Apply performance monitoring
app.use(performanceMiddleware.monitor());

// Apply rate limiting
app.use('/api/admin', rateLimiting.getAdminLimiter());
app.use('/api', rateLimiting.getApiLimiter());

let db, mongoClient;

// Health endpoint with monitoring
app.get('/health', rateLimiting.getHealthLimiter(), (req, res) => {
    const healthStatus = performanceMiddleware.getHealthStatus();
    res.json({
        status: healthStatus.status,
        service: 'zone-api',
        port: PORT,
        timestamp: new Date().toISOString(),
        database: db ? 'connected' : 'disconnected',
        performance: healthStatus.metrics,
        uptime: process.uptime(),
        monitoring: {
            connected: monitoringClient.isConnected,
            serviceType: monitoringClient.serviceType
        }
    });
});

// Telegram Webhook endpoint - Gateway to bot service
app.post('/api/webhook', rateLimiting.getApiLimiter(), errorHandling.asyncHandler(async (req, res) => {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;
    
    // Verify webhook secret if configured
    if (expectedSecret && secret !== expectedSecret) {
        monitoringClient.sendAlert('webhook_auth_failed', { ip: req.ip });
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Forward webhook to bot service
    const botPort = process.env.BOT_PORT || 3002;
    const botUrl = `http://localhost:${botPort}/webhook`;
    
    try {
        const response = await fetch(botUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Bot-Api-Secret-Token': secret
            },
            body: JSON.stringify(req.body),
            timeout: 5000
        });
        
        // Send metrics to monitoring
        monitoringClient.sendPerformanceData({
            endpoint: '/api/webhook',
            botResponse: response.status,
            success: response.ok
        });
        
        if (response.ok) {
            res.status(200).send('OK');
        } else {
            console.error('Bot service error:', response.status, response.statusText);
            res.status(200).send('OK'); // Still return OK to Telegram
        }
    } catch (error) {
        console.error('Error forwarding webhook to bot:', error);
        monitoringClient.sendAlert('webhook_forward_error', { error: error.message });
        res.status(200).send('OK'); // Always return OK to Telegram
    }
}));

// News endpoint with caching and rate limiting
app.get('/api/news', rateLimiting.getNewsLimiter(), CacheMiddleware.createNewsCache(cacheService), errorHandling.asyncHandler(async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;
        
        const articles = await db.collection('news_articles')
            .find({})
            .sort({ published_date: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
            
        const total = await db.collection('news_articles').countDocuments();
            
        res.json({
            success: true,
            count: articles.length,
            total: total,
            page: page,
            pages: Math.ceil(total / limit),
            articles: articles
        });
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: 'Failed to fetch news' });
    }
}));

// Performance metrics endpoint
app.get('/api/admin/performance', rateLimiting.getAdminLimiter(), (req, res) => {
    const metrics = performanceMiddleware.getPerformanceMetrics();
    res.json({
        timestamp: Date.now(),
        metrics: metrics,
        health: performanceMiddleware.getHealthStatus()
    });
});

// Admin dashboard endpoint
app.get('/admin/dashboard', rateLimiting.getAdminLimiter(), (req, res) => {
    res.json({
        service: 'zone-api',
        status: 'operational',
        performance: performanceMiddleware.getPerformanceMetrics(),
        health: performanceMiddleware.getHealthStatus(),
        cache: cacheService.getStats ? cacheService.getStats() : { status: 'unavailable' }
    });
});

// Error handling middleware
app.use(errorHandling.notFoundHandler());
app.use(errorHandling.handleError());

// Start server
async function startServer() {
    try {
        // Initialize cache service
        await cacheService.connect();
        console.log('Redis cache connected');

        // Connect to MongoDB
        mongoClient = new MongoClient(MONGODB_URI);
        await mongoClient.connect();
        db = mongoClient.db(DB_NAME);
        console.log('MongoDB connected');

        // Start HTTP server
        app.listen(PORT, () => {
            console.log(`Zone API (Production) running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/health`);
            console.log(`News API: http://localhost:${PORT}/api/news`);
            console.log(`Admin dashboard: http://localhost:${PORT}/admin/dashboard`);
            console.log(`Performance metrics: http://localhost:${PORT}/api/admin/performance`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    if (mongoClient) await mongoClient.close();
    if (cacheService) await cacheService.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    if (mongoClient) await mongoClient.close();
    if (cacheService) await cacheService.disconnect();
    process.exit(0);
});