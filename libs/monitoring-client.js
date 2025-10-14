/**
 * Centralized Monitoring Client
 * WebSocket client to connect services to centralized monitoring
 */

const WebSocket = require('ws');

class MonitoringClient {
    constructor(serviceType, monitoringUrl = 'ws://localhost:3021') {
        this.serviceType = serviceType;
        this.monitoringUrl = monitoringUrl;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.metrics = {
            requests: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        this.connect();
        this.startHeartbeat();
    }
    
    connect() {
        try {
            const url = `${this.monitoringUrl}?service=${this.serviceType}`;
            this.ws = new WebSocket(url);
            
            this.ws.on('open', () => {
                console.log(`📊 Connected to centralized monitoring (${this.serviceType})`);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                // Send initial metrics
                this.sendMetrics({
                    type: 'startup',
                    memory: process.memoryUsage(),
                    uptime: process.uptime()
                });
            });
            
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Invalid message from monitoring server:', error);
                }
            });
            
            this.ws.on('close', () => {
                console.log(`📊 Disconnected from monitoring (${this.serviceType})`);
                this.isConnected = false;
                this.reconnect();
            });
            
            this.ws.on('error', (error) => {
                console.error(`📊 Monitoring connection error (${this.serviceType}):`, error.message);
                this.isConnected = false;
            });
            
        } catch (error) {
            console.error(`📊 Failed to connect to monitoring (${this.serviceType}):`, error.message);
            this.reconnect();
        }
    }
    
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`📊 Max reconnection attempts reached for ${this.serviceType}`);
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`📊 Reconnecting to monitoring (${this.serviceType}) - Attempt ${this.reconnectAttempts}`);
        
        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'welcome':
                console.log(`📊 Welcome message from monitoring: ${message.serviceId}`);
                break;
            case 'ping':
                this.sendPong();
                break;
            default:
                console.log(`📊 Unknown message type: ${message.type}`);
        }
    }
    
    sendMetrics(metrics) {
        if (!this.isConnected || !this.ws) return;
        
        try {
            this.ws.send(JSON.stringify({
                type: 'metrics',
                data: {
                    ...metrics,
                    serviceType: this.serviceType,
                    timestamp: Date.now(),
                    pid: process.pid
                }
            }));
        } catch (error) {
            console.error(`📊 Failed to send metrics (${this.serviceType}):`, error.message);
        }
    }
    
    sendAlert(alertType, details) {
        if (!this.isConnected || !this.ws) return;
        
        try {
            this.ws.send(JSON.stringify({
                type: 'alert',
                data: {
                    alertType,
                    details,
                    serviceType: this.serviceType,
                    timestamp: Date.now()
                }
            }));
        } catch (error) {
            console.error(`📊 Failed to send alert (${this.serviceType}):`, error.message);
        }
    }
    
    sendPerformanceData(performanceData) {
        if (!this.isConnected || !this.ws) return;
        
        try {
            this.ws.send(JSON.stringify({
                type: 'performance',
                data: {
                    ...performanceData,
                    serviceType: this.serviceType,
                    timestamp: Date.now()
                }
            }));
        } catch (error) {
            console.error(`📊 Failed to send performance data (${this.serviceType}):`, error.message);
        }
    }
    
    sendPong() {
        if (!this.isConnected || !this.ws) return;
        
        try {
            this.ws.send(JSON.stringify({
                type: 'pong',
                data: {
                    serviceType: this.serviceType,
                    timestamp: Date.now()
                }
            }));
        } catch (error) {
            console.error(`📊 Failed to send pong (${this.serviceType}):`, error.message);
        }
    }
    
    startHeartbeat() {
        // Send heartbeat every 30 seconds
        setInterval(() => {
            if (this.isConnected) {
                this.ws.send(JSON.stringify({
                    type: 'heartbeat',
                    data: {
                        memory: process.memoryUsage(),
                        uptime: process.uptime(),
                        requests: this.metrics.requests,
                        errors: this.metrics.errors,
                        serviceType: this.serviceType,
                        timestamp: Date.now()
                    }
                }));
            }
        }, 30000);
    }
    
    // Middleware to track requests
    trackRequest() {
        return (req, res, next) => {
            this.metrics.requests++;
            
            const startTime = Date.now();
            
            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                
                if (res.statusCode >= 400) {
                    this.metrics.errors++;
                }
                
                // Send performance data for slow requests
                if (responseTime > 1000) {
                    this.sendPerformanceData({
                        responseTime,
                        statusCode: res.statusCode,
                        method: req.method,
                        path: req.path,
                        slow: true
                    });
                }
            });
            
            next();
        };
    }
    
    // Record custom metrics
    recordMetric(name, value, tags = {}) {
        this.sendMetrics({
            metricName: name,
            value: value,
            tags: tags,
            type: 'custom'
        });
    }
    
    // Disconnect gracefully
    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

module.exports = MonitoringClient;