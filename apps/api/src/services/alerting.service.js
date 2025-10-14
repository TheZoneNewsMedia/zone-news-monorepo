/**
 * Alerting Service
 * Real-time threshold monitoring and alerting
 */

class AlertingService {
    constructor() {
        this.alertHistory = [];
        this.rateLimiter = new Map(); // Prevent alert spam
        this.alertChannels = this.initializeAlertChannels();
    }
    
    /**
     * Send alert for threshold breach
     */
    async sendAlert(type, data) {
        const alertKey = `${type}_${data.endpoint || 'system'}`;
        
        // Rate limiting - prevent spam
        if (this.isRateLimited(alertKey)) {
            return;
        }
        
        const alert = {
            id: this.generateAlertId(),
            type,
            severity: this.determineSeverity(type, data),
            message: this.generateAlertMessage(type, data),
            data,
            timestamp: new Date(),
            acknowledged: false
        };
        
        // Store alert
        this.alertHistory.push(alert);
        this.trimAlertHistory();
        
        // Send to all configured channels
        await this.sendToChannels(alert);
        
        // Set rate limit
        this.setRateLimit(alertKey);
        
        console.warn(`🚨 ALERT [${alert.severity}]: ${alert.message}`);
    }
    
    /**
     * Generate alert message
     */
    generateAlertMessage(type, data) {
        switch (type) {
            case 'response_time':
                return `High response time detected: ${data.endpoint} took ${data.duration.toFixed(2)}ms (threshold: ${data.threshold}ms)`;
            
            case 'memory_usage':
                return `High memory usage: ${data.usage.toFixed(2)}MB (threshold: ${data.threshold}MB)`;
            
            case 'server_error':
                return `Server error on ${data.endpoint}: HTTP ${data.statusCode}`;
            
            case 'database_slow':
                return `Slow database query: ${data.operation} took ${data.duration.toFixed(2)}ms`;
            
            case 'high_error_rate':
                return `High error rate detected: ${data.errorRate.toFixed(2)}% over last ${data.timeWindow} minutes`;
            
            default:
                return `Performance alert: ${type}`;
        }
    }
    
    /**
     * Determine alert severity
     */
    determineSeverity(type, data) {
        switch (type) {
            case 'response_time':
                return data.duration > 1000 ? 'critical' : 'warning';
            
            case 'memory_usage':
                return data.usage > 150 ? 'critical' : 'warning';
            
            case 'server_error':
                return 'error';
            
            case 'database_slow':
                return data.duration > 500 ? 'critical' : 'warning';
            
            default:
                return 'info';
        }
    }
    
    /**
     * Initialize alert channels
     */
    initializeAlertChannels() {
        const channels = [];
        
        // Console logging (always enabled)
        channels.push({
            name: 'console',
            enabled: true,
            send: (alert) => {
                const timestamp = alert.timestamp.toISOString();
                console.log(`[${timestamp}] ${alert.severity.toUpperCase()}: ${alert.message}`);
            }
        });
        
        // Webhook alerts
        if (process.env.ALERT_WEBHOOK_URL) {
            channels.push({
                name: 'webhook',
                enabled: true,
                send: async (alert) => {
                    try {
                        // Use built-in https module instead of fetch for Node.js compatibility
                        const https = require('https');
                        const url = require('url');
                        
                        const webhookUrl = new URL(process.env.ALERT_WEBHOOK_URL);
                        const postData = JSON.stringify(alert);
                        
                        const options = {
                            hostname: webhookUrl.hostname,
                            port: webhookUrl.port || 443,
                            path: webhookUrl.pathname,
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(postData)
                            }
                        };
                        
                        const req = https.request(options, (res) => {
                            // Handle response if needed
                        });
                        
                        req.on('error', (error) => {
                            console.error('Failed to send webhook alert:', error.message);
                        });
                        
                        req.write(postData);
                        req.end();
                    } catch (error) {
                        console.error('Failed to send webhook alert:', error.message);
                    }
                }
            });
        }
        
        // Email alerts (if configured)
        if (process.env.ALERT_EMAIL_ENABLED === 'true') {
            channels.push({
                name: 'email',
                enabled: true,
                send: async (alert) => {
                    // Email implementation would go here
                    console.log(`📧 Email alert would be sent: ${alert.message}`);
                }
            });
        }
        
        return channels;
    }
    
    /**
     * Send alert to all configured channels
     */
    async sendToChannels(alert) {
        const promises = this.alertChannels
            .filter(channel => channel.enabled)
            .map(channel => {
                try {
                    return channel.send(alert);
                } catch (error) {
                    console.error(`Failed to send alert via ${channel.name}:`, error.message);
                    return Promise.resolve();
                }
            });
        
        await Promise.allSettled(promises);
    }
    
    /**
     * Rate limiting to prevent alert spam
     */
    isRateLimited(alertKey) {
        const now = Date.now();
        const lastAlert = this.rateLimiter.get(alertKey);
        const minInterval = 60000; // 1 minute minimum between same alerts
        
        return lastAlert && (now - lastAlert) < minInterval;
    }
    
    /**
     * Set rate limit for alert
     */
    setRateLimit(alertKey) {
        this.rateLimiter.set(alertKey, Date.now());
        
        // Clean up old rate limits
        setTimeout(() => {
            this.rateLimiter.delete(alertKey);
        }, 300000); // 5 minutes
    }
    
    /**
     * Get alert history
     */
    getAlertHistory(limit = 50) {
        return this.alertHistory
            .slice(-limit)
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    
    /**
     * Acknowledge alert
     */
    acknowledgeAlert(alertId) {
        const alert = this.alertHistory.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = new Date();
        }
    }
    
    /**
     * Trim alert history to prevent memory bloat
     */
    trimAlertHistory() {
        if (this.alertHistory.length > 1000) {
            this.alertHistory = this.alertHistory.slice(-500);
        }
    }
    
    /**
     * Generate unique alert ID
     */
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Monitor error rate continuously
     */
    startErrorRateMonitoring(metricsService) {
        setInterval(() => {
            try {
                const stats = metricsService.getAggregatedMetrics();
                const errorRate = stats.errorRate;
                const config = require('../config/performance-config');
                
                // Check 5-minute error rate
                if (errorRate > config.ERROR_RATE_THRESHOLD) {
                    this.sendAlert('high_error_rate', {
                        errorRate,
                        threshold: config.ERROR_RATE_THRESHOLD,
                        timeWindow: 5,
                        totalRequests: stats.totalRequests || 0,
                        timestamp: new Date()
                    });
                }
                
                // Check endpoint-specific error rates
                const endpoints = stats.endpoints || {};
                Object.entries(endpoints).forEach(([endpoint, endpointStats]) => {
                    if (endpointStats.errorRate > config.ENDPOINT_ERROR_RATE_THRESHOLD) {
                        this.sendAlert('endpoint_high_error_rate', {
                            endpoint,
                            errorRate: endpointStats.errorRate,
                            threshold: config.ENDPOINT_ERROR_RATE_THRESHOLD,
                            requests: endpointStats.count,
                            timestamp: new Date()
                        });
                    }
                });
                
            } catch (error) {
                console.error('Error rate monitoring failed:', error.message);
            }
        }, 60000); // Check every minute
    }
    
    /**
     * Generate enhanced alert message with error rate details
     */
    generateEnhancedErrorMessage(type, data) {
        switch (type) {
            case 'high_error_rate':
                return `🚨 High system error rate: ${data.errorRate.toFixed(2)}% over last ${data.timeWindow} minutes (threshold: ${data.threshold}%). Total requests: ${data.totalRequests}`;
            
            case 'endpoint_high_error_rate':
                return `⚠️ Endpoint error spike: ${data.endpoint} has ${data.errorRate.toFixed(2)}% error rate (threshold: ${data.threshold}%) over ${data.requests} requests`;
            
            case 'consecutive_errors':
                return `🔥 Consecutive errors detected: ${data.count} consecutive errors on ${data.endpoint}`;
            
            case 'error_pattern':
                return `🔍 Error pattern detected: ${data.errorType} occurring frequently (${data.occurrences} times in ${data.timeWindow} minutes)`;
                
            default:
                return this.generateAlertMessage(type, data);
        }
    }
    
    /**
     * Track consecutive errors for pattern detection
     */
    trackConsecutiveErrors(endpoint, isError) {
        if (!this.consecutiveErrors) {
            this.consecutiveErrors = new Map();
        }
        
        if (isError) {
            const current = this.consecutiveErrors.get(endpoint) || 0;
            const newCount = current + 1;
            this.consecutiveErrors.set(endpoint, newCount);
            
            // Alert on 5 consecutive errors
            if (newCount >= 5 && newCount % 5 === 0) {
                this.sendAlert('consecutive_errors', {
                    endpoint,
                    count: newCount,
                    timestamp: new Date()
                });
            }
        } else {
            // Reset counter on successful request
            this.consecutiveErrors.set(endpoint, 0);
        }
    }
    
    /**
     * Get error rate monitoring status
     */
    getErrorMonitoringStatus() {
        return {
            alertHistory: this.getAlertHistory(20),
            rateLimitedAlerts: Array.from(this.rateLimiter.keys()),
            consecutiveErrors: this.consecutiveErrors ? 
                Object.fromEntries(this.consecutiveErrors) : {},
            monitoringActive: true,
            lastCheck: new Date()
        };
    }
}

module.exports = AlertingService;