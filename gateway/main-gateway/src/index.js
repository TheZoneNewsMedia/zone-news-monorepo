/**
 * Zone News Main System API Gateway
 * Orchestrates all service gateways and provides unified access point
 * Integrates TDLib for advanced Telegram features
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const winston = require('winston');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Import services
const ServiceRegistry = require('./services/ServiceRegistry');
const HealthMonitor = require('./services/HealthMonitor');
const CircuitBreaker = require('./services/CircuitBreaker');
const AuthMiddleware = require('./middleware/AuthMiddleware');
const RequestTracker = require('./services/RequestTracker');
const GatewayOrchestrator = require('./services/GatewayOrchestrator');
const TDLibManager = require('./services/TDLibManager');

// Configuration
const config = {
  port: process.env.MAIN_GATEWAY_PORT || 8000,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0
  },
  tdlib: {
    apiId: process.env.TDLIB_API_ID,
    apiHash: process.env.TDLIB_API_HASH,
    sessionPath: process.env.TDLIB_SESSION_PATH || './data/tdlib-sessions',
    enableQRLogin: process.env.TDLIB_ENABLE_QR === 'true'
  },
  serviceGateways: {
    core: { url: 'http://localhost:8001', path: '/core' },
    user: { url: 'http://localhost:8002', path: '/user' },
    content: { url: 'http://localhost:8003', path: '/content' },
    frontend: { url: 'http://localhost:8004', path: '/frontend' },
    special: { url: 'http://localhost:8005', path: '/special' }
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
  },
  monitoring: {
    healthCheckInterval: 30000, // 30 seconds
    circuitBreakerThreshold: 5, // failures before opening circuit
    circuitBreakerTimeout: 60000 // 1 minute before retry
  }
};

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/main-gateway-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/main-gateway-combined.log' 
    })
  ]
});

// Initialize Redis client
const redis = new Redis(config.redis);
redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

// Initialize services
const serviceRegistry = new ServiceRegistry(redis, logger);
const healthMonitor = new HealthMonitor(serviceRegistry, logger);
const circuitBreaker = new CircuitBreaker(config.monitoring, logger);
const authMiddleware = new AuthMiddleware(redis, logger);
const requestTracker = new RequestTracker(redis, logger);
const gatewayOrchestrator = new GatewayOrchestrator(serviceRegistry, logger);
const tdlibManager = new TDLibManager(config.tdlib, redis, logger);

// Initialize Express app
const app = express();
const server = http.createServer(app);

// WebSocket server for TDLib real-time updates
const wss = new WebSocket.Server({ 
  server, 
  path: '/ws/tdlib',
  verifyClient: (info, cb) => {
    // Verify WebSocket connection authentication
    const token = info.req.headers.authorization;
    if (authMiddleware.verifyWebSocketToken(token)) {
      cb(true);
    } else {
      cb(false, 401, 'Unauthorized');
    }
  }
});

// WebSocket connection handler for TDLib updates
wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  logger.info(`WebSocket client connected: ${clientId}`);

  // Subscribe to TDLib updates
  tdlibManager.subscribeToUpdates(clientId, (update) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(update));
    }
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle TDLib commands via WebSocket
      if (data.type === 'tdlib_command') {
        const result = await tdlibManager.executeCommand(data.command, data.params);
        ws.send(JSON.stringify({ 
          type: 'tdlib_response', 
          requestId: data.requestId,
          result 
        }));
      }
    } catch (error) {
      logger.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error.message 
      }));
    }
  });

  ws.on('close', () => {
    logger.info(`WebSocket client disconnected: ${clientId}`);
    tdlibManager.unsubscribeFromUpdates(clientId);
  });
});

// Apply middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan('combined', { 
  stream: { 
    write: message => logger.info(message.trim()) 
  } 
}));

// Rate limiting
const limiter = rateLimit({
  ...config.rateLimit,
  store: new (require('rate-limit-redis'))({
    client: redis,
    prefix: 'rl:main:'
  })
});
app.use('/api', limiter);

// Request tracking middleware
app.use(async (req, res, next) => {
  req.requestId = uuidv4();
  req.startTime = Date.now();
  
  // Track request
  await requestTracker.trackRequest({
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Log response time
  res.on('finish', async () => {
    const duration = Date.now() - req.startTime;
    await requestTracker.updateRequest(req.requestId, {
      status: res.statusCode,
      duration
    });
    
    logger.info({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = await healthMonitor.getSystemHealth();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Service registry endpoint
app.get('/services', authMiddleware.verifyToken, async (req, res) => {
  const services = await serviceRegistry.getAllServices();
  res.json(services);
});

// TDLib management endpoints
app.post('/tdlib/initialize', authMiddleware.verifyToken, async (req, res) => {
  try {
    const result = await tdlibManager.initialize();
    res.json({ success: true, result });
  } catch (error) {
    logger.error('TDLib initialization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/tdlib/authenticate', authMiddleware.verifyToken, async (req, res) => {
  try {
    const { method, ...params } = req.body;
    const result = await tdlibManager.authenticate(method, params);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('TDLib authentication error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/tdlib/qr-code', authMiddleware.verifyToken, async (req, res) => {
  try {
    const qrCode = await tdlibManager.getQRCode();
    res.json({ success: true, qrCode });
  } catch (error) {
    logger.error('TDLib QR code error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/tdlib/command', authMiddleware.verifyToken, async (req, res) => {
  try {
    const { command, params } = req.body;
    const result = await tdlibManager.executeCommand(command, params);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('TDLib command error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Service gateway routing with circuit breaker
Object.entries(config.serviceGateways).forEach(([name, gateway]) => {
  const proxyMiddleware = createProxyMiddleware({
    target: gateway.url,
    changeOrigin: true,
    pathRewrite: {
      [`^${gateway.path}`]: ''
    },
    onProxyReq: (proxyReq, req, res) => {
      // Add request tracking headers
      proxyReq.setHeader('X-Request-ID', req.requestId);
      proxyReq.setHeader('X-Gateway-Time', Date.now());
      proxyReq.setHeader('X-Forwarded-Gateway', 'main');
    },
    onProxyRes: (proxyRes, req, res) => {
      // Track gateway response
      const gatewayTime = Date.now() - parseInt(proxyRes.headers['x-gateway-time'] || 0);
      logger.debug(`Gateway ${name} response time: ${gatewayTime}ms`);
    },
    onError: (err, req, res) => {
      logger.error(`Gateway ${name} proxy error:`, err);
      circuitBreaker.recordFailure(name);
      
      if (circuitBreaker.isOpen(name)) {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          service: name,
          retryAfter: circuitBreaker.getRetryTime(name)
        });
      } else {
        res.status(502).json({
          error: 'Gateway error',
          service: name
        });
      }
    }
  });

  // Apply circuit breaker check before proxying
  app.use(gateway.path, (req, res, next) => {
    if (circuitBreaker.isOpen(name)) {
      return res.status(503).json({
        error: 'Service circuit breaker open',
        service: name,
        retryAfter: circuitBreaker.getRetryTime(name)
      });
    }
    next();
  }, proxyMiddleware);
});

// Direct service access routes (backward compatibility)
app.use('/api/news', createProxyMiddleware({
  target: 'http://localhost:8001',
  changeOrigin: true,
  pathRewrite: { '^/api/news': '/news' }
}));

app.use('/api/bot', createProxyMiddleware({
  target: 'http://localhost:8001',
  changeOrigin: true,
  pathRewrite: { '^/api/bot': '/bot' }
}));

app.use('/api/auth', createProxyMiddleware({
  target: 'http://localhost:8002',
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/auth' }
}));

app.use('/telegram-mini-app', createProxyMiddleware({
  target: 'http://localhost:8004',
  changeOrigin: true
}));

// Global error handler
app.use((err, req, res, next) => {
  logger.error({
    requestId: req.requestId,
    error: err.message,
    stack: err.stack
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    requestId: req.requestId
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    availableGateways: Object.keys(config.serviceGateways).map(name => 
      config.serviceGateways[name].path
    )
  });
});

// Start server
const startServer = async () => {
  try {
    // Initialize TDLib
    await tdlibManager.initialize();
    logger.info('TDLib initialized successfully');

    // Connect to service gateways
    await gatewayOrchestrator.connectToGateways(config.serviceGateways);
    logger.info('Connected to all service gateways');

    // Start health monitoring
    healthMonitor.startMonitoring(config.monitoring.healthCheckInterval);
    logger.info('Health monitoring started');

    // Start server
    server.listen(config.port, () => {
      logger.info(`Main System Gateway running on port ${config.port}`);
      logger.info('Service gateways:', Object.keys(config.serviceGateways));
      logger.info('WebSocket endpoint: ws://localhost:' + config.port + '/ws/tdlib');
    });

    // Register with service discovery
    await serviceRegistry.registerService('main-gateway', {
      id: 'main-gateway-' + uuidv4(),
      name: 'Main System Gateway',
      version: '1.0.0',
      endpoint: `http://localhost:${config.port}`,
      health: `http://localhost:${config.port}/health`,
      metadata: {
        type: 'gateway',
        role: 'main',
        gateways: Object.keys(config.serviceGateways)
      }
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close WebSocket connections
  wss.clients.forEach(ws => {
    ws.close(1000, 'Server shutting down');
  });

  // Cleanup services
  await healthMonitor.stopMonitoring();
  await serviceRegistry.deregisterService('main-gateway');
  await tdlibManager.cleanup();
  await redis.quit();
  
  logger.info('Graceful shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// Start the server
startServer();

module.exports = { app, server };
