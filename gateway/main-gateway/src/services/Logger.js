const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

class Logger {
  constructor(serviceName = 'gateway', config = {}) {
    this.serviceName = serviceName;
    this.config = {
      level: process.env.LOG_LEVEL || config.level || 'info',
      logsDir: config.logsDir || path.join(__dirname, '../../logs'),
      maxFiles: config.maxFiles || '14d',
      maxSize: config.maxSize || '20m',
      datePattern: config.datePattern || 'YYYY-MM-DD',
      enableConsole: config.enableConsole !== false,
      enableFile: config.enableFile !== false,
      enableErrorFile: config.enableErrorFile !== false,
      enableCombinedFile: config.enableCombinedFile !== false,
      enableMetrics: config.enableMetrics !== false,
      ...config
    };

    // Ensure logs directory exists
    if (!fs.existsSync(this.config.logsDir)) {
      fs.mkdirSync(this.config.logsDir, { recursive: true });
    }

    // Performance metrics
    this.metrics = {
      requests: 0,
      errors: 0,
      warnings: 0,
      responseTime: [],
      startTime: Date.now()
    };

    this.logger = this.createLogger();
  }

  createLogger() {
    const formats = [];

    // Add timestamp
    formats.push(winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }));

    // Add service name
    formats.push(winston.format.label({ 
      label: this.serviceName 
    }));

    // Add error stack traces
    formats.push(winston.format.errors({ 
      stack: true 
    }));

    // Add metadata
    formats.push(winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'label']
    }));

    // Custom format for console
    const consoleFormat = winston.format.printf(({ 
      level, 
      message, 
      label, 
      timestamp, 
      metadata 
    }) => {
      const meta = Object.keys(metadata).length ? 
        ` ${JSON.stringify(metadata)}` : '';
      return `${timestamp} [${label}] ${level}: ${message}${meta}`;
    });

    // Custom format for files (JSON)
    const fileFormat = winston.format.printf(({ 
      level, 
      message, 
      label, 
      timestamp, 
      metadata 
    }) => {
      return JSON.stringify({
        timestamp,
        service: label,
        level,
        message,
        ...metadata
      });
    });

    const transports = [];

    // Console transport
    if (this.config.enableConsole) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          ...formats,
          consoleFormat
        )
      }));
    }

    // Error file transport
    if (this.config.enableErrorFile) {
      transports.push(new DailyRotateFile({
        filename: path.join(this.config.logsDir, `${this.serviceName}-error-%DATE%.log`),
        datePattern: this.config.datePattern,
        maxSize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        level: 'error',
        format: winston.format.combine(
          ...formats,
          fileFormat
        )
      }));
    }

    // Combined file transport
    if (this.config.enableCombinedFile) {
      transports.push(new DailyRotateFile({
        filename: path.join(this.config.logsDir, `${this.serviceName}-combined-%DATE%.log`),
        datePattern: this.config.datePattern,
        maxSize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        format: winston.format.combine(
          ...formats,
          fileFormat
        )
      }));
    }

    // Service-specific file transport
    if (this.config.enableFile) {
      transports.push(new DailyRotateFile({
        filename: path.join(this.config.logsDir, `${this.serviceName}-%DATE%.log`),
        datePattern: this.config.datePattern,
        maxSize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        level: this.config.level,
        format: winston.format.combine(
          ...formats,
          fileFormat
        )
      }));
    }

    return winston.createLogger({
      level: this.config.level,
      transports: transports,
      exitOnError: false
    });
  }

  // Main logging methods
  error(message, meta = {}) {
    this.metrics.errors++;
    this.logger.error(message, this.enrichMetadata(meta));
  }

  warn(message, meta = {}) {
    this.metrics.warnings++;
    this.logger.warn(message, this.enrichMetadata(meta));
  }

  info(message, meta = {}) {
    this.logger.info(message, this.enrichMetadata(meta));
  }

  debug(message, meta = {}) {
    this.logger.debug(message, this.enrichMetadata(meta));
  }

  verbose(message, meta = {}) {
    this.logger.verbose(message, this.enrichMetadata(meta));
  }

  // Specialized logging methods
  http(req, res, responseTime) {
    this.metrics.requests++;
    this.metrics.responseTime.push(responseTime);
    
    // Keep only last 1000 response times
    if (this.metrics.responseTime.length > 1000) {
      this.metrics.responseTime.shift();
    }

    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    };

    if (res.statusCode >= 400) {
      this.error(`HTTP ${res.statusCode}`, logData);
    } else {
      this.info(`HTTP ${res.statusCode}`, logData);
    }
  }

  security(event, details = {}) {
    this.warn(`SECURITY: ${event}`, {
      type: 'security',
      event,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  audit(action, user, details = {}) {
    this.info(`AUDIT: ${action}`, {
      type: 'audit',
      action,
      user,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  performance(operation, duration, details = {}) {
    const level = duration > 1000 ? 'warn' : 'info';
    this[level](`PERFORMANCE: ${operation}`, {
      type: 'performance',
      operation,
      duration: `${duration}ms`,
      ...details
    });
  }

  database(query, duration, details = {}) {
    const level = duration > 500 ? 'warn' : 'debug';
    this[level](`DATABASE: Query executed`, {
      type: 'database',
      query: query.substring(0, 200), // Truncate long queries
      duration: `${duration}ms`,
      ...details
    });
  }

  integration(service, action, success, details = {}) {
    const level = success ? 'info' : 'error';
    this[level](`INTEGRATION: ${service} - ${action}`, {
      type: 'integration',
      service,
      action,
      success,
      ...details
    });
  }

  // TDLib specific logging
  tdlib(event, details = {}) {
    this.info(`TDLIB: ${event}`, {
      type: 'tdlib',
      event,
      ...details
    });
  }

  // Service lifecycle logging
  startup(details = {}) {
    this.info(`SERVICE STARTED: ${this.serviceName}`, {
      type: 'lifecycle',
      event: 'startup',
      pid: process.pid,
      node: process.version,
      ...details
    });
  }

  shutdown(reason = 'unknown', details = {}) {
    this.info(`SERVICE SHUTDOWN: ${this.serviceName}`, {
      type: 'lifecycle',
      event: 'shutdown',
      reason,
      uptime: `${(Date.now() - this.metrics.startTime) / 1000}s`,
      totalRequests: this.metrics.requests,
      totalErrors: this.metrics.errors,
      ...details
    });
  }

  // Enrichment and utilities
  enrichMetadata(meta) {
    // Add common metadata
    const enriched = {
      service: this.serviceName,
      environment: process.env.NODE_ENV || 'development',
      pid: process.pid,
      ...meta
    };

    // Add correlation ID if available
    if (global.correlationId) {
      enriched.correlationId = global.correlationId;
    }

    // Add user context if available
    if (global.userContext) {
      enriched.user = global.userContext;
    }

    return enriched;
  }

  // Metrics and monitoring
  getMetrics() {
    const avgResponseTime = this.metrics.responseTime.length > 0
      ? this.metrics.responseTime.reduce((a, b) => a + b, 0) / this.metrics.responseTime.length
      : 0;

    return {
      uptime: Date.now() - this.metrics.startTime,
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      warnings: this.metrics.warnings,
      errorRate: this.metrics.requests > 0 
        ? (this.metrics.errors / this.metrics.requests) * 100 
        : 0,
      avgResponseTime: Math.round(avgResponseTime),
      p95ResponseTime: this.calculatePercentile(95),
      p99ResponseTime: this.calculatePercentile(99)
    };
  }

  calculatePercentile(percentile) {
    if (this.metrics.responseTime.length === 0) return 0;
    
    const sorted = [...this.metrics.responseTime].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  // Stream support for real-time logs
  createStream(level = 'info') {
    const stream = new winston.transports.Stream({
      stream: process.stdout,
      level: level
    });
    
    this.logger.add(stream);
    return stream;
  }

  // Context management for request tracing
  child(metadata) {
    const childLogger = Object.create(this);
    childLogger.defaultMetadata = { 
      ...this.defaultMetadata, 
      ...metadata 
    };
    return childLogger;
  }

  // Express middleware
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Add logger to request
      req.logger = this.child({
        requestId: req.id || Math.random().toString(36).substring(7),
        method: req.method,
        path: req.path
      });

      // Log response
      const originalSend = res.send;
      res.send = function(data) {
        const responseTime = Date.now() - startTime;
        req.logger.http(req, res, responseTime);
        originalSend.call(this, data);
      };

      next();
    };
  }

  // Error handler middleware
  errorHandler() {
    return (err, req, res, next) => {
      this.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
      });

      res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal Server Error' 
          : err.message
      });
    };
  }

  // Clean up old log files
  async cleanOldLogs(daysToKeep = 30) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(this.config.logsDir);
    
    for (const file of files) {
      const filePath = path.join(this.config.logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime.getTime() < cutoffTime) {
        fs.unlinkSync(filePath);
        this.info(`Deleted old log file: ${file}`);
      }
    }
  }

  // Export logs for analysis
  async exportLogs(startDate, endDate, format = 'json') {
    const logs = [];
    const files = fs.readdirSync(this.config.logsDir);
    
    for (const file of files) {
      if (!file.includes(this.serviceName)) continue;
      
      const filePath = path.join(this.config.logsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line);
      
      for (const line of lines) {
        try {
          const log = JSON.parse(line);
          const logDate = new Date(log.timestamp);
          
          if (logDate >= startDate && logDate <= endDate) {
            logs.push(log);
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
    }
    
    if (format === 'csv') {
      return this.logsToCSV(logs);
    }
    
    return logs;
  }

  logsToCSV(logs) {
    if (logs.length === 0) return '';
    
    const headers = Object.keys(logs[0]);
    const csv = [headers.join(',')];
    
    for (const log of logs) {
      const row = headers.map(header => {
        const value = log[header];
        return typeof value === 'string' ? `"${value}"` : value;
      });
      csv.push(row.join(','));
    }
    
    return csv.join('\n');
  }
}

// Singleton instance for default logger
let defaultLogger = null;

// Factory function to get or create logger
function getLogger(serviceName = 'default', config = {}) {
  if (!defaultLogger || serviceName !== 'default') {
    return new Logger(serviceName, config);
  }
  
  if (!defaultLogger) {
    defaultLogger = new Logger('default', config);
  }
  
  return defaultLogger;
}

module.exports = {
  Logger,
  getLogger,
  // Convenience exports
  createLogger: (serviceName, config) => new Logger(serviceName, config)
};
