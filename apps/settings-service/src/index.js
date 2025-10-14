#!/usr/bin/env node

const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

/**
 * Production-Grade Settings Service with Circuit Breaker Protection
 */
class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000) {
        this.threshold = threshold;
        this.timeout = timeout;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
        }
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime
        };
    }
}

class Logger {
    constructor(serviceName = 'settings-service') {
        this.serviceName = serviceName;
    }

    log(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            service: this.serviceName,
            message,
            ...meta,
            pid: process.pid
        };

        console.log(JSON.stringify(logEntry));
    }

    info(message, meta) { this.log('info', message, meta); }
    warn(message, meta) { this.log('warn', message, meta); }
    error(message, meta) { this.log('error', message, meta); }
    debug(message, meta) { this.log('debug', message, meta); }
}

class SettingsService {
    constructor() {
        this.app = express();
        this.port = process.env.SETTINGS_SERVICE_PORT || 4005;
        this.db = null;
        this.server = null;
        this.logger = new Logger();
        this.circuitBreaker = new CircuitBreaker(3, 30000);
        this.isShuttingDown = false;
        
        // Default feature flags
        this.defaultFeatures = {
            newUI: true,
            aiSummaries: false,
            premiumTiers: true,
            advancedAnalytics: false,
            autoPosting: true,
            webhookIntegration: false,
            customTemplates: true,
            bulkOperations: true
        };
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    async connectDatabase() {
        try {
            const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
            const client = await MongoClient.connect(mongoUri, {
                useUnifiedTopology: true,
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            
            this.db = client.db('zone_news_production');
            
            // Test connection
            await this.db.admin().ping();
            
            this.logger.info('Connected to MongoDB', {
                database: 'zone_news_production'
            });
            
            return this.db;
        } catch (error) {
            this.logger.error('Failed to connect to MongoDB', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        }));
        
        // CORS
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));
        
        // Body parsing
        this.app.use(express.json({ limit: '1mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
        
        // Request logging
        this.app.use((req, res, next) => {
            if (!this.isShuttingDown) {
                this.logger.info(`${req.method} ${req.path}`, {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    requestId: req.headers['x-request-id']
                });
            }
            next();
        });

        // Circuit breaker middleware
        this.app.use((req, res, next) => {
            req.circuitBreaker = this.circuitBreaker;
            req.db = this.db;
            req.logger = this.logger;
            next();
        });
    }

    setupRoutes() {
        // Health check routes
        this.app.get('/health', this.handleHealthCheck.bind(this));
        this.app.get('/health/detailed', this.handleDetailedHealthCheck.bind(this));
        this.app.get('/ready', this.handleReadinessCheck.bind(this));
        this.app.get('/live', this.handleLivenessCheck.bind(this));
        
        // Feature flags
        this.app.get('/api/features', this.handleGetFeatures.bind(this));
        this.app.get('/api/features/:feature', this.handleGetFeature.bind(this));
        this.app.post('/api/features', this.handleUpdateFeatures.bind(this));
        this.app.put('/api/features/:feature', this.handleUpdateFeature.bind(this));
        
        // Configuration management
        this.app.get('/api/config', this.handleGetConfig.bind(this));
        this.app.post('/api/config', this.handleUpdateConfig.bind(this));
        this.app.get('/api/config/:key', this.handleGetConfigKey.bind(this));
        this.app.put('/api/config/:key', this.handleUpdateConfigKey.bind(this));
        
        // User preferences
        this.app.get('/api/preferences/:userId', this.handleGetUserPreferences.bind(this));
        this.app.post('/api/preferences/:userId', this.handleUpdateUserPreferences.bind(this));
        
        // Service settings
        this.app.get('/api/settings/services', this.handleGetServiceSettings.bind(this));
        this.app.post('/api/settings/services', this.handleUpdateServiceSettings.bind(this));
        
        // Circuit breaker status
        this.app.get('/api/circuit-breaker', this.handleCircuitBreakerStatus.bind(this));
        this.app.post('/api/circuit-breaker/reset', this.handleResetCircuitBreaker.bind(this));
        
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Route ${req.path} not found`,
                timestamp: new Date().toISOString()
            });
        });
    }

    setupErrorHandling() {
        // Global error handler
        this.app.use((err, req, res, next) => {
            this.logger.error('Unhandled error', {
                error: err.message,
                stack: err.stack,
                path: req.path,
                method: req.method
            });
            
            res.status(err.status || 500).json({
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
                timestamp: new Date().toISOString()
            });
        });
        
        // Process error handlers
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught Exception', {
                error: error.message,
                stack: error.stack,
                critical: true
            });
            
            this.gracefulShutdown('uncaughtException');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled Rejection', {
                reason: reason instanceof Error ? reason.message : reason,
                stack: reason instanceof Error ? reason.stack : undefined,
                promise: promise.toString(),
                critical: true
            });
            
            this.gracefulShutdown('unhandledRejection');
        });
    }

    // Route Handlers
    handleHealthCheck(req, res) {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'settings-service',
            version: process.env.npm_package_version || '1.0.0',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            circuitBreaker: this.circuitBreaker.getState()
        };
        
        // Check circuit breaker state
        if (this.circuitBreaker.getState().state === 'OPEN') {
            health.status = 'degraded';
            health.warning = 'Circuit breaker is OPEN';
        }
        
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    }

    async handleDetailedHealthCheck(req, res) {
        const checks = {
            database: { status: 'unknown' },
            memory: { status: 'unknown' },
            circuitBreaker: this.circuitBreaker.getState()
        };
        
        let overallStatus = 'healthy';
        
        // Database check
        try {
            if (this.db) {
                await this.circuitBreaker.execute(async () => {
                    const startTime = Date.now();
                    await this.db.admin().ping();
                    checks.database = {
                        status: 'healthy',
                        latency: Date.now() - startTime
                    };
                });
            } else {
                checks.database = { status: 'unhealthy', error: 'Database not connected' };
                overallStatus = 'unhealthy';
            }
        } catch (error) {
            checks.database = {
                status: 'unhealthy',
                error: error.message,
                circuitBreakerOpen: error.message === 'Circuit breaker is OPEN'
            };
            overallStatus = 'unhealthy';
        }
        
        // Memory check
        const memUsage = process.memoryUsage();
        const memoryThreshold = 500 * 1024 * 1024; // 500MB
        checks.memory = {
            status: memUsage.heapUsed > memoryThreshold ? 'warning' : 'healthy',
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss
        };
        
        const detailedHealth = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            service: 'settings-service',
            checks,
            uptime: process.uptime(),
            nodeVersion: process.version,
            platform: process.platform
        };
        
        const statusCode = overallStatus === 'healthy' ? 200 : 503;
        res.status(statusCode).json(detailedHealth);
    }

    handleReadinessCheck(req, res) {
        const ready = this.db && !this.isShuttingDown;
        
        if (ready) {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                status: 'not ready',
                timestamp: new Date().toISOString(),
                reasons: {
                    database: !this.db,
                    shuttingDown: this.isShuttingDown
                }
            });
        }
    }

    handleLivenessCheck(req, res) {
        res.status(200).json({
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    }

    async handleGetFeatures(req, res) {
        try {
            const features = await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    return this.defaultFeatures;
                }
                
                const settings = await this.db.collection('app_settings')
                    .findOne({ type: 'feature_flags' });
                
                return settings?.features || this.defaultFeatures;
            });
            
            res.json({
                features,
                timestamp: new Date().toISOString(),
                source: this.db ? 'database' : 'default'
            });
        } catch (error) {
            this.logger.error('Failed to get features', { error: error.message });
            
            if (error.message === 'Circuit breaker is OPEN') {
                return res.status(503).json({
                    error: 'Service temporarily unavailable',
                    features: this.defaultFeatures,
                    source: 'fallback'
                });
            }
            
            res.status(500).json({
                error: 'Failed to retrieve features',
                features: this.defaultFeatures,
                source: 'fallback'
            });
        }
    }

    async handleGetFeature(req, res) {
        try {
            const { feature } = req.params;
            
            const features = await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    return this.defaultFeatures;
                }
                
                const settings = await this.db.collection('app_settings')
                    .findOne({ type: 'feature_flags' });
                
                return settings?.features || this.defaultFeatures;
            });
            
            if (!(feature in features)) {
                return res.status(404).json({
                    error: 'Feature not found',
                    feature
                });
            }
            
            res.json({
                feature,
                enabled: features[feature],
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to get feature', { 
                feature: req.params.feature,
                error: error.message 
            });
            
            const fallbackValue = this.defaultFeatures[req.params.feature] || false;
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to retrieve feature',
                feature: req.params.feature,
                enabled: fallbackValue,
                source: 'fallback'
            });
        }
    }

    async handleUpdateFeatures(req, res) {
        try {
            const { features } = req.body;
            
            if (!features || typeof features !== 'object') {
                return res.status(400).json({
                    error: 'Invalid features object'
                });
            }
            
            const result = await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    throw new Error('Database not available');
                }
                
                const updatedFeatures = { ...this.defaultFeatures, ...features };
                
                await this.db.collection('app_settings').updateOne(
                    { type: 'feature_flags' },
                    {
                        $set: {
                            features: updatedFeatures,
                            updated_at: new Date(),
                            updated_by: req.headers['x-user-id'] || 'system'
                        }
                    },
                    { upsert: true }
                );
                
                return updatedFeatures;
            });
            
            this.logger.info('Features updated', {
                features: Object.keys(features),
                updatedBy: req.headers['x-user-id'] || 'system'
            });
            
            res.json({
                success: true,
                features: result,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to update features', { error: error.message });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to update features',
                message: error.message
            });
        }
    }

    async handleUpdateFeature(req, res) {
        try {
            const { feature } = req.params;
            const { enabled } = req.body;
            
            if (typeof enabled !== 'boolean') {
                return res.status(400).json({
                    error: 'Feature enabled value must be boolean'
                });
            }
            
            const result = await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    throw new Error('Database not available');
                }
                
                await this.db.collection('app_settings').updateOne(
                    { type: 'feature_flags' },
                    {
                        $set: {
                            [`features.${feature}`]: enabled,
                            updated_at: new Date(),
                            updated_by: req.headers['x-user-id'] || 'system'
                        }
                    },
                    { upsert: true }
                );
                
                return { [feature]: enabled };
            });
            
            this.logger.info('Feature updated', {
                feature,
                enabled,
                updatedBy: req.headers['x-user-id'] || 'system'
            });
            
            res.json({
                success: true,
                feature,
                enabled,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to update feature', {
                feature: req.params.feature,
                error: error.message
            });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to update feature',
                message: error.message
            });
        }
    }

    async handleGetConfig(req, res) {
        try {
            const config = await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    return {};
                }
                
                const settings = await this.db.collection('app_settings')
                    .findOne({ type: 'global_config' });
                
                return settings?.config || {};
            });
            
            res.json({
                config,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to get config', { error: error.message });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to retrieve config',
                config: {},
                source: 'fallback'
            });
        }
    }

    async handleUpdateConfig(req, res) {
        try {
            const { config } = req.body;
            
            if (!config || typeof config !== 'object') {
                return res.status(400).json({
                    error: 'Invalid config object'
                });
            }
            
            await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    throw new Error('Database not available');
                }
                
                await this.db.collection('app_settings').updateOne(
                    { type: 'global_config' },
                    {
                        $set: {
                            config,
                            updated_at: new Date(),
                            updated_by: req.headers['x-user-id'] || 'system'
                        }
                    },
                    { upsert: true }
                );
            });
            
            this.logger.info('Config updated', {
                keys: Object.keys(config),
                updatedBy: req.headers['x-user-id'] || 'system'
            });
            
            res.json({
                success: true,
                config,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to update config', { error: error.message });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to update config',
                message: error.message
            });
        }
    }

    async handleGetConfigKey(req, res) {
        try {
            const { key } = req.params;
            
            const config = await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    return {};
                }
                
                const settings = await this.db.collection('app_settings')
                    .findOne({ type: 'global_config' });
                
                return settings?.config || {};
            });
            
            if (!(key in config)) {
                return res.status(404).json({
                    error: 'Config key not found',
                    key
                });
            }
            
            res.json({
                key,
                value: config[key],
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to get config key', {
                key: req.params.key,
                error: error.message
            });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to retrieve config key',
                key: req.params.key
            });
        }
    }

    async handleUpdateConfigKey(req, res) {
        try {
            const { key } = req.params;
            const { value } = req.body;
            
            await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    throw new Error('Database not available');
                }
                
                await this.db.collection('app_settings').updateOne(
                    { type: 'global_config' },
                    {
                        $set: {
                            [`config.${key}`]: value,
                            updated_at: new Date(),
                            updated_by: req.headers['x-user-id'] || 'system'
                        }
                    },
                    { upsert: true }
                );
            });
            
            this.logger.info('Config key updated', {
                key,
                updatedBy: req.headers['x-user-id'] || 'system'
            });
            
            res.json({
                success: true,
                key,
                value,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to update config key', {
                key: req.params.key,
                error: error.message
            });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to update config key',
                message: error.message
            });
        }
    }

    async handleGetUserPreferences(req, res) {
        try {
            const { userId } = req.params;
            
            const preferences = await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    return {};
                }
                
                const userPrefs = await this.db.collection('user_preferences')
                    .findOne({ user_id: userId });
                
                return userPrefs?.preferences || {};
            });
            
            res.json({
                userId,
                preferences,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to get user preferences', {
                userId: req.params.userId,
                error: error.message
            });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to retrieve user preferences',
                userId: req.params.userId
            });
        }
    }

    async handleUpdateUserPreferences(req, res) {
        try {
            const { userId } = req.params;
            const { preferences } = req.body;
            
            if (!preferences || typeof preferences !== 'object') {
                return res.status(400).json({
                    error: 'Invalid preferences object'
                });
            }
            
            await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    throw new Error('Database not available');
                }
                
                await this.db.collection('user_preferences').updateOne(
                    { user_id: userId },
                    {
                        $set: {
                            preferences,
                            updated_at: new Date()
                        }
                    },
                    { upsert: true }
                );
            });
            
            this.logger.info('User preferences updated', {
                userId,
                keys: Object.keys(preferences)
            });
            
            res.json({
                success: true,
                userId,
                preferences,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to update user preferences', {
                userId: req.params.userId,
                error: error.message
            });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to update user preferences',
                message: error.message
            });
        }
    }

    async handleGetServiceSettings(req, res) {
        try {
            const settings = await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    return {};
                }
                
                const serviceSettings = await this.db.collection('service_settings')
                    .find({})
                    .toArray();
                
                const settingsMap = {};
                serviceSettings.forEach(setting => {
                    settingsMap[setting.service_name] = setting.settings;
                });
                
                return settingsMap;
            });
            
            res.json({
                services: settings,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to get service settings', { error: error.message });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to retrieve service settings',
                services: {}
            });
        }
    }

    async handleUpdateServiceSettings(req, res) {
        try {
            const { serviceName, settings } = req.body;
            
            if (!serviceName || !settings || typeof settings !== 'object') {
                return res.status(400).json({
                    error: 'Invalid serviceName or settings'
                });
            }
            
            await this.circuitBreaker.execute(async () => {
                if (!this.db) {
                    throw new Error('Database not available');
                }
                
                await this.db.collection('service_settings').updateOne(
                    { service_name: serviceName },
                    {
                        $set: {
                            settings,
                            updated_at: new Date(),
                            updated_by: req.headers['x-user-id'] || 'system'
                        }
                    },
                    { upsert: true }
                );
            });
            
            this.logger.info('Service settings updated', {
                serviceName,
                updatedBy: req.headers['x-user-id'] || 'system'
            });
            
            res.json({
                success: true,
                serviceName,
                settings,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to update service settings', { error: error.message });
            
            res.status(error.message === 'Circuit breaker is OPEN' ? 503 : 500).json({
                error: 'Failed to update service settings',
                message: error.message
            });
        }
    }

    handleCircuitBreakerStatus(req, res) {
        res.json({
            circuitBreaker: this.circuitBreaker.getState(),
            timestamp: new Date().toISOString()
        });
    }

    handleResetCircuitBreaker(req, res) {
        // In production, add authentication here
        if (process.env.NODE_ENV === 'production' && !req.headers['x-admin-token']) {
            return res.status(401).json({ error: 'Admin token required' });
        }
        
        this.circuitBreaker.onSuccess(); // Reset circuit breaker
        
        this.logger.info('Circuit breaker reset by admin', {
            userAgent: req.headers['user-agent'],
            ip: req.ip
        });
        
        res.json({
            message: 'Circuit breaker reset successfully',
            timestamp: new Date().toISOString()
        });
    }

    async start() {
        try {
            this.logger.info('Starting Settings Service...');
            
            // Connect to database (optional for this service)
            try {
                await this.connectDatabase();
            } catch (error) {
                this.logger.warn('Database connection failed, running in degraded mode', {
                    error: error.message
                });
            }
            
            // Start HTTP server
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                this.logger.info(`Settings Service running on port ${this.port}`, {
                    port: this.port,
                    environment: process.env.NODE_ENV || 'development',
                    nodeVersion: process.version,
                    pid: process.pid
                });
                
                this.logger.info('Available endpoints:', {
                    health: `GET /health`,
                    features: `GET /api/features`,
                    config: `GET /api/config`,
                    preferences: `GET /api/preferences/:userId`
                });
            });
            
            // Graceful shutdown handlers
            process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
            process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
            
        } catch (error) {
            this.logger.error('Failed to start Settings Service', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    }

    async gracefulShutdown(signal) {
        this.logger.info(`Received ${signal}, shutting down gracefully...`);
        this.isShuttingDown = true;
        
        // Stop accepting new requests
        if (this.server) {
            this.server.close(() => {
                this.logger.info('HTTP server closed');
            });
        }
        
        // Close database connection
        if (this.db) {
            try {
                await this.db.client.close();
                this.logger.info('Database connection closed');
            } catch (error) {
                this.logger.error('Error closing database connection', {
                    error: error.message
                });
            }
        }
        
        this.logger.info('Settings Service shutdown complete');
        process.exit(0);
    }
}

// Start the service
const settingsService = new SettingsService();
settingsService.start();