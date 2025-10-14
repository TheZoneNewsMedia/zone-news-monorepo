/**
 * Advanced Scheduler Service for Zone News Telegram Bot
 * Handles comprehensive post scheduling with timezone support, batch operations,
 * queue management, and advanced scheduling features.
 * 
 * @author Zone News Bot System
 * @version 2.0.0
 * @since 2025-01-14
 */

const { CronJob } = require('cron');
const { ObjectId } = require('mongodb');

/**
 * Comprehensive scheduler service with advanced scheduling capabilities
 */
class SchedulerService {
    constructor(bot, db, postManager = null, options = {}) {
        this.bot = bot;
        this.db = db;
        this.postManager = postManager;
        
        // Configuration
        this.options = {
            timezone: 'Australia/Adelaide',
            maxRetries: 3,
            retryDelay: 60000, // 1 minute
            batchSize: 5,
            rateLimit: 30, // messages per minute
            quietHours: { start: 22, end: 6 }, // 10 PM to 6 AM
            enableHolidaySkip: true,
            ...options
        };
        
        // Internal state
        this.jobs = new Map(); // Active cron jobs
        this.rateLimiter = { count: 0, resetTime: Date.now() + 60000 };
        this.processingQueue = new Set();
        this.isHealthy = true;
        this.lastHeartbeat = new Date();
        
        // Schedule templates
        this.templates = {
            'morning-digest': { hour: 8, minute: 0, days: [1,2,3,4,5] },
            'evening-digest': { hour: 18, minute: 0, days: [1,2,3,4,5] },
            'breaking-news': { interval: '*/15 * * * *' }, // Every 15 minutes
            'weekend-summary': { hour: 10, minute: 0, days: [0,6] }
        };
        
        // Popular timezones
        this.timezones = {
            'Australia/Adelaide': 'Adelaide (ACST/ACDT)',
            'Australia/Sydney': 'Sydney (AEST/AEDT)', 
            'Australia/Melbourne': 'Melbourne (AEST/AEDT)',
            'Australia/Perth': 'Perth (AWST)',
            'Australia/Brisbane': 'Brisbane (AEST)',
            'UTC': 'UTC',
            'America/New_York': 'New York (EST/EDT)',
            'Europe/London': 'London (GMT/BST)',
            'Asia/Tokyo': 'Tokyo (JST)'
        };
        
        this.init();
    }
    
    /**
     * Initialize the scheduler service
     */
    async init() {
        try {
            // Ensure database collections exist
            await this.ensureCollections();
            
            // Load existing scheduled posts and jobs
            await this.loadScheduledPosts();
            await this.loadCronJobs();
            
            // Start health monitor (every minute)
            this.startHealthMonitor();
            
            // Start queue processor
            this.startQueueProcessor();
            
            // Start rate limiter reset
            this.startRateLimiterReset();
            
            // Recovery check for failed posts
            setTimeout(() => this.performRecoveryCheck(), 30000);
            
            console.log(`✅ Advanced Scheduler Service initialized with timezone: ${this.options.timezone}`);
            console.log(`📋 Available schedule templates: ${Object.keys(this.templates).join(', ')}`);
            
        } catch (error) {
            console.error('❌ Failed to initialize Scheduler Service:', error);
            this.isHealthy = false;
        }
    }
    
    /**
     * Ensure all required MongoDB collections exist with proper indexes
     */
    async ensureCollections() {
        const collections = [
            { name: 'scheduled_posts', indexes: [
                { key: { scheduled_for: 1, status: 1 } },
                { key: { scheduled_by: 1 } },
                { key: { created_at: -1 } }
            ]},
            { name: 'schedule_jobs', indexes: [
                { key: { channel_id: 1, enabled: 1 } },
                { key: { created_by: 1 } },
                { key: { next_run: 1 } }
            ]},
            { name: 'schedule_templates', indexes: [
                { key: { name: 1 }, unique: true },
                { key: { created_by: 1 } }
            ]},
            { name: 'scheduler_metrics', indexes: [
                { key: { date: 1 }, unique: true },
                { key: { timestamp: -1 } }
            ]},
            { name: 'scheduler_logs', indexes: [
                { key: { timestamp: -1 } },
                { key: { level: 1, timestamp: -1 } }
            ]}
        ];
        
        for (const collection of collections) {
            try {
                await this.db.createCollection(collection.name);
            } catch (error) {
                // Collection already exists
            }
            
            // Create indexes
            for (const index of collection.indexes) {
                try {
                    await this.db.collection(collection.name).createIndex(index.key, index);
                } catch (error) {
                    console.warn(`Index creation warning for ${collection.name}:`, error.message);
                }
            }
        }
    }
    
    /**
     * Load existing scheduled posts on startup
     */
    async loadScheduledPosts() {
        try {
            const pendingPosts = await this.db.collection('scheduled_posts')
                .find({ 
                    status: 'pending',
                    scheduled_for: { $gte: new Date() }
                })
                .sort({ scheduled_for: 1 })
                .toArray();
            
            console.log(`📅 Loaded ${pendingPosts.length} pending scheduled posts`);
            
            // Check for posts that should have been sent (recovery)
            const overduePosts = await this.db.collection('scheduled_posts')
                .find({
                    status: 'pending',
                    scheduled_for: { $lt: new Date() }
                })
                .toArray();
            
            if (overduePosts.length > 0) {
                console.log(`⚠️  Found ${overduePosts.length} overdue posts - will attempt recovery`);
                for (const post of overduePosts) {
                    await this.schedulePostForRecovery(post);
                }
            }
            
        } catch (error) {
            console.error('❌ Error loading scheduled posts:', error);
            await this.logError('loadScheduledPosts', error);
        }
    }
    
    /**
     * Load existing cron jobs
     */
    async loadCronJobs() {
        try {
            const activeJobs = await this.db.collection('schedule_jobs')
                .find({ enabled: true })
                .toArray();
            
            for (const jobData of activeJobs) {
                await this.createCronJob(jobData);
            }
            
            console.log(`🔄 Loaded ${activeJobs.length} active cron jobs`);
            
        } catch (error) {
            console.error('❌ Error loading cron jobs:', error);
            await this.logError('loadCronJobs', error);
        }
    }
    
    /**
     * Create and start a cron job
     */
    async createCronJob(jobData) {
        try {
            const cronPattern = this.generateCronPattern(jobData.schedule);
            
            const job = new CronJob(
                cronPattern,
                async () => {
                    await this.executeCronJob(jobData);
                },
                null,
                false,
                jobData.timezone || this.options.timezone
            );
            
            // Store job reference
            this.jobs.set(jobData._id.toString(), {
                job,
                data: jobData,
                lastRun: null,
                runCount: 0,
                errors: []
            });
            
            job.start();
            
            // Update next run time
            await this.db.collection('schedule_jobs').updateOne(
                { _id: jobData._id },
                { $set: { next_run: job.nextDate().toDate() } }
            );
            
        } catch (error) {
            console.error(`❌ Failed to create cron job:`, error);
            await this.logError('createCronJob', error, { jobData });
        }
    }
    
    /**
     * Generate cron pattern from schedule object
     */
    generateCronPattern(schedule) {
        if (schedule.cron) {
            return schedule.cron;
        }
        
        if (schedule.interval) {
            return schedule.interval;
        }
        
        // Generate from hour/minute/days format
        const minute = schedule.minute || 0;
        const hour = schedule.hour || 0;
        const days = schedule.days ? schedule.days.join(',') : '*';
        
        return `${minute} ${hour} * * ${days}`;
    }
    
    /**
     * Execute a cron job
     */
    async executeCronJob(jobData) {
        try {
            const jobId = jobData._id.toString();
            const jobRef = this.jobs.get(jobId);
            
            if (!jobRef) {
                console.error(`❌ Job reference not found: ${jobId}`);
                return;
            }
            
            // Check if we're in quiet hours
            if (this.isQuietHour() && !jobData.ignore_quiet_hours) {
                console.log(`🔇 Skipping job ${jobId} - quiet hours`);
                await this.logInfo('cronJobSkipped', 'Job skipped due to quiet hours', { jobId });
                return;
            }
            
            // Check for holidays if enabled
            if (this.options.enableHolidaySkip && await this.isHoliday()) {
                console.log(`🎄 Skipping job ${jobId} - holiday`);
                await this.logInfo('cronJobSkipped', 'Job skipped due to holiday', { jobId });
                return;
            }
            
            console.log(`🔄 Executing cron job: ${jobData.name || jobId}`);
            
            // Update job reference
            jobRef.lastRun = new Date();
            jobRef.runCount++;
            
            // Execute based on job type
            switch (jobData.type) {
                case 'digest':
                    await this.executeDigestJob(jobData);
                    break;
                case 'breaking_news':
                    await this.executeBreakingNewsJob(jobData);
                    break;
                case 'category_schedule':
                    await this.executeCategoryJob(jobData);
                    break;
                case 'custom':
                    await this.executeCustomJob(jobData);
                    break;
                default:
                    throw new Error(`Unknown job type: ${jobData.type}`);
            }
            
            // Update database
            await this.db.collection('schedule_jobs').updateOne(
                { _id: jobData._id },
                { 
                    $set: { 
                        last_run: new Date(),
                        next_run: jobRef.job.nextDate().toDate()
                    },
                    $inc: { run_count: 1 }
                }
            );
            
            await this.logInfo('cronJobExecuted', 'Job executed successfully', { jobId, jobData });
            
        } catch (error) {
            console.error(`❌ Error executing cron job:`, error);
            
            const jobRef = this.jobs.get(jobData._id.toString());
            if (jobRef) {
                jobRef.errors.push({
                    error: error.message,
                    timestamp: new Date()
                });
                
                // Keep only last 10 errors
                if (jobRef.errors.length > 10) {
                    jobRef.errors = jobRef.errors.slice(-10);
                }
            }
            
            await this.logError('cronJobFailed', error, { jobData });
        }
    }
    
    /**
     * Execute digest job
     */
    async executeDigestJob(jobData) {
        const articles = await this.getLatestArticles(
            jobData.category || null,
            jobData.limit || 5
        );
        
        if (articles.length === 0) {
            console.log('📰 No new articles for digest');
            return;
        }
        
        const digest = this.formatDigest(articles, jobData.digest_type || 'standard');
        
        for (const destinationId of jobData.destinations || []) {
            await this.queuePost({
                type: 'digest',
                content: digest,
                destination_id: destinationId,
                job_id: jobData._id,
                priority: jobData.priority || 'normal'
            });
        }
    }
    
    /**
     * Execute breaking news job
     */
    async executeBreakingNewsJob(jobData) {
        const breakingArticles = await this.getBreakingNews(
            jobData.keywords || [],
            jobData.last_check || new Date(Date.now() - 15 * 60 * 1000)
        );
        
        for (const article of breakingArticles) {
            for (const destinationId of jobData.destinations || []) {
                await this.queuePost({
                    type: 'breaking_news',
                    article_id: article._id,
                    destination_id: destinationId,
                    job_id: jobData._id,
                    priority: 'high'
                });
            }
        }
        
        // Update last check time
        await this.db.collection('schedule_jobs').updateOne(
            { _id: jobData._id },
            { $set: { last_check: new Date() } }
        );
    }
    
    /**
     * Execute category-specific job
     */
    async executeCategoryJob(jobData) {
        const articles = await this.getLatestArticles(
            jobData.category,
            jobData.limit || 3
        );
        
        for (const article of articles) {
            for (const destinationId of jobData.destinations || []) {
                await this.queuePost({
                    type: 'category',
                    article_id: article._id,
                    destination_id: destinationId,
                    job_id: jobData._id,
                    priority: 'normal'
                });
            }
        }
    }
    
    /**
     * Execute custom job
     */
    async executeCustomJob(jobData) {
        // Custom job logic based on job configuration
        if (jobData.custom_handler) {
            await this.executeCustomHandler(jobData);
        } else {
            // Default custom job behavior
            await this.executeDigestJob(jobData);
        }
    }
    
    /**
     * Queue a post for batch processing
     */
    async queuePost(postData) {
        try {
            const queueItem = {
                ...postData,
                queued_at: new Date(),
                attempts: 0,
                status: 'queued',
                _id: new ObjectId()
            };
            
            await this.db.collection('post_queue').insertOne(queueItem);
            console.log(`📮 Queued post: ${postData.type} for ${postData.destination_id}`);
            
        } catch (error) {
            console.error('❌ Error queueing post:', error);
            await this.logError('queuePost', error, postData);
        }
    }
    
    /**
     * Start queue processor
     */
    startQueueProcessor() {
        // Process queue every 30 seconds
        setInterval(async () => {
            try {
                await this.processQueue();
            } catch (error) {
                console.error('❌ Queue processor error:', error);
            }
        }, 30000);
    }
    
    /**
     * Process the post queue
     */
    async processQueue() {
        try {
            if (this.processingQueue.size >= this.options.batchSize) {
                return; // Already processing enough items
            }
            
            // Check rate limit
            if (!this.checkRateLimit()) {
                return;
            }
            
            const queueItems = await this.db.collection('post_queue')
                .find({ 
                    status: 'queued',
                    $or: [
                        { scheduled_for: { $exists: false } },
                        { scheduled_for: { $lte: new Date() } }
                    ]
                })
                .sort({ 
                    priority: 1, // High priority first 
                    queued_at: 1   // FIFO
                })
                .limit(this.options.batchSize - this.processingQueue.size)
                .toArray();
            
            for (const item of queueItems) {
                if (this.processingQueue.has(item._id.toString())) {
                    continue;
                }
                
                this.processingQueue.add(item._id.toString());
                this.processQueueItem(item).finally(() => {
                    this.processingQueue.delete(item._id.toString());
                });
            }
            
        } catch (error) {
            console.error('❌ Process queue error:', error);
            await this.logError('processQueue', error);
        }
    }
    
    /**
     * Process individual queue item
     */
    async processQueueItem(item) {
        try {
            // Mark as processing
            await this.db.collection('post_queue').updateOne(
                { _id: item._id },
                { 
                    $set: { 
                        status: 'processing',
                        processing_started: new Date()
                    },
                    $inc: { attempts: 1 }
                }
            );
            
            let result;
            
            // Process based on type
            switch (item.type) {
                case 'digest':
                    result = await this.postDigest(item);
                    break;
                case 'breaking_news':
                case 'category':
                    result = await this.postArticle(item);
                    break;
                default:
                    throw new Error(`Unknown post type: ${item.type}`);
            }
            
            if (result.success) {
                // Mark as completed
                await this.db.collection('post_queue').updateOne(
                    { _id: item._id },
                    { 
                        $set: {
                            status: 'completed',
                            completed_at: new Date(),
                            result: result
                        }
                    }
                );
                
                // Update rate limiter
                this.rateLimiter.count++;
                
                console.log(`✅ Successfully processed queue item: ${item.type}`);
                
            } else {
                await this.handleQueueItemFailure(item, result.error);
            }
            
        } catch (error) {
            console.error('❌ Process queue item error:', error);
            await this.handleQueueItemFailure(item, error.message);
        }
    }
    
    /**
     * Handle queue item failure
     */
    async handleQueueItemFailure(item, errorMessage) {
        const attempts = (item.attempts || 0) + 1;
        
        if (attempts >= this.options.maxRetries) {
            // Max retries reached - mark as failed
            await this.db.collection('post_queue').updateOne(
                { _id: item._id },
                { 
                    $set: {
                        status: 'failed',
                        failed_at: new Date(),
                        error: errorMessage
                    }
                }
            );
            
            console.log(`❌ Queue item failed after ${attempts} attempts: ${errorMessage}`);
            
            // Notify admin if configured
            await this.notifyAdminOfFailure(item, errorMessage);
            
        } else {
            // Schedule retry
            const nextAttempt = new Date(Date.now() + this.options.retryDelay * attempts);
            
            await this.db.collection('post_queue').updateOne(
                { _id: item._id },
                { 
                    $set: {
                        status: 'queued',
                        scheduled_for: nextAttempt,
                        last_error: errorMessage
                    }
                }
            );
            
            console.log(`🔄 Scheduled retry ${attempts}/${this.options.maxRetries} for queue item in ${this.options.retryDelay * attempts / 1000}s`);
        }
    }
    
    /**
     * Post digest content
     */
    async postDigest(item) {
        try {
            const destination = await this.db.collection('destinations')
                .findOne({ _id: new ObjectId(item.destination_id) });
            
            if (!destination) {
                throw new Error('Destination not found');
            }
            
            const sentMessage = await this.bot.telegram.sendMessage(
                destination.id,
                item.content,
                {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false
                }
            );
            
            return {
                success: true,
                message_id: sentMessage.message_id,
                destination: destination.name || destination.id
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Post individual article
     */
    async postArticle(item) {
        if (!this.postManager) {
            return {
                success: false,
                error: 'PostManager not available'
            };
        }
        
        return await this.postManager.postArticle(
            item.article_id,
            item.destination_id,
            item.job_id
        );
    }
    
    /**
     * Check rate limit
     */
    checkRateLimit() {
        const now = Date.now();
        
        if (now >= this.rateLimiter.resetTime) {
            this.rateLimiter.count = 0;
            this.rateLimiter.resetTime = now + 60000; // Reset every minute
        }
        
        return this.rateLimiter.count < this.options.rateLimit;
    }
    
    /**
     * Start rate limiter reset timer
     */
    startRateLimiterReset() {
        setInterval(() => {
            this.rateLimiter.count = 0;
            this.rateLimiter.resetTime = Date.now() + 60000;
        }, 60000);
    }
    
    /**
     * Check if current time is within quiet hours
     */
    isQuietHour() {
        const now = new Date();
        const hour = now.getHours();
        const { start, end } = this.options.quietHours;
        
        if (start < end) {
            return hour >= start && hour < end;
        } else {
            // Overnight quiet hours (e.g., 22:00 to 06:00)
            return hour >= start || hour < end;
        }
    }
    
    /**
     * Check if today is a holiday (basic implementation)
     */
    async isHoliday() {
        // This is a placeholder implementation
        // In production, you would integrate with a holiday API or maintain a holiday database
        const today = new Date();
        const month = today.getMonth() + 1;
        const day = today.getDate();
        
        // Australian public holidays (basic list)
        const holidays = [
            { month: 1, day: 1 },   // New Year's Day
            { month: 1, day: 26 },  // Australia Day
            { month: 4, day: 25 },  // ANZAC Day
            { month: 12, day: 25 }, // Christmas Day
            { month: 12, day: 26 }  // Boxing Day
        ];
        
        return holidays.some(h => h.month === month && h.day === day);
    }
    
    /**
     * Start health monitor
     */
    startHealthMonitor() {
        setInterval(async () => {
            try {
                await this.performHealthCheck();
                this.lastHeartbeat = new Date();
            } catch (error) {
                console.error('❌ Health check failed:', error);
                this.isHealthy = false;
            }
        }, 60000); // Every minute
    }
    
    /**
     * Perform health check
     */
    async performHealthCheck() {
        try {
            // Check database connection
            await this.db.admin().ping();
            
            // Check active jobs
            const activeJobsCount = this.jobs.size;
            
            // Check queue size
            const queueSize = await this.db.collection('post_queue')
                .countDocuments({ status: 'queued' });
            
            // Update metrics
            await this.updateMetrics({
                active_jobs: activeJobsCount,
                queue_size: queueSize,
                processing_items: this.processingQueue.size,
                rate_limit_usage: this.rateLimiter.count,
                health_status: 'healthy'
            });
            
            this.isHealthy = true;
            
            // Log if queue is getting large
            if (queueSize > 100) {
                console.warn(`⚠️  Large queue size: ${queueSize} items`);
            }
            
        } catch (error) {
            this.isHealthy = false;
            throw error;
        }
    }
    
    /**
     * Perform recovery check for failed operations
     */
    async performRecoveryCheck() {
        try {
            console.log('🔄 Performing recovery check...');
            
            // Check for stuck processing items
            const stuckItems = await this.db.collection('post_queue')
                .find({
                    status: 'processing',
                    processing_started: { 
                        $lt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
                    }
                })
                .toArray();
            
            for (const item of stuckItems) {
                console.log(`🔄 Recovering stuck queue item: ${item._id}`);
                await this.db.collection('post_queue').updateOne(
                    { _id: item._id },
                    { $set: { status: 'queued' } }
                );
            }
            
            // Check for failed scheduled posts that can be retried
            const failedPosts = await this.db.collection('scheduled_posts')
                .find({
                    status: 'failed',
                    failed_at: { 
                        $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Within last 24 hours
                    },
                    retry_count: { $lt: 3 }
                })
                .toArray();
            
            for (const post of failedPosts) {
                console.log(`🔄 Attempting to recover failed post: ${post.title}`);
                await this.schedulePostForRecovery(post);
            }
            
            console.log(`✅ Recovery check completed. Recovered ${stuckItems.length} stuck items and ${failedPosts.length} failed posts`);
            
        } catch (error) {
            console.error('❌ Recovery check failed:', error);
            await this.logError('recoveryCheck', error);
        }
    }
    
    /**
     * Schedule post for recovery
     */
    async schedulePostForRecovery(post) {
        try {
            // Schedule for immediate processing with retry flag
            await this.db.collection('post_queue').insertOne({
                type: 'recovery',
                scheduled_post_id: post._id,
                article_id: post.article_id,
                destinations: post.destinations,
                queued_at: new Date(),
                priority: 'high',
                attempts: 0,
                status: 'queued',
                recovery_attempt: true
            });
            
            // Update retry count
            await this.db.collection('scheduled_posts').updateOne(
                { _id: post._id },
                { 
                    $inc: { retry_count: 1 },
                    $set: { recovery_scheduled: new Date() }
                }
            );
            
        } catch (error) {
            console.error('❌ Error scheduling post for recovery:', error);
        }
    }
    
    // =====================================
    // PUBLIC API METHODS
    // =====================================
    
    /**
     * Schedule a single post
     */
    async schedulePost(articleId, destinations, scheduledFor, userId, options = {}) {
        try {
            const scheduleTime = new Date(scheduledFor);
            const now = new Date();
            
            // Validation
            if (scheduleTime <= now) {
                return {
                    success: false,
                    error: 'Schedule time must be in the future'
                };
            }
            
            // Check if scheduling too far in advance (1 year max)
            const maxAdvance = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
            if (scheduleTime > maxAdvance) {
                return {
                    success: false,
                    error: 'Cannot schedule more than 1 year in advance'
                };
            }
            
            // Get article details
            const article = await this.db.collection('news_articles')
                .findOne({ _id: new ObjectId(articleId) });
            
            if (!article) {
                return {
                    success: false,
                    error: 'Article not found'
                };
            }
            
            // Validate destinations
            const validDestinations = [];
            for (const destId of destinations) {
                const dest = await this.db.collection('destinations')
                    .findOne({ _id: new ObjectId(destId), active: { $ne: false } });
                if (dest) {
                    validDestinations.push(destId);
                }
            }
            
            if (validDestinations.length === 0) {
                return {
                    success: false,
                    error: 'No valid destinations found'
                };
            }
            
            // Create scheduled post
            const scheduledPost = {
                article_id: articleId,
                title: article.title,
                destinations: validDestinations,
                scheduled_for: scheduleTime,
                scheduled_by: userId,
                created_at: now,
                status: 'pending',
                timezone: options.timezone || this.options.timezone,
                priority: options.priority || 'normal',
                retry_count: 0
            };
            
            const result = await this.db.collection('scheduled_posts').insertOne(scheduledPost);
            
            // Log the scheduling
            await this.logInfo('postScheduled', 'Post scheduled successfully', {
                scheduledPostId: result.insertedId,
                articleId,
                scheduledFor: scheduleTime,
                destinations: validDestinations.length
            });
            
            return {
                success: true,
                scheduled_post_id: result.insertedId,
                scheduled_for: scheduleTime,
                destinations_count: validDestinations.length
            };
            
        } catch (error) {
            console.error('❌ Error scheduling post:', error);
            await this.logError('schedulePost', error, { articleId, destinations, scheduledFor });
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Create recurring schedule (cron job)
     */
    async createRecurringSchedule(config, userId) {
        try {
            const {
                name,
                type = 'digest',
                schedule,
                destinations,
                category = null,
                timezone = this.options.timezone,
                enabled = true,
                options = {}
            } = config;
            
            // Validate schedule
            if (!this.validateSchedule(schedule)) {
                return {
                    success: false,
                    error: 'Invalid schedule format'
                };
            }
            
            // Validate destinations
            const validDestinations = [];
            for (const destId of destinations || []) {
                const dest = await this.db.collection('destinations')
                    .findOne({ _id: new ObjectId(destId), active: { $ne: false } });
                if (dest) {
                    validDestinations.push(destId);
                }
            }
            
            if (validDestinations.length === 0) {
                return {
                    success: false,
                    error: 'No valid destinations provided'
                };
            }
            
            // Create job data
            const jobData = {
                name,
                type,
                schedule,
                destinations: validDestinations,
                category,
                timezone,
                enabled,
                created_by: userId,
                created_at: new Date(),
                run_count: 0,
                last_run: null,
                next_run: null,
                ...options
            };
            
            const result = await this.db.collection('schedule_jobs').insertOne(jobData);
            jobData._id = result.insertedId;
            
            // Create and start cron job if enabled
            if (enabled) {
                await this.createCronJob(jobData);
            }
            
            await this.logInfo('recurringScheduleCreated', 'Recurring schedule created', {
                jobId: result.insertedId,
                name,
                type,
                destinations: validDestinations.length
            });
            
            return {
                success: true,
                job_id: result.insertedId,
                name,
                next_run: this.jobs.get(result.insertedId.toString())?.job?.nextDate()?.toDate()
            };
            
        } catch (error) {
            console.error('❌ Error creating recurring schedule:', error);
            await this.logError('createRecurringSchedule', error, config);
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Update recurring schedule
     */
    async updateRecurringSchedule(jobId, updates, userId) {
        try {
            const job = await this.db.collection('schedule_jobs')
                .findOne({ _id: new ObjectId(jobId) });
            
            if (!job) {
                return {
                    success: false,
                    error: 'Schedule not found'
                };
            }
            
            // Check permissions (only creator or admin can modify)
            const isAdmin = await this.isAdmin(userId);
            if (job.created_by !== userId && !isAdmin) {
                return {
                    success: false,
                    error: 'Insufficient permissions'
                };
            }
            
            // Validate updates
            if (updates.schedule && !this.validateSchedule(updates.schedule)) {
                return {
                    success: false,
                    error: 'Invalid schedule format'
                };
            }
            
            // Stop existing cron job
            const existingJobRef = this.jobs.get(jobId);
            if (existingJobRef) {
                existingJobRef.job.stop();
                this.jobs.delete(jobId);
            }
            
            // Update database
            const updateData = {
                ...updates,
                updated_by: userId,
                updated_at: new Date()
            };
            
            await this.db.collection('schedule_jobs').updateOne(
                { _id: new ObjectId(jobId) },
                { $set: updateData }
            );
            
            // Get updated job data
            const updatedJob = await this.db.collection('schedule_jobs')
                .findOne({ _id: new ObjectId(jobId) });
            
            // Recreate cron job if enabled
            if (updatedJob.enabled) {
                await this.createCronJob(updatedJob);
            }
            
            await this.logInfo('recurringScheduleUpdated', 'Recurring schedule updated', {
                jobId,
                updates: Object.keys(updates)
            });
            
            return {
                success: true,
                job_id: jobId,
                next_run: this.jobs.get(jobId)?.job?.nextDate()?.toDate()
            };
            
        } catch (error) {
            console.error('❌ Error updating recurring schedule:', error);
            await this.logError('updateRecurringSchedule', error, { jobId, updates });
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Delete recurring schedule
     */
    async deleteRecurringSchedule(jobId, userId) {
        try {
            const job = await this.db.collection('schedule_jobs')
                .findOne({ _id: new ObjectId(jobId) });
            
            if (!job) {
                return {
                    success: false,
                    error: 'Schedule not found'
                };
            }
            
            // Check permissions
            const isAdmin = await this.isAdmin(userId);
            if (job.created_by !== userId && !isAdmin) {
                return {
                    success: false,
                    error: 'Insufficient permissions'
                };
            }
            
            // Stop and remove cron job
            const jobRef = this.jobs.get(jobId);
            if (jobRef) {
                jobRef.job.stop();
                this.jobs.delete(jobId);
            }
            
            // Delete from database
            await this.db.collection('schedule_jobs').deleteOne({
                _id: new ObjectId(jobId)
            });
            
            await this.logInfo('recurringScheduleDeleted', 'Recurring schedule deleted', {
                jobId,
                jobName: job.name
            });
            
            return {
                success: true,
                message: 'Schedule deleted successfully'
            };
            
        } catch (error) {
            console.error('❌ Error deleting recurring schedule:', error);
            await this.logError('deleteRecurringSchedule', error, { jobId });
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Cancel scheduled post
     */
    async cancelScheduledPost(postId, userId) {
        try {
            const post = await this.db.collection('scheduled_posts')
                .findOne({ _id: new ObjectId(postId) });
            
            if (!post) {
                return {
                    success: false,
                    error: 'Scheduled post not found'
                };
            }
            
            // Check permissions
            const isAdmin = await this.isAdmin(userId);
            if (post.scheduled_by !== userId && !isAdmin) {
                return {
                    success: false,
                    error: 'You can only cancel your own scheduled posts'
                };
            }
            
            if (post.status !== 'pending') {
                return {
                    success: false,
                    error: `Cannot cancel post with status: ${post.status}`
                };
            }
            
            // Cancel the post
            await this.db.collection('scheduled_posts').updateOne(
                { _id: new ObjectId(postId) },
                { 
                    $set: { 
                        status: 'cancelled',
                        cancelled_at: new Date(),
                        cancelled_by: userId
                    }
                }
            );
            
            await this.logInfo('postCancelled', 'Scheduled post cancelled', {
                postId,
                postTitle: post.title
            });
            
            return {
                success: true,
                message: 'Scheduled post cancelled successfully'
            };
            
        } catch (error) {
            console.error('❌ Error cancelling scheduled post:', error);
            await this.logError('cancelScheduledPost', error, { postId });
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get scheduled posts for a user
     */
    async getScheduledPosts(userId, options = {}) {
        try {
            const {
                limit = 20,
                offset = 0,
                status = null,
                includeAll = false
            } = options;
            
            const query = {};
            
            // Filter by user unless admin requesting all
            const isAdmin = await this.isAdmin(userId);
            if (!includeAll || !isAdmin) {
                query.scheduled_by = userId;
            }
            
            // Filter by status
            if (status) {
                query.status = status;
            } else {
                // Default to pending and future posts
                query.status = { $in: ['pending', 'processing'] };
                query.scheduled_for = { $gte: new Date() };
            }
            
            const posts = await this.db.collection('scheduled_posts')
                .find(query)
                .sort({ scheduled_for: 1 })
                .skip(offset)
                .limit(limit)
                .toArray();
            
            // Get total count
            const totalCount = await this.db.collection('scheduled_posts')
                .countDocuments(query);
            
            return {
                success: true,
                posts,
                total: totalCount,
                has_more: (offset + limit) < totalCount
            };
            
        } catch (error) {
            console.error('❌ Error getting scheduled posts:', error);
            return {
                success: false,
                error: error.message,
                posts: []
            };
        }
    }
    
    /**
     * Get recurring schedules for a user
     */
    async getRecurringSchedules(userId, options = {}) {
        try {
            const {
                limit = 20,
                offset = 0,
                includeDisabled = false,
                includeAll = false
            } = options;
            
            const query = {};
            
            // Filter by user unless admin requesting all
            const isAdmin = await this.isAdmin(userId);
            if (!includeAll || !isAdmin) {
                query.created_by = userId;
            }
            
            // Filter by enabled status
            if (!includeDisabled) {
                query.enabled = true;
            }
            
            const schedules = await this.db.collection('schedule_jobs')
                .find(query)
                .sort({ created_at: -1 })
                .skip(offset)
                .limit(limit)
                .toArray();
            
            // Add next run times from active jobs
            const schedulesWithStatus = schedules.map(schedule => {
                const jobRef = this.jobs.get(schedule._id.toString());
                return {
                    ...schedule,
                    is_active: !!jobRef,
                    next_run: jobRef?.job?.nextDate()?.toDate(),
                    last_run_status: jobRef?.errors?.length > 0 ? 'error' : 'success',
                    error_count: jobRef?.errors?.length || 0
                };
            });
            
            const totalCount = await this.db.collection('schedule_jobs')
                .countDocuments(query);
            
            return {
                success: true,
                schedules: schedulesWithStatus,
                total: totalCount,
                has_more: (offset + limit) < totalCount
            };
            
        } catch (error) {
            console.error('❌ Error getting recurring schedules:', error);
            return {
                success: false,
                error: error.message,
                schedules: []
            };
        }
    }
    
    /**
     * Get schedule templates
     */
    async getScheduleTemplates(userId = null) {
        try {
            // Get built-in templates
            const builtInTemplates = Object.entries(this.templates).map(([key, value]) => ({
                name: key,
                display_name: this.formatTemplateName(key),
                schedule: value,
                built_in: true,
                description: this.getTemplateDescription(key)
            }));
            
            // Get user-created templates
            let userTemplates = [];
            if (userId) {
                userTemplates = await this.db.collection('schedule_templates')
                    .find({ 
                        $or: [
                            { created_by: userId },
                            { public: true }
                        ]
                    })
                    .sort({ created_at: -1 })
                    .toArray();
            }
            
            return {
                success: true,
                templates: [...builtInTemplates, ...userTemplates]
            };
            
        } catch (error) {
            console.error('❌ Error getting schedule templates:', error);
            return {
                success: false,
                error: error.message,
                templates: []
            };
        }
    }
    
    /**
     * Create custom schedule template
     */
    async createScheduleTemplate(name, schedule, userId, options = {}) {
        try {
            const {
                description = '',
                isPublic = false
            } = options;
            
            // Validate schedule
            if (!this.validateSchedule(schedule)) {
                return {
                    success: false,
                    error: 'Invalid schedule format'
                };
            }
            
            // Check if template name already exists for user
            const existing = await this.db.collection('schedule_templates')
                .findOne({ name, created_by: userId });
            
            if (existing) {
                return {
                    success: false,
                    error: 'Template name already exists'
                };
            }
            
            const template = {
                name,
                schedule,
                description,
                public: isPublic,
                created_by: userId,
                created_at: new Date(),
                usage_count: 0
            };
            
            const result = await this.db.collection('schedule_templates')
                .insertOne(template);
            
            return {
                success: true,
                template_id: result.insertedId,
                message: 'Template created successfully'
            };
            
        } catch (error) {
            console.error('❌ Error creating schedule template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get scheduler analytics
     */
    async getSchedulerAnalytics(userId, days = 30) {
        try {
            const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            
            // Check if user is admin for full analytics
            const isAdmin = await this.isAdmin(userId);
            const userFilter = isAdmin ? {} : { scheduled_by: userId };
            
            // Get basic statistics
            const [
                totalScheduled,
                totalSent,
                totalFailed,
                totalCancelled,
                recentActivity
            ] = await Promise.all([
                this.db.collection('scheduled_posts').countDocuments({
                    ...userFilter,
                    created_at: { $gte: startDate }
                }),
                this.db.collection('scheduled_posts').countDocuments({
                    ...userFilter,
                    status: 'sent',
                    created_at: { $gte: startDate }
                }),
                this.db.collection('scheduled_posts').countDocuments({
                    ...userFilter,
                    status: 'failed',
                    created_at: { $gte: startDate }
                }),
                this.db.collection('scheduled_posts').countDocuments({
                    ...userFilter,
                    status: 'cancelled',
                    created_at: { $gte: startDate }
                }),
                this.db.collection('scheduled_posts').aggregate([
                    {
                        $match: {
                            ...userFilter,
                            created_at: { $gte: startDate }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                date: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } }
                            },
                            scheduled: { $sum: 1 },
                            sent: {
                                $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
                            },
                            failed: {
                                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                            }
                        }
                    },
                    { $sort: { '_id.date': 1 } }
                ]).toArray()
            ]);
            
            // Get queue statistics (admin only)
            let queueStats = null;
            if (isAdmin) {
                queueStats = {
                    queued: await this.db.collection('post_queue').countDocuments({ status: 'queued' }),
                    processing: await this.db.collection('post_queue').countDocuments({ status: 'processing' }),
                    completed_today: await this.db.collection('post_queue').countDocuments({
                        status: 'completed',
                        completed_at: { $gte: new Date(new Date().setHours(0,0,0,0)) }
                    }),
                    failed_today: await this.db.collection('post_queue').countDocuments({
                        status: 'failed',
                        failed_at: { $gte: new Date(new Date().setHours(0,0,0,0)) }
                    })
                };
            }
            
            // Calculate success rate
            const successRate = totalSent + totalFailed > 0 
                ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
                : 0;
            
            return {
                success: true,
                analytics: {
                    period_days: days,
                    total_scheduled: totalScheduled,
                    total_sent: totalSent,
                    total_failed: totalFailed,
                    total_cancelled: totalCancelled,
                    success_rate: successRate,
                    active_jobs: this.jobs.size,
                    health_status: this.isHealthy ? 'healthy' : 'unhealthy',
                    recent_activity: recentActivity,
                    queue_stats: queueStats,
                    last_heartbeat: this.lastHeartbeat
                }
            };
            
        } catch (error) {
            console.error('❌ Error getting scheduler analytics:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Bulk schedule posts
     */
    async bulkSchedulePosts(posts, userId) {
        try {
            const results = [];
            const batchSize = 10;
            
            for (let i = 0; i < posts.length; i += batchSize) {
                const batch = posts.slice(i, i + batchSize);
                const batchPromises = batch.map(post => 
                    this.schedulePost(
                        post.article_id,
                        post.destinations,
                        post.scheduled_for,
                        userId,
                        post.options || {}
                    )
                );
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
                
                // Small delay between batches to avoid overwhelming the system
                if (i + batchSize < posts.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            const successful = results.filter(r => r.success).length;
            const failed = results.length - successful;
            
            await this.logInfo('bulkSchedule', 'Bulk schedule completed', {
                total: posts.length,
                successful,
                failed
            });
            
            return {
                success: true,
                total: posts.length,
                successful,
                failed,
                results
            };
            
        } catch (error) {
            console.error('❌ Error bulk scheduling posts:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Smart scheduling - suggest optimal times
     */
    async suggestOptimalTimes(destinationIds, timezone = null) {
        try {
            // This is a simplified implementation
            // In production, you would analyze engagement patterns, user activity, etc.
            
            const tz = timezone || this.options.timezone;
            const suggestions = [];
            
            // Morning suggestions
            suggestions.push({
                time: '08:00',
                label: 'Morning Digest',
                description: 'Good for daily news summaries',
                engagement_score: 85,
                timezone: tz
            });
            
            // Lunch suggestions  
            suggestions.push({
                time: '12:30',
                label: 'Lunch Break',
                description: 'Peak mobile usage time',
                engagement_score: 92,
                timezone: tz
            });
            
            // Evening suggestions
            suggestions.push({
                time: '18:00',
                label: 'Evening Update',
                description: 'End of workday catch-up',
                engagement_score: 88,
                timezone: tz
            });
            
            // Weekend suggestions
            suggestions.push({
                time: '10:00',
                label: 'Weekend Morning',
                description: 'Leisurely weekend reading',
                engagement_score: 75,
                timezone: tz,
                days: ['Saturday', 'Sunday']
            });
            
            return {
                success: true,
                suggestions,
                timezone: tz
            };
            
        } catch (error) {
            console.error('❌ Error suggesting optimal times:', error);
            return {
                success: false,
                error: error.message,
                suggestions: []
            };
        }
    }
    
    /**
     * Pause/Resume scheduler
     */
    async pauseScheduler(userId) {
        try {
            const isAdmin = await this.isAdmin(userId);
            if (!isAdmin) {
                return {
                    success: false,
                    error: 'Admin access required'
                };
            }
            
            // Stop all active jobs
            for (const [jobId, jobRef] of this.jobs.entries()) {
                jobRef.job.stop();
            }
            
            // Update status
            await this.db.collection('scheduler_status').updateOne(
                { _id: 'global' },
                { 
                    $set: {
                        paused: true,
                        paused_by: userId,
                        paused_at: new Date()
                    }
                },
                { upsert: true }
            );
            
            await this.logInfo('schedulerPaused', 'Scheduler paused by admin', { userId });
            
            return {
                success: true,
                message: 'Scheduler paused successfully'
            };
            
        } catch (error) {
            console.error('❌ Error pausing scheduler:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Resume scheduler
     */
    async resumeScheduler(userId) {
        try {
            const isAdmin = await this.isAdmin(userId);
            if (!isAdmin) {
                return {
                    success: false,
                    error: 'Admin access required'
                };
            }
            
            // Restart all enabled jobs
            const enabledJobs = await this.db.collection('schedule_jobs')
                .find({ enabled: true })
                .toArray();
            
            for (const jobData of enabledJobs) {
                await this.createCronJob(jobData);
            }
            
            // Update status
            await this.db.collection('scheduler_status').updateOne(
                { _id: 'global' },
                { 
                    $set: {
                        paused: false,
                        resumed_by: userId,
                        resumed_at: new Date()
                    }
                },
                { upsert: true }
            );
            
            await this.logInfo('schedulerResumed', 'Scheduler resumed by admin', { userId });
            
            return {
                success: true,
                message: 'Scheduler resumed successfully'
            };
            
        } catch (error) {
            console.error('❌ Error resuming scheduler:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // =====================================
    // HELPER METHODS
    // =====================================
    
    /**
     * Validate schedule format
     */
    validateSchedule(schedule) {
        if (!schedule || typeof schedule !== 'object') {
            return false;
        }
        
        // Check for cron expression
        if (schedule.cron) {
            return this.validateCronExpression(schedule.cron);
        }
        
        // Check for interval
        if (schedule.interval) {
            return this.validateCronExpression(schedule.interval);
        }
        
        // Check for hour/minute/days format
        if (typeof schedule.hour === 'number' && typeof schedule.minute === 'number') {
            return schedule.hour >= 0 && schedule.hour <= 23 &&
                   schedule.minute >= 0 && schedule.minute <= 59;
        }
        
        return false;
    }
    
    /**
     * Validate cron expression (basic validation)
     */
    validateCronExpression(cron) {
        if (typeof cron !== 'string') return false;
        
        const parts = cron.trim().split(/\s+/);
        return parts.length === 5 || parts.length === 6; // Standard or with seconds
    }
    
    /**
     * Check if user is admin
     */
    async isAdmin(userId) {
        // This should integrate with your admin system
        const config = require('../config');
        return config.adminIds.includes(parseInt(userId));
    }
    
    /**
     * Get latest articles
     */
    async getLatestArticles(category = null, limit = 5) {
        try {
            const query = {};
            if (category) {
                query.category = category;
            }
            
            return await this.db.collection('news_articles')
                .find(query)
                .sort({ published_date: -1, created_at: -1 })
                .limit(limit)
                .toArray();
                
        } catch (error) {
            console.error('❌ Error getting latest articles:', error);
            return [];
        }
    }
    
    /**
     * Get breaking news articles
     */
    async getBreakingNews(keywords = [], since = null) {
        try {
            const sinceDate = since || new Date(Date.now() - 15 * 60 * 1000); // Last 15 minutes
            
            const query = {
                created_at: { $gte: sinceDate }
            };
            
            // Add keyword matching if provided
            if (keywords.length > 0) {
                query.$or = [
                    { title: { $regex: keywords.join('|'), $options: 'i' } },
                    { content: { $regex: keywords.join('|'), $options: 'i' } }
                ];
            }
            
            return await this.db.collection('news_articles')
                .find(query)
                .sort({ created_at: -1 })
                .limit(10)
                .toArray();
                
        } catch (error) {
            console.error('❌ Error getting breaking news:', error);
            return [];
        }
    }
    
    /**
     * Format digest content
     */
    formatDigest(articles, digestType = 'standard') {
        if (articles.length === 0) {
            return '📰 *News Digest*\n\nNo new articles available at this time.';
        }
        
        let digest = `📰 *News Digest* - ${new Date().toLocaleDateString('en-AU')}\n\n`;
        
        switch (digestType) {
            case 'brief':
                articles.slice(0, 3).forEach((article, index) => {
                    digest += `${index + 1}. *${this.escapeMarkdown(article.title)}*\n`;
                });
                break;
                
            case 'detailed':
                articles.forEach((article, index) => {
                    digest += `${index + 1}. *${this.escapeMarkdown(article.title)}*\n`;
                    digest += `   ${this.escapeMarkdown(article.summary || article.content?.substring(0, 100))}...\n`;
                    digest += `   📅 ${new Date(article.published_date).toLocaleDateString('en-AU')}\n\n`;
                });
                break;
                
            default: // standard
                articles.forEach((article, index) => {
                    digest += `${index + 1}. *${this.escapeMarkdown(article.title)}*\n`;
                    digest += `   📅 ${new Date(article.published_date).toLocaleDateString('en-AU')} | `;
                    digest += `📂 ${article.category || 'General'}\n\n`;
                });
        }
        
        digest += `\n🔗 [Read all articles](https://thezonenews.com)\n`;
        digest += `📊 Total articles: ${articles.length}`;
        
        return digest;
    }
    
    /**
     * Format template name for display
     */
    formatTemplateName(key) {
        return key.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }
    
    /**
     * Get template description
     */
    getTemplateDescription(key) {
        const descriptions = {
            'morning-digest': 'Daily morning news summary on weekdays',
            'evening-digest': 'Daily evening news update on weekdays',
            'breaking-news': 'Breaking news alerts every 15 minutes',
            'weekend-summary': 'Weekend news summary on Saturday and Sunday mornings'
        };
        
        return descriptions[key] || 'Custom schedule template';
    }
    
    /**
     * Escape markdown characters
     */
    escapeMarkdown(text) {
        if (!text) return '';
        return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
    }
    
    /**
     * Update metrics
     */
    async updateMetrics(metrics) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            await this.db.collection('scheduler_metrics').updateOne(
                { date: today },
                { 
                    $set: {
                        ...metrics,
                        timestamp: new Date()
                    }
                },
                { upsert: true }
            );
            
        } catch (error) {
            console.error('❌ Error updating metrics:', error);
        }
    }
    
    /**
     * Log information
     */
    async logInfo(action, message, data = {}) {
        try {
            await this.db.collection('scheduler_logs').insertOne({
                level: 'info',
                action,
                message,
                data,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('❌ Error logging info:', error);
        }
    }
    
    /**
     * Log error
     */
    async logError(action, error, data = {}) {
        try {
            await this.db.collection('scheduler_logs').insertOne({
                level: 'error',
                action,
                message: error.message || error,
                error: error.stack || error,
                data,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('❌ Error logging error:', error);
        }
    }
    
    /**
     * Notify admin of failure
     */
    async notifyAdminOfFailure(item, errorMessage) {
        try {
            const config = require('../config');
            if (!config.adminIds || config.adminIds.length === 0) return;
            
            const message = `🚨 *Scheduler Alert*\n\n` +
                `❌ Failed to process queue item\n` +
                `📝 Type: ${item.type}\n` +
                `🆔 ID: ${item._id}\n` +
                `📅 Queued: ${new Date(item.queued_at).toLocaleString('en-AU')}\n` +
                `🔄 Attempts: ${item.attempts}/${this.options.maxRetries}\n` +
                `❌ Error: ${errorMessage}\n\n` +
                `Please check the scheduler logs for more details.`;
            
            // Send to first admin only to avoid spam
            await this.bot.telegram.sendMessage(
                config.adminIds[0],
                message,
                { parse_mode: 'Markdown' }
            );
            
        } catch (error) {
            console.error('❌ Error notifying admin:', error);
        }
    }
    
    /**
     * Get health status
     */
    getHealthStatus() {
        return {
            is_healthy: this.isHealthy,
            active_jobs: this.jobs.size,
            processing_queue_size: this.processingQueue.size,
            rate_limit_usage: `${this.rateLimiter.count}/${this.options.rateLimit}`,
            last_heartbeat: this.lastHeartbeat,
            uptime: Date.now() - (this.startTime || Date.now())
        };
    }
    
    /**
     * Get supported timezones
     */
    getSupportedTimezones() {
        return this.timezones;
    }
}

module.exports = SchedulerService;