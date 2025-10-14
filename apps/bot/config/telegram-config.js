/**
 * Centralized Telegram Configuration
 * All configuration comes from environment variables only
 * No hardcoded values allowed
 */

class TelegramConfig {
    constructor() {
        this.validateEnvironment();
    }

    /**
     * Validate required environment variables
     */
    validateEnvironment() {
        const required = [
            'TELEGRAM_BOT_TOKEN',
            'WEBHOOK_URL',
            'BOT_PORT'
        ];

        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(
                `Missing required environment variables: ${missing.join(', ')}\n` +
                'Please set these in your .env file or environment'
            );
        }
    }

    /**
     * Get bot configuration
     */
    get bot() {
        return {
            token: process.env.TELEGRAM_BOT_TOKEN,
            username: process.env.BOT_USERNAME || 'ZoneNewsBot',
            environment: process.env.NODE_ENV || 'development'
        };
    }

    /**
     * Get webhook configuration
     */
    get webhook() {
        return {
            url: process.env.WEBHOOK_URL,
            path: `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`,
            port: parseInt(process.env.BOT_PORT || '8000', 10),
            maxConnections: parseInt(process.env.MAX_CONNECTIONS || '40', 10),
            allowedUpdates: process.env.ALLOWED_UPDATES 
                ? process.env.ALLOWED_UPDATES.split(',') 
                : ['message', 'callback_query', 'inline_query']
        };
    }

    /**
     * Get server configuration
     */
    get server() {
        return {
            host: process.env.SERVER_HOST || '0.0.0.0',
            port: parseInt(process.env.BOT_PORT || '8000', 10),
            baseUrl: process.env.BASE_URL || `http://67.219.107.230`,
            healthCheckPath: process.env.HEALTH_CHECK_PATH || '/health'
        };
    }

    /**
     * Get database configuration
     */
    get database() {
        return {
            uri: process.env.MONGO_URI || process.env.MONGODB_URI,
            name: process.env.DB_NAME || 'zone-news',
            options: {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                maxPoolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10)
            }
        };
    }

    /**
     * Get Redis configuration
     */
    get redis() {
        return {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0', 10),
            keyPrefix: process.env.REDIS_PREFIX || 'telegram:',
            enabled: process.env.REDIS_ENABLED === 'true'
        };
    }

    /**
     * Get API configuration
     */
    get api() {
        return {
            baseUrl: process.env.API_BASE_URL || 'http://localhost:3001',
            timeout: parseInt(process.env.API_TIMEOUT || '10000', 10),
            retries: parseInt(process.env.API_RETRIES || '3', 10)
        };
    }

    /**
     * Get channel configuration
     */
    get channels() {
        return {
            main: process.env.MAIN_CHANNEL_ID || '@ZoneNewsAU',
            tbc: process.env.TBC_CHANNEL_ID || '@TheBedroomCoder',
            test: process.env.TEST_CHANNEL_ID
        };
    }

    /**
     * Get feature flags
     */
    get features() {
        return {
            useWebhook: process.env.USE_WEBHOOK !== 'false',
            enableRedis: process.env.REDIS_ENABLED === 'true',
            enableMetrics: process.env.ENABLE_METRICS === 'true',
            enableLogging: process.env.ENABLE_LOGGING !== 'false',
            debug: process.env.DEBUG === 'true'
        };
    }

    /**
     * Get timeout configuration
     */
    get timeouts() {
        return {
            webhook: parseInt(process.env.WEBHOOK_TIMEOUT || '10000', 10),
            longPolling: parseInt(process.env.LONG_POLLING_TIMEOUT || '30', 10),
            request: parseInt(process.env.REQUEST_TIMEOUT || '10000', 10)
        };
    }

    /**
     * Get rate limiting configuration
     */
    get rateLimits() {
        return {
            messagesPerSecond: parseInt(process.env.RATE_LIMIT_MESSAGES || '30', 10),
            messagesPerMinute: parseInt(process.env.RATE_LIMIT_MESSAGES_MINUTE || '20', 10),
            globalLimit: parseInt(process.env.RATE_LIMIT_GLOBAL || '1000', 10)
        };
    }

    /**
     * Check if in production mode
     */
    get isProduction() {
        return process.env.NODE_ENV === 'production';
    }

    /**
     * Check if in development mode
     */
    get isDevelopment() {
        return process.env.NODE_ENV !== 'production';
    }

    /**
     * Get all configuration as object
     */
    toObject() {
        return {
            bot: this.bot,
            webhook: this.webhook,
            server: this.server,
            database: this.database,
            redis: this.redis,
            api: this.api,
            channels: this.channels,
            features: this.features,
            timeouts: this.timeouts,
            rateLimits: this.rateLimits,
            isProduction: this.isProduction,
            isDevelopment: this.isDevelopment
        };
    }

    /**
     * Log configuration (with sensitive data masked)
     */
    logConfig() {
        const config = this.toObject();
        
        // Mask sensitive values
        if (config.bot.token) {
            config.bot.token = config.bot.token.substring(0, 10) + '...MASKED';
        }
        if (config.database.uri) {
            config.database.uri = 'mongodb://...MASKED';
        }
        if (config.redis.password) {
            config.redis.password = '...MASKED';
        }
        
        console.log('Telegram Configuration:', JSON.stringify(config, null, 2));
    }
}

// Export singleton instance
module.exports = new TelegramConfig();
