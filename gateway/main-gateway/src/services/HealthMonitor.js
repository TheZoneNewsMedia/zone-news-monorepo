/**
 * HealthMonitor Service
 * 
 * Production-grade health monitoring system for TDLib Gateway Architecture
 * Monitors all gateway services, TDLib connections, and microservice health
 * 
 * @module HealthMonitor
 * @version 1.0.0
 * @created 2025-08-19
 */

const EventEmitter = require('events');
const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

/**
 * Health status enum
 */
const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

/**
 * Health check types
 */
const CheckType = {
  HTTP: 'http',
  TCP: 'tcp',
  PROCESS: 'process',
  DISK: 'disk',
  MEMORY: 'memory',
  CUSTOM: 'custom'
};

/**
 * HealthMonitor class for comprehensive system health monitoring
 */
class HealthMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      interval: config.interval || 30000, // 30 seconds default
      timeout: config.timeout || 5000, // 5 seconds timeout
      retries: config.retries || 3,
      alertThreshold: config.alertThreshold || 3, // Alert after 3 consecutive failures
      metricsWindow: config.metricsWindow || 300000, // 5 minutes window for metrics
      enableMetrics: config.enableMetrics !== false,
      enableAlerts: config.enableAlerts !== false,
      thresholds: {
        cpu: config.cpuThreshold || 80, // 80% CPU usage
        memory: config.memoryThreshold || 85, // 85% memory usage
        disk: config.diskThreshold || 90, // 90% disk usage
        responseTime: config.responseTimeThreshold || 1000, // 1 second
        errorRate: config.errorRateThreshold || 5 // 5% error rate
      },
      ...config
    };
    
    this.services = new Map();
    this.checks = new Map();
    this.metrics = new Map();
    this.alerts = new Map();
    this.history = new Map();
    this.intervals = new Map();
    this.isRunning = false;
    
    // System metrics cache
    this.systemMetrics = {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      timestamp: Date.now()
    };
    
    // TDLib specific health checks
    this.tdlibHealth = {
      connected: false,
      authorized: false,
      lastUpdate: null,
      messageRate: 0,
      activeChats: 0,
      pendingUpdates: 0
    };
    
    // Gateway metrics
    this.gatewayMetrics = {
      requestsPerSecond: 0,
      averageLatency: 0,
      errorRate: 0,
      activeConnections: 0,
      throughput: 0
    };
    
    this.logger = config.logger || console;
    this.setupEventHandlers();
  }
  
  /**
   * Setup internal event handlers
   */
  setupEventHandlers() {
    this.on('health:change', (service, status) => {
      this.handleHealthChange(service, status);
    });
    
    this.on('alert:triggered', (alert) => {
      this.handleAlert(alert);
    });
    
    this.on('metrics:updated', (metrics) => {
      this.updateMetricsHistory(metrics);
    });
  }
  
  /**
   * Register a service for health monitoring
   */
  registerService(name, config) {
    const service = {
      name,
      url: config.url,
      type: config.type || CheckType.HTTP,
      interval: config.interval || this.config.interval,
      timeout: config.timeout || this.config.timeout,
      retries: config.retries || this.config.retries,
      healthEndpoint: config.healthEndpoint || '/health',
      critical: config.critical || false,
      dependencies: config.dependencies || [],
      customCheck: config.customCheck || null,
      metadata: config.metadata || {},
      status: HealthStatus.UNKNOWN,
      lastCheck: null,
      consecutiveFailures: 0,
      responseTime: null,
      errorMessage: null
    };
    
    this.services.set(name, service);
    
    // Create health check
    this.createHealthCheck(service);
    
    // Start monitoring if auto-start enabled
    if (this.isRunning) {
      this.startServiceMonitoring(name);
    }
    
    this.logger.info(`Service registered: ${name}`, { type: service.type, critical: service.critical });
    return service;
  }
  
  /**
   * Create health check for service
   */
  createHealthCheck(service) {
    let checkFunction;
    
    switch (service.type) {
      case CheckType.HTTP:
        checkFunction = () => this.checkHttpHealth(service);
        break;
      case CheckType.TCP:
        checkFunction = () => this.checkTcpHealth(service);
        break;
      case CheckType.PROCESS:
        checkFunction = () => this.checkProcessHealth(service);
        break;
      case CheckType.CUSTOM:
        checkFunction = service.customCheck;
        break;
      default:
        checkFunction = () => this.checkHttpHealth(service);
    }
    
    this.checks.set(service.name, checkFunction);
  }
  
  /**
   * HTTP health check
   */
  async checkHttpHealth(service) {
    const startTime = Date.now();
    const url = new URL(service.healthEndpoint, service.url);
    const protocol = url.protocol === 'https:' ? https : http;
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        timeout: service.timeout,
        headers: {
          'User-Agent': 'HealthMonitor/1.0'
        }
      };
      
      const req = protocol.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            let healthData = {};
            
            try {
              healthData = JSON.parse(data);
            } catch (e) {
              healthData = { status: 'ok', raw: data };
            }
            
            resolve({
              status: HealthStatus.HEALTHY,
              responseTime,
              statusCode: res.statusCode,
              data: healthData
            });
          } else {
            resolve({
              status: HealthStatus.UNHEALTHY,
              responseTime,
              statusCode: res.statusCode,
              error: `HTTP ${res.statusCode}`
            });
          }
        });
      });
      
      req.on('error', (error) => {
        resolve({
          status: HealthStatus.UNHEALTHY,
          responseTime: Date.now() - startTime,
          error: error.message
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: HealthStatus.UNHEALTHY,
          responseTime: service.timeout,
          error: 'Request timeout'
        });
      });
      
      req.end();
    });
  }
  
  /**
   * TCP health check
   */
  async checkTcpHealth(service) {
    const net = require('net');
    const startTime = Date.now();
    const url = new URL(service.url);
    
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(service.timeout);
      
      socket.connect(url.port || 80, url.hostname, () => {
        socket.end();
        resolve({
          status: HealthStatus.HEALTHY,
          responseTime: Date.now() - startTime
        });
      });
      
      socket.on('error', (error) => {
        resolve({
          status: HealthStatus.UNHEALTHY,
          responseTime: Date.now() - startTime,
          error: error.message
        });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          status: HealthStatus.UNHEALTHY,
          responseTime: service.timeout,
          error: 'Connection timeout'
        });
      });
    });
  }
  
  /**
   * Process health check
   */
  async checkProcessHealth(service) {
    const { exec } = require('child_process');
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      exec(service.metadata.command || `pgrep -f ${service.name}`, (error, stdout, stderr) => {
        const responseTime = Date.now() - startTime;
        
        if (error) {
          resolve({
            status: HealthStatus.UNHEALTHY,
            responseTime,
            error: error.message
          });
        } else {
          const pids = stdout.trim().split('\n').filter(Boolean);
          resolve({
            status: pids.length > 0 ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
            responseTime,
            processes: pids.length
          });
        }
      });
    });
  }
  
  /**
   * Perform health check with retries
   */
  async performHealthCheck(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) return null;
    
    const checkFunction = this.checks.get(serviceName);
    if (!checkFunction) return null;
    
    let lastError = null;
    let result = null;
    
    for (let i = 0; i < service.retries; i++) {
      try {
        result = await checkFunction(service);
        
        if (result.status === HealthStatus.HEALTHY) {
          break;
        }
        
        lastError = result.error;
        
        // Wait before retry
        if (i < service.retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      } catch (error) {
        lastError = error.message;
        result = {
          status: HealthStatus.UNHEALTHY,
          error: error.message
        };
      }
    }
    
    // Update service status
    const previousStatus = service.status;
    service.status = result.status;
    service.lastCheck = Date.now();
    service.responseTime = result.responseTime;
    service.errorMessage = result.error || null;
    
    if (result.status === HealthStatus.HEALTHY) {
      service.consecutiveFailures = 0;
    } else {
      service.consecutiveFailures++;
      
      // Check if we need to trigger an alert
      if (service.consecutiveFailures >= this.config.alertThreshold) {
        this.emit('alert:triggered', {
          service: serviceName,
          type: 'service_down',
          severity: service.critical ? 'critical' : 'warning',
          message: `Service ${serviceName} has been down for ${service.consecutiveFailures} consecutive checks`,
          error: lastError,
          timestamp: Date.now()
        });
      }
    }
    
    // Emit health change event
    if (previousStatus !== result.status) {
      this.emit('health:change', serviceName, result);
    }
    
    // Update metrics
    this.updateServiceMetrics(serviceName, result);
    
    return result;
  }
  
  /**
   * Update service metrics
   */
  updateServiceMetrics(serviceName, result) {
    if (!this.config.enableMetrics) return;
    
    let metrics = this.metrics.get(serviceName);
    if (!metrics) {
      metrics = {
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity,
        uptime: 100,
        history: []
      };
      this.metrics.set(serviceName, metrics);
    }
    
    metrics.totalChecks++;
    
    if (result.status === HealthStatus.HEALTHY) {
      metrics.successfulChecks++;
    } else {
      metrics.failedChecks++;
    }
    
    if (result.responseTime) {
      metrics.averageResponseTime = 
        (metrics.averageResponseTime * (metrics.totalChecks - 1) + result.responseTime) / metrics.totalChecks;
      metrics.maxResponseTime = Math.max(metrics.maxResponseTime, result.responseTime);
      metrics.minResponseTime = Math.min(metrics.minResponseTime, result.responseTime);
    }
    
    metrics.uptime = (metrics.successfulChecks / metrics.totalChecks) * 100;
    
    // Add to history
    metrics.history.push({
      timestamp: Date.now(),
      status: result.status,
      responseTime: result.responseTime
    });
    
    // Keep only recent history
    const cutoff = Date.now() - this.config.metricsWindow;
    metrics.history = metrics.history.filter(h => h.timestamp > cutoff);
    
    this.emit('metrics:updated', { service: serviceName, metrics });
  }
  
  /**
   * Check system resources
   */
  async checkSystemResources() {
    const cpuUsage = this.getCpuUsage();
    const memoryUsage = this.getMemoryUsage();
    const diskUsage = await this.getDiskUsage();
    
    const metrics = {
      cpu: cpuUsage,
      memory: memoryUsage,
      disk: diskUsage,
      timestamp: Date.now()
    };
    
    // Check thresholds
    if (cpuUsage > this.config.thresholds.cpu) {
      this.emit('alert:triggered', {
        type: 'high_cpu',
        severity: 'warning',
        message: `CPU usage is ${cpuUsage.toFixed(2)}%`,
        value: cpuUsage,
        threshold: this.config.thresholds.cpu,
        timestamp: Date.now()
      });
    }
    
    if (memoryUsage > this.config.thresholds.memory) {
      this.emit('alert:triggered', {
        type: 'high_memory',
        severity: 'warning',
        message: `Memory usage is ${memoryUsage.toFixed(2)}%`,
        value: memoryUsage,
        threshold: this.config.thresholds.memory,
        timestamp: Date.now()
      });
    }
    
    if (diskUsage > this.config.thresholds.disk) {
      this.emit('alert:triggered', {
        type: 'high_disk',
        severity: 'critical',
        message: `Disk usage is ${diskUsage.toFixed(2)}%`,
        value: diskUsage,
        threshold: this.config.thresholds.disk,
        timestamp: Date.now()
      });
    }
    
    // Update system metrics history
    this.systemMetrics.cpu.push({ value: cpuUsage, timestamp: Date.now() });
    this.systemMetrics.memory.push({ value: memoryUsage, timestamp: Date.now() });
    this.systemMetrics.disk.push({ value: diskUsage, timestamp: Date.now() });
    
    // Keep only recent data
    const cutoff = Date.now() - this.config.metricsWindow;
    this.systemMetrics.cpu = this.systemMetrics.cpu.filter(m => m.timestamp > cutoff);
    this.systemMetrics.memory = this.systemMetrics.memory.filter(m => m.timestamp > cutoff);
    this.systemMetrics.disk = this.systemMetrics.disk.filter(m => m.timestamp > cutoff);
    
    return metrics;
  }
  
  /**
   * Get CPU usage percentage
   */
  getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    return usage;
  }
  
  /**
   * Get memory usage percentage
   */
  getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usage = (usedMem / totalMem) * 100;
    
    return usage;
  }
  
  /**
   * Get disk usage percentage
   */
  async getDiskUsage() {
    const { exec } = require('child_process');
    
    return new Promise((resolve) => {
      exec("df -h / | awk 'NR==2 {print $5}'", (error, stdout, stderr) => {
        if (error) {
          resolve(0);
        } else {
          const usage = parseInt(stdout.trim().replace('%', ''), 10);
          resolve(usage || 0);
        }
      });
    });
  }
  
  /**
   * Update TDLib health status
   */
  updateTDLibHealth(status) {
    this.tdlibHealth = {
      ...this.tdlibHealth,
      ...status,
      lastUpdate: Date.now()
    };
    
    // Check TDLib health
    if (!this.tdlibHealth.connected) {
      this.emit('alert:triggered', {
        type: 'tdlib_disconnected',
        severity: 'critical',
        message: 'TDLib is disconnected',
        timestamp: Date.now()
      });
    }
    
    if (!this.tdlibHealth.authorized) {
      this.emit('alert:triggered', {
        type: 'tdlib_unauthorized',
        severity: 'warning',
        message: 'TDLib is not authorized',
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Update gateway metrics
   */
  updateGatewayMetrics(metrics) {
    this.gatewayMetrics = {
      ...this.gatewayMetrics,
      ...metrics,
      timestamp: Date.now()
    };
    
    // Check thresholds
    if (this.gatewayMetrics.errorRate > this.config.thresholds.errorRate) {
      this.emit('alert:triggered', {
        type: 'high_error_rate',
        severity: 'critical',
        message: `Error rate is ${this.gatewayMetrics.errorRate.toFixed(2)}%`,
        value: this.gatewayMetrics.errorRate,
        threshold: this.config.thresholds.errorRate,
        timestamp: Date.now()
      });
    }
    
    if (this.gatewayMetrics.averageLatency > this.config.thresholds.responseTime) {
      this.emit('alert:triggered', {
        type: 'high_latency',
        severity: 'warning',
        message: `Average latency is ${this.gatewayMetrics.averageLatency}ms`,
        value: this.gatewayMetrics.averageLatency,
        threshold: this.config.thresholds.responseTime,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Start monitoring all registered services
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Health monitor is already running');
      return;
    }
    
    this.isRunning = true;
    this.logger.info('Starting health monitor');
    
    // Start monitoring each service
    for (const [name, service] of this.services) {
      this.startServiceMonitoring(name);
    }
    
    // Start system resource monitoring
    this.systemMonitorInterval = setInterval(() => {
      this.checkSystemResources();
    }, 60000); // Check every minute
    
    // Initial checks
    await this.checkAllServices();
    await this.checkSystemResources();
    
    this.emit('monitor:started');
  }
  
  /**
   * Start monitoring a specific service
   */
  startServiceMonitoring(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) return;
    
    // Clear existing interval if any
    if (this.intervals.has(serviceName)) {
      clearInterval(this.intervals.get(serviceName));
    }
    
    // Set up periodic health check
    const interval = setInterval(() => {
      this.performHealthCheck(serviceName);
    }, service.interval);
    
    this.intervals.set(serviceName, interval);
    
    // Perform initial check
    this.performHealthCheck(serviceName);
  }
  
  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isRunning) {
      this.logger.warn('Health monitor is not running');
      return;
    }
    
    this.isRunning = false;
    this.logger.info('Stopping health monitor');
    
    // Clear all intervals
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
    
    // Clear system monitor interval
    if (this.systemMonitorInterval) {
      clearInterval(this.systemMonitorInterval);
      this.systemMonitorInterval = null;
    }
    
    this.emit('monitor:stopped');
  }
  
  /**
   * Check all services immediately
   */
  async checkAllServices() {
    const results = new Map();
    
    for (const serviceName of this.services.keys()) {
      const result = await this.performHealthCheck(serviceName);
      results.set(serviceName, result);
    }
    
    return results;
  }
  
  /**
   * Get current health status
   */
  getHealthStatus() {
    const services = {};
    const unhealthyServices = [];
    const degradedServices = [];
    
    for (const [name, service] of this.services) {
      services[name] = {
        status: service.status,
        lastCheck: service.lastCheck,
        responseTime: service.responseTime,
        consecutiveFailures: service.consecutiveFailures,
        critical: service.critical,
        error: service.errorMessage
      };
      
      if (service.status === HealthStatus.UNHEALTHY) {
        unhealthyServices.push(name);
      } else if (service.status === HealthStatus.DEGRADED) {
        degradedServices.push(name);
      }
    }
    
    // Determine overall status
    let overallStatus = HealthStatus.HEALTHY;
    
    if (unhealthyServices.some(name => this.services.get(name).critical)) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (unhealthyServices.length > 0) {
      overallStatus = HealthStatus.DEGRADED;
    } else if (degradedServices.length > 0) {
      overallStatus = HealthStatus.DEGRADED;
    }
    
    return {
      status: overallStatus,
      timestamp: Date.now(),
      services,
      unhealthyServices,
      degradedServices,
      system: {
        cpu: this.systemMetrics.cpu[this.systemMetrics.cpu.length - 1]?.value || 0,
        memory: this.systemMetrics.memory[this.systemMetrics.memory.length - 1]?.value || 0,
        disk: this.systemMetrics.disk[this.systemMetrics.disk.length - 1]?.value || 0
      },
      tdlib: this.tdlibHealth,
      gateway: this.gatewayMetrics,
      uptime: process.uptime()
    };
  }
  
  /**
   * Get service metrics
   */
  getServiceMetrics(serviceName) {
    const service = this.services.get(serviceName);
    const metrics = this.metrics.get(serviceName);
    
    if (!service || !metrics) {
      return null;
    }
    
    return {
      service: {
        name: serviceName,
        type: service.type,
        status: service.status,
        critical: service.critical
      },
      metrics: {
        ...metrics,
        currentStatus: service.status,
        lastCheck: service.lastCheck,
        lastResponseTime: service.responseTime
      }
    };
  }
  
  /**
   * Get all metrics
   */
  getAllMetrics() {
    const servicesMetrics = {};
    
    for (const serviceName of this.services.keys()) {
      servicesMetrics[serviceName] = this.getServiceMetrics(serviceName);
    }
    
    return {
      timestamp: Date.now(),
      services: servicesMetrics,
      system: {
        cpu: {
          current: this.systemMetrics.cpu[this.systemMetrics.cpu.length - 1]?.value || 0,
          average: this.calculateAverage(this.systemMetrics.cpu),
          max: this.calculateMax(this.systemMetrics.cpu),
          history: this.systemMetrics.cpu
        },
        memory: {
          current: this.systemMetrics.memory[this.systemMetrics.memory.length - 1]?.value || 0,
          average: this.calculateAverage(this.systemMetrics.memory),
          max: this.calculateMax(this.systemMetrics.memory),
          history: this.systemMetrics.memory
        },
        disk: {
          current: this.systemMetrics.disk[this.systemMetrics.disk.length - 1]?.value || 0,
          average: this.calculateAverage(this.systemMetrics.disk),
          max: this.calculateMax(this.systemMetrics.disk),
          history: this.systemMetrics.disk
        }
      },
      tdlib: this.tdlibHealth,
      gateway: this.gatewayMetrics
    };
  }
  
  /**
   * Calculate average from metrics array
   */
  calculateAverage(metrics) {
    if (metrics.length === 0) return 0;
    const sum = metrics.reduce((acc, m) => acc + m.value, 0);
    return sum / metrics.length;
  }
  
  /**
   * Calculate max from metrics array
   */
  calculateMax(metrics) {
    if (metrics.length === 0) return 0;
    return Math.max(...metrics.map(m => m.value));
  }
  
  /**
   * Handle health change event
   */
  handleHealthChange(serviceName, result) {
    const service = this.services.get(serviceName);
    
    this.logger.info(`Health status changed for ${serviceName}`, {
      previousStatus: service.status,
      newStatus: result.status,
      responseTime: result.responseTime,
      error: result.error
    });
    
    // Check dependencies
    if (result.status === HealthStatus.UNHEALTHY && service.dependencies.length > 0) {
      this.checkDependencies(serviceName);
    }
  }
  
  /**
   * Check service dependencies
   */
  async checkDependencies(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) return;
    
    for (const depName of service.dependencies) {
      const depService = this.services.get(depName);
      if (depService && depService.status === HealthStatus.HEALTHY) {
        // Trigger immediate check of healthy dependency
        await this.performHealthCheck(depName);
      }
    }
  }
  
  /**
   * Handle alert
   */
  handleAlert(alert) {
    if (!this.config.enableAlerts) return;
    
    // Log alert
    this.logger.error('Health alert triggered', alert);
    
    // Store alert
    if (!this.alerts.has(alert.type)) {
      this.alerts.set(alert.type, []);
    }
    this.alerts.get(alert.type).push(alert);
    
    // Keep only recent alerts
    const cutoff = Date.now() - this.config.metricsWindow;
    const alerts = this.alerts.get(alert.type).filter(a => a.timestamp > cutoff);
    this.alerts.set(alert.type, alerts);
    
    // Emit for external handlers
    this.emit('alert', alert);
  }
  
  /**
   * Update metrics history
   */
  updateMetricsHistory(data) {
    const { service, metrics } = data;
    
    if (!this.history.has(service)) {
      this.history.set(service, []);
    }
    
    const history = this.history.get(service);
    history.push({
      timestamp: Date.now(),
      metrics: { ...metrics }
    });
    
    // Keep only recent history
    const cutoff = Date.now() - this.config.metricsWindow;
    this.history.set(service, history.filter(h => h.timestamp > cutoff));
  }
  
  /**
   * Export metrics for monitoring systems
   */
  async exportMetrics(format = 'prometheus') {
    const metrics = this.getAllMetrics();
    
    switch (format) {
      case 'prometheus':
        return this.formatPrometheus(metrics);
      case 'json':
        return JSON.stringify(metrics, null, 2);
      case 'influx':
        return this.formatInflux(metrics);
      default:
        return metrics;
    }
  }
  
  /**
   * Format metrics for Prometheus
   */
  formatPrometheus(metrics) {
    let output = '';
    
    // Service metrics
    for (const [serviceName, data] of Object.entries(metrics.services)) {
      if (data) {
        const labels = `service="${serviceName}",type="${data.service.type}"`;
        output += `# HELP service_up Service health status (1=healthy, 0=unhealthy)\n`;
        output += `# TYPE service_up gauge\n`;
        output += `service_up{${labels}} ${data.service.status === HealthStatus.HEALTHY ? 1 : 0}\n`;
        
        output += `# HELP service_response_time_ms Service response time in milliseconds\n`;
        output += `# TYPE service_response_time_ms gauge\n`;
        output += `service_response_time_ms{${labels}} ${data.metrics.lastResponseTime || 0}\n`;
        
        output += `# HELP service_uptime_percent Service uptime percentage\n`;
        output += `# TYPE service_uptime_percent gauge\n`;
        output += `service_uptime_percent{${labels}} ${data.metrics.uptime || 0}\n`;
      }
    }
    
    // System metrics
    output += `# HELP system_cpu_usage_percent System CPU usage percentage\n`;
    output += `# TYPE system_cpu_usage_percent gauge\n`;
    output += `system_cpu_usage_percent ${metrics.system.cpu.current}\n`;
    
    output += `# HELP system_memory_usage_percent System memory usage percentage\n`;
    output += `# TYPE system_memory_usage_percent gauge\n`;
    output += `system_memory_usage_percent ${metrics.system.memory.current}\n`;
    
    output += `# HELP system_disk_usage_percent System disk usage percentage\n`;
    output += `# TYPE system_disk_usage_percent gauge\n`;
    output += `system_disk_usage_percent ${metrics.system.disk.current}\n`;
    
    // TDLib metrics
    output += `# HELP tdlib_connected TDLib connection status\n`;
    output += `# TYPE tdlib_connected gauge\n`;
    output += `tdlib_connected ${metrics.tdlib.connected ? 1 : 0}\n`;
    
    output += `# HELP tdlib_message_rate TDLib message rate per second\n`;
    output += `# TYPE tdlib_message_rate gauge\n`;
    output += `tdlib_message_rate ${metrics.tdlib.messageRate}\n`;
    
    // Gateway metrics
    output += `# HELP gateway_requests_per_second Gateway requests per second\n`;
    output += `# TYPE gateway_requests_per_second gauge\n`;
    output += `gateway_requests_per_second ${metrics.gateway.requestsPerSecond}\n`;
    
    output += `# HELP gateway_error_rate_percent Gateway error rate percentage\n`;
    output += `# TYPE gateway_error_rate_percent gauge\n`;
    output += `gateway_error_rate_percent ${metrics.gateway.errorRate}\n`;
    
    return output;
  }
  
  /**
   * Format metrics for InfluxDB
   */
  formatInflux(metrics) {
    const lines = [];
    const timestamp = Date.now() * 1000000; // Nanoseconds
    
    // Service metrics
    for (const [serviceName, data] of Object.entries(metrics.services)) {
      if (data) {
        lines.push(
          `service_health,service=${serviceName},type=${data.service.type} ` +
          `status="${data.service.status}",` +
          `response_time=${data.metrics.lastResponseTime || 0},` +
          `uptime=${data.metrics.uptime || 0} ${timestamp}`
        );
      }
    }
    
    // System metrics
    lines.push(
      `system_metrics ` +
      `cpu=${metrics.system.cpu.current},` +
      `memory=${metrics.system.memory.current},` +
      `disk=${metrics.system.disk.current} ${timestamp}`
    );
    
    // TDLib metrics
    lines.push(
      `tdlib_metrics ` +
      `connected=${metrics.tdlib.connected ? 1 : 0},` +
      `authorized=${metrics.tdlib.authorized ? 1 : 0},` +
      `message_rate=${metrics.tdlib.messageRate},` +
      `active_chats=${metrics.tdlib.activeChats} ${timestamp}`
    );
    
    // Gateway metrics
    lines.push(
      `gateway_metrics ` +
      `requests_per_second=${metrics.gateway.requestsPerSecond},` +
      `average_latency=${metrics.gateway.averageLatency},` +
      `error_rate=${metrics.gateway.errorRate},` +
      `active_connections=${metrics.gateway.activeConnections} ${timestamp}`
    );
    
    return lines.join('\n');
  }
  
  /**
   * Clean up resources
   */
  async cleanup() {
    this.stop();
    this.removeAllListeners();
    this.services.clear();
    this.checks.clear();
    this.metrics.clear();
    this.alerts.clear();
    this.history.clear();
    this.intervals.clear();
  }
}

module.exports = HealthMonitor;
