/**
 * Secure Webhook Service - Production Security Enhanced
 * Comprehensive security implementation for Telegram webhooks
 */

const express = require('express');
const { 
    setupProductionSecurity, 
    createSecureServer, 
    addSecurityHealthCheck,
    createTelegramCommandRateLimit,
    TelegramSecurity
} = require('@zone/shared');

class SecureWebhookService {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.app = null;
        this.server = null;
        this.commandRateLimit = createTelegramCommandRateLimit();
    }

    async start() {
        try {
            // Validate configuration
            if (!this.config.webhookUrl || !this.config.botToken) {
                throw new Error('Missing required webhook configuration');
            }

            // Validate bot token
            if (!TelegramSecurity.validateBotToken(this.config.botToken)) {
                throw new Error('Invalid bot token format');
            }

            // Clear existing webhook first
            await this.clearExistingWebhook();

            // Create Express app with security
            this.app = express();

            // Security configuration
            const securityOptions = {
                service: 'zone-news-bot-webhook',
                enableTelegramWebhook: true,
                botToken: this.config.botToken,
                apiKeys: this.config.apiKeys || [],
                customCorsOrigins: [
                    'https://api.telegram.org',
                    'https://core.telegram.org',
                    ...(this.config.corsOrigins || [])
                ],
                enableRateLimit: true,
                enableSpeedLimit: true,
                enableInputValidation: true,
                enableHelmet: true,
                enableCors: true,
                enableLogging: true,
                enableErrorHandler: true,
                maxBodySize: 2 * 1024 * 1024 // 2MB for Telegram webhooks
            };

            // Setup production security
            setupProductionSecurity(this.app, securityOptions);

            // Add security health check
            addSecurityHealthCheck(this.app);

            // Setup secure webhook endpoint
            this.setupWebhookEndpoint();

            // Setup Telegram webhook with retry logic
            await this.setupTelegramWebhook();

            // Start secure server
            this.server = createSecureServer(this.app, {
                port: this.config.webhookPort,
                httpsPort: this.config.httpsPort || 8443,
                host: '0.0.0.0'
            });

            console.log('✅ Secure webhook service started');
            console.log(`🌐 Webhook URL: ${this.config.webhookUrl}${this.config.webhookPath}`);
            console.log(`🛡️ Security: ENABLED`);

        } catch (error) {
            console.error('❌ Secure webhook setup failed:', error);
            throw error;
        }
    }

    async clearExistingWebhook() {
        try {
            await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
            console.log('🧹 Cleared existing webhook/updates');
            
            // Wait to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error('⚠️ Error clearing webhook:', error);
        }
    }

    async setupTelegramWebhook() {
        const fullWebhookUrl = `${this.config.webhookUrl}${this.config.webhookPath}`;
        
        // Validate webhook URL
        if (!TelegramSecurity.validateWebhookUrl(fullWebhookUrl)) {
            throw new Error('Invalid webhook URL format');
        }

        let webhookSet = false;
        let retries = 3;

        while (!webhookSet && retries > 0) {
            try {
                // Set webhook with secret token
                const webhookOptions = {
                    url: fullWebhookUrl,
                    max_connections: 40,
                    allowed_updates: [
                        'message',
                        'edited_message', 
                        'callback_query',
                        'inline_query',
                        'chosen_inline_result'
                    ]
                };

                // Add secret token if configured
                if (this.config.webhookSecret) {
                    webhookOptions.secret_token = this.config.webhookSecret;
                }

                await this.bot.telegram.setWebhook(webhookOptions);
                webhookSet = true;
                console.log('✅ Telegram webhook configured with security');

                // Log security configuration
                TelegramSecurity.logSecurityEvent('webhook_configured', {
                    url: fullWebhookUrl,
                    hasSecret: !!this.config.webhookSecret,
                    allowedUpdates: webhookOptions.allowed_updates
                });

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

        if (!webhookSet) {
            throw new Error('Failed to set webhook after retries');
        }
    }

    setupWebhookEndpoint() {
        // Enable webhook reply mode for Telegraf
        this.bot.webhookReply = true;

        // Main webhook endpoint with comprehensive security
        this.app.post(this.config.webhookPath, [
            // Command rate limiting for bot operations
            this.commandRateLimit,
            
            // Custom validation middleware
            (req, res, next) => {
                try {
                    // Additional IP validation for Telegram
                    const clientIP = req.ip || req.connection.remoteAddress;
                    const isValidTelegramIP = TelegramSecurity.validateTelegramIP(clientIP);
                    
                    if (!isValidTelegramIP && process.env.NODE_ENV === 'production') {
                        console.warn('❌ Invalid IP for Telegram webhook:', clientIP);
                        TelegramSecurity.logSecurityEvent('invalid_webhook_ip', {
                            clientIP,
                            userAgent: req.get('User-Agent')
                        });
                        return res.status(403).json({
                            error: 'Forbidden - Invalid source IP',
                            code: 'INVALID_SOURCE_IP'
                        });
                    }

                    // Validate webhook secret if configured
                    if (this.config.webhookSecret) {
                        const providedSecret = req.headers['x-telegram-bot-api-secret-token'];
                        if (providedSecret !== this.config.webhookSecret) {
                            console.warn('❌ Invalid webhook secret token');
                            TelegramSecurity.logSecurityEvent('invalid_webhook_secret', {
                                clientIP,
                                hasSecret: !!providedSecret
                            });
                            return res.status(403).json({
                                error: 'Invalid webhook secret',
                                code: 'INVALID_WEBHOOK_SECRET'
                            });
                        }
                    }

                    // Sanitize user input if message is present
                    if (req.body.message?.text) {
                        req.body.message.text = TelegramSecurity.sanitizeUserInput(
                            req.body.message.text,
                            { 
                                maxLength: 4096, 
                                allowMarkdown: true,
                                stripUrls: false 
                            }
                        );
                    }

                    // Rate limit check results
                    if (req.commandRateLimit && !req.commandRateLimit.allowed) {
                        console.warn('🚫 Command rate limit exceeded');
                        return res.status(429).json({
                            error: 'Command rate limit exceeded',
                            code: 'COMMAND_RATE_LIMIT'
                        });
                    }

                    next();
                } catch (error) {
                    console.error('❌ Webhook validation error:', error);
                    res.status(500).json({
                        error: 'Webhook validation failed',
                        code: 'WEBHOOK_VALIDATION_ERROR'
                    });
                }
            }
        ], async (req, res) => {
            try {
                // Log successful webhook with security context
                console.log(`📨 Secure webhook received: update_id=${req.body.update_id}`);
                
                TelegramSecurity.logSecurityEvent('webhook_processed', {
                    updateId: req.body.update_id,
                    updateType: this.getUpdateType(req.body),
                    clientIP: req.ip,
                    userAgent: req.get('User-Agent'),
                    hasSecret: !!req.headers['x-telegram-bot-api-secret-token'],
                    commandRateLimit: req.commandRateLimit
                });

                // Process update with error handling
                const result = await Promise.race([
                    this.bot.handleUpdate(req.body, res),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Webhook processing timeout')), 15000)
                    )
                ]);

                // If handleUpdate didn't send response, send success
                if (!res.headersSent) {
                    res.status(200).json({ 
                        status: 'ok', 
                        update_id: req.body.update_id,
                        processed_at: new Date().toISOString()
                    });
                }

            } catch (error) {
                console.error('❌ Webhook processing error:', {
                    updateId: req.body.update_id,
                    error: error.message,
                    stack: error.stack
                });

                TelegramSecurity.logSecurityEvent('webhook_error', {
                    updateId: req.body.update_id,
                    error: error.message,
                    clientIP: req.ip
                });

                if (!res.headersSent) {
                    res.status(200).json({ 
                        status: 'error', 
                        message: 'Processing failed' 
                    });
                }
            }
        });

        // Bot status endpoint with authentication
        this.app.get('/bot/status', (req, res) => {
            res.json({
                status: 'running',
                service: 'zone-news-bot',
                webhook: 'enabled',
                security: 'active',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // Bot configuration endpoint (admin only)
        this.app.get('/bot/config', this.requireApiKey.bind(this), (req, res) => {
            res.json({
                webhookUrl: this.config.webhookUrl + this.config.webhookPath,
                hasSecret: !!this.config.webhookSecret,
                rateLimit: 'enabled',
                securityHeaders: 'enabled',
                allowedUpdates: [
                    'message', 'edited_message', 'callback_query',
                    'inline_query', 'chosen_inline_result'
                ]
            });
        });
    }

    getUpdateType(update) {
        const types = [
            'message', 'edited_message', 'channel_post', 'edited_channel_post',
            'inline_query', 'chosen_inline_result', 'callback_query',
            'shipping_query', 'pre_checkout_query', 'poll', 'poll_answer'
        ];
        
        return types.find(type => update[type]) || 'unknown';
    }

    requireApiKey(req, res, next) {
        const apiKey = req.headers['x-api-key'];
        const validKeys = this.config.apiKeys || [];

        if (!apiKey || !validKeys.includes(apiKey)) {
            return res.status(401).json({
                error: 'API key required',
                code: 'UNAUTHORIZED'
            });
        }

        next();
    }

    async stop() {
        try {
            console.log('👋 Stopping secure webhook service...');
            
            // Remove webhook
            await this.bot.telegram.deleteWebhook();
            console.log('✅ Webhook removed from Telegram');

            // Close server
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                console.log('✅ Server closed');
            }

            console.log('👋 Secure webhook service stopped');
        } catch (error) {
            console.error('❌ Error stopping webhook service:', error);
        }
    }

    async getWebhookInfo() {
        try {
            const info = await this.bot.telegram.getWebhookInfo();
            return {
                url: info.url,
                hasCustomCertificate: info.has_custom_certificate,
                pendingUpdateCount: info.pending_update_count,
                lastErrorDate: info.last_error_date,
                lastErrorMessage: info.last_error_message,
                maxConnections: info.max_connections,
                allowedUpdates: info.allowed_updates
            };
        } catch (error) {
            console.error('❌ Error getting webhook info:', error);
            throw error;
        }
    }
}

module.exports = SecureWebhookService;