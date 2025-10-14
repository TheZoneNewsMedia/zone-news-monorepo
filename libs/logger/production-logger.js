/**
 * Production Logger Service
 * Replaces console.log with structured logging
 */

const winston = require('winston');
const path = require('path');

class ProductionLogger {
    constructor() {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { 
                service: process.env.SERVICE_NAME || 'zone-news-bot',
                environment: process.env.NODE_ENV || 'development'
            },
            transports: [
                // Error logs
                new winston.transports.File({ 
                    filename: path.join(process.cwd(), 'logs', 'error.log'), 
                    level: 'error',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                }),
                // Combined logs
                new winston.transports.File({ 
                    filename: path.join(process.cwd(), 'logs', 'combined.log'),
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                })
            ]
        });

        // Add console in development
        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }));
        }
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Bot-specific logging methods
    botError(error, ctx = null) {
        const meta = {
            type: 'bot_error',
            updateType: ctx?.updateType,
            userId: ctx?.from?.id,
            chatId: ctx?.chat?.id,
            error: error.message,
            stack: error.stack
        };
        this.error('Bot error occurred', meta);
    }

    userAction(action, userId, meta = {}) {
        this.info('User action', {
            type: 'user_action',
            action,
            userId,
            ...meta
        });
    }

    apiRequest(method, endpoint, userId = null, status = null) {
        this.info('API request', {
            type: 'api_request',
            method,
            endpoint,
            userId,
            status
        });
    }

    paymentEvent(event, userId, amount = null, tier = null) {
        this.info('Payment event', {
            type: 'payment_event',
            event,
            userId,
            amount,
            tier
        });
    }

    securityEvent(event, userId = null, details = {}) {
        this.warn('Security event', {
            type: 'security_event',
            event,
            userId,
            ...details
        });
    }
}

// Create singleton instance
const logger = new ProductionLogger();

module.exports = logger;