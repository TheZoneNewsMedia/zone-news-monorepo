/**
 * Health Check Routes with Circuit Breaker Status
 */

const express = require('express');
const { asyncHandler, workflowCircuitBreaker, databaseCircuitBreaker } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Basic health check
router.get('/', asyncHandler(async (req, res) => {
    const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'workflow-service',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        circuitBreakers: {
            workflow: workflowCircuitBreaker.getState(),
            database: databaseCircuitBreaker.getState()
        }
    };

    // Check if any circuit breakers are open
    const workflowState = workflowCircuitBreaker.getState();
    const dbState = databaseCircuitBreaker.getState();
    
    if (workflowState.state === 'OPEN' || dbState.state === 'OPEN') {
        healthStatus.status = 'degraded';
        healthStatus.warnings = [];
        
        if (workflowState.state === 'OPEN') {
            healthStatus.warnings.push('Workflow circuit breaker is OPEN');
        }
        if (dbState.state === 'OPEN') {
            healthStatus.warnings.push('Database circuit breaker is OPEN');
        }
    }

    logger.healthCheck(healthStatus.status, {
        circuitBreakers: healthStatus.circuitBreakers,
        uptime: healthStatus.uptime
    });

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
}));

// Detailed health check
router.get('/detailed', asyncHandler(async (req, res) => {
    const checks = {};
    let overallStatus = 'healthy';

    // Database connectivity check
    try {
        if (req.db) {
            await databaseCircuitBreaker.execute(async () => {
                await req.db.admin().ping();
                checks.database = { status: 'healthy', latency: Date.now() };
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

    // Queue connectivity check
    try {
        if (req.queues) {
            for (const [queueName, queue] of Object.entries(req.queues)) {
                const waiting = await queue.getWaiting();
                const active = await queue.getActive();
                const completed = await queue.getCompleted();
                const failed = await queue.getFailed();
                
                checks[`queue_${queueName}`] = {
                    status: 'healthy',
                    waiting: waiting.length,
                    active: active.length,
                    completed: completed.length,
                    failed: failed.length
                };
            }
        } else {
            checks.queues = { status: 'warning', message: 'Queues not initialized' };
        }
    } catch (error) {
        checks.queues = { status: 'unhealthy', error: error.message };
        overallStatus = 'unhealthy';
    }

    // Workflow engine check
    try {
        if (req.engine) {
            const engineStatus = await req.engine.getStatus();
            checks.workflowEngine = {
                status: 'healthy',
                ...engineStatus
            };
        } else {
            checks.workflowEngine = { status: 'unhealthy', error: 'Engine not initialized' };
            overallStatus = 'unhealthy';
        }
    } catch (error) {
        checks.workflowEngine = { status: 'unhealthy', error: error.message };
        overallStatus = 'unhealthy';
    }

    // Memory usage check
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
        service: 'workflow-service',
        checks,
        circuitBreakers: {
            workflow: workflowCircuitBreaker.getState(),
            database: databaseCircuitBreaker.getState()
        },
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform
    };

    logger.healthCheck(overallStatus, checks);

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    res.status(statusCode).json(detailedHealth);
}));

// Readiness probe (for Kubernetes)
router.get('/ready', asyncHandler(async (req, res) => {
    const ready = req.db && req.engine && req.queues;
    
    if (ready) {
        res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({
            status: 'not ready',
            timestamp: new Date().toISOString(),
            missing: {
                database: !req.db,
                engine: !req.engine,
                queues: !req.queues
            }
        });
    }
}));

// Liveness probe (for Kubernetes)
router.get('/live', asyncHandler(async (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
}));

// Circuit breaker status
router.get('/circuit-breakers', asyncHandler(async (req, res) => {
    res.json({
        timestamp: new Date().toISOString(),
        circuitBreakers: {
            workflow: workflowCircuitBreaker.getState(),
            database: databaseCircuitBreaker.getState()
        }
    });
}));

// Reset circuit breakers (admin only)
router.post('/circuit-breakers/reset', asyncHandler(async (req, res) => {
    // In production, add authentication here
    if (process.env.NODE_ENV === 'production' && !req.headers['x-admin-token']) {
        return res.status(401).json({ error: 'Admin token required' });
    }

    workflowCircuitBreaker.onSuccess(); // Reset workflow breaker
    databaseCircuitBreaker.onSuccess(); // Reset database breaker

    logger.info('Circuit breakers reset by admin', {
        userAgent: req.headers['user-agent'],
        ip: req.ip
    });

    res.json({
        message: 'Circuit breakers reset successfully',
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;