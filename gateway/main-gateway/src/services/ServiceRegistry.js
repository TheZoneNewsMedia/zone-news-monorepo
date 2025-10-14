/**
 * Zone News Service Registry
 * Dynamic service registration and discovery for the hierarchical gateway system
 * Manages all 18 monorepo services across 5 service gateways
 */

const EventEmitter = require('events');
const axios = require('axios');
const logger = require('./Logger');

class ServiceRegistry extends EventEmitter {
  constructor(redisClient) {
    super();
    this.redis = redisClient;
    this.services = new Map();
    this.healthCheckInterval = null;
    this.serviceGateways = {
      core: {
        url: 'http://localhost:8001',
        name: 'Core Services Gateway',
        services: ['api', 'auth', 'database']
      },
      user: {
        url: 'http://localhost:8002',
        name: 'User Services Gateway',
        services: ['user-service', 'admin', 'subscription']
      },
      content: {
        url: 'http://localhost:8003',
        name: 'Content Services Gateway',
        services: ['bot', 'content-delivery', 'media-processor', 'scraper']
      },
      frontend: {
        url: 'http://localhost:8004',
        name: 'Frontend Services Gateway',
        services: ['web', 'telegram-mini-app', 'admin-dashboard']
      },
      special: {
        url: 'http://localhost:8005',
        name: 'Special Services Gateway',
        services: ['tdlib', 'websocket', 'notification', 'analytics']
      }
    };
    
    // Initialize service metadata
    this.serviceMetadata = {
      // Core Services (Port 8001)
      'api': {
        port: 3001,
        gateway: 'core',
        description: 'Main API service',
        healthEndpoint: '/health',
        priority: 1,
        dependencies: ['database', 'auth']
      },
      'auth': {
        port: 3002,
        gateway: 'core',
        description: 'Authentication service',
        healthEndpoint: '/health',
        priority: 1,
        dependencies: ['database']
      },
      'database': {
        port: 27017,
        gateway: 'core',
        description: 'MongoDB database',
        healthEndpoint: null,
        priority: 0,
        dependencies: []
      },
      
      // User Services (Port 8002)
      'user-service': {
        port: 3003,
        gateway: 'user',
        description: 'User management service',
        healthEndpoint: '/health',
        priority: 2,
        dependencies: ['auth', 'database']
      },
      'admin': {
        port: 3004,
        gateway: 'user',
        description: 'Admin panel service',
        healthEndpoint: '/health',
        priority: 3,
        dependencies: ['auth', 'api']
      },
      'subscription': {
        port: 3005,
        gateway: 'user',
        description: 'Subscription management',
        healthEndpoint: '/health',
        priority: 3,
        dependencies: ['user-service', 'database']
      },
      
      // Content Services (Port 8003)
      'bot': {
        port: 3006,
        gateway: 'content',
        description: 'Telegram bot service',
        healthEndpoint: '/health',
        priority: 2,
        dependencies: ['api', 'tdlib']
      },
      'content-delivery': {
        port: 3007,
        gateway: 'content',
        description: 'Content delivery network',
        healthEndpoint: '/health',
        priority: 2,
        dependencies: ['database', 'media-processor']
      },
      'media-processor': {
        port: 3008,
        gateway: 'content',
        description: 'Media processing service',
        healthEndpoint: '/health',
        priority: 2,
        dependencies: ['database']
      },
      'scraper': {
        port: 3009,
        gateway: 'content',
        description: 'News scraping service',
        healthEndpoint: '/health',
        priority: 3,
        dependencies: ['database', 'api']
      },
      
      // Frontend Services (Port 8004)
      'web': {
        port: 3010,
        gateway: 'frontend',
        description: 'Main website',
        healthEndpoint: '/health',
        priority: 2,
        dependencies: ['api', 'auth']
      },
      'telegram-mini-app': {
        port: 3011,
        gateway: 'frontend',
        description: 'Telegram Mini App',
        healthEndpoint: '/health',
        priority: 2,
        dependencies: ['api', 'bot']
      },
      'admin-dashboard': {
        port: 3012,
        gateway: 'frontend',
        description: 'Admin dashboard UI',
        healthEndpoint: '/health',
        priority: 3,
        dependencies: ['admin', 'api']
      },
      
      // Special Services (Port 8005)
      'tdlib': {
        port: 8006,
        gateway: 'special',
        description: 'TDLib integration service',
        healthEndpoint: '/health',
        priority: 1,
        dependencies: ['database']
      },
      'websocket': {
        port: 8007,
        gateway: 'special',
        description: 'WebSocket server',
        healthEndpoint: '/health',
        priority: 2,
        dependencies: ['api']
      },
      'notification': {
        port: 8008,
        gateway: 'special',
        description: 'Notification service',
        healthEndpoint: '/health',
        priority: 3,
        dependencies: ['user-service', 'websocket']
      },
      'analytics': {
        port: 8009,
        gateway: 'special',
        description: 'Analytics service',
        healthEndpoint: '/health',
        priority: 3,
        dependencies: ['database', 'api']
      }
    };
  }

  /**
   * Initialize the service registry
   */
  async initialize() {
    logger.info('Initializing Service Registry');
    
    // Load persisted service states from Redis
    await this.loadPersistedServices();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Auto-discover services
    await this.discoverServices();
    
    logger.info(`Service Registry initialized with ${this.services.size} services`);
  }

  /**
   * Register a service
   */
  async registerService(serviceId, metadata = {}) {
    const serviceInfo = {
      id: serviceId,
      ...this.serviceMetadata[serviceId],
      ...metadata,
      status: 'registered',
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      health: 'unknown',
      metrics: {
        requests: 0,
        errors: 0,
        latency: 0
      }
    };

    this.services.set(serviceId, serviceInfo);
    
    // Persist to Redis
    await this.redis.setex(
      `service:${serviceId}`,
      3600, // 1 hour TTL
      JSON.stringify(serviceInfo)
    );

    // Emit registration event
    this.emit('service:registered', serviceInfo);
    
    logger.info(`Service registered: ${serviceId}`, {
      gateway: serviceInfo.gateway,
      port: serviceInfo.port
    });

    return serviceInfo;
  }

  /**
   * Deregister a service
   */
  async deregisterService(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    this.services.delete(serviceId);
    await this.redis.del(`service:${serviceId}`);
    
    this.emit('service:deregistered', service);
    logger.info(`Service deregistered: ${serviceId}`);
    
    return true;
  }

  /**
   * Get service information
   */
  getService(serviceId) {
    return this.services.get(serviceId);
  }

  /**
   * Get all services for a gateway
   */
  getGatewayServices(gatewayId) {
    const services = [];
    for (const [id, service] of this.services) {
      if (service.gateway === gatewayId) {
        services.push(service);
      }
    }
    return services;
  }

  /**
   * Get all healthy services
   */
  getHealthyServices() {
    const healthy = [];
    for (const [id, service] of this.services) {
      if (service.health === 'healthy') {
        healthy.push(service);
      }
    }
    return healthy;
  }

  /**
   * Update service health status
   */
  async updateServiceHealth(serviceId, health, details = {}) {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    const previousHealth = service.health;
    service.health = health;
    service.lastHealthCheck = new Date();
    service.healthDetails = details;

    // Update Redis
    await this.redis.setex(
      `service:${serviceId}`,
      3600,
      JSON.stringify(service)
    );

    // Emit health change event if status changed
    if (previousHealth !== health) {
      this.emit('service:health:changed', {
        service,
        previousHealth,
        newHealth: health
      });

      logger.info(`Service health changed: ${serviceId}`, {
        from: previousHealth,
        to: health
      });
    }

    return true;
  }

  /**
   * Update service metrics
   */
  async updateServiceMetrics(serviceId, metrics) {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    service.metrics = {
      ...service.metrics,
      ...metrics,
      lastUpdated: new Date()
    };

    // Update Redis
    await this.redis.setex(
      `service:${serviceId}`,
      3600,
      JSON.stringify(service)
    );

    return true;
  }

  /**
   * Discover services automatically
   */
  async discoverServices() {
    logger.info('Starting service discovery');
    
    const discoveryPromises = [];
    
    // Check each service gateway
    for (const [gatewayId, gateway] of Object.entries(this.serviceGateways)) {
      discoveryPromises.push(this.discoverGatewayServices(gatewayId, gateway));
    }

    // Check individual services
    for (const [serviceId, metadata] of Object.entries(this.serviceMetadata)) {
      if (metadata.port) {
        discoveryPromises.push(this.checkServiceAvailability(serviceId, metadata));
      }
    }

    await Promise.allSettled(discoveryPromises);
    
    logger.info(`Service discovery complete: ${this.services.size} services found`);
  }

  /**
   * Discover services for a specific gateway
   */
  async discoverGatewayServices(gatewayId, gateway) {
    try {
      const response = await axios.get(`${gateway.url}/services`, {
        timeout: 5000
      });

      if (response.data && response.data.services) {
        for (const service of response.data.services) {
          await this.registerService(service.id, {
            ...service,
            discoveredVia: 'gateway',
            gateway: gatewayId
          });
        }
      }
    } catch (error) {
      logger.warn(`Failed to discover services from gateway ${gatewayId}:`, error.message);
    }
  }

  /**
   * Check if a service is available
   */
  async checkServiceAvailability(serviceId, metadata) {
    try {
      const url = `http://localhost:${metadata.port}${metadata.healthEndpoint || '/health'}`;
      const response = await axios.get(url, { timeout: 3000 });
      
      if (response.status === 200) {
        await this.registerService(serviceId, {
          discoveredVia: 'direct',
          health: 'healthy'
        });
        return true;
      }
    } catch (error) {
      // Service not available
      logger.debug(`Service ${serviceId} not available on port ${metadata.port}`);
    }
    return false;
  }

  /**
   * Start health monitoring for all services
   */
  startHealthMonitoring() {
    // Clear existing interval if any
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000);

    // Perform initial health check
    this.performHealthChecks();
  }

  /**
   * Perform health checks on all registered services
   */
  async performHealthChecks() {
    const healthChecks = [];
    
    for (const [serviceId, service] of this.services) {
      if (service.healthEndpoint) {
        healthChecks.push(this.checkServiceHealth(serviceId, service));
      }
    }

    await Promise.allSettled(healthChecks);
  }

  /**
   * Check health of a specific service
   */
  async checkServiceHealth(serviceId, service) {
    try {
      const url = `http://localhost:${service.port}${service.healthEndpoint}`;
      const response = await axios.get(url, { timeout: 5000 });
      
      const healthData = response.data || {};
      const isHealthy = response.status === 200 && 
                       (!healthData.status || healthData.status === 'healthy');
      
      await this.updateServiceHealth(
        serviceId,
        isHealthy ? 'healthy' : 'unhealthy',
        healthData
      );
    } catch (error) {
      await this.updateServiceHealth(serviceId, 'unhealthy', {
        error: error.message
      });
    }
  }

  /**
   * Load persisted services from Redis
   */
  async loadPersistedServices() {
    try {
      const keys = await this.redis.keys('service:*');
      
      for (const key of keys) {
        const serviceData = await this.redis.get(key);
        if (serviceData) {
          const service = JSON.parse(serviceData);
          this.services.set(service.id, service);
        }
      }
      
      logger.info(`Loaded ${keys.length} persisted services from Redis`);
    } catch (error) {
      logger.error('Failed to load persisted services:', error);
    }
  }

  /**
   * Get service dependency graph
   */
  getDependencyGraph() {
    const graph = {};
    
    for (const [serviceId, service] of this.services) {
      graph[serviceId] = {
        dependencies: service.dependencies || [],
        dependents: []
      };
    }

    // Build dependents list
    for (const [serviceId, service] of this.services) {
      if (service.dependencies) {
        for (const dep of service.dependencies) {
          if (graph[dep]) {
            graph[dep].dependents.push(serviceId);
          }
        }
      }
    }

    return graph;
  }

  /**
   * Check if all service dependencies are healthy
   */
  async checkDependencies(serviceId) {
    const service = this.services.get(serviceId);
    if (!service || !service.dependencies) {
      return true;
    }

    for (const depId of service.dependencies) {
      const dep = this.services.get(depId);
      if (!dep || dep.health !== 'healthy') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get service topology sorted by priority
   */
  getServiceTopology() {
    const topology = [];
    const visited = new Set();
    
    // Sort services by priority
    const sortedServices = Array.from(this.services.values())
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));
    
    for (const service of sortedServices) {
      if (!visited.has(service.id)) {
        this.topologicalSort(service.id, visited, topology);
      }
    }

    return topology;
  }

  /**
   * Topological sort helper
   */
  topologicalSort(serviceId, visited, result) {
    if (visited.has(serviceId)) {
      return;
    }

    visited.add(serviceId);
    const service = this.services.get(serviceId);
    
    if (service && service.dependencies) {
      for (const dep of service.dependencies) {
        this.topologicalSort(dep, visited, result);
      }
    }

    if (service) {
      result.push(service);
    }
  }

  /**
   * Get registry statistics
   */
  getStatistics() {
    const stats = {
      totalServices: this.services.size,
      byGateway: {},
      byHealth: {
        healthy: 0,
        unhealthy: 0,
        unknown: 0
      },
      byStatus: {}
    };

    for (const [id, service] of this.services) {
      // By gateway
      if (!stats.byGateway[service.gateway]) {
        stats.byGateway[service.gateway] = 0;
      }
      stats.byGateway[service.gateway]++;

      // By health
      const health = service.health || 'unknown';
      stats.byHealth[health]++;

      // By status
      const status = service.status || 'unknown';
      if (!stats.byStatus[status]) {
        stats.byStatus[status] = 0;
      }
      stats.byStatus[status]++;
    }

    return stats;
  }

  /**
   * Shutdown the registry
   */
  async shutdown() {
    logger.info('Shutting down Service Registry');
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Mark all services as shutting down
    for (const [id, service] of this.services) {
      service.status = 'shutting_down';
      await this.redis.setex(
        `service:${id}`,
        60, // Short TTL for shutdown state
        JSON.stringify(service)
      );
    }

    this.emit('registry:shutdown');
  }
}

module.exports = ServiceRegistry;
