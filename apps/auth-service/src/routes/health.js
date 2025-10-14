const express = require('express');
const router = express.Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
    try {
        const db = req.db;
        
        // Check database connection
        await db.admin().ping();
        
        res.json({
            status: 'healthy',
            service: 'auth-service',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
            },
            database: 'connected'
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            service: 'auth-service',
            error: error.message,
            database: 'disconnected'
        });
    }
});

/**
 * GET /health/ready
 * Readiness check endpoint
 */
router.get('/ready', async (req, res) => {
    try {
        const db = req.db;
        
        // Check if service is ready to handle requests
        await db.admin().ping();
        
        res.json({
            ready: true,
            service: 'auth-service'
        });
    } catch (error) {
        res.status(503).json({
            ready: false,
            service: 'auth-service',
            error: error.message
        });
    }
});

/**
 * GET /health/live
 * Liveness check endpoint
 */
router.get('/live', (req, res) => {
    res.json({
        alive: true,
        service: 'auth-service',
        pid: process.pid
    });
});

module.exports = router;