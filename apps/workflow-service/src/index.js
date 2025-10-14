#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');
const Bull = require('bull');
require('dotenv').config();

const workflowRoutes = require('./routes/workflows');
const executionRoutes = require('./routes/executions');
const healthRoutes = require('./routes/health');
const WorkflowEngine = require('./services/WorkflowEngine');
const { errorHandler } = require('./middleware/errorHandler');
const { logger } = require('./utils/logger');

class WorkflowService {
    constructor() {
        this.app = express();
        this.port = process.env.WORKFLOW_SERVICE_PORT || 4003;
        this.db = null;
        this.server = null;
        this.engine = null;
        this.queues = {};
    }

    async connectDatabase() {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        const client = await MongoClient.connect(mongoUri, {
            useUnifiedTopology: true
        });
        this.db = client.db('zone_news_production');
        logger.info('Connected to MongoDB');
        return this.db;
    }

    setupQueues() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        // Create queues for different workflow types
        this.queues.content = new Bull('content-workflows', redisUrl);
        this.queues.user = new Bull('user-workflows', redisUrl);
        this.queues.payment = new Bull('payment-workflows', redisUrl);
        this.queues.analytics = new Bull('analytics-workflows', redisUrl);
        
        logger.info('Job queues initialized');
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            credentials: true
        }));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        this.app.use((req, res, next) => {
            req.db = this.db;
            req.engine = this.engine;
            req.queues = this.queues;
            next();
        });

        this.app.use('/health', healthRoutes);
        this.app.use('/api/workflows', workflowRoutes);
        this.app.use('/api/executions', executionRoutes);

        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Route ${req.path} not found`
            });
        });

        this.app.use(errorHandler);
    }

    async initializeEngine() {
        this.engine = new WorkflowEngine(this.db, this.queues);
        await this.engine.initialize();
        logger.info('Workflow engine initialized');
    }

    async start() {
        try {
            logger.info('Starting Workflow Service...');
            
            await this.connectDatabase();
            this.setupQueues();
            await this.initializeEngine();
            this.setupMiddleware();
            this.setupRoutes();
            
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                logger.info(`Workflow Service running on port ${this.port}`);
                logger.info('Endpoints:');
                logger.info('  GET /api/workflows - List workflows');
                logger.info('  POST /api/workflows - Create workflow');
                logger.info('  GET /api/workflows/:id - Get workflow');
                logger.info('  POST /api/workflows/:id/execute - Execute workflow');
                logger.info('  GET /api/executions - List executions');
                logger.info('  GET /api/executions/:id - Get execution');
                logger.info('  POST /api/executions/:id/cancel - Cancel execution');
                logger.info('  GET /health - Health check');
            });

            process.on('SIGTERM', () => this.shutdown('SIGTERM'));
            process.on('SIGINT', () => this.shutdown('SIGINT'));

        } catch (error) {
            logger.error('Failed to start Workflow Service:', error);
            process.exit(1);
        }
    }

    async shutdown(signal) {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        
        if (this.engine) {
            await this.engine.shutdown();
        }
        
        if (this.server) {
            this.server.close(() => {
                logger.info('HTTP server closed');
            });
        }
        
        if (this.db) {
            await this.db.client.close();
            logger.info('Database connection closed');
        }
        
        // Close all queues
        for (const queue of Object.values(this.queues)) {
            await queue.close();
        }
        
        process.exit(0);
    }
}

const workflowService = new WorkflowService();
workflowService.start();