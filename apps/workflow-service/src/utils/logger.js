/**
 * Enhanced Logger with Circuit Breaker Monitoring
 */

const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logDir = process.env.LOG_DIR || './logs';
        this.serviceName = 'workflow-service';
        
        // Ensure log directory exists
        this.ensureLogDirectory();
        
        // Log levels
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            service: this.serviceName,
            message,
            ...meta,
            pid: process.pid,
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };

        return JSON.stringify(logEntry);
    }

    writeToFile(level, formattedMessage) {
        const filename = `${this.serviceName}-${new Date().toISOString().split('T')[0]}.log`;
        const filepath = path.join(this.logDir, filename);
        
        try {
            fs.appendFileSync(filepath, formattedMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    writeToConsole(level, message, meta) {
        const colors = {
            error: '\x1b[31m',
            warn: '\x1b[33m',
            info: '\x1b[36m',
            debug: '\x1b[90m'
        };
        
        const reset = '\x1b[0m';
        const color = colors[level] || '';
        
        console.log(`${color}[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}${reset}`);
        
        if (meta && Object.keys(meta).length > 0) {
            console.log(`${color}Meta:${reset}`, meta);
        }
    }

    log(level, message, meta = {}) {
        if (!this.shouldLog(level)) return;

        const formattedMessage = this.formatMessage(level, message, meta);
        
        // Always write to console
        this.writeToConsole(level, message, meta);
        
        // Write to file in production
        if (process.env.NODE_ENV === 'production') {
            this.writeToFile(level, formattedMessage);
        }
    }

    error(message, meta = {}) {
        this.log('error', message, meta);
        
        // Send critical errors to monitoring service if configured
        if (process.env.ERROR_WEBHOOK_URL && meta.critical) {
            this.sendToMonitoring('error', message, meta);
        }
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    // Circuit breaker specific logging
    circuitBreakerStateChange(breakerName, oldState, newState, meta = {}) {
        this.warn(`Circuit breaker ${breakerName} state changed: ${oldState} -> ${newState}`, {
            circuitBreaker: breakerName,
            oldState,
            newState,
            ...meta
        });
    }

    circuitBreakerTripped(breakerName, error, meta = {}) {
        this.error(`Circuit breaker ${breakerName} tripped`, {
            circuitBreaker: breakerName,
            error: error.message,
            stack: error.stack,
            critical: true,
            ...meta
        });
    }

    // Performance monitoring
    performanceMetric(metric, value, unit = 'ms', meta = {}) {
        this.info(`Performance: ${metric} = ${value}${unit}`, {
            metric,
            value,
            unit,
            ...meta
        });
    }

    // Health check logging
    healthCheck(status, checks = {}) {
        const level = status === 'healthy' ? 'info' : 'warn';
        this.log(level, `Health check: ${status}`, {
            healthStatus: status,
            checks
        });
    }

    // Send to external monitoring service
    async sendToMonitoring(level, message, meta) {
        if (!process.env.ERROR_WEBHOOK_URL) return;

        try {
            const axios = require('axios');
            await axios.post(process.env.ERROR_WEBHOOK_URL, {
                service: this.serviceName,
                level,
                message,
                meta,
                timestamp: new Date().toISOString()
            }, {
                timeout: 5000
            });
        } catch (error) {
            console.error('Failed to send to monitoring service:', error.message);
        }
    }

    // Graceful shutdown logging
    shutdown(reason) {
        this.info(`Service shutting down: ${reason}`, {
            shutdown: true,
            reason,
            uptime: process.uptime()
        });
    }
}

const logger = new Logger();

// Process event handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack,
        critical: true
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: promise.toString(),
        critical: true
    });
});

module.exports = { logger };