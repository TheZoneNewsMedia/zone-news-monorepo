/**
 * Prometheus Metrics for Zone News
 * Comprehensive monitoring and observability
 */

const promClient = require('prom-client');
const express = require('express');

class MetricsService {
    constructor() {
        // Create a Registry
        this.register = new promClient.Registry();
        
        // Add default metrics (CPU, memory, etc.)
        promClient.collectDefaultMetrics({ 
            register: this.register,
            prefix: 'zone_news_'
        });
        
        // Initialize custom metrics
        this.initializeMetrics();
    }

    initializeMetrics() {
        // HTTP metrics
        this.httpRequestDuration = new promClient.Histogram({
            name: 'zone_news_http_request_duration_seconds',
            help: 'Duration of HTTP requests in seconds',
            labelNames: ['method', 'route', 'status', 'service'],
            buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
        });
        
        this.httpRequestTotal = new promClient.Counter({
            name: 'zone_news_http_requests_total',
            help: 'Total number of HTTP requests',
            labelNames: ['method', 'route', 'status', 'service']
        });
        
        // Business metrics
        this.newsArticlesTotal = new promClient.Counter({
            name: 'zone_news_articles_total',
            help: 'Total number of news articles',
            labelNames: ['category', 'source']
        });
        
        this.userRegistrations = new promClient.Counter({
            name: 'zone_news_user_registrations_total',
            help: 'Total number of user registrations',
            labelNames: ['tier', 'source']
        });
        
        this.userActivity = new promClient.Gauge({
            name: 'zone_news_active_users',
            help: 'Number of active users',
            labelNames: ['tier', 'timeframe']
        });
        
        // Tier metrics
        this.tierUpgrades = new promClient.Counter({
            name: 'zone_news_tier_upgrades_total',
            help: 'Total number of tier upgrades',
            labelNames: ['from_tier', 'to_tier']
        });
        
        this.tierRevenue = new promClient.Counter({
            name: 'zone_news_revenue_total',
            help: 'Total revenue in cents',
            labelNames: ['tier', 'currency']
        });
        
        // API metrics
        this.apiCallsTotal = new promClient.Counter({
            name: 'zone_news_api_calls_total',
            help: 'Total number of API calls',
            labelNames: ['endpoint', 'tier', 'status']
        });
        
        this.apiRateLimitHits = new promClient.Counter({
            name: 'zone_news_rate_limit_hits_total',
            help: 'Total number of rate limit hits',
            labelNames: ['tier', 'endpoint']
        });
        
        // Cache metrics
        this.cacheHits = new promClient.Counter({
            name: 'zone_news_cache_hits_total',
            help: 'Total number of cache hits',
            labelNames: ['cache_type']
        });
        
        this.cacheMisses = new promClient.Counter({
            name: 'zone_news_cache_misses_total',
            help: 'Total number of cache misses',
            labelNames: ['cache_type']
        });
        
        // Database metrics
        this.dbQueryDuration = new promClient.Histogram({
            name: 'zone_news_db_query_duration_seconds',
            help: 'Duration of database queries',
            labelNames: ['operation', 'collection'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
        });
        
        this.dbConnectionPool = new promClient.Gauge({
            name: 'zone_news_db_connection_pool_size',
            help: 'Database connection pool size',
            labelNames: ['state']
        });
        
        // WebSocket metrics
        this.wsConnections = new promClient.Gauge({
            name: 'zone_news_websocket_connections',
            help: 'Number of active WebSocket connections',
            labelNames: ['room']
        });
        
        this.wsMessages = new promClient.Counter({
            name: 'zone_news_websocket_messages_total',
            help: 'Total WebSocket messages',
            labelNames: ['direction', 'event']
        });
        
        // Bot metrics
        this.botCommands = new promClient.Counter({
            name: 'zone_news_bot_commands_total',
            help: 'Total bot commands processed',
            labelNames: ['command', 'status']
        });
        
        this.botUsers = new promClient.Gauge({
            name: 'zone_news_bot_users',
            help: 'Number of bot users',
            labelNames: ['state']
        });
        
        // Error metrics
        this.errors = new promClient.Counter({
            name: 'zone_news_errors_total',
            help: 'Total number of errors',
            labelNames: ['type', 'service', 'severity']
        });
        
        // Performance metrics
        this.responseTime = new promClient.Summary({
            name: 'zone_news_response_time_seconds',
            help: 'Response time summary',
            labelNames: ['service', 'endpoint'],
            percentiles: [0.5, 0.9, 0.95, 0.99]
        });
        
        // Register all metrics
        this.register.registerMetric(this.httpRequestDuration);
        this.register.registerMetric(this.httpRequestTotal);
        this.register.registerMetric(this.newsArticlesTotal);
        this.register.registerMetric(this.userRegistrations);
        this.register.registerMetric(this.userActivity);
        this.register.registerMetric(this.tierUpgrades);
        this.register.registerMetric(this.tierRevenue);
        this.register.registerMetric(this.apiCallsTotal);
        this.register.registerMetric(this.apiRateLimitHits);
        this.register.registerMetric(this.cacheHits);
        this.register.registerMetric(this.cacheMisses);
        this.register.registerMetric(this.dbQueryDuration);
        this.register.registerMetric(this.dbConnectionPool);
        this.register.registerMetric(this.wsConnections);
        this.register.registerMetric(this.wsMessages);
        this.register.registerMetric(this.botCommands);
        this.register.registerMetric(this.botUsers);
        this.register.registerMetric(this.errors);
        this.register.registerMetric(this.responseTime);
    }

    /**
     * Express middleware for HTTP metrics
     */
    httpMiddleware() {
        return (req, res, next) => {
            const start = Date.now();
            
            // Intercept response finish
            res.on('finish', () => {
                const duration = (Date.now() - start) / 1000;
                const route = req.route?.path || req.path;
                const service = req.app.get('service-name') || 'unknown';
                
                // Record metrics
                this.httpRequestDuration.observe(
                    { 
                        method: req.method, 
                        route, 
                        status: res.statusCode, 
                        service 
                    },
                    duration
                );
                
                this.httpRequestTotal.inc({
                    method: req.method,
                    route,
                    status: res.statusCode,
                    service
                });
                
                this.responseTime.observe(
                    { service, endpoint: route },
                    duration
                );
                
                // Track errors
                if (res.statusCode >= 500) {
                    this.errors.inc({
                        type: 'http_error',
                        service,
                        severity: 'error'
                    });
                } else if (res.statusCode >= 400) {
                    this.errors.inc({
                        type: 'http_error',
                        service,
                        severity: 'warning'
                    });
                }
            });
            
            next();
        };
    }

    /**
     * Database query tracking
     */
    trackDbQuery(operation, collection, duration) {
        this.dbQueryDuration.observe(
            { operation, collection },
            duration
        );
    }

    /**
     * Cache tracking
     */
    trackCacheHit(cacheType = 'redis') {
        this.cacheHits.inc({ cache_type: cacheType });
    }

    trackCacheMiss(cacheType = 'redis') {
        this.cacheMisses.inc({ cache_type: cacheType });
    }

    /**
     * User activity tracking
     */
    trackUserActivity(tier, timeframe, count) {
        this.userActivity.set({ tier, timeframe }, count);
    }

    /**
     * Revenue tracking
     */
    trackRevenue(tier, amount, currency = 'USD') {
        this.tierRevenue.inc({ tier, currency }, amount);
    }

    /**
     * WebSocket tracking
     */
    setWsConnections(room, count) {
        this.wsConnections.set({ room }, count);
    }

    trackWsMessage(direction, event) {
        this.wsMessages.inc({ direction, event });
    }

    /**
     * Bot command tracking
     */
    trackBotCommand(command, status = 'success') {
        this.botCommands.inc({ command, status });
    }

    /**
     * Create metrics endpoint
     */
    metricsEndpoint() {
        const router = express.Router();
        
        router.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', this.register.contentType);
                const metrics = await this.register.metrics();
                res.end(metrics);
            } catch (error) {
                res.status(500).end(error);
            }
        });
        
        return router;
    }

    /**
     * Custom metric aggregations
     */
    async getBusinessMetrics() {
        return {
            totalUsers: await this.getUserCount(),
            activeUsers: {
                daily: await this.getActiveUsers('24h'),
                weekly: await this.getActiveUsers('7d'),
                monthly: await this.getActiveUsers('30d')
            },
            revenue: {
                daily: await this.getRevenue('24h'),
                monthly: await this.getRevenue('30d')
            },
            performance: {
                avgResponseTime: await this.getAvgResponseTime(),
                errorRate: await this.getErrorRate(),
                cacheHitRate: await this.getCacheHitRate()
            }
        };
    }

    async getUserCount() {
        // Implementation would query actual data
        return 0;
    }

    async getActiveUsers(timeframe) {
        // Implementation would query actual data
        return 0;
    }

    async getRevenue(timeframe) {
        // Implementation would query actual data
        return 0;
    }

    async getAvgResponseTime() {
        // Calculate from responseTime summary
        return 0;
    }

    async getErrorRate() {
        // Calculate error rate
        return 0;
    }

    async getCacheHitRate() {
        // Calculate cache hit rate
        const hits = await this.register.getSingleMetricAsString('zone_news_cache_hits_total');
        const misses = await this.register.getSingleMetricAsString('zone_news_cache_misses_total');
        // Parse and calculate (simplified)
        return 0;
    }

    /**
     * Alert rules for Prometheus
     */
    getAlertRules() {
        return `
groups:
  - name: zone_news_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(zone_news_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High error rate detected
          description: "Error rate is {{ $value }} errors per second"
      
      - alert: HighResponseTime
        expr: zone_news_response_time_seconds{quantile="0.95"} > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High response time
          description: "95th percentile response time is {{ $value }} seconds"
      
      - alert: LowCacheHitRate
        expr: rate(zone_news_cache_hits_total[5m]) / (rate(zone_news_cache_hits_total[5m]) + rate(zone_news_cache_misses_total[5m])) < 0.8
        for: 10m
        labels:
          severity: info
        annotations:
          summary: Low cache hit rate
          description: "Cache hit rate is below 80%"
      
      - alert: DatabaseSlowQueries
        expr: zone_news_db_query_duration_seconds{quantile="0.95"} > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Database queries are slow
          description: "95th percentile query time is {{ $value }} seconds"
        `;
    }
}

// Singleton instance
let metricsInstance = null;

function getMetrics() {
    if (!metricsInstance) {
        metricsInstance = new MetricsService();
    }
    return metricsInstance;
}

module.exports = {
    MetricsService,
    getMetrics,
    promClient
};