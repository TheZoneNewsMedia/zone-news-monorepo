/**
 * Health Monitor Service for Bot
 * Monitors service health and handles automatic recovery
 */

const EventEmitter = require('events');

class HealthMonitor extends EventEmitter {
    constructor(bot, db, circuitBreakers) {
        super();
        this.bot = bot;
        this.db = db;
        this.circuitBreakers = circuitBreakers;
        this.healthCheckInterval = 30000; // 30 seconds
        this.degradedServiceTimeout = 300000; // 5 minutes
        this.intervalId = null;
        
        // Health status tracking
        this.lastHealthCheck = null;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
        this.isShuttingDown = false;
        
        // Service status
        this.serviceStatus = {
            database: 'unknown',
            telegram: 'unknown',
            circuitBreakers: 'unknown',
            memory: 'unknown',
            uptime: 'healthy'
        };
        
        // Performance metrics
        this.metrics = {
            messagesSent: 0,
            commandsProcessed: 0,
            errors: 0,
            restarts: 0,
            lastRestart: null
        };
        
        this.startMonitoring();
    }

    startMonitoring() {
        console.log('Health monitor started');
        
        // Initial health check
        this.performHealthCheck();
        
        // Schedule periodic health checks
        this.intervalId = setInterval(() => {
            if (!this.isShuttingDown) {
                this.performHealthCheck();
            }
        }, this.healthCheckInterval);
        
        // Monitor for process events
        this.setupProcessMonitoring();
    }

    async performHealthCheck() {
        const startTime = Date.now();
        const healthData = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            checks: {}
        };

        try {
            // Database connectivity check
            healthData.checks.database = await this.checkDatabase();
            
            // Telegram API check
            healthData.checks.telegram = await this.checkTelegramAPI();
            
            // Circuit breaker status
            healthData.checks.circuitBreakers = this.checkCircuitBreakers();
            
            // Memory usage check
            healthData.checks.memory = this.checkMemoryUsage();
            
            // Uptime check
            healthData.checks.uptime = this.checkUptime();
            
            // Calculate overall status
            healthData.status = this.calculateOverallStatus(healthData.checks);
            
            // Update service status
            this.updateServiceStatus(healthData.checks);
            
            // Handle health status changes
            this.handleHealthStatus(healthData);
            
            this.lastHealthCheck = healthData;
            this.consecutiveFailures = 0;
            
            // Emit health update event
            this.emit('healthUpdate', healthData);
            
        } catch (error) {
            console.error('Health check failed:', error);
            this.consecutiveFailures++;
            
            healthData.status = 'unhealthy';
            healthData.error = error.message;
            
            this.emit('healthCheckFailed', {
                error: error.message,
                consecutiveFailures: this.consecutiveFailures
            });
            
            // Trigger recovery if too many consecutive failures
            if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
                this.emit('criticalHealth', {
                    consecutiveFailures: this.consecutiveFailures,
                    lastError: error.message
                });
            }
        }

        const duration = Date.now() - startTime;
        console.log(`Health check completed in ${duration}ms - Status: ${healthData.status}`);
    }

    async checkDatabase() {
        return await this.circuitBreakers.executeWithBreaker(
            'database',
            async () => {
                const startTime = Date.now();
                await this.db.admin().ping();
                const latency = Date.now() - startTime;
                
                return {
                    status: 'healthy',
                    latency,
                    connected: true
                };
            },
            async () => {
                return {
                    status: 'unhealthy',
                    error: 'Database circuit breaker open',
                    connected: false
                };
            }
        );
    }

    async checkTelegramAPI() {
        return await this.circuitBreakers.executeWithBreaker(
            'telegram_api',
            async () => {
                const startTime = Date.now();
                const botInfo = await this.bot.telegram.getMe();
                const latency = Date.now() - startTime;
                
                return {
                    status: 'healthy',
                    latency,
                    botUsername: botInfo.username,
                    connected: true
                };
            },
            async () => {
                return {
                    status: 'unhealthy',
                    error: 'Telegram API circuit breaker open',
                    connected: false
                };
            }
        );
    }

    checkCircuitBreakers() {
        const breakerHealth = this.circuitBreakers.getHealthStatus();
        
        return {
            status: breakerHealth.overallStatus === 'healthy' ? 'healthy' : 'degraded',
            totalBreakers: breakerHealth.total,
            healthy: breakerHealth.healthy,
            degraded: breakerHealth.degraded,
            failed: breakerHealth.failed,
            details: this.circuitBreakers.getAllStates()
        };
    }

    checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const totalMemory = memUsage.rss;
        const heapUsed = memUsage.heapUsed;
        const heapTotal = memUsage.heapTotal;
        
        // Memory thresholds
        const warningThreshold = 500 * 1024 * 1024; // 500MB
        const criticalThreshold = 800 * 1024 * 1024; // 800MB
        
        let status = 'healthy';
        if (heapUsed > criticalThreshold) {
            status = 'critical';
        } else if (heapUsed > warningThreshold) {
            status = 'warning';
        }
        
        return {
            status,
            heapUsed,
            heapTotal,
            rss: totalMemory,
            external: memUsage.external,
            usagePercent: Math.round((heapUsed / heapTotal) * 100)
        };
    }

    checkUptime() {
        const uptime = process.uptime();
        const uptimeHours = uptime / 3600;
        
        return {
            status: 'healthy',
            seconds: uptime,
            hours: Math.round(uptimeHours * 100) / 100,
            formattedUptime: this.formatUptime(uptime)
        };
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    calculateOverallStatus(checks) {
        const statuses = Object.values(checks).map(check => check.status);
        
        if (statuses.includes('critical')) {
            return 'critical';
        } else if (statuses.includes('unhealthy')) {
            return 'unhealthy';
        } else if (statuses.includes('degraded') || statuses.includes('warning')) {
            return 'degraded';
        } else {
            return 'healthy';
        }
    }

    updateServiceStatus(checks) {
        this.serviceStatus = {
            database: checks.database.status,
            telegram: checks.telegram.status,
            circuitBreakers: checks.circuitBreakers.status,
            memory: checks.memory.status,
            uptime: checks.uptime.status
        };
    }

    handleHealthStatus(healthData) {
        switch (healthData.status) {
            case 'critical':
                this.handleCriticalHealth(healthData);
                break;
            case 'unhealthy':
                this.handleUnhealthyStatus(healthData);
                break;
            case 'degraded':
                this.handleDegradedStatus(healthData);
                break;
            case 'healthy':
                this.handleHealthyStatus(healthData);
                break;
        }
    }

    handleCriticalHealth(healthData) {
        console.error('CRITICAL: Bot health is critical', healthData);
        
        // Emit critical health event
        this.emit('criticalHealth', healthData);
        
        // Check if memory is critical
        if (healthData.checks.memory.status === 'critical') {
            console.error('Critical memory usage detected - considering restart');
            this.emit('memoryPressure', healthData.checks.memory);
        }
        
        // Check if database is down
        if (healthData.checks.database.status === 'unhealthy') {
            console.error('Database connectivity lost');
            this.emit('databaseDown', healthData.checks.database);
        }
        
        // Check if Telegram API is down
        if (healthData.checks.telegram.status === 'unhealthy') {
            console.error('Telegram API connectivity lost');
            this.emit('telegramDown', healthData.checks.telegram);
        }
    }

    handleUnhealthyStatus(healthData) {
        console.warn('Bot health is unhealthy', healthData.status);
        this.emit('unhealthyStatus', healthData);
    }

    handleDegradedStatus(healthData) {
        console.warn('Bot health is degraded');
        this.emit('degradedStatus', healthData);
        
        // Check for circuit breaker issues
        if (healthData.checks.circuitBreakers.failed > 0) {
            console.warn('Some circuit breakers are open:', healthData.checks.circuitBreakers.details);
        }
    }

    handleHealthyStatus(healthData) {
        // Log only if we were previously unhealthy
        if (this.lastHealthCheck && this.lastHealthCheck.status !== 'healthy') {
            console.log('Bot health recovered to healthy status');
            this.emit('healthRecovered', healthData);
        }
    }

    setupProcessMonitoring() {
        // Track process events
        process.on('warning', (warning) => {
            console.warn('Process warning:', warning.message);
            this.metrics.errors++;
            this.emit('processWarning', warning);
        });
        
        // Memory pressure monitoring
        setInterval(() => {
            if (global.gc) {
                const memBefore = process.memoryUsage().heapUsed;
                global.gc();
                const memAfter = process.memoryUsage().heapUsed;
                const freed = memBefore - memAfter;
                
                if (freed > 50 * 1024 * 1024) { // More than 50MB freed
                    console.log(`Garbage collection freed ${Math.round(freed / 1024 / 1024)}MB`);
                }
            }
        }, 120000); // Every 2 minutes
    }

    // Public methods for metrics
    incrementMessagesSent() {
        this.metrics.messagesSent++;
    }

    incrementCommandsProcessed() {
        this.metrics.commandsProcessed++;
    }

    incrementErrors() {
        this.metrics.errors++;
    }

    recordRestart() {
        this.metrics.restarts++;
        this.metrics.lastRestart = new Date().toISOString();
    }

    getHealthStatus() {
        return {
            lastCheck: this.lastHealthCheck,
            serviceStatus: this.serviceStatus,
            metrics: {
                ...this.metrics,
                uptime: process.uptime(),
                pid: process.pid
            },
            circuitBreakers: this.circuitBreakers.getHealthStatus()
        };
    }

    getMetrics() {
        return {
            ...this.metrics,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            pid: process.pid,
            timestamp: new Date().toISOString()
        };
    }

    // Admin command to get health report
    getHealthReport() {
        const health = this.getHealthStatus();
        const cbHealth = this.circuitBreakers.getHealthStatus();
        
        let report = `🏥 *Bot Health Report*\n\n`;
        
        // Overall status
        const statusEmoji = {
            healthy: '✅',
            degraded: '⚠️',
            unhealthy: '❌',
            critical: '🚨'
        };
        
        const lastStatus = this.lastHealthCheck?.status || 'unknown';
        report += `*Overall Status:* ${statusEmoji[lastStatus] || '❓'} ${lastStatus.toUpperCase()}\n\n`;
        
        // Service status
        report += `*Services:*\n`;
        for (const [service, status] of Object.entries(this.serviceStatus)) {
            const emoji = statusEmoji[status] || '❓';
            report += `• ${service}: ${emoji} ${status}\n`;
        }
        
        // Circuit breakers
        report += `\n*Circuit Breakers:*\n`;
        report += `• Total: ${cbHealth.total}\n`;
        report += `• Healthy: ${cbHealth.healthy}\n`;
        report += `• Degraded: ${cbHealth.degraded}\n`;
        report += `• Failed: ${cbHealth.failed}\n`;
        
        // Metrics
        report += `\n*Metrics:*\n`;
        report += `• Messages sent: ${this.metrics.messagesSent}\n`;
        report += `• Commands processed: ${this.metrics.commandsProcessed}\n`;
        report += `• Errors: ${this.metrics.errors}\n`;
        report += `• Uptime: ${this.formatUptime(process.uptime())}\n`;
        
        // Memory usage
        const memUsage = process.memoryUsage();
        const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        report += `• Memory: ${memMB}MB\n`;
        
        return report;
    }

    async shutdown() {
        console.log('Shutting down health monitor...');
        this.isShuttingDown = true;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.emit('shutdown');
    }
}

module.exports = HealthMonitor;