const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const db = req.db;
        await db.admin().ping();
        
        res.json({
            status: 'healthy',
            service: 'user-service',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: 'connected'
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            service: 'user-service',
            error: error.message
        });
    }
});

router.get('/ready', async (req, res) => {
    try {
        const db = req.db;
        await db.admin().ping();
        
        res.json({
            ready: true,
            service: 'user-service'
        });
    } catch (error) {
        res.status(503).json({
            ready: false,
            service: 'user-service',
            error: error.message
        });
    }
});

module.exports = router;