/**
 * Winston Logger Service
 * Structured logging with admin access and multiple transports
 */

const winston = require('winston');
const Transport = require('winston-transport');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Custom in-memory transport for admin access
class MemoryTransport extends Transport {
    constructor(opts, loggerService) {
        super(opts);
        this.loggerService = loggerService;
    }
    
    log(info, callback) {
        setImmediate(() => {
            if (this.loggerService) {
                this.loggerService.addToRecentLogs(info);
                this.loggerService.updateErrorStats(info);
            }
        });
        callback();
    }
}

class LoggerService {
    constructor(config = {}) {
        this.logDir = config.logDir || path.join(__dirname, '../../logs');
        this.serviceName = config.serviceName || 'zone-telegram-bot';
        this.environment = process.env.NODE_ENV || 'development';
        
        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        // Log levels
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            http: 3,
            verbose: 4,
            debug: 5,
            silly: 6
        };
        
        // Initialize logger
        this.logger = this.createLogger();
        
        // Store recent logs for admin access
        this.recentLogs = [];
        this.maxRecentLogs = 1000;
        
        // Error statistics
        this.errorStats = {
            total: 0,
            byType: {},
            byHour: {},
            critical: []
        };
    }
    
    createLogger() {
        // Custom format for structured logging
        const logFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            winston.format.errors({ stack: true }),
            winston.format.metadata({
                fillExcept: ['message', 'level', 'timestamp', 'label']
            }),
            winston.format.printf(({ 
                timestamp, 
                level, 
                message, 
                metadata,
                ...meta 
            }) => {
                let log = {
                    timestamp,
                    level,
                    service: this.serviceName,
                    message
                };
                
                // Add metadata if present
                if (metadata && Object.keys(metadata).length > 0) {
                    log = { ...log, ...metadata };
                }
                
                // Add any additional meta fields
                if (meta && Object.keys(meta).length > 0) {
                    log = { ...log, ...meta };
                }
                
                return JSON.stringify(log);
            })
        );
        
        // Console format for development
        const consoleFormat = winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({
                format: 'HH:mm:ss'
            }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaStr = Object.keys(meta).length ? 
                    '\n' + JSON.stringify(meta, null, 2) : '';
                return `[${timestamp}] ${level}: ${message}${metaStr}`;
            })
        );
        
        // Create transports
        const transports = [];
        
        // Console transport (development)
        if (this.environment === 'development') {
            transports.push(
                new winston.transports.Console({
                    format: consoleFormat,
                    level: 'debug'
                })
            );
        }
        
        // File transport for all logs (daily rotation)
        transports.push(
            new DailyRotateFile({
                filename: path.join(this.logDir, '%DATE%-combined.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: logFormat,
                level: 'info'
            })
        );
        
        // File transport for errors only
        transports.push(
            new DailyRotateFile({
                filename: path.join(this.logDir, '%DATE%-error.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '30d',
                format: logFormat,
                level: 'error'
            })
        );
        
        // Custom transport for admin access (in-memory storage)
        transports.push(new MemoryTransport({ level: 'silly' }, this));
        
        // Create logger instance
        return winston.createLogger({
            levels: this.levels,
            format: logFormat,
            transports,
            exitOnError: false
        });
    }
    
    /**
     * Add log to recent logs buffer
     */
    addToRecentLogs(log) {
        this.recentLogs.push(log);
        if (this.recentLogs.length > this.maxRecentLogs) {
            this.recentLogs.shift();
        }
    }
    
    /**
     * Update error statistics
     */
    updateErrorStats(log) {
        if (log.level === 'error') {
            this.errorStats.total++;
            
            // Track by error type
            const errorType = log.errorType || 'unknown';
            this.errorStats.byType[errorType] = (this.errorStats.byType[errorType] || 0) + 1;
            
            // Track by hour
            const hour = new Date(log.timestamp).getHours();
            this.errorStats.byHour[hour] = (this.errorStats.byHour[hour] || 0) + 1;
            
            // Store critical errors
            if (log.critical) {
                this.errorStats.critical.push({
                    timestamp: log.timestamp,
                    message: log.message,
                    stack: log.stack
                });
                
                // Keep only last 100 critical errors
                if (this.errorStats.critical.length > 100) {
                    this.errorStats.critical.shift();
                }
            }
        }
    }
    
    /**
     * Main logging methods
     */
    error(message, meta = {}) {
        this.logger.error(message, this.addContext(meta));
    }
    
    warn(message, meta = {}) {
        this.logger.warn(message, this.addContext(meta));
    }
    
    info(message, meta = {}) {
        this.logger.info(message, this.addContext(meta));
    }
    
    http(message, meta = {}) {
        this.logger.http(message, this.addContext(meta));
    }
    
    verbose(message, meta = {}) {
        this.logger.verbose(message, this.addContext(meta));
    }
    
    debug(message, meta = {}) {
        this.logger.debug(message, this.addContext(meta));
    }
    
    /**
     * Add context to log metadata
     */
    addContext(meta) {
        return {
            ...meta,
            environment: this.environment,
            service: this.serviceName,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Log API request/response
     */
    logRequest(req, res, duration) {
        const log = {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };
        
        if (res.statusCode >= 400) {
            this.warn('API Request Failed', log);
        } else {
            this.http('API Request', log);
        }
    }
    
    /**
     * Log database query
     */
    logQuery(collection, operation, duration, success = true) {
        const log = {
            collection,
            operation,
            duration: `${duration}ms`,
            success
        };
        
        if (!success || duration > 1000) {
            this.warn('Slow/Failed Query', log);
        } else {
            this.debug('Database Query', log);
        }
    }
    
    /**
     * Log bot command
     */
    logCommand(userId, username, command, success = true, error = null) {
        const log = {
            userId,
            username,
            command,
            success
        };
        
        if (error) {
            log.error = error.message;
            log.stack = error.stack;
        }
        
        if (success) {
            this.info('Bot Command', log);
        } else {
            this.error('Bot Command Failed', log);
        }
    }
    
    /**
     * Admin access methods
     */
    
    /**
     * Get recent logs for admin
     */
    getRecentLogs(options = {}) {
        const {
            level = null,
            limit = 100,
            startTime = null,
            endTime = null,
            search = null
        } = options;
        
        let logs = [...this.recentLogs];
        
        // Filter by level
        if (level) {
            logs = logs.filter(log => log.level === level);
        }
        
        // Filter by time range
        if (startTime) {
            const start = new Date(startTime).getTime();
            logs = logs.filter(log => 
                new Date(log.timestamp).getTime() >= start
            );
        }
        
        if (endTime) {
            const end = new Date(endTime).getTime();
            logs = logs.filter(log => 
                new Date(log.timestamp).getTime() <= end
            );
        }
        
        // Search in messages
        if (search) {
            const searchLower = search.toLowerCase();
            logs = logs.filter(log => 
                log.message.toLowerCase().includes(searchLower) ||
                JSON.stringify(log).toLowerCase().includes(searchLower)
            );
        }
        
        // Sort by timestamp (newest first)
        logs.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        // Apply limit
        return logs.slice(0, limit);
    }
    
    /**
     * Get error statistics
     */
    getErrorStats() {
        return {
            ...this.errorStats,
            errorRate: this.calculateErrorRate(),
            topErrors: this.getTopErrors()
        };
    }
    
    /**
     * Calculate error rate (errors per hour)
     */
    calculateErrorRate() {
        const now = new Date();
        const hourAgo = new Date(now - 3600000);
        
        const recentErrors = this.recentLogs.filter(log => 
            log.level === 'error' && 
            new Date(log.timestamp) > hourAgo
        );
        
        return recentErrors.length;
    }
    
    /**
     * Get top error types
     */
    getTopErrors() {
        return Object.entries(this.errorStats.byType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type, count]) => ({ type, count }));
    }
    
    /**
     * Clear logs (admin only)
     */
    clearLogs() {
        this.recentLogs = [];
        this.errorStats = {
            total: 0,
            byType: {},
            byHour: {},
            critical: []
        };
        this.info('Logs cleared by admin');
    }
    
    /**
     * Export logs to file (admin only)
     */
    async exportLogs(options = {}) {
        const logs = this.getRecentLogs(options);
        const filename = `export-${Date.now()}.json`;
        const filepath = path.join(this.logDir, filename);
        
        try {
            await fs.promises.writeFile(
                filepath, 
                JSON.stringify(logs, null, 2)
            );
            
            this.info('Logs exported', { filename, count: logs.length });
            return filepath;
        } catch (error) {
            this.error('Failed to export logs', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Get log files list
     */
    async getLogFiles() {
        try {
            const files = await fs.promises.readdir(this.logDir);
            const fileStats = await Promise.all(
                files.map(async (file) => {
                    const filepath = path.join(this.logDir, file);
                    const stats = await fs.promises.stat(filepath);
                    return {
                        name: file,
                        size: stats.size,
                        modified: stats.mtime,
                        path: filepath
                    };
                })
            );
            
            return fileStats.sort((a, b) => b.modified - a.modified);
        } catch (error) {
            this.error('Failed to get log files', { error: error.message });
            return [];
        }
    }
    
    /**
     * Stream logs in real-time (for admin dashboard)
     */
    streamLogs(callback) {
        // Create custom transport for streaming
        class StreamTransport extends Transport {
            log(info, done) {
                try {
                    callback(info);
                } catch (e) {
                    // Ignore errors
                }
                done();
            }
        }
        
        const streamTransport = new StreamTransport({ level: 'silly' });
        this.logger.add(streamTransport);
        
        // Return unsubscribe function
        return () => {
            this.logger.remove(streamTransport);
        };
    }
    
    /**
     * Performance logging
     */
    startTimer(label) {
        return {
            label,
            startTime: Date.now()
        };
    }
    
    endTimer(timer, meta = {}) {
        const duration = Date.now() - timer.startTime;
        this.debug(`${timer.label} completed`, {
            ...meta,
            duration: `${duration}ms`
        });
        return duration;
    }
}

// Export singleton instance
const logger = new LoggerService();

module.exports = {
    LoggerService,
    logger
};