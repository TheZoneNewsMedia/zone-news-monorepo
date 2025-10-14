/**
 * Zone News Bot - Shared Security Library
 * Production-grade security utilities for all services
 */

const SecurityMiddleware = require('./security-middleware');
const TelegramSecurity = require('./telegram-security');
const SSLConfig = require('./ssl-config');

/**
 * Complete security setup for Express applications
 */
function setupProductionSecurity(app, options = {}) {
    const {
        service = 'unknown',
        enableTelegramWebhook = false,
        botToken = null,
        customCorsOrigins = [],
        apiKeys = [],
        ...securityOptions
    } = options;

    console.log(`🛡️ Setting up production security for ${service}`);

    // 1. SSL Configuration and body parsing
    SSLConfig.configureBodyParsing(app);

    // 2. Security headers and basic middleware
    SecurityMiddleware.setupSecurity(app, {
        ...securityOptions,
        customCorsOrigins
    });

    // 3. Telegram-specific security for webhook services
    if (enableTelegramWebhook && botToken) {
        // Validate bot token format
        if (!TelegramSecurity.validateBotToken(botToken)) {
            console.error('❌ Invalid bot token format');
            throw new Error('Invalid bot token format');
        }

        // Enhanced webhook endpoint with Telegram validation
        app.post('/webhook*', [
            SecurityMiddleware.validateInput({ maxBodySize: 2 * 1024 * 1024 }), // 2MB for webhooks
            SecurityMiddleware.validateTelegramWebhook(botToken),
            (req, res, next) => {
                // Additional Telegram-specific validation
                const validation = TelegramSecurity.validateUpdateStructure(req.body);
                if (!validation.valid) {
                    console.warn('❌ Invalid Telegram update structure:', validation.error);
                    return res.status(400).json({
                        error: 'Invalid update structure',
                        code: 'INVALID_TELEGRAM_UPDATE'
                    });
                }

                // Log security event
                TelegramSecurity.logSecurityEvent('webhook_received', {
                    updateId: req.body.update_id,
                    updateType: Object.keys(req.body).find(key => key !== 'update_id'),
                    clientIP: req.ip,
                    hasSecret: !!req.headers['x-telegram-bot-api-secret-token']
                });

                next();
            }
        ]);

        console.log('✅ Telegram webhook security configured');
    }

    // 4. API key protection for admin endpoints
    if (apiKeys.length > 0) {
        app.use('/admin*', SecurityMiddleware.validateApiKey(apiKeys));
        app.use('/api/admin*', SecurityMiddleware.validateApiKey(apiKeys));
        console.log('✅ API key protection configured for admin endpoints');
    }

    // 5. Environment-specific configuration
    const envConfig = SSLConfig.getEnvironmentConfig();
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⚙️ Config:`, envConfig);

    return {
        SecurityMiddleware,
        TelegramSecurity,
        SSLConfig,
        envConfig
    };
}

/**
 * Create secure server with SSL support
 */
function createSecureServer(app, options = {}) {
    const envConfig = SSLConfig.getEnvironmentConfig();
    const mergedOptions = { ...envConfig, ...options };
    
    const server = SSLConfig.createSecureServer(app, mergedOptions);
    SSLConfig.configureTimeouts(server, mergedOptions);
    
    return server;
}

/**
 * Security health check endpoint
 */
function addSecurityHealthCheck(app) {
    app.get('/security-health', (req, res) => {
        const sslValidation = SSLConfig.validateSSLCertificate();
        const envConfig = SSLConfig.getEnvironmentConfig();
        
        res.json({
            service: 'zone-news-security',
            status: 'operational',
            timestamp: new Date().toISOString(),
            security: {
                ssl: {
                    enabled: envConfig.enableSSL,
                    valid: sslValidation.valid,
                    error: sslValidation.error || null
                },
                environment: process.env.NODE_ENV || 'development',
                rateLimit: 'enabled',
                cors: 'enabled',
                inputValidation: 'enabled',
                securityHeaders: 'enabled'
            }
        });
    });
}

/**
 * Express middleware for command rate limiting (for bot commands)
 */
function createTelegramCommandRateLimit() {
    const rateLimiter = TelegramSecurity.createCommandRateLimit();
    
    return (req, res, next) => {
        // Extract user ID and command from Telegram update
        const update = req.body;
        let userId = null;
        let command = null;

        if (update.message) {
            userId = update.message.from?.id;
            command = update.message.text?.split(' ')[0];
        } else if (update.callback_query) {
            userId = update.callback_query.from?.id;
            command = update.callback_query.data?.split(':')[0];
        }

        if (userId && command) {
            const result = rateLimiter(userId, command);
            if (!result.allowed) {
                console.warn(`🚫 Command rate limit exceeded for user ${userId}, command ${command}`);
                return res.status(429).json({
                    error: 'Command rate limit exceeded',
                    code: 'COMMAND_RATE_LIMIT',
                    resetTime: result.resetTime
                });
            }

            // Add remaining count to request for logging
            req.commandRateLimit = result;
        }

        next();
    };
}

module.exports = {
    setupProductionSecurity,
    createSecureServer,
    addSecurityHealthCheck,
    createTelegramCommandRateLimit,
    SecurityMiddleware,
    TelegramSecurity,
    SSLConfig
};