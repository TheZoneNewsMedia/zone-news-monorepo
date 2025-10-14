/**
 * WebhookService - Handles webhook operations
 * Single Responsibility: Manage webhook server and updates
 */

const express = require('express');

class WebhookService {
    constructor(bot, port = 3002) {
        this.bot = bot;
        this.port = port;
        this.app = express();
        this.server = null;
        this.updateCount = 0;
    }

    setBot(bot) {
        // Bot is already set in constructor
    }

    async initialize() {
        this.setupRoutes();
        await this.startServer();
        console.log(`  🌐 Webhook service initialized on port ${this.port}`);
    }

    /**
     * Set up Express routes
     */
    setupRoutes() {
        this.app.use(express.json());
        
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            console.log('[WEBHOOK] Health check requested');
            res.json({ 
                status: 'ok',
                service: 'webhook',
                uptime: process.uptime(),
                updates: this.updateCount
            });
        });
        
        // Webhook endpoint
        this.app.post('/webhook', async (req, res) => {
            try {
                console.log('[WEBHOOK] Update received:', {
                    updateId: req.body.update_id,
                    type: this.getUpdateType(req.body),
                    from: req.body.message?.from?.username || 'unknown'
                });
                
                this.updateCount++;
                
                // Process update through bot
                await this.bot.handleUpdate(req.body, res);
                
                // Acknowledge immediately
                if (!res.headersSent) {
                    res.sendStatus(200);
                }
                
                console.log(`[WEBHOOK] ✅ Update ${req.body.update_id} processed`);
            } catch (error) {
                console.error('[WEBHOOK] ❌ Error processing update:', error);
                
                if (!res.headersSent) {
                    res.sendStatus(200); // Always return 200 to prevent Telegram retry
                }
            }
        });
        
        // Webhook info endpoint
        this.app.get('/webhook/info', (req, res) => {
            res.json({
                active: true,
                port: this.port,
                updates: this.updateCount,
                url: process.env.WEBHOOK_URL || 'Not set'
            });
        });
        
        // 404 handler
        this.app.use((req, res) => {
            console.log(`[WEBHOOK] 404 - ${req.method} ${req.path}`);
            res.status(404).json({ error: 'Not found' });
        });
    }

    /**
     * Start Express server
     */
    async startServer() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`[WEBHOOK] 🚀 Server listening on 0.0.0.0:${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop server
     */
    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    console.log('[WEBHOOK] Server stopped');
                    resolve();
                });
            });
        }
    }

    /**
     * Get update type for logging
     */
    getUpdateType(update) {
        if (update.message) return 'message';
        if (update.edited_message) return 'edited_message';
        if (update.channel_post) return 'channel_post';
        if (update.edited_channel_post) return 'edited_channel_post';
        if (update.inline_query) return 'inline_query';
        if (update.chosen_inline_result) return 'chosen_inline_result';
        if (update.callback_query) return 'callback_query';
        if (update.shipping_query) return 'shipping_query';
        if (update.pre_checkout_query) return 'pre_checkout_query';
        if (update.poll) return 'poll';
        if (update.poll_answer) return 'poll_answer';
        if (update.my_chat_member) return 'my_chat_member';
        if (update.chat_member) return 'chat_member';
        if (update.chat_join_request) return 'chat_join_request';
        if (update.message_reaction) return 'message_reaction';
        if (update.message_reaction_count) return 'message_reaction_count';
        return 'unknown';
    }

    /**
     * Set webhook on Telegram
     */
    async setWebhook(url) {
        try {
            const result = await this.bot.telegram.setWebhook(url);
            console.log(`[WEBHOOK] ✅ Webhook set to: ${url}`);
            return result;
        } catch (error) {
            console.error('[WEBHOOK] ❌ Failed to set webhook:', error);
            throw error;
        }
    }

    /**
     * Delete webhook
     */
    async deleteWebhook() {
        try {
            const result = await this.bot.telegram.deleteWebhook();
            console.log('[WEBHOOK] ✅ Webhook deleted');
            return result;
        } catch (error) {
            console.error('[WEBHOOK] ❌ Failed to delete webhook:', error);
            throw error;
        }
    }

    /**
     * Get webhook info
     */
    async getWebhookInfo() {
        try {
            const info = await this.bot.telegram.getWebhookInfo();
            console.log('[WEBHOOK] Webhook info:', info);
            return info;
        } catch (error) {
            console.error('[WEBHOOK] ❌ Failed to get webhook info:', error);
            throw error;
        }
    }
}

module.exports = WebhookService;