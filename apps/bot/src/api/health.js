const express = require('express');
const router = express.Router();
const { getHealthStatus, getServices } = require('../services/bot-initialization');
const DatabaseService = require('../services/database-service');
const config = require('../config/environment');

// Basic health check endpoint
router.get('/', async (req, res) => {
    try {
        const healthStatus = getHealthStatus();
        
        // Determine overall health
        const overallHealth = healthStatus.status === 'healthy' && 
                             Object.values(healthStatus.services).every(status => 
                                 status === 'healthy' || status === 'disabled'
                             );
        
        res.status(overallHealth ? 200 : 503).json({
            status: overallHealth ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: healthStatus.uptime,
            version: healthStatus.version,
            services: healthStatus.services
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Detailed health check with all service status
router.get('/detailed', async (req, res) => {
    try {
        const healthStatus = getHealthStatus();
        const services = getServices();
        
        // Test database connection
        let dbHealth = 'healthy';
        let dbStats = null;
        try {
            await DatabaseService.ping();
            dbStats = await DatabaseService.getStats();
        } catch (error) {
            dbHealth = 'error';
        }
        
        // Test bot connection
        let botHealth = 'healthy';
        let botInfo = null;
        try {
            const botInitService = require('../services/bot-initialization');
            const bot = botInitService.getBotInstance();
            if (bot) {
                botInfo = await bot.telegram.getMe();
            }
        } catch (error) {
            botHealth = 'error';
        }
        
        res.json({
            status: healthStatus.status,
            timestamp: new Date().toISOString(),
            startTime: healthStatus.startTime,
            uptime: healthStatus.uptime,
            version: healthStatus.version,
            isInitialized: healthStatus.isInitialized,
            environment: process.env.NODE_ENV || 'development',
            
            services: {
                database: {
                    status: dbHealth,
                    stats: dbStats,
                    connectionString: config.database.uri ? '***connected***' : 'not configured'
                },
                bot: {
                    status: botHealth,
                    info: botInfo,
                    token: config.bot.token ? '***configured***' : 'not configured'
                },
                ...healthStatus.services
            },
            
            features: {
                reactionsEnabled: config.features.reactionsEnabled,
                analyticsEnabled: config.features.analyticsEnabled,
                subscriptionsEnabled: config.features.subscriptionsEnabled,
                schedulingEnabled: config.features.schedulingEnabled,
                adminPanelEnabled: config.features.adminPanelEnabled
            },
            
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                architecture: process.arch,
                memory: process.memoryUsage(),
                pid: process.pid
            }
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Database health check
router.get('/database', async (req, res) => {
    try {
        await DatabaseService.ping();
        const stats = await DatabaseService.getStats();
        
        res.json({
            status: 'healthy',
            stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(503).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Bot health check
router.get('/bot', async (req, res) => {
    try {
        const botInitService = require('../services/bot-initialization');
        const bot = botInitService.getBotInstance();
        
        if (!bot) {
            return res.status(503).json({
                status: 'error',
                message: 'Bot not initialized',
                timestamp: new Date().toISOString()
            });
        }
        
        const botInfo = await bot.telegram.getMe();
        
        res.json({
            status: 'healthy',
            botInfo,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(503).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Service-specific health checks
router.get('/services', async (req, res) => {
    try {
        const services = getServices();
        const serviceStatus = {};
        
        for (const [serviceName, service] of Object.entries(services)) {
            try {
                // Try to call a health check method if available
                if (service.getHealthStatus) {
                    serviceStatus[serviceName] = await service.getHealthStatus();
                } else if (service.ping) {
                    await service.ping();
                    serviceStatus[serviceName] = { status: 'healthy' };
                } else {
                    serviceStatus[serviceName] = { 
                        status: service ? 'healthy' : 'not initialized' 
                    };
                }
            } catch (error) {
                serviceStatus[serviceName] = { 
                    status: 'error', 
                    error: error.message 
                };
            }
        }
        
        res.json({
            status: 'ok',
            services: serviceStatus,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Metrics endpoint for monitoring
router.get('/metrics', async (req, res) => {
    try {
        const healthStatus = getHealthStatus();
        
        // Basic metrics in Prometheus-like format
        const metrics = `
# HELP zone_news_bot_uptime_seconds Bot uptime in seconds
# TYPE zone_news_bot_uptime_seconds counter
zone_news_bot_uptime_seconds ${Math.floor(healthStatus.uptime / 1000)}

# HELP zone_news_bot_status Bot status (1=healthy, 0=unhealthy)
# TYPE zone_news_bot_status gauge
zone_news_bot_status ${healthStatus.status === 'healthy' ? 1 : 0}

# HELP zone_news_bot_services_status Service status (1=healthy, 0=unhealthy)
# TYPE zone_news_bot_services_status gauge
${Object.entries(healthStatus.services).map(([service, status]) => 
    `zone_news_bot_services_status{service="${service}"} ${status === 'healthy' ? 1 : 0}`
).join('\n')}

# HELP zone_news_bot_memory_usage_bytes Memory usage in bytes
# TYPE zone_news_bot_memory_usage_bytes gauge
zone_news_bot_memory_usage_bytes{type="rss"} ${process.memoryUsage().rss}
zone_news_bot_memory_usage_bytes{type="heapTotal"} ${process.memoryUsage().heapTotal}
zone_news_bot_memory_usage_bytes{type="heapUsed"} ${process.memoryUsage().heapUsed}
zone_news_bot_memory_usage_bytes{type="external"} ${process.memoryUsage().external}
        `.trim();
        
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Readiness probe (for Kubernetes)
router.get('/ready', async (req, res) => {
    try {
        const healthStatus = getHealthStatus();
        
        if (healthStatus.isInitialized && healthStatus.status === 'healthy') {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                status: 'not ready',
                message: 'Bot not fully initialized',
                timestamp: new Date().toISOString()
            });
        }
        
    } catch (error) {
        res.status(503).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Liveness probe (for Kubernetes)
router.get('/live', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid
    });
});

module.exports = router;
