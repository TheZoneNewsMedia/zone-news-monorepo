/**
 * Schedule Service
 * Handles post scheduling with cron and one-time schedules
 */

const cron = require('node-cron');

class ScheduleService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.scheduledTasks = new Map();
        this.init();
    }
    
    async init() {
        // Load existing schedules on startup
        await this.loadSchedules();
        
        // Check for pending one-time posts every minute
        cron.schedule('* * * * *', async () => {
            await this.checkPendingPosts();
        });
    }
    
    /**
     * Create a new schedule
     */
    async createSchedule(userId, destination, schedule, articleSelection = 'latest') {
        const scheduleId = `sch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.db.collection('scheduled_posts').insertOne({
            schedule_id: scheduleId,
            user_id: userId,
            destination: destination,
            schedule: schedule,
            article_selection: articleSelection,
            created_at: new Date(),
            active: true,
            executed_count: 0
        });
        
        // Set up cron for recurring schedules
        if (schedule.type === 'daily' || schedule.type === 'weekly') {
            this.setupCronJob(scheduleId, schedule);
        }
        
        return scheduleId;
    }
    
    /**
     * Parse schedule time string
     */
    parseSchedule(timeStr, timezone = 'Australia/Adelaide') {
        const now = new Date();
        let schedule = {};
        
        // Daily schedule
        if (timeStr.startsWith('daily ')) {
            const time = timeStr.replace('daily ', '');
            const [hour, minute] = time.split(':');
            
            schedule = {
                type: 'daily',
                time: time,
                hour: parseInt(hour),
                minute: parseInt(minute),
                timezone: timezone,
                cron: `${minute} ${hour} * * *`,
                display: `Daily at ${time} ${timezone}`
            };
        }
        // Weekly schedule
        else if (timeStr.match(/^(mon|tue|wed|thu|fri|sat|sun) /i)) {
            const parts = timeStr.split(' ');
            const day = parts[0].toLowerCase();
            const time = parts[1];
            const [hour, minute] = time.split(':');
            
            const dayMap = {
                'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3,
                'thu': 4, 'fri': 5, 'sat': 6
            };
            
            schedule = {
                type: 'weekly',
                day: day,
                time: time,
                hour: parseInt(hour),
                minute: parseInt(minute),
                timezone: timezone,
                cron: `${minute} ${hour} * * ${dayMap[day]}`,
                display: `Every ${day} at ${time} ${timezone}`
            };
        }
        // Tomorrow
        else if (timeStr.startsWith('tomorrow ')) {
            const time = timeStr.replace('tomorrow ', '');
            const [hour, minute] = time.split(':');
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(parseInt(hour), parseInt(minute), 0, 0);
            
            schedule = {
                type: 'once',
                time: time,
                timestamp: tomorrow.getTime(),
                display: `Tomorrow at ${time}`
            };
        }
        // Today or specific time
        else if (timeStr.match(/^\d{1,2}:\d{2}$/)) {
            const [hour, minute] = timeStr.split(':');
            const today = new Date(now);
            today.setHours(parseInt(hour), parseInt(minute), 0, 0);
            
            // If time has passed, schedule for tomorrow
            if (today.getTime() < now.getTime()) {
                today.setDate(today.getDate() + 1);
            }
            
            schedule = {
                type: 'once',
                time: timeStr,
                timestamp: today.getTime(),
                display: today.getTime() > now.getTime() ? 
                    `Today at ${timeStr}` : `Tomorrow at ${timeStr}`
            };
        }
        
        return Object.keys(schedule).length > 0 ? schedule : null;
    }
    
    /**
     * Setup cron job for recurring schedule
     */
    setupCronJob(scheduleId, schedule) {
        const task = cron.schedule(schedule.cron, async () => {
            await this.executeSchedule(scheduleId);
        }, {
            scheduled: true,
            timezone: schedule.timezone || 'Australia/Adelaide'
        });
        
        this.scheduledTasks.set(scheduleId, task);
    }
    
    /**
     * Execute a scheduled post
     */
    async executeSchedule(scheduleId) {
        try {
            const schedule = await this.db.collection('scheduled_posts')
                .findOne({ schedule_id: scheduleId, active: true });
            
            if (!schedule) return;
            
            // Get article based on selection
            let article;
            if (schedule.article_selection === 'latest') {
                const articles = await this.db.collection('news_articles')
                    .find({ 'zone_news_data.channel': '@ZoneNewsAdl' })
                    .sort({ published_date: -1 })
                    .limit(1)
                    .toArray();
                
                if (articles.length === 0) return;
                article = articles[0];
            }
            
            // Format message
            const message = this.formatArticle(article);
            
            // Send to destination
            const messageOptions = {
                parse_mode: 'Markdown',
                reply_markup: this.getArticleKeyboard(article)
            };
            
            // Handle topic threads
            if (schedule.destination.includes(':topic:')) {
                const [chatId, topicId] = schedule.destination.split(':topic:');
                messageOptions.message_thread_id = parseInt(topicId);
                await this.bot.telegram.sendMessage(chatId, message, messageOptions);
            } else {
                await this.bot.telegram.sendMessage(
                    schedule.destination, 
                    message, 
                    messageOptions
                );
            }
            
            // Log execution
            await this.db.collection('scheduled_posts').updateOne(
                { schedule_id: scheduleId },
                { 
                    $inc: { executed_count: 1 },
                    $set: { last_executed: new Date() }
                }
            );
            
            // Log posted article
            await this.db.collection('posted_articles').insertOne({
                article_id: article._id,
                destination: schedule.destination,
                posted_at: new Date(),
                posted_by: 'scheduler',
                schedule_id: scheduleId
            });
            
            // Deactivate if one-time schedule
            if (schedule.schedule.type === 'once') {
                await this.cancelSchedule(scheduleId);
            }
            
        } catch (error) {
            console.error(`Schedule execution error for ${scheduleId}:`, error);
            
            // Log error
            await this.db.collection('schedule_errors').insertOne({
                schedule_id: scheduleId,
                error: error.message,
                occurred_at: new Date()
            });
        }
    }
    
    /**
     * Check and execute pending one-time posts
     */
    async checkPendingPosts() {
        const now = Date.now();
        
        const pending = await this.db.collection('scheduled_posts')
            .find({
                active: true,
                'schedule.type': 'once',
                'schedule.timestamp': { $lte: now }
            })
            .toArray();
        
        for (const schedule of pending) {
            await this.executeSchedule(schedule.schedule_id);
        }
    }
    
    /**
     * Cancel a schedule
     */
    async cancelSchedule(scheduleId) {
        // Stop cron job if exists
        if (this.scheduledTasks.has(scheduleId)) {
            this.scheduledTasks.get(scheduleId).stop();
            this.scheduledTasks.delete(scheduleId);
        }
        
        // Mark as inactive
        await this.db.collection('scheduled_posts').updateOne(
            { schedule_id: scheduleId },
            { 
                $set: { 
                    active: false, 
                    cancelled_at: new Date() 
                } 
            }
        );
    }
    
    /**
     * Get user's schedules
     */
    async getUserSchedules(userId, activeOnly = true) {
        const query = { user_id: userId };
        if (activeOnly) query.active = true;
        
        return await this.db.collection('scheduled_posts')
            .find(query)
            .sort({ created_at: -1 })
            .toArray();
    }
    
    /**
     * Load schedules on startup
     */
    async loadSchedules() {
        const activeSchedules = await this.db.collection('scheduled_posts')
            .find({ 
                active: true,
                'schedule.type': { $in: ['daily', 'weekly'] }
            })
            .toArray();
        
        for (const schedule of activeSchedules) {
            this.setupCronJob(schedule.schedule_id, schedule.schedule);
        }
        
        console.log(`✅ Loaded ${activeSchedules.length} active schedules`);
    }
    
    /**
     * Format article for posting
     */
    formatArticle(article) {
        const date = new Date(article.published_date).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        
        const content = article.content ? 
            article.content.substring(0, 800) + '...' : 
            article.title;
        
        return `📰 *${article.title}*

${content}

📅 ${date}
📂 ${article.category || 'General News'}
👁 ${article.views || 0} views

#ZoneNews #Adelaide #Breaking`;
    }
    
    /**
     * Get article keyboard
     */
    getArticleKeyboard(article) {
        const messageId = article.zone_news_data?.message_id;
        const link = messageId ? 
            `https://t.me/ZoneNewsAdl/${messageId}` : 
            article.url || 'https://thezonenews.com';
        
        return {
            inline_keyboard: [
                [
                    { text: '📖 Read Full', url: link },
                    { text: '🔗 Share', url: `https://t.me/share/url?url=${encodeURIComponent(link)}` }
                ],
                [
                    { text: '👍 0', callback_data: `like_${article._id}_0` },
                    { text: '❤️ 0', callback_data: `love_${article._id}_0` },
                    { text: '🔥 0', callback_data: `fire_${article._id}_0` }
                ]
            ]
        };
    }
}

module.exports = ScheduleService;