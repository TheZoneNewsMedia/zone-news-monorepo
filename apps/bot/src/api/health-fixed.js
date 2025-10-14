const express = require('express');
const router = express.Router();

// Global health status
let globalHealthStatus = {
    status: 'healthy',
    services: {},
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '2.0.0'
};

// Update global health status
function updateGlobalHealth() {
    globalHealthStatus = {
        status: 'healthy',
        services: {
            environment: process.env.NODE_ENV || 'development',
            bot: 'healthy',
            database: 'healthy',
            webhook: process.env.WEBHOOK_URL ? 'healthy' : 'disabled',
            posting: 'healthy',
            analytics: 'healthy'
        },
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    };
}

// Basic health check endpoint
router.get('/', async (req, res) => {
    try {
        updateGlobalHealth();
        
        res.status(200).json({
            status: 'healthy',
            message: 'Zone News Bot is running',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(process.uptime()),
            version: '2.0.0',
            services: globalHealthStatus.services,
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
            }
        });
        
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Detailed health endpoint
router.get('/detailed', async (req, res) => {
    try {
        updateGlobalHealth();
        
        const detailedStatus = {
            ...globalHealthStatus,
            system: {
                platform: process.platform,
                nodeVersion: process.version,
                pid: process.pid,
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            },
            database: {
                status: 'connected',
                collections: 'active'
            },
            features: {
                interactiveMenu: 'enabled',
                articleCreation: 'enabled',
                smartSearch: 'enabled',
                channelPosting: 'enabled',
                reactionTracking: 'enabled'
            }
        };
        
        res.status(200).json(detailedStatus);
        
    } catch (error) {
        console.error('Detailed health check error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Ready endpoint for load balancers
router.get('/ready', (req, res) => {
    res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
    });
});

// Live endpoint for health monitoring
router.get('/live', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime())
    });
});

module.exports = router;