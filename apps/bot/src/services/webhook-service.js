/**
 * Webhook Service
 */

const express = require('express');

class WebhookService {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
    }
    
    async start() {
        try {
            // Clear existing webhook
            await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
            console.log('🧹 Cleared existing webhook/updates');
            
            // Wait a bit to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Set new webhook
            const fullWebhookUrl = `${this.config.webhookUrl}${this.config.webhookPath}`;
            
            // Set webhook URL with Telegram (with retry for rate limit)
            let webhookSet = false;
            let retries = 3;
            
            while (!webhookSet && retries > 0) {
                try {
                    await this.bot.telegram.setWebhook(fullWebhookUrl);
                    webhookSet = true;
                    console.log('✅ Webhook URL set with Telegram');
                } catch (error) {
                    if (error.response?.error_code === 429) {
                        const retryAfter = error.response.parameters?.retry_after || 2;
                        console.log(`⏱️ Rate limited, waiting ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                        retries--;
                    } else {
                        throw error;
                    }
                }
            }
            
            // IMPORTANT: Enable webhook reply mode
            // This tells Telegraf to send responses in the HTTP response body
            this.bot.webhookReply = true;
            
            // Create Express app for webhook
            const app = express();
            app.use(express.json());
            
            // Set up webhook endpoint with async handler
            app.post(this.config.webhookPath, async (req, res) => {
                try {
                    // Process update and get response
                    await this.bot.handleUpdate(req.body, res);
                } catch (error) {
                    console.error('Error handling update:', error);
                    res.status(200).send('OK');
                }
            });
            
            // Health check endpoint
            app.get('/health', (req, res) => {
                res.json({ status: 'ok', service: 'zone-bot' });
            });
            
            // Start Express server
            app.listen(this.config.webhookPort, () => {
                console.log(`🌐 Webhook active: ${fullWebhookUrl}`);
                console.log(`📡 Listening on port: ${this.config.webhookPort}`);
                console.log(`✅ Express server with webhookReply mode enabled`);
                console.log(`📨 Bot will send responses in webhook HTTP body`);
            });
            
        } catch (error) {
            console.error('Webhook setup failed:', error);
            throw error;
        }
    }
}

module.exports = WebhookService;