/**
 * Performance Monitoring Middleware
 * Tracks request duration, memory usage, and concurrent requests
 */

const { performance } = require('perf_hooks');
const MetricsCollectionService = require('../services/metrics-collection.service');
const AlertingService = require('../services/alerting.service');

class PerformanceMonitoringMiddleware {
    constructor() {
        this.metricsService = new MetricsCollectionService();
        this.alertingService = new AlertingService();
        this.concurrentRequests = 0;
        this.requestCounter = 0;
    }

    /**
     * Main middleware function
     */
    monitor() {
        return async (req, res, next) => {
            const startTime = performance.now();
            const startMemory = process.memoryUsage();
            const requestId = ++this.requestCounter;
            
            // Track concurrent requests
            this.concurrentRequests++;
            
            // Response interceptor
            const originalSend = res.send;
            const originalJson = res.json;
            let requestEnded = false;
            
            const endRequest = (statusCode, responseSize = 0) => {
                // Prevent multiple calls
                if (requestEnded) return;
                requestEnded = true;
                const endTime = performance.now();
                const endMemory = process.memoryUsage();
                const duration = endTime - startTime;
                
                // Collect metrics
                const metrics = {
                    requestId,
                    method: req.method,
                    endpoint: req.route?.path || req.path,
                    statusCode,
                    duration,
                    memoryUsage: {
                        heapUsed: endMemory.heapUsed,
                        heapTotal: endMemory.heapTotal,
                        external: endMemory.external,
                        rss: endMemory.rss,
                        heapDelta: endMemory.heapUsed - startMemory.heapUsed
                    },
                    concurrentRequests: this.concurrentRequests,
                    responseSize,
                    timestamp: new Date(),
                    userAgent: req.get('User-Agent'),
                    ip: req.ip || req.connection.remoteAddress
                };
                
                // Record metrics
                this.metricsService.recordRequest(metrics);
                
                // Check thresholds and alert if necessary
                this.checkAlertThresholds(metrics);
                
                // Decrement concurrent requests
                this.concurrentRequests--;
            };
            
            // Override response methods
            res.send = function(data) {
                endRequest(this.statusCode, Buffer.byteLength(data || ''));
                return originalSend.call(this, data);
            };
            
            res.json = function(data) {
                const jsonString = JSON.stringify(data);
                endRequest(this.statusCode, Buffer.byteLength(jsonString));
                return originalJson.call(this, data);
            };
            
            // Handle response end without explicit send/json
            res.on('finish', () => {
                if (!res.headersSent) return;
                endRequest(res.statusCode);
            });
            
            next();
        };
    }
    
    /**
     * Check alert thresholds
     */
    checkAlertThresholds(metrics) {
        const config = require('../config/performance-config');
        
        // Response time alert
        if (metrics.duration > config.RESPONSE_TIME_THRESHOLD) {
            this.alertingService.sendAlert('response_time', {
                endpoint: metrics.endpoint,
                duration: metrics.duration,
                threshold: config.RESPONSE_TIME_THRESHOLD,
                timestamp: metrics.timestamp
            });
        }
        
        // Memory usage alert
        const memoryMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
        if (memoryMB > config.MEMORY_THRESHOLD_MB) {
            this.alertingService.sendAlert('memory_usage', {
                usage: memoryMB,
                threshold: config.MEMORY_THRESHOLD_MB,
                timestamp: metrics.timestamp
            });
        }
        
        // Error rate alert
        if (metrics.statusCode >= 500) {
            this.alertingService.sendAlert('server_error', {
                endpoint: metrics.endpoint,
                statusCode: metrics.statusCode,
                timestamp: metrics.timestamp
            });
        }
    }
    
    /**
     * Get metrics service instance
     */
    getMetricsService() {
        return this.metricsService;
    }
    
    /**
     * Get alerting service instance
     */
    getAlertingService() {
        return this.alertingService;
    }
    
    /**
     * Get real-time performance metrics
     */
    getPerformanceMetrics() {
        return this.metricsService.getAggregatedMetrics();
    }
    
    /**
     * Get endpoint-specific metrics
     */
    getEndpointMetrics(endpoint) {
        return this.metricsService.getEndpointMetrics(endpoint);
    }
    
    /**
     * Get system health status
     */
    getHealthStatus() {
        const metrics = this.metricsService.getAggregatedMetrics();
        const config = require('../config/performance-config');
        
        const issues = [];
        let status = 'healthy';
        
        // Check response time
        if (metrics.avgResponseTime > config.RESPONSE_TIME_THRESHOLD) {
            issues.push(`High response time: ${metrics.avgResponseTime.toFixed(2)}ms`);
            status = 'warning';
        }
        
        // Check memory usage
        const memoryMB = process.memoryUsage().heapUsed / 1024 / 1024;
        if (memoryMB > config.MEMORY_THRESHOLD_MB) {
            issues.push(`High memory usage: ${memoryMB.toFixed(2)}MB`);
            status = 'critical';
        }
        
        // Check error rate
        if (metrics.errorRate > config.ERROR_RATE_THRESHOLD) {
            issues.push(`High error rate: ${metrics.errorRate.toFixed(2)}%`);
            status = 'critical';
        }
        
        return {
            status,
            issues,
            metrics: {
                avgResponseTime: metrics.avgResponseTime,
                memoryUsage: memoryMB,
                errorRate: metrics.errorRate,
                requestsPerSecond: metrics.requestsPerSecond
            },
            thresholds: {
                responseTime: config.RESPONSE_TIME_THRESHOLD,
                memory: config.MEMORY_THRESHOLD_MB,
                errorRate: config.ERROR_RATE_THRESHOLD
            }
        };
    }
    
    /**
     * Reset all metrics
     */
    resetMetrics() {
        this.metricsService.reset();
        this.requestCounter = 0;
    }
}

module.exports = PerformanceMonitoringMiddleware;