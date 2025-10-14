#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const tokenRoutes = require('./routes/token');
const healthRoutes = require('./routes/health');
const { errorHandler } = require('./middleware/errorHandler');
const { logger } = require('./utils/logger');

class AuthService {
    constructor() {
        this.app = express();
        this.port = process.env.AUTH_SERVICE_PORT || 4001;
        this.db = null;
        this.server = null;
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

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            credentials: true
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP'
        });
        this.app.use('/api/auth', limiter);

        // Body parsing
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('user-agent')
            });
            next();
        });
    }

    setupRoutes() {
        // Make database available to routes
        this.app.use((req, res, next) => {
            req.db = this.db;
            next();
        });

        // API routes
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/token', tokenRoutes);
        this.app.use('/health', healthRoutes);

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Route ${req.path} not found`
            });
        });

        // Error handler
        this.app.use(errorHandler);
    }

    async start() {
        try {
            logger.info('Starting Auth Service...');
            
            // Connect to database
            await this.connectDatabase();
            
            // Setup middleware and routes
            this.setupMiddleware();
            this.setupRoutes();
            
            // Start server
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                logger.info(`Auth Service running on port ${this.port}`);
                logger.info('Endpoints:');
                logger.info('  POST /api/auth/register - Register new user');
                logger.info('  POST /api/auth/login - Login user');
                logger.info('  POST /api/auth/logout - Logout user');
                logger.info('  POST /api/token/refresh - Refresh JWT token');
                logger.info('  POST /api/token/validate - Validate JWT token');
                logger.info('  GET /health - Health check');
            });

            // Graceful shutdown
            process.on('SIGTERM', () => this.shutdown('SIGTERM'));
            process.on('SIGINT', () => this.shutdown('SIGINT'));

        } catch (error) {
            logger.error('Failed to start Auth Service:', error);
            process.exit(1);
        }
    }

    async shutdown(signal) {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        
        if (this.server) {
            this.server.close(() => {
                logger.info('HTTP server closed');
            });
        }
        
        if (this.db) {
            await this.db.client.close();
            logger.info('Database connection closed');
        }
        
        process.exit(0);
    }
}

// Start the service
const authService = new AuthService();
authService.start();