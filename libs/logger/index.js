const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

// Log levels with priorities
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

class Logger {
    constructor(service) {
        this.service = service;
        this.logLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;
        this.logToFile = process.env.NODE_ENV === 'production';
        this.logDir = path.join(process.cwd(), 'logs');
        
        // Create logs directory if needed
        if (this.logToFile && !fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    format(level, message, data) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.service}] [${level}]`;
        return data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
    }

    writeToFile(level, formattedMessage) {
        if (!this.logToFile) return;
        
        const filename = level === 'ERROR' ? 'error.log' : 'combined.log';
        const filepath = path.join(this.logDir, filename);
        
        fs.appendFile(filepath, formattedMessage + '\n', (err) => {
            if (err) {
                // Fallback to console if file write fails
                console.error('Failed to write to log file:', err);
            }
        });
    }

    shouldLog(level) {
        return LOG_LEVELS[level] <= this.logLevel;
    }

    info(message, data) {
        if (!this.shouldLog('INFO')) return;
        
        const formatted = this.format('INFO', message, data);
        
        if (process.env.NODE_ENV === 'production') {
            this.writeToFile('INFO', formatted);
        } else {
            console.log(colors.cyan + formatted + colors.reset);
        }
    }

    error(message, error) {
        if (!this.shouldLog('ERROR')) return;
        
        const errorData = error instanceof Error ? { message: error.message, stack: error.stack } : error;
        const formatted = this.format('ERROR', message, errorData);
        
        if (process.env.NODE_ENV === 'production') {
            this.writeToFile('ERROR', formatted);
            // Also log to console in production for errors
            console.error(colors.red + formatted + colors.reset);
        } else {
            console.error(colors.red + formatted + colors.reset);
        }
    }

    warn(message, data) {
        if (!this.shouldLog('WARN')) return;
        
        const formatted = this.format('WARN', message, data);
        
        if (process.env.NODE_ENV === 'production') {
            this.writeToFile('WARN', formatted);
            // Also log warnings to console in production
            console.log(colors.yellow + formatted + colors.reset);
        } else {
            console.log(colors.yellow + formatted + colors.reset);
        }
    }

    debug(message, data) {
        if (!this.shouldLog('DEBUG')) return;
        
        const formatted = this.format('DEBUG', message, data);
        
        if (process.env.NODE_ENV === 'production') {
            // Don't log debug messages in production unless explicitly enabled
            if (process.env.DEBUG === 'true') {
                this.writeToFile('DEBUG', formatted);
            }
        } else {
            console.log(colors.gray + formatted + colors.reset);
        }
    }

    success(message, data) {
        // Treat success as info level
        if (!this.shouldLog('INFO')) return;
        
        const formatted = this.format('SUCCESS', message, data);
        
        if (process.env.NODE_ENV === 'production') {
            this.writeToFile('INFO', formatted);
        } else {
            console.log(colors.green + formatted + colors.reset);
        }
    }

    // Convenience method to replace console.log
    log(message, data) {
        this.info(message, data);
    }
}

module.exports = { Logger };
