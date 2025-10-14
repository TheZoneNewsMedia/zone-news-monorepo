/**
 * Zone News API Server - Production Hardened with Centralized Monitoring
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
    
    // Send health metrics to centralized monitoring
    monitoringClient.sendMetrics({
        type: 'health_check',
        status: healthStatus.status,
        responseTime: healthStatus.metrics.avgResponseTime,
        memoryUsage: healthStatus.metrics.memoryUsage,
        errorRate: healthStatus.metrics.errorRate
    });
    
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

// News endpoint with caching and rate limiting
app.get('/api/news', rateLimiting.getNewsLimiter(), CacheMiddleware.createNewsCache(cacheService), errorHandling.asyncHandler(async (req, res) => {
    const queryStart = Date.now();
    
    try {
        if (!db) {
            monitoringClient.sendAlert('database_disconnected', { endpoint: '/api/news' });
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
        
        const queryTime = Date.now() - queryStart;
        
        // Send performance metrics to monitoring
        monitoringClient.sendPerformanceData({
            endpoint: '/api/news',
            queryTime: queryTime,
            resultCount: articles.length,
            page: page,
            limit: limit
        });
            
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
        monitoringClient.sendAlert('api_error', { 
            endpoint: '/api/news',
            error: error.message 
        });
        res.status(500).json({ error: 'Failed to fetch news' });
    }
}));

// Performance metrics endpoint
app.get('/api/admin/performance', rateLimiting.getAdminLimiter(), (req, res) => {
    const metrics = performanceMiddleware.getPerformanceMetrics();
    res.json({
        timestamp: Date.now(),
        metrics: metrics,
        health: performanceMiddleware.getHealthStatus(),
        monitoring: {
            connected: monitoringClient.isConnected,
            serviceType: monitoringClient.serviceType
        }
    });
});

// Admin dashboard endpoint
app.get('/admin/dashboard', rateLimiting.getAdminLimiter(), (req, res) => {
    res.json({
        service: 'zone-api',
        status: 'operational',
        performance: performanceMiddleware.getPerformanceMetrics(),
        health: performanceMiddleware.getHealthStatus(),
        cache: cacheService.getStats ? cacheService.getStats() : { status: 'unavailable' },
        monitoring: {
            connected: monitoringClient.isConnected,
            serviceType: monitoringClient.serviceType,
            url: monitoringClient.monitoringUrl
        }
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

        // Send startup metrics to monitoring
        monitoringClient.sendMetrics({
            type: 'server_startup',
            port: PORT,
            database: 'connected',
            cache: 'connected'
        });

        // Start HTTP server
        app.listen(PORT, () => {
            console.log(`Zone API (Production + Monitoring) running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/health`);
            console.log(`News API: http://localhost:${PORT}/api/news`);
            console.log(`Admin dashboard: http://localhost:${PORT}/admin/dashboard`);
            console.log(`Performance metrics: http://localhost:${PORT}/api/admin/performance`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        monitoringClient.sendAlert('startup_failure', { error: error.message });
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    monitoringClient.sendAlert('server_shutdown', { reason: 'SIGTERM' });
    monitoringClient.disconnect();
    if (mongoClient) await mongoClient.close();
    if (cacheService) await cacheService.disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    monitoringClient.sendAlert('server_shutdown', { reason: 'SIGINT' });
    monitoringClient.disconnect();
    if (mongoClient) await mongoClient.close();
    if (cacheService) await cacheService.disconnect();
    process.exit(0);
});