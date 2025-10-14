#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const profileRoutes = require('./routes/profiles');
const bookmarkRoutes = require('./routes/bookmarks');
const preferencesRoutes = require('./routes/preferences');
const healthRoutes = require('./routes/health');
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');
const { logger } = require('./utils/logger');

class UserService {
    constructor() {
        this.app = express();
        this.port = process.env.USER_SERVICE_PORT || 4002;
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
        // Security
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            credentials: true
        }));

        // Body parsing
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Make database available to routes
        this.app.use((req, res, next) => {
            req.db = this.db;
            next();
        });

        // Public routes
        this.app.use('/health', healthRoutes);

        // Protected routes (require authentication)
        this.app.use('/api/users/profile', authenticate, profileRoutes);
        this.app.use('/api/users/bookmarks', authenticate, bookmarkRoutes);
        this.app.use('/api/users/preferences', authenticate, preferencesRoutes);

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
            logger.info('Starting User Service...');
            
            // Connect to database
            await this.connectDatabase();
            
            // Setup middleware and routes
            this.setupMiddleware();
            this.setupRoutes();
            
            // Start server
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                logger.info(`User Service running on port ${this.port}`);
                logger.info('Endpoints:');
                logger.info('  GET /api/users/profile - Get user profile');
                logger.info('  PUT /api/users/profile - Update user profile');
                logger.info('  GET /api/users/bookmarks - Get user bookmarks');
                logger.info('  POST /api/users/bookmarks - Add bookmark');
                logger.info('  DELETE /api/users/bookmarks/:id - Remove bookmark');
                logger.info('  GET /api/users/preferences - Get preferences');
                logger.info('  PUT /api/users/preferences - Update preferences');
                logger.info('  GET /health - Health check');
            });

            // Graceful shutdown
            process.on('SIGTERM', () => this.shutdown('SIGTERM'));
            process.on('SIGINT', () => this.shutdown('SIGINT'));

        } catch (error) {
            logger.error('Failed to start User Service:', error);
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
const userService = new UserService();
userService.start();