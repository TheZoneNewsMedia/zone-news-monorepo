/**
 * Simple logger utility for auth service
 */

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

class Logger {
    constructor(service = 'auth-service') {
        this.service = service;
    }

    format(level, message, data) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.service}] [${level}]`;
        
        if (data) {
            return `${prefix} ${message} ${JSON.stringify(data)}`;
        }
        return `${prefix} ${message}`;
    }

    info(message, data) {
        console.log(
            colors.cyan + this.format('INFO', message, data) + colors.reset
        );
    }

    warn(message, data) {
        console.log(
            colors.yellow + this.format('WARN', message, data) + colors.reset
        );
    }

    error(message, error) {
        const errorData = error instanceof Error ? {
            message: error.message,
            stack: error.stack
        } : error;
        
        console.error(
            colors.red + this.format('ERROR', message, errorData) + colors.reset
        );
    }

    debug(message, data) {
        if (process.env.NODE_ENV === 'development') {
            console.log(
                colors.gray + this.format('DEBUG', message, data) + colors.reset
            );
        }
    }

    success(message, data) {
        console.log(
            colors.green + this.format('SUCCESS', message, data) + colors.reset
        );
    }
}

module.exports = {
    logger: new Logger()
};