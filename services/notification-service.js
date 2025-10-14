#!/usr/bin/env node

/**
 * Zone News Push Notification Service
 * Handles web push, email, and Telegram notifications
 */

const express = require('express');
const webpush = require('web-push');
const nodemailer = require('nodemailer');
const { MongoClient } = require('mongodb');
const Bull = require('bull');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

class NotificationService {
    constructor() {
        this.app = express();
        this.port = process.env.NOTIFICATION_PORT || 3031;
        this.db = null;
        this.notificationQueue = null;
        this.emailTransporter = null;
        this.telegramBot = null;
        
        // Web Push configuration
        this.vapidKeys = {
            publicKey: process.env.VAPID_PUBLIC_KEY,
            privateKey: process.env.VAPID_PRIVATE_KEY
        };
    }

    async initialize() {
        await this.connectDatabase();
        await this.setupQueues();
        this.setupWebPush();
        this.setupEmail();
        this.setupTelegram();
        this.setupExpress();
        this.processQueues();
        await this.startServer();
    }

    async connectDatabase() {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        const client = await MongoClient.connect(mongoUri);
        this.db = client.db('zone_news_production');
        console.log('✅ Connected to MongoDB');
    }

    async setupQueues() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        // Create notification queue
        this.notificationQueue = new Bull('notifications', redisUrl);
        
        // Create separate queues for different notification types
        this.pushQueue = new Bull('push-notifications', redisUrl);
        this.emailQueue = new Bull('email-notifications', redisUrl);
        this.telegramQueue = new Bull('telegram-notifications', redisUrl);
        
        console.log('✅ Queues initialized');
    }

    setupWebPush() {
        if (!this.vapidKeys.publicKey || !this.vapidKeys.privateKey) {
            console.log('⚠️ VAPID keys not configured, generating new ones...');
            const vapidKeys = webpush.generateVAPIDKeys();
            console.log('Public Key:', vapidKeys.publicKey);
            console.log('Private Key:', vapidKeys.privateKey);
            this.vapidKeys = vapidKeys;
        }
        
        webpush.setVapidDetails(
            'mailto:admin@thezonenews.com',
            this.vapidKeys.publicKey,
            this.vapidKeys.privateKey
        );
        
        console.log('✅ Web Push configured');
    }

    setupEmail() {
        this.emailTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
        
        if (process.env.SMTP_USER) {
            console.log('✅ Email service configured');
        } else {
            console.log('⚠️ Email service not configured');
        }
    }

    setupTelegram() {
        if (process.env.BOT_TOKEN) {
            this.telegramBot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
            console.log('✅ Telegram bot configured');
        } else {
            console.log('⚠️ Telegram bot not configured');
        }
    }

    setupExpress() {
        this.app.use(cors());
        this.app.use(express.json());
        
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                services: {
                    webPush: !!this.vapidKeys.publicKey,
                    email: !!this.emailTransporter,
                    telegram: !!this.telegramBot
                },
                queues: {
                    notifications: this.notificationQueue?.name,
                    push: this.pushQueue?.name,
                    email: this.emailQueue?.name,
                    telegram: this.telegramQueue?.name
                }
            });
        });
        
        // Get VAPID public key for client registration
        this.app.get('/vapid-public-key', (req, res) => {
            res.json({ publicKey: this.vapidKeys.publicKey });
        });
        
        // Register push subscription
        this.app.post('/subscribe', async (req, res) => {
            try {
                const { userId, subscription, preferences } = req.body;
                
                await this.db.collection('push_subscriptions').updateOne(
                    { userId },
                    {
                        $set: {
                            subscription,
                            preferences,
                            subscribedAt: new Date(),
                            active: true
                        }
                    },
                    { upsert: true }
                );
                
                res.json({ success: true });
            } catch (error) {
                console.error('Subscription error:', error);
                res.status(500).json({ error: 'Failed to save subscription' });
            }
        });
        
        // Unsubscribe
        this.app.post('/unsubscribe', async (req, res) => {
            try {
                const { userId } = req.body;
                
                await this.db.collection('push_subscriptions').updateOne(
                    { userId },
                    { $set: { active: false } }
                );
                
                res.json({ success: true });
            } catch (error) {
                console.error('Unsubscribe error:', error);
                res.status(500).json({ error: 'Failed to unsubscribe' });
            }
        });
        
        // Send notification (internal API)
        this.app.post('/send', this.authenticateInternal.bind(this), async (req, res) => {
            try {
                const { type, recipients, data, options = {} } = req.body;
                
                // Add to queue
                const job = await this.notificationQueue.add({
                    type,
                    recipients,
                    data,
                    options,
                    timestamp: new Date()
                });
                
                res.json({ 
                    success: true, 
                    jobId: job.id 
                });
            } catch (error) {
                console.error('Send notification error:', error);
                res.status(500).json({ error: 'Failed to queue notification' });
            }
        });
        
        // Broadcast notification
        this.app.post('/broadcast', this.authenticateInternal.bind(this), async (req, res) => {
            try {
                const { type, data, filters = {} } = req.body;
                
                // Get recipients based on filters
                const recipients = await this.getRecipients(filters);
                
                // Queue broadcast
                const job = await this.notificationQueue.add({
                    type: 'broadcast',
                    subType: type,
                    recipients,
                    data,
                    timestamp: new Date()
                });
                
                res.json({ 
                    success: true, 
                    jobId: job.id,
                    recipientCount: recipients.length
                });
            } catch (error) {
                console.error('Broadcast error:', error);
                res.status(500).json({ error: 'Failed to broadcast' });
            }
        });
        
        // Get user preferences
        this.app.get('/preferences/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                
                const user = await this.db.collection('users').findOne(
                    { telegramId: parseInt(userId) },
                    { projection: { notificationPreferences: 1 } }
                );
                
                res.json(user?.notificationPreferences || {
                    push: true,
                    email: true,
                    telegram: true,
                    categories: ['breaking', 'local'],
                    quiet: { start: '22:00', end: '08:00' }
                });
            } catch (error) {
                console.error('Get preferences error:', error);
                res.status(500).json({ error: 'Failed to get preferences' });
            }
        });
        
        // Update preferences
        this.app.put('/preferences/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                const preferences = req.body;
                
                await this.db.collection('users').updateOne(
                    { telegramId: parseInt(userId) },
                    { $set: { notificationPreferences: preferences } }
                );
                
                res.json({ success: true });
            } catch (error) {
                console.error('Update preferences error:', error);
                res.status(500).json({ error: 'Failed to update preferences' });
            }
        });
    }

    processQueues() {
        // Process main notification queue
        this.notificationQueue.process(async (job) => {
            const { type, recipients, data, options } = job.data;
            
            console.log(`Processing notification: ${type}`);
            
            // Route to appropriate notification type
            switch (type) {
                case 'push':
                    await this.pushQueue.add({ recipients, data, options });
                    break;
                case 'email':
                    await this.emailQueue.add({ recipients, data, options });
                    break;
                case 'telegram':
                    await this.telegramQueue.add({ recipients, data, options });
                    break;
                case 'broadcast':
                    // Send to all channels
                    await this.pushQueue.add({ recipients, data, options });
                    await this.emailQueue.add({ recipients, data, options });
                    await this.telegramQueue.add({ recipients, data, options });
                    break;
                default:
                    console.error(`Unknown notification type: ${type}`);
            }
        });
        
        // Process push notifications
        this.pushQueue.process(async (job) => {
            await this.sendPushNotifications(job.data);
        });
        
        // Process email notifications
        this.emailQueue.process(async (job) => {
            await this.sendEmailNotifications(job.data);
        });
        
        // Process Telegram notifications
        this.telegramQueue.process(async (job) => {
            await this.sendTelegramNotifications(job.data);
        });
    }

    async sendPushNotifications({ recipients, data, options }) {
        const subscriptions = await this.db.collection('push_subscriptions')
            .find({ 
                userId: { $in: recipients },
                active: true
            })
            .toArray();
        
        const payload = JSON.stringify({
            title: data.title || 'Zone News Update',
            body: data.body,
            icon: data.icon || '/icon-192x192.png',
            badge: data.badge || '/badge-72x72.png',
            data: {
                url: data.url || '/',
                category: data.category,
                articleId: data.articleId,
                timestamp: new Date()
            }
        });
        
        const promises = subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(sub.subscription, payload);
                console.log(`✅ Push sent to user ${sub.userId}`);
            } catch (error) {
                console.error(`❌ Push failed for user ${sub.userId}:`, error);
                
                // Mark subscription as inactive if it failed
                if (error.statusCode === 410) {
                    await this.db.collection('push_subscriptions').updateOne(
                        { userId: sub.userId },
                        { $set: { active: false } }
                    );
                }
            }
        });
        
        await Promise.all(promises);
    }

    async sendEmailNotifications({ recipients, data, options }) {
        if (!this.emailTransporter) {
            console.log('Email service not configured');
            return;
        }
        
        const users = await this.db.collection('users')
            .find({ 
                telegramId: { $in: recipients },
                email: { $exists: true }
            })
            .toArray();
        
        const promises = users.map(async (user) => {
            try {
                await this.emailTransporter.sendMail({
                    from: process.env.SMTP_FROM || 'Zone News <noreply@thezonenews.com>',
                    to: user.email,
                    subject: data.subject || 'Zone News Update',
                    html: this.generateEmailTemplate(data, user),
                    text: data.body
                });
                
                console.log(`✅ Email sent to ${user.email}`);
            } catch (error) {
                console.error(`❌ Email failed for ${user.email}:`, error);
            }
        });
        
        await Promise.all(promises);
    }

    async sendTelegramNotifications({ recipients, data, options }) {
        if (!this.telegramBot) {
            console.log('Telegram bot not configured');
            return;
        }
        
        const promises = recipients.map(async (userId) => {
            try {
                const message = this.formatTelegramMessage(data);
                
                await this.telegramBot.sendMessage(userId, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: false,
                    reply_markup: data.buttons ? {
                        inline_keyboard: data.buttons
                    } : undefined
                });
                
                console.log(`✅ Telegram sent to ${userId}`);
            } catch (error) {
                console.error(`❌ Telegram failed for ${userId}:`, error);
            }
        });
        
        await Promise.all(promises);
    }

    generateEmailTemplate(data, user) {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .button { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Zone News</h1>
        </div>
        <div class="content">
            <h2>${data.title || 'News Update'}</h2>
            <p>Hi ${user.firstName || 'there'},</p>
            <p>${data.body}</p>
            ${data.url ? `<p><a href="${data.url}" class="button">Read More</a></p>` : ''}
        </div>
        <div class="footer">
            <p>© 2025 Zone News. All rights reserved.</p>
            <p><a href="https://thezonenews.com/unsubscribe">Unsubscribe</a></p>
        </div>
    </div>
</body>
</html>`;
    }

    formatTelegramMessage(data) {
        let message = `<b>${data.title || 'Zone News Update'}</b>\n\n`;
        message += data.body;
        
        if (data.url) {
            message += `\n\n<a href="${data.url}">Read More</a>`;
        }
        
        return message;
    }

    async getRecipients(filters) {
        const query = {};
        
        if (filters.tier) {
            query.tier = filters.tier;
        }
        
        if (filters.category) {
            query['preferences.categories'] = filters.category;
        }
        
        if (filters.active) {
            query.lastActivity = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
        }
        
        const users = await this.db.collection('users')
            .find(query, { projection: { telegramId: 1 } })
            .toArray();
        
        return users.map(u => u.telegramId);
    }

    authenticateInternal(req, res, next) {
        const token = req.headers['x-internal-token'];
        if (token !== process.env.INTERNAL_TOKEN) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    }

    async startServer() {
        this.app.listen(this.port, '0.0.0.0', () => {
            console.log(`✅ Notification service running on port ${this.port}`);
        });
    }
}

// Start the service
const service = new NotificationService();
service.initialize().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down notification service...');
    await service.notificationQueue?.close();
    await service.pushQueue?.close();
    await service.emailQueue?.close();
    await service.telegramQueue?.close();
    process.exit(0);
});