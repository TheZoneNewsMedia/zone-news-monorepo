#!/usr/bin/env node

/**
 * Zone News Bot - Comprehensive Health Check
 * Validates configuration, dependencies, and system readiness
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

class HealthChecker {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
    }

    log(type, message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${type}: ${message}`);
    }

    pass(check) {
        this.passed.push(check);
        this.log('✅ PASS', check);
    }

    warn(check, message) {
        this.warnings.push({ check, message });
        this.log('⚠️  WARN', `${check}: ${message}`);
    }

    fail(check, message) {
        this.errors.push({ check, message });
        this.log('❌ FAIL', `${check}: ${message}`);
    }

    checkEnvironmentVariables() {
        console.log('\n🔧 Checking Environment Variables...');

        // Required variables
        const required = [
            'TELEGRAM_BOT_TOKEN',
            'MONGODB_URI'
        ];

        for (const envVar of required) {
            if (process.env[envVar]) {
                this.pass(`Required env var ${envVar} is set`);
            } else {
                this.fail(`Required env var ${envVar}`, 'Missing required environment variable');
            }
        }

        // Optional but recommended
        const recommended = [
            'ADMIN_IDS',
            'NODE_ENV',
            'LOG_LEVEL'
        ];

        for (const envVar of recommended) {
            if (process.env[envVar]) {
                this.pass(`Recommended env var ${envVar} is set`);
            } else {
                this.warn(`Recommended env var ${envVar}`, 'Not set but recommended for production');
            }
        }
    }

    checkFiles() {
        console.log('\n📁 Checking Required Files...');

        const requiredFiles = [
            'package.json',
            'index.js',
            'src/config/environment.js',
            'src/services/bot-initialization.js',
            'src/services/database-service.js',
            'src/utils/logger.js',
            '.env'
        ];

        for (const file of requiredFiles) {
            const filePath = path.join(process.cwd(), file);
            if (fs.existsSync(filePath)) {
                this.pass(`Required file ${file} exists`);
            } else {
                this.fail(`Required file ${file}`, 'File not found');
            }
        }

        // Check for .env template
        if (fs.existsSync('.env.production.template')) {
            this.pass('Production environment template exists');
        } else {
            this.warn('Production environment template', 'Template not found');
        }
    }

    checkPackageJson() {
        console.log('\n📦 Checking Package Configuration...');

        try {
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

            // Check required dependencies
            const requiredDeps = [
                'telegraf',
                'express',
                'mongoose',
                'dotenv',
                'mongodb'
            ];

            for (const dep of requiredDeps) {
                if (pkg.dependencies && pkg.dependencies[dep]) {
                    this.pass(`Required dependency ${dep} is listed`);
                } else {
                    this.fail(`Required dependency ${dep}`, 'Not found in package.json dependencies');
                }
            }

            // Check scripts
            const requiredScripts = [
                'start',
                'dev'
            ];

            for (const script of requiredScripts) {
                if (pkg.scripts && pkg.scripts[script]) {
                    this.pass(`Required script ${script} is defined`);
                } else {
                    this.fail(`Required script ${script}`, 'Not found in package.json scripts');
                }
            }

        } catch (error) {
            this.fail('package.json parsing', `Unable to parse package.json: ${error.message}`);
        }
    }

    async checkConfiguration() {
        console.log('\n⚙️  Checking Configuration...');

        try {
            const config = require('../src/config/environment');
            this.pass('Configuration loads successfully');

            // Check bot token format
            if (config.bot?.token) {
                if (config.bot.token.includes(':')) {
                    this.pass('Bot token format appears valid');
                } else {
                    this.warn('Bot token format', 'Token format may be invalid');
                }
            }

            // Check admin IDs
            if (config.bot?.adminIds && config.bot.adminIds.length > 0) {
                this.pass(`Admin IDs configured (${config.bot.adminIds.length} admins)`);
            } else {
                this.warn('Admin IDs', 'No admin users configured');
            }

            // Check database URI
            if (config.database?.mongoUri) {
                if (config.database.mongoUri.startsWith('mongodb://') || config.database.mongoUri.startsWith('mongodb+srv://')) {
                    this.pass('MongoDB URI format appears valid');
                } else {
                    this.warn('MongoDB URI format', 'URI format may be invalid');
                }
            }

        } catch (error) {
            this.fail('Configuration loading', `Unable to load configuration: ${error.message}`);
        }
    }

    async checkDatabaseConnection() {
        console.log('\n🗄️  Checking Database Connection...');

        try {
            const mongoose = require('mongoose');
            const mongoUri = process.env.MONGODB_URI;

            if (!mongoUri) {
                this.fail('Database connection', 'MONGODB_URI not set');
                return;
            }

            // Test connection with short timeout
            await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 5000
            });

            this.pass('Database connection successful');

            // Test basic operations
            const db = mongoose.connection.db;
            const collections = await db.listCollections().toArray();
            this.pass(`Database accessible (${collections.length} collections)`);

            await mongoose.disconnect();

        } catch (error) {
            this.fail('Database connection', `Unable to connect: ${error.message}`);
        }
    }

    checkNodeVersion() {
        console.log('\n🟢 Checking Node.js Version...');

        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

        if (majorVersion >= 18) {
            this.pass(`Node.js version ${nodeVersion} is supported`);
        } else {
            this.fail('Node.js version', `Version ${nodeVersion} is too old, requires Node.js 18+`);
        }
    }

    async checkPortAvailability() {
        console.log('\n🔌 Checking Port Availability...');

        const net = require('net');
        const port = process.env.PORT || 3002;

        try {
            const server = net.createServer();
            
            await new Promise((resolve, reject) => {
                server.listen(port, () => {
                    server.close(() => resolve());
                });
                
                server.on('error', (err) => {
                    reject(err);
                });
            });

            this.pass(`Port ${port} is available`);

        } catch (error) {
            if (error.code === 'EADDRINUSE') {
                this.warn(`Port ${port}`, 'Port is already in use');
            } else {
                this.fail(`Port ${port}`, `Port check failed: ${error.message}`);
            }
        }
    }

    generateSummary() {
        console.log('\n📊 Health Check Summary');
        console.log('========================');
        console.log(`✅ Passed: ${this.passed.length}`);
        console.log(`⚠️  Warnings: ${this.warnings.length}`);
        console.log(`❌ Errors: ${this.errors.length}`);

        if (this.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            this.warnings.forEach(w => console.log(`   - ${w.check}: ${w.message}`));
        }

        if (this.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.errors.forEach(e => console.log(`   - ${e.check}: ${e.message}`));
        }

        console.log('\n' + '='.repeat(50));

        if (this.errors.length === 0) {
            console.log('🎉 Health check passed! Bot is ready to start.');
            return true;
        } else {
            console.log('🚨 Health check failed! Please fix the errors above.');
            return false;
        }
    }

    async run() {
        console.log('🏥 Zone News Bot - Health Check');
        console.log('================================');

        this.checkNodeVersion();
        this.checkEnvironmentVariables();
        this.checkFiles();
        this.checkPackageJson();
        await this.checkConfiguration();
        await this.checkDatabaseConnection();
        await this.checkPortAvailability();

        const success = this.generateSummary();
        process.exit(success ? 0 : 1);
    }
}

// Run health check
if (require.main === module) {
    const checker = new HealthChecker();
    checker.run().catch(error => {
        console.error('❌ Health check crashed:', error);
        process.exit(1);
    });
}

module.exports = HealthChecker;