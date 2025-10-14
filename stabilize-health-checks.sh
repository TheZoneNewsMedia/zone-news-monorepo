#!/bin/bash

# Script to stabilize health checks across all services
echo "🏥 Stabilizing health checks..."

# Update auth-service health check
cat > apps/auth-service/src/routes/health.js << 'EOF'
const express = require('express');
const router = express.Router();

/**
 * GET /health
 * Basic health check - always returns OK
 */
router.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'auth-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

/**
 * GET /health/ready
 * Readiness check - checks DB connection
 */
router.get('/ready', async (req, res) => {
    try {
        const db = req.db;
        if (db) {
            await db.admin().ping();
            res.json({
                ready: true,
                service: 'auth-service',
                database: 'connected'
            });
        } else {
            res.status(503).json({
                ready: false,
                service: 'auth-service',
                database: 'not connected'
            });
        }
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
 * Liveness check
 */
router.get('/live', (req, res) => {
    res.json({
        alive: true,
        service: 'auth-service',
        pid: process.pid
    });
});

module.exports = router;
EOF

# Update user-service health check
cat > apps/user-service/src/routes/health.js << 'EOF'
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'user-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

router.get('/ready', async (req, res) => {
    try {
        const db = req.db;
        if (db) {
            await db.admin().ping();
            res.json({
                ready: true,
                service: 'user-service',
                database: 'connected'
            });
        } else {
            res.status(503).json({
                ready: false,
                service: 'user-service',
                database: 'not connected'
            });
        }
    } catch (error) {
        res.status(503).json({
            ready: false,
            service: 'user-service',
            error: error.message
        });
    }
});

module.exports = router;
EOF

# Create health check routes for workflow service
mkdir -p apps/workflow-service/src/routes
cat > apps/workflow-service/src/routes/health.js << 'EOF'
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'workflow-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

router.get('/ready', async (req, res) => {
    try {
        const db = req.db;
        const readyChecks = {
            database: false,
            queues: false
        };
        
        if (db) {
            await db.admin().ping();
            readyChecks.database = true;
        }
        
        if (req.queues && Object.keys(req.queues).length > 0) {
            readyChecks.queues = true;
        }
        
        const allReady = Object.values(readyChecks).every(v => v === true);
        
        if (allReady) {
            res.json({
                ready: true,
                service: 'workflow-service',
                checks: readyChecks
            });
        } else {
            res.status(503).json({
                ready: false,
                service: 'workflow-service',
                checks: readyChecks
            });
        }
    } catch (error) {
        res.status(503).json({
            ready: false,
            service: 'workflow-service',
            error: error.message
        });
    }
});

module.exports = router;
EOF

# Create missing route files for workflow service
cat > apps/workflow-service/src/routes/workflows.js << 'EOF'
const express = require('express');
const router = express.Router();

// GET /api/workflows
router.get('/', async (req, res) => {
    try {
        const workflows = await req.db.collection('workflows').find({}).toArray();
        res.json({ workflows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/workflows
router.post('/', async (req, res) => {
    try {
        const workflow = req.body;
        const result = await req.db.collection('workflows').insertOne(workflow);
        res.status(201).json({ id: result.insertedId, message: 'Workflow created' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/workflows/:id/execute
router.post('/:id/execute', async (req, res) => {
    try {
        const { id } = req.params;
        const context = req.body;
        
        // Queue the workflow for execution
        const job = await req.queues.content.add('execute-workflow', {
            workflowId: id,
            context
        });
        
        res.json({ 
            message: 'Workflow queued for execution',
            jobId: job.id 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
EOF

cat > apps/workflow-service/src/routes/executions.js << 'EOF'
const express = require('express');
const router = express.Router();

// GET /api/executions
router.get('/', async (req, res) => {
    try {
        const executions = await req.db.collection('workflow_executions')
            .find({})
            .sort({ startTime: -1 })
            .limit(100)
            .toArray();
        res.json({ executions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/executions/:id
router.get('/:id', async (req, res) => {
    try {
        const execution = await req.db.collection('workflow_executions')
            .findOne({ executionId: req.params.id });
        
        if (!execution) {
            return res.status(404).json({ error: 'Execution not found' });
        }
        
        res.json({ execution });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/executions/:id/cancel
router.post('/:id/cancel', async (req, res) => {
    try {
        const cancelled = await req.engine.cancelExecution(req.params.id);
        
        if (cancelled) {
            res.json({ message: 'Execution cancelled' });
        } else {
            res.status(404).json({ error: 'Execution not found or already completed' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
EOF

# Create missing utils and middleware
cat > apps/workflow-service/src/utils/logger.js << 'EOF'
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

class Logger {
    constructor(service = 'workflow-service') {
        this.service = service;
    }

    format(level, message, data) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.service}] [${level}]`;
        return data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
    }

    info(message, data) {
        console.log(colors.cyan + this.format('INFO', message, data) + colors.reset);
    }

    error(message, error) {
        const errorData = error instanceof Error ? { message: error.message, stack: error.stack } : error;
        console.error(colors.red + this.format('ERROR', message, errorData) + colors.reset);
    }
}

module.exports = { logger: new Logger() };
EOF

cat > apps/workflow-service/src/middleware/errorHandler.js << 'EOF'
const { logger } = require('../utils/logger');

function errorHandler(err, req, res, next) {
    logger.error(`Error in ${req.method} ${req.path}:`, err);
    
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    
    res.status(status).json({
        error: {
            message,
            status,
            timestamp: new Date().toISOString()
        }
    });
}

module.exports = { errorHandler };
EOF

echo "✅ Health checks stabilized for all services!"
echo ""
echo "Key changes:"
echo "  - /health endpoints no longer require DB connection"
echo "  - /health/ready endpoints check DB and other dependencies"
echo "  - /health/live endpoints for liveness probes"
echo ""
echo "Run './secure-deploy.sh' to deploy these changes"