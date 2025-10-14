#!/usr/bin/env node
/**
 * Centralized Monitoring Service
 * Collects metrics from all Zone News services and forwards to admin dashboard
 */

const express = require('express');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server || WebSocket.WebSocketServer;
const { MongoClient } = require('mongodb');

class CentralizedMonitoringService {
    constructor() {
        this.app = express();
        this.port = process.env.MONITORING_PORT || 3020;
        this.wss = null;
        this.clients = new Map(); // Connected services
        this.metrics = new Map(); // Real-time metrics storage
        this.db = null;
        
        this.setupExpress();
        this.setupWebSocket();
        this.setupDatabase();
        this.startService();
    }

    setupExpress() {
        this.app.use(express.json());
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            next();
        });

        // Health endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'centralized-monitoring',
                port: this.port,
                connectedServices: this.clients.size,
                uptime: process.uptime()
            });
        });

        // Metrics collection endpoint
        this.app.post('/metrics', (req, res) => {
            this.collectMetrics(req.body);
            res.json({ status: 'received' });
        });

        // Admin dashboard data endpoint
        this.app.get('/admin/dashboard', (req, res) => {
            res.json(this.getDashboardData());
        });

        // Service status endpoint
        this.app.get('/admin/services', (req, res) => {
            res.json(this.getServiceStatus());
        });

        // Performance analytics endpoint
        this.app.get('/admin/performance', (req, res) => {
            res.json(this.getPerformanceAnalytics());
        });
    }

    setupWebSocket() {
        // WebSocket for real-time monitoring
        this.wss = new WebSocketServer({ 
            port: this.port + 1,
            clientTracking: true
        });

        this.wss.on('connection', (ws, req) => {
            const serviceType = req.url?.split('?service=')[1] || 'unknown';
            const serviceId = `${serviceType}_${Date.now()}`;
            
            this.clients.set(serviceId, {
                ws,
                serviceType,
                lastSeen: Date.now(),
                metrics: {}
            });

            console.log(`📊 Service connected: ${serviceType} (${serviceId})`);

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleServiceMessage(serviceId, message);
                } catch (error) {
                    console.error('Invalid message from service:', error);
                }
            });

            ws.on('close', () => {
                this.clients.delete(serviceId);
                console.log(`📊 Service disconnected: ${serviceType} (${serviceId})`);
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error for ${serviceId}:`, error);
                this.clients.delete(serviceId);
            });

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'welcome',
                serviceId,
                timestamp: Date.now()
            }));
        });
    }

    async setupDatabase() {
        try {
            const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
            this.mongoClient = new MongoClient(MONGODB_URI);
            await this.mongoClient.connect();
            this.db = this.mongoClient.db('zone_news_production');
            
            // Create monitoring collections if they don't exist
            await this.db.createCollection('service_metrics').catch(() => {});
            await this.db.createCollection('performance_logs').catch(() => {});
            await this.db.createCollection('service_alerts').catch(() => {});
            
            console.log('📊 Monitoring database connected');
        } catch (error) {
            console.error('Database connection failed:', error);
        }
    }

    handleServiceMessage(serviceId, message) {
        const service = this.clients.get(serviceId);
        if (!service) return;

        service.lastSeen = Date.now();

        switch (message.type) {
            case 'metrics':
                this.processServiceMetrics(serviceId, message.data);
                break;
            case 'alert':
                this.processServiceAlert(serviceId, message.data);
                break;
            case 'heartbeat':
                this.processHeartbeat(serviceId, message.data);
                break;
            case 'performance':
                this.processPerformanceData(serviceId, message.data);
                break;
            default:
                console.log(`Unknown message type from ${serviceId}:`, message.type);
        }
    }

    processServiceMetrics(serviceId, metrics) {
        const service = this.clients.get(serviceId);
        if (!service) return;

        // Update real-time metrics
        service.metrics = {
            ...service.metrics,
            ...metrics,
            timestamp: Date.now()
        };

        // Store in database
        if (this.db) {
            this.db.collection('service_metrics').insertOne({
                serviceId,
                serviceType: service.serviceType,
                metrics,
                timestamp: new Date()
            }).catch(console.error);
        }

        // Broadcast to admin clients
        this.broadcastToAdmins({
            type: 'service_metrics',
            serviceId,
            serviceType: service.serviceType,
            metrics
        });
    }

    processServiceAlert(serviceId, alert) {
        const service = this.clients.get(serviceId);
        if (!service) return;

        const alertData = {
            serviceId,
            serviceType: service.serviceType,
            alert,
            timestamp: new Date(),
            resolved: false
        };

        // Store alert in database
        if (this.db) {
            this.db.collection('service_alerts').insertOne(alertData).catch(console.error);
        }

        // Broadcast alert to admin
        this.broadcastToAdmins({
            type: 'service_alert',
            ...alertData
        });

        console.log(`🚨 Alert from ${service.serviceType}:`, alert);
    }

    processHeartbeat(serviceId, data) {
        const service = this.clients.get(serviceId);
        if (!service) return;

        service.lastSeen = Date.now();
        service.health = data;
    }

    processPerformanceData(serviceId, performanceData) {
        const service = this.clients.get(serviceId);
        if (!service) return;

        // Store performance data
        if (this.db) {
            this.db.collection('performance_logs').insertOne({
                serviceId,
                serviceType: service.serviceType,
                performance: performanceData,
                timestamp: new Date()
            }).catch(console.error);
        }

        // Check for performance issues
        this.checkPerformanceThresholds(serviceId, performanceData);
    }

    checkPerformanceThresholds(serviceId, performance) {
        const service = this.clients.get(serviceId);
        if (!service) return;

        const alerts = [];

        // Response time threshold
        if (performance.responseTime > 1000) {
            alerts.push({
                type: 'high_response_time',
                value: performance.responseTime,
                threshold: 1000,
                severity: 'warning'
            });
        }

        // Memory threshold
        if (performance.memoryUsage > 100 * 1024 * 1024) { // 100MB
            alerts.push({
                type: 'high_memory_usage',
                value: performance.memoryUsage,
                threshold: 100 * 1024 * 1024,
                severity: 'warning'
            });
        }

        // Error rate threshold
        if (performance.errorRate > 5) {
            alerts.push({
                type: 'high_error_rate',
                value: performance.errorRate,
                threshold: 5,
                severity: 'critical'
            });
        }

        // Send alerts
        alerts.forEach(alert => {
            this.processServiceAlert(serviceId, alert);
        });
    }

    collectMetrics(metrics) {
        // HTTP endpoint for services that can't use WebSocket
        const timestamp = Date.now();
        
        // Store metrics
        this.metrics.set(`http_${timestamp}`, {
            ...metrics,
            timestamp,
            source: 'http'
        });

        // Store in database
        if (this.db) {
            this.db.collection('service_metrics').insertOne({
                serviceId: 'http_client',
                serviceType: metrics.serviceType || 'unknown',
                metrics,
                timestamp: new Date()
            }).catch(console.error);
        }
    }

    getDashboardData() {
        const services = Array.from(this.clients.entries()).map(([id, service]) => ({
            id,
            type: service.serviceType,
            status: this.getServiceHealth(service),
            lastSeen: service.lastSeen,
            metrics: service.metrics || {},
            health: service.health || {}
        }));

        return {
            timestamp: Date.now(),
            connectedServices: this.clients.size,
            services,
            systemMetrics: this.getSystemMetrics(),
            alerts: this.getRecentAlerts()
        };
    }

    getServiceStatus() {
        const services = {};
        
        this.clients.forEach((service, id) => {
            const status = this.getServiceHealth(service);
            
            if (!services[service.serviceType]) {
                services[service.serviceType] = {
                    count: 0,
                    healthy: 0,
                    warning: 0,
                    critical: 0,
                    instances: []
                };
            }
            
            services[service.serviceType].count++;
            services[service.serviceType][status]++;
            services[service.serviceType].instances.push({
                id,
                status,
                lastSeen: service.lastSeen,
                uptime: Date.now() - service.lastSeen
            });
        });

        return services;
    }

    getPerformanceAnalytics() {
        // Get aggregated performance data
        const analytics = {
            timestamp: Date.now(),
            services: {},
            overall: {
                avgResponseTime: 0,
                totalRequests: 0,
                errorRate: 0,
                uptime: 0
            }
        };

        this.clients.forEach((service, id) => {
            if (service.metrics) {
                analytics.services[service.serviceType] = analytics.services[service.serviceType] || {
                    instances: 0,
                    avgResponseTime: 0,
                    totalRequests: 0,
                    errorRate: 0
                };

                const serviceAnalytics = analytics.services[service.serviceType];
                serviceAnalytics.instances++;
                
                if (service.metrics.responseTime) {
                    serviceAnalytics.avgResponseTime = 
                        (serviceAnalytics.avgResponseTime + service.metrics.responseTime) / serviceAnalytics.instances;
                }
                
                if (service.metrics.totalRequests) {
                    serviceAnalytics.totalRequests += service.metrics.totalRequests;
                }
                
                if (service.metrics.errorRate) {
                    serviceAnalytics.errorRate = 
                        (serviceAnalytics.errorRate + service.metrics.errorRate) / serviceAnalytics.instances;
                }
            }
        });

        return analytics;
    }

    getServiceHealth(service) {
        const timeSinceLastSeen = Date.now() - service.lastSeen;
        
        if (timeSinceLastSeen > 60000) return 'critical'; // 1 minute
        if (timeSinceLastSeen > 30000) return 'warning';  // 30 seconds
        
        // Check metrics-based health
        if (service.metrics) {
            if (service.metrics.errorRate > 10) return 'critical';
            if (service.metrics.errorRate > 5) return 'warning';
            if (service.metrics.responseTime > 2000) return 'warning';
        }
        
        return 'healthy';
    }

    getSystemMetrics() {
        return {
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            connections: this.clients.size,
            timestamp: Date.now()
        };
    }

    async getRecentAlerts() {
        if (!this.db) return [];
        
        try {
            const alerts = await this.db.collection('service_alerts')
                .find({ timestamp: { $gte: new Date(Date.now() - 3600000) } }) // Last hour
                .sort({ timestamp: -1 })
                .limit(20)
                .toArray();
            
            return alerts;
        } catch (error) {
            console.error('Failed to get recent alerts:', error);
            return [];
        }
    }

    broadcastToAdmins(message) {
        // Find admin connections (could be identified by a special parameter)
        this.clients.forEach((client, id) => {
            if (client.serviceType === 'admin' && client.ws.readyState === 1) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }

    startService() {
        this.app.listen(this.port, () => {
            console.log(`📊 Centralized Monitoring Service running on port ${this.port}`);
            console.log(`📊 WebSocket server running on port ${this.port + 1}`);
            console.log(`📊 Admin dashboard: http://localhost:${this.port}/admin/dashboard`);
        });

        // Cleanup disconnected clients every minute
        setInterval(() => {
            const now = Date.now();
            this.clients.forEach((client, id) => {
                if (now - client.lastSeen > 120000) { // 2 minutes
                    console.log(`📊 Removing stale service: ${id}`);
                    this.clients.delete(id);
                }
            });
        }, 60000);
    }

    // Graceful shutdown
    async shutdown() {
        console.log('📊 Shutting down monitoring service...');
        
        if (this.wss) {
            this.wss.close();
        }
        
        if (this.mongoClient) {
            await this.mongoClient.close();
        }
        
        process.exit(0);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => monitoringService.shutdown());
process.on('SIGINT', () => monitoringService.shutdown());

// Start the service
const monitoringService = new CentralizedMonitoringService();

module.exports = CentralizedMonitoringService;