#!/usr/bin/env node

/**
 * Zone News Background Job Queue Service
 * Handles async processing, scheduled tasks, and heavy computations
 */

const express = require('express');
const Bull = require('bull');
const { MongoClient } = require('mongodb');
const { CronJob } = require('cron');
const axios = require('axios');
const cors = require('cors');

class JobQueueService {
    constructor() {
        this.app = express();
        this.port = process.env.JOB_QUEUE_PORT || 3032;
        this.db = null;
        this.queues = {};
        this.cronJobs = {};
        this.workers = {};
        this.redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD
        };
    }

    async initialize() {
        await this.connectDatabase();
        this.setupQueues();
        this.setupWorkers();
        this.setupCronJobs();
        this.setupExpress();
        this.setupMonitoring();
        await this.startServer();
    }

    async connectDatabase() {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        const client = await MongoClient.connect(mongoUri);
        this.db = client.db('zone_news_production');
        console.log('✅ Connected to MongoDB');
    }

    setupQueues() {
        // Create different queues for different job types
        this.queues = {
            // News processing
            newsProcessing: new Bull('news-processing', { redis: this.redisConfig }),
            newsAggregation: new Bull('news-aggregation', { redis: this.redisConfig }),
            contentAnalysis: new Bull('content-analysis', { redis: this.redisConfig }),
            
            // User operations
            userDigest: new Bull('user-digest', { redis: this.redisConfig }),
            tierUpgrade: new Bull('tier-upgrade', { redis: this.redisConfig }),
            userCleanup: new Bull('user-cleanup', { redis: this.redisConfig }),
            
            // Analytics
            analytics: new Bull('analytics', { redis: this.redisConfig }),
            reporting: new Bull('reporting', { redis: this.redisConfig }),
            metrics: new Bull('metrics-aggregation', { redis: this.redisConfig }),
            
            // Notifications
            emailQueue: new Bull('email-queue', { redis: this.redisConfig }),
            pushQueue: new Bull('push-notifications', { redis: this.redisConfig }),
            
            // System maintenance
            backup: new Bull('backup', { redis: this.redisConfig }),
            cleanup: new Bull('cleanup', { redis: this.redisConfig }),
            optimization: new Bull('optimization', { redis: this.redisConfig }),
            
            // AI/ML operations
            aiProcessing: new Bull('ai-processing', { redis: this.redisConfig }),
            recommendations: new Bull('recommendations', { redis: this.redisConfig }),
            
            // Import/Export
            dataImport: new Bull('data-import', { redis: this.redisConfig }),
            dataExport: new Bull('data-export', { redis: this.redisConfig })
        };

        console.log('✅ Job queues initialized');
    }

    setupWorkers() {
        // News Processing Worker
        this.queues.newsProcessing.process(async (job) => {
            const { articleId, operations } = job.data;
            console.log(`Processing news article ${articleId}`);
            
            try {
                const article = await this.db.collection('news_articles').findOne({ _id: articleId });
                
                if (!article) {
                    throw new Error('Article not found');
                }

                // Process each operation
                for (const operation of operations) {
                    switch (operation) {
                        case 'extract_entities':
                            await this.extractEntities(article);
                            break;
                        case 'generate_summary':
                            await this.generateSummary(article);
                            break;
                        case 'translate':
                            await this.translateArticle(article);
                            break;
                        case 'analyze_sentiment':
                            await this.analyzeSentiment(article);
                            break;
                    }
                    
                    // Update progress
                    await job.progress((operations.indexOf(operation) + 1) / operations.length * 100);
                }

                return { success: true, articleId };
                
            } catch (error) {
                console.error('News processing error:', error);
                throw error;
            }
        });

        // User Digest Worker
        this.queues.userDigest.process(async (job) => {
            const { userId, frequency } = job.data;
            console.log(`Generating ${frequency} digest for user ${userId}`);
            
            try {
                const user = await this.db.collection('users').findOne({ telegramId: parseInt(userId) });
                
                if (!user) {
                    throw new Error('User not found');
                }

                // Get relevant news based on preferences
                const articles = await this.getDigestArticles(user, frequency);
                
                // Generate digest
                const digest = await this.generateDigest(articles, user, frequency);
                
                // Queue for sending
                await this.queues.emailQueue.add({
                    to: user.email,
                    subject: `Your ${frequency} Zone News Digest`,
                    template: 'digest',
                    data: digest
                });

                return { success: true, userId, articleCount: articles.length };
                
            } catch (error) {
                console.error('Digest generation error:', error);
                throw error;
            }
        });

        // Analytics Worker
        this.queues.analytics.process(async (job) => {
            const { type, period, filters } = job.data;
            console.log(`Running analytics: ${type} for ${period}`);
            
            try {
                let result;
                
                switch (type) {
                    case 'user_engagement':
                        result = await this.calculateUserEngagement(period, filters);
                        break;
                    case 'content_performance':
                        result = await this.analyzeContentPerformance(period, filters);
                        break;
                    case 'revenue_analytics':
                        result = await this.calculateRevenue(period, filters);
                        break;
                    case 'system_health':
                        result = await this.analyzeSystemHealth(period);
                        break;
                }

                // Store results
                await this.db.collection('analytics_reports').insertOne({
                    type,
                    period,
                    filters,
                    result,
                    generatedAt: new Date()
                });

                return result;
                
            } catch (error) {
                console.error('Analytics error:', error);
                throw error;
            }
        });

        // Backup Worker
        this.queues.backup.process(async (job) => {
            const { type, destination } = job.data;
            console.log(`Running backup: ${type} to ${destination}`);
            
            try {
                let backupData;
                
                switch (type) {
                    case 'full':
                        backupData = await this.performFullBackup();
                        break;
                    case 'incremental':
                        backupData = await this.performIncrementalBackup();
                        break;
                    case 'users':
                        backupData = await this.backupCollection('users');
                        break;
                    case 'articles':
                        backupData = await this.backupCollection('news_articles');
                        break;
                }

                // Upload to destination
                await this.uploadBackup(backupData, destination);

                // Log backup
                await this.db.collection('backup_logs').insertOne({
                    type,
                    destination,
                    size: backupData.size,
                    completedAt: new Date()
                });

                return { success: true, size: backupData.size };
                
            } catch (error) {
                console.error('Backup error:', error);
                throw error;
            }
        });

        // AI Processing Worker
        this.queues.aiProcessing.process(async (job) => {
            const { task, data } = job.data;
            console.log(`AI Processing: ${task}`);
            
            try {
                let result;
                
                switch (task) {
                    case 'content_moderation':
                        result = await this.moderateContent(data);
                        break;
                    case 'auto_tagging':
                        result = await this.autoTagContent(data);
                        break;
                    case 'trend_prediction':
                        result = await this.predictTrends(data);
                        break;
                    case 'user_clustering':
                        result = await this.clusterUsers(data);
                        break;
                }

                return result;
                
            } catch (error) {
                console.error('AI processing error:', error);
                throw error;
            }
        });

        // Cleanup Worker
        this.queues.cleanup.process(async (job) => {
            const { target, options } = job.data;
            console.log(`Running cleanup: ${target}`);
            
            try {
                let result;
                
                switch (target) {
                    case 'old_logs':
                        result = await this.cleanupOldLogs(options);
                        break;
                    case 'expired_sessions':
                        result = await this.cleanupSessions(options);
                        break;
                    case 'temp_files':
                        result = await this.cleanupTempFiles(options);
                        break;
                    case 'old_analytics':
                        result = await this.cleanupOldAnalytics(options);
                        break;
                }

                return result;
                
            } catch (error) {
                console.error('Cleanup error:', error);
                throw error;
            }
        });

        console.log('✅ Workers configured');
    }

    setupCronJobs() {
        // Daily digest at 8 AM
        this.cronJobs.dailyDigest = new CronJob('0 8 * * *', async () => {
            console.log('Running daily digest job');
            
            const users = await this.db.collection('users').find({
                'preferences.digest': 'daily'
            }).toArray();

            for (const user of users) {
                await this.queues.userDigest.add({
                    userId: user.telegramId,
                    frequency: 'daily'
                });
            }
        });

        // Weekly analytics every Monday at 9 AM
        this.cronJobs.weeklyAnalytics = new CronJob('0 9 * * 1', async () => {
            console.log('Running weekly analytics');
            
            await this.queues.analytics.add({
                type: 'comprehensive',
                period: 'weekly',
                filters: {}
            });
        });

        // Hourly news aggregation
        this.cronJobs.newsAggregation = new CronJob('0 * * * *', async () => {
            console.log('Running news aggregation');
            
            await this.queues.newsAggregation.add({
                sources: ['rss', 'api', 'scraping'],
                timestamp: new Date()
            });
        });

        // Daily backup at 2 AM
        this.cronJobs.dailyBackup = new CronJob('0 2 * * *', async () => {
            console.log('Running daily backup');
            
            await this.queues.backup.add({
                type: 'incremental',
                destination: 's3'
            });
        });

        // Weekly full backup on Sunday at 3 AM
        this.cronJobs.weeklyBackup = new CronJob('0 3 * * 0', async () => {
            console.log('Running weekly full backup');
            
            await this.queues.backup.add({
                type: 'full',
                destination: 's3'
            });
        });

        // Daily cleanup at 4 AM
        this.cronJobs.dailyCleanup = new CronJob('0 4 * * *', async () => {
            console.log('Running daily cleanup');
            
            await this.queues.cleanup.add({ target: 'old_logs', options: { days: 30 } });
            await this.queues.cleanup.add({ target: 'expired_sessions', options: {} });
            await this.queues.cleanup.add({ target: 'temp_files', options: {} });
        });

        // Start all cron jobs
        Object.values(this.cronJobs).forEach(job => job.start());
        
        console.log('✅ Cron jobs scheduled');
    }

    setupExpress() {
        this.app.use(cors());
        this.app.use(express.json());

        // Health check
        this.app.get('/health', async (req, res) => {
            const health = await this.getHealthStatus();
            res.json(health);
        });

        // Queue job
        this.app.post('/queue/:queueName', this.authenticateInternal.bind(this), async (req, res) => {
            try {
                const { queueName } = req.params;
                const { data, options = {} } = req.body;

                if (!this.queues[queueName]) {
                    return res.status(400).json({ error: 'Invalid queue name' });
                }

                const job = await this.queues[queueName].add(data, options);

                res.json({
                    success: true,
                    jobId: job.id,
                    queue: queueName
                });
            } catch (error) {
                console.error('Queue error:', error);
                res.status(500).json({ error: 'Failed to queue job' });
            }
        });

        // Get job status
        this.app.get('/job/:queueName/:jobId', async (req, res) => {
            try {
                const { queueName, jobId } = req.params;

                if (!this.queues[queueName]) {
                    return res.status(400).json({ error: 'Invalid queue name' });
                }

                const job = await this.queues[queueName].getJob(jobId);

                if (!job) {
                    return res.status(404).json({ error: 'Job not found' });
                }

                res.json({
                    id: job.id,
                    data: job.data,
                    progress: job.progress(),
                    state: await job.getState(),
                    result: job.returnvalue,
                    failedReason: job.failedReason
                });
            } catch (error) {
                console.error('Job status error:', error);
                res.status(500).json({ error: 'Failed to get job status' });
            }
        });

        // Queue statistics
        this.app.get('/stats', async (req, res) => {
            try {
                const stats = {};

                for (const [name, queue] of Object.entries(this.queues)) {
                    const counts = await queue.getJobCounts();
                    stats[name] = {
                        waiting: counts.waiting,
                        active: counts.active,
                        completed: counts.completed,
                        failed: counts.failed,
                        delayed: counts.delayed
                    };
                }

                res.json(stats);
            } catch (error) {
                console.error('Stats error:', error);
                res.status(500).json({ error: 'Failed to get stats' });
            }
        });

        // Retry failed jobs
        this.app.post('/retry/:queueName', this.authenticateInternal.bind(this), async (req, res) => {
            try {
                const { queueName } = req.params;

                if (!this.queues[queueName]) {
                    return res.status(400).json({ error: 'Invalid queue name' });
                }

                const failedJobs = await this.queues[queueName].getFailed();
                const retryPromises = failedJobs.map(job => job.retry());
                await Promise.all(retryPromises);

                res.json({
                    success: true,
                    retriedCount: failedJobs.length
                });
            } catch (error) {
                console.error('Retry error:', error);
                res.status(500).json({ error: 'Failed to retry jobs' });
            }
        });

        // Clean completed jobs
        this.app.delete('/clean/:queueName', this.authenticateInternal.bind(this), async (req, res) => {
            try {
                const { queueName } = req.params;
                const { grace = 3600000 } = req.query; // Default 1 hour

                if (!this.queues[queueName]) {
                    return res.status(400).json({ error: 'Invalid queue name' });
                }

                await this.queues[queueName].clean(grace, 'completed');
                await this.queues[queueName].clean(grace, 'failed');

                res.json({ success: true });
            } catch (error) {
                console.error('Clean error:', error);
                res.status(500).json({ error: 'Failed to clean jobs' });
            }
        });
    }

    setupMonitoring() {
        // Monitor queue events
        Object.entries(this.queues).forEach(([name, queue]) => {
            queue.on('completed', (job, result) => {
                console.log(`✅ Job ${job.id} in ${name} completed`);
                this.recordMetric('job_completed', { queue: name });
            });

            queue.on('failed', (job, err) => {
                console.error(`❌ Job ${job.id} in ${name} failed:`, err);
                this.recordMetric('job_failed', { queue: name, error: err.message });
            });

            queue.on('stalled', (job) => {
                console.warn(`⚠️ Job ${job.id} in ${name} stalled`);
                this.recordMetric('job_stalled', { queue: name });
            });
        });
    }

    async getHealthStatus() {
        const health = {
            status: 'healthy',
            uptime: process.uptime(),
            queues: {},
            cronJobs: {}
        };

        // Check queue health
        for (const [name, queue] of Object.entries(this.queues)) {
            const counts = await queue.getJobCounts();
            health.queues[name] = counts;
        }

        // Check cron job status
        for (const [name, job] of Object.entries(this.cronJobs)) {
            health.cronJobs[name] = {
                running: job.running,
                lastDate: job.lastDate(),
                nextDates: job.nextDates(1)
            };
        }

        return health;
    }

    authenticateInternal(req, res, next) {
        const token = req.headers['x-internal-token'];
        if (token !== process.env.INTERNAL_TOKEN) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    }

    recordMetric(metric, data) {
        // This would integrate with Prometheus metrics
        if (global.metricsService) {
            global.metricsService.record(metric, data);
        }
    }

    // Helper methods for workers
    async extractEntities(article) {
        // Entity extraction logic
        console.log(`Extracting entities from article ${article._id}`);
    }

    async generateSummary(article) {
        // Summary generation logic
        console.log(`Generating summary for article ${article._id}`);
    }

    async translateArticle(article) {
        // Translation logic
        console.log(`Translating article ${article._id}`);
    }

    async analyzeSentiment(article) {
        // Sentiment analysis logic
        console.log(`Analyzing sentiment for article ${article._id}`);
    }

    async getDigestArticles(user, frequency) {
        // Get relevant articles for digest
        const query = {
            category: { $in: user.preferences?.categories || [] },
            published_date: { $gte: this.getDigestStartDate(frequency) }
        };
        
        return await this.db.collection('news_articles')
            .find(query)
            .sort({ views: -1 })
            .limit(10)
            .toArray();
    }

    getDigestStartDate(frequency) {
        const now = new Date();
        switch (frequency) {
            case 'daily':
                return new Date(now - 24 * 60 * 60 * 1000);
            case 'weekly':
                return new Date(now - 7 * 24 * 60 * 60 * 1000);
            case 'monthly':
                return new Date(now - 30 * 24 * 60 * 60 * 1000);
            default:
                return new Date(now - 24 * 60 * 60 * 1000);
        }
    }

    async generateDigest(articles, user, frequency) {
        return {
            user: user.firstName || user.username,
            frequency,
            articleCount: articles.length,
            articles: articles.map(a => ({
                title: a.title,
                summary: a.summary,
                url: a.url,
                category: a.category
            })),
            generatedAt: new Date()
        };
    }

    async startServer() {
        this.app.listen(this.port, '0.0.0.0', () => {
            console.log(`✅ Job Queue service running on port ${this.port}`);
        });
    }
}

// Start the service
const service = new JobQueueService();
service.initialize().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down Job Queue service...');
    
    // Stop cron jobs
    Object.values(service.cronJobs).forEach(job => job.stop());
    
    // Close queues
    await Promise.all(
        Object.values(service.queues).map(queue => queue.close())
    );
    
    process.exit(0);
});