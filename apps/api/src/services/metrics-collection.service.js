/**
 * Metrics Collection Service
 * Centralized metrics storage and aggregation with circular buffers
 */

const CircularBuffer = require('../utils/circular-buffer');

class MetricsCollectionService {
    constructor() {
        // Circular buffers for efficient memory usage
        this.requestMetrics = new CircularBuffer(1000); // Last 1000 requests
        this.memoryMetrics = new CircularBuffer(500);   // Last 500 memory snapshots
        this.dbMetrics = new CircularBuffer(500);       // Last 500 DB queries
        this.alertHistory = new CircularBuffer(100);    // Last 100 alerts
        
        // Real-time statistics
        this.stats = {
            totalRequests: 0,
            totalErrors: 0,
            averageResponseTime: 0,
            currentMemoryUsage: 0,
            peakMemoryUsage: 0,
            concurrentRequests: 0,
            errorRate: 0
        };
        
        // Start memory monitoring
        this.startMemoryMonitoring();
    }
    
    /**
     * Record request metrics
     */
    recordRequest(metrics) {
        this.requestMetrics.push(metrics);
        this.updateStatistics(metrics);
        
        // Emit metrics for real-time dashboard
        this.emitRealtimeMetrics(metrics);
    }
    
    /**
     * Record database query metrics
     */
    recordDatabaseQuery(queryMetrics) {
        this.dbMetrics.push(queryMetrics);
    }
    
    /**
     * Record cache hit metrics
     */
    recordCacheHit(cacheMetrics) {
        const metrics = {
            type: 'cache_hit',
            ...cacheMetrics,
            timestamp: new Date()
        };
        this.requestMetrics.push(metrics);
    }
    
    /**
     * Record cache miss metrics
     */
    recordCacheMiss(cacheMetrics) {
        const metrics = {
            type: 'cache_miss',
            ...cacheMetrics,
            timestamp: new Date()
        };
        this.requestMetrics.push(metrics);
    }
    
    /**
     * Update real-time statistics
     */
    updateStatistics(metrics) {
        this.stats.totalRequests++;
        
        if (metrics.statusCode >= 400) {
            this.stats.totalErrors++;
        }
        
        // Update error rate
        this.stats.errorRate = (this.stats.totalErrors / this.stats.totalRequests) * 100;
        
        // Update average response time (sliding window)
        const recentRequests = this.requestMetrics.getRecent(100);
        this.stats.averageResponseTime = recentRequests.reduce((sum, req) => 
            sum + req.duration, 0) / recentRequests.length;
        
        // Update memory statistics (safely handle undefined)
        if (metrics.memoryUsage && metrics.memoryUsage.heapUsed) {
            const memoryMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
            this.stats.currentMemoryUsage = memoryMB;
            if (memoryMB > this.stats.peakMemoryUsage) {
                this.stats.peakMemoryUsage = memoryMB;
            }
        } else {
            // Use process memory if not provided
            const memUsage = process.memoryUsage();
            const memoryMB = memUsage.heapUsed / 1024 / 1024;
            this.stats.currentMemoryUsage = memoryMB;
            if (memoryMB > this.stats.peakMemoryUsage) {
                this.stats.peakMemoryUsage = memoryMB;
            }
        }
        
        this.stats.concurrentRequests = metrics.concurrentRequests;
    }
    
    /**
     * Get performance statistics
     */
    getStatistics() {
        const recentRequests = this.requestMetrics.getRecent(100);
        const recentDbQueries = this.dbMetrics.getRecent(100);
        
        return {
            ...this.stats,
            endpoints: this.getEndpointStatistics(),
            database: this.getDatabaseStatistics(),
            cache: this.getCacheStatistics(),
            memoryTrend: this.getMemoryTrend(),
            responseTimes: {
                p50: this.calculatePercentile(recentRequests, 50),
                p95: this.calculatePercentile(recentRequests, 95),
                p99: this.calculatePercentile(recentRequests, 99)
            },
            lastUpdated: new Date()
        };
    }
    
    /**
     * Get endpoint-specific statistics
     */
    getEndpointStatistics() {
        const recentRequests = this.requestMetrics.getRecent(500);
        const endpointStats = {};
        
        recentRequests.forEach(req => {
            if (!endpointStats[req.endpoint]) {
                endpointStats[req.endpoint] = {
                    count: 0,
                    totalDuration: 0,
                    errors: 0,
                    averageDuration: 0,
                    errorRate: 0
                };
            }
            
            const stats = endpointStats[req.endpoint];
            stats.count++;
            stats.totalDuration += req.duration;
            if (req.statusCode >= 400) stats.errors++;
            
            stats.averageDuration = stats.totalDuration / stats.count;
            stats.errorRate = (stats.errors / stats.count) * 100;
        });
        
        return endpointStats;
    }
    
    /**
     * Get database performance statistics
     */
    getDatabaseStatistics() {
        const recentQueries = this.dbMetrics.getRecent(100);
        
        if (recentQueries.length === 0) {
            return { averageQueryTime: 0, slowQueries: 0, totalQueries: 0 };
        }
        
        const averageQueryTime = recentQueries.reduce((sum, query) => 
            sum + query.duration, 0) / recentQueries.length;
        
        const slowQueries = recentQueries.filter(query => 
            query.duration > 100).length; // >100ms considered slow
        
        return {
            averageQueryTime,
            slowQueries,
            totalQueries: recentQueries.length,
            slowestQuery: Math.max(...recentQueries.map(q => q.duration))
        };
    }
    
    /**
     * Get cache statistics
     */
    getCacheStatistics() {
        const recentRequests = this.requestMetrics.getRecent(500);
        const cacheHits = recentRequests.filter(req => req.type === 'cache_hit');
        const cacheMisses = recentRequests.filter(req => req.type === 'cache_miss');
        
        const totalCacheRequests = cacheHits.length + cacheMisses.length;
        
        if (totalCacheRequests === 0) {
            return { 
                hitRate: 0, 
                totalHits: 0, 
                totalMisses: 0, 
                averageHitTime: 0,
                averageMissTime: 0
            };
        }
        
        const hitRate = (cacheHits.length / totalCacheRequests) * 100;
        const averageHitTime = cacheHits.length > 0 ? 
            cacheHits.reduce((sum, hit) => sum + hit.duration, 0) / cacheHits.length : 0;
        const averageMissTime = cacheMisses.length > 0 ?
            cacheMisses.reduce((sum, miss) => sum + miss.duration, 0) / cacheMisses.length : 0;
        
        return {
            hitRate: Math.round(hitRate * 100) / 100,
            totalHits: cacheHits.length,
            totalMisses: cacheMisses.length,
            averageHitTime: Math.round(averageHitTime * 100) / 100,
            averageMissTime: Math.round(averageMissTime * 100) / 100,
            efficiency: hitRate > 80 ? 'excellent' : hitRate > 60 ? 'good' : hitRate > 40 ? 'fair' : 'poor'
        };
    }
    
    /**
     * Get memory usage trend
     */
    getMemoryTrend() {
        const recentMemory = this.memoryMetrics.getRecent(50);
        return recentMemory.map(m => ({
            timestamp: m.timestamp,
            heapUsed: m.heapUsed / 1024 / 1024, // Convert to MB
            heapTotal: m.heapTotal / 1024 / 1024,
            external: m.external / 1024 / 1024,
            rss: m.rss / 1024 / 1024
        }));
    }
    
    /**
     * Calculate percentile for response times
     */
    calculatePercentile(requests, percentile) {
        if (requests.length === 0) return 0;
        
        const sorted = requests.map(r => r.duration).sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index] || 0;
    }
    
    /**
     * Start continuous memory monitoring
     */
    startMemoryMonitoring() {
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            this.memoryMetrics.push({
                ...memoryUsage,
                timestamp: new Date()
            });
        }, 5000); // Every 5 seconds
    }
    
    /**
     * Emit real-time metrics for dashboard
     */
    emitRealtimeMetrics(metrics) {
        // WebSocket implementation for real-time dashboard updates
        try {
            const io = require('../utils/websocket-server');
            if (io) {
                io.emit('performance-metrics', {
                    type: 'request',
                    data: metrics,
                    stats: this.getStatistics()
                });
            }
        } catch (error) {
            // WebSocket not available, continue without real-time updates
        }
    }
    
    /**
     * Get aggregated metrics (alias for getStatistics for middleware compatibility)
     */
    getAggregatedMetrics() {
        const stats = this.getStatistics();
        return {
            avgResponseTime: stats.averageResponseTime,
            errorRate: stats.errorRate,
            requestsPerSecond: this.calculateRequestsPerSecond(),
            memoryUsage: stats.currentMemoryUsage,
            concurrentRequests: stats.concurrentRequests,
            endpoints: stats.endpoints,
            database: stats.database,
            cache: stats.cache,
            responseTimes: stats.responseTimes
        };
    }
    
    /**
     * Get metrics for specific endpoint
     */
    getEndpointMetrics(endpoint) {
        const endpointStats = this.getEndpointStatistics();
        return endpointStats[endpoint] || null;
    }
    
    /**
     * Calculate requests per second
     */
    calculateRequestsPerSecond() {
        const recentRequests = this.requestMetrics.getRecent(100);
        if (recentRequests.length === 0) return 0;
        
        const timeSpan = new Date() - new Date(recentRequests[0].timestamp);
        const seconds = timeSpan / 1000;
        return seconds > 0 ? recentRequests.length / seconds : 0;
    }
    
    /**
     * Reset all metrics
     */
    reset() {
        this.requestMetrics.clear();
        this.memoryMetrics.clear();
        this.dbMetrics.clear();
        this.alertHistory.clear();
        
        this.stats = {
            totalRequests: 0,
            totalErrors: 0,
            averageResponseTime: 0,
            currentMemoryUsage: 0,
            peakMemoryUsage: 0,
            concurrentRequests: 0,
            errorRate: 0
        };
    }
}

module.exports = MetricsCollectionService;