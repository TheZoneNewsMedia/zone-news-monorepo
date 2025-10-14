/**
 * Database Service - MongoDB connection and management for Zone News Bot
 * Handles database connections, health checks, and connection pooling
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectInterval = 5000; // 5 seconds
    this.healthCheckInterval = null;
    this.eventListenersSetup = false;
    this.connectionOptions = {
      serverSelectionTimeoutMS: 15000, // Increased from 5s to 15s
      heartbeatFrequencyMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 60000, // Increased from 45s to 60s
      connectTimeoutMS: 20000, // Added explicit connect timeout
      family: 4 // Use IPv4
    };
  }

  /**
   * Get the MongoDB database instance
   */
  get db() {
    if (!this.isConnected || !mongoose.connection.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return mongoose.connection.db;
  }

  /**
   * Connect to MongoDB
   */
  async connect(uri = process.env.MONGODB_URI) {
    if (this.isConnected) {
      logger.info('Database already connected');
      return this.connection;
    }

    try {
      // Validate URI
      if (!uri) {
        throw new Error('MongoDB URI is required');
      }

      logger.info('Connecting to MongoDB...');
      
      // Set up mongoose connection
      mongoose.set('strictQuery', false);
      
      // Connect with options
      this.connection = await mongoose.connect(uri, this.connectionOptions);
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Set up event listeners only on first connection
      if (!this.eventListenersSetup) {
        this.setupEventListeners();
        this.eventListenersSetup = true;
      }
      
      // Start health check
      this.startHealthCheck();
      
      logger.info('✅ MongoDB connected successfully');
      logger.info(`Database: ${this.connection.connection.name}`);
      logger.info(`Host: ${this.connection.connection.host}`);
      
      return this.connection;
    } catch (error) {
      logger.error('❌ MongoDB connection error:', error);
      this.isConnected = false;
      throw error; // Don't attempt reconnection here, let caller handle it
    }
  }

  /**
   * Set up MongoDB event listeners
   */
  setupEventListeners() {
    const db = mongoose.connection;

    db.on('connected', () => {
      logger.info('✅ MongoDB connected event');
      this.isConnected = true;
    });

    db.on('disconnected', () => {
      logger.warn('⚠️ MongoDB disconnected');
      this.isConnected = false;
      this.handleDisconnection();
    });

    db.on('reconnected', () => {
      logger.info('✅ MongoDB reconnected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    db.on('error', (error) => {
      logger.error('❌ MongoDB error:', error);
      this.isConnected = false;
      // Don't attempt reconnection on authentication errors
      if (error.name !== 'MongoAuthenticationError') {
        this.handleDisconnection();
      }
    });

    // Add connection pool monitoring
    db.on('fullsetup', () => {
      logger.info('✅ MongoDB replica set fully connected');
    });

    db.on('all', () => {
      logger.info('✅ MongoDB all servers connected');
    });

    db.on('close', () => {
      logger.info('MongoDB connection closed');
      this.isConnected = false;
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  /**
   * Handle disconnection and attempt reconnection
   */
  async handleDisconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      await this.reconnect();
    } else {
      logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
      this.stopHealthCheck();
    }
  }

  /**
   * Reconnect to MongoDB
   */
  async reconnect() {
    this.reconnectAttempts++;
    logger.info(`Attempting to reconnect to MongoDB (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    await new Promise(resolve => setTimeout(resolve, this.reconnectInterval));
    
    try {
      await this.connect(process.env.MONGODB_URI);
    } catch (error) {
      logger.error('Reconnection failed:', error);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        // Exponential backoff
        this.reconnectInterval = Math.min(this.reconnectInterval * 2, 60000);
        await this.reconnect();
      }
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    try {
      this.stopHealthCheck();
      
      if (this.isConnected && mongoose.connection) {
        await mongoose.connection.close();
        this.isConnected = false;
        this.connection = null;
        logger.info('✅ MongoDB disconnected gracefully');
      }
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', error);
    }
  }

  /**
   * Start health check interval
   */
  startHealthCheck() {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkHealth();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop health check interval
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Check database health
   */
  async checkHealth() {
    try {
      if (!this.isConnected) {
        logger.warn('Database health check: Not connected');
        return false;
      }

      // Ping the database
      const adminDb = mongoose.connection.db.admin();
      const result = await adminDb.ping();
      
      if (result.ok === 1) {
        return true;
      } else {
        logger.warn('Database health check failed');
        return false;
      }
    } catch (error) {
      logger.error('Database health check error:', error);
      this.isConnected = false;
      await this.handleDisconnection();
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      if (!this.isConnected) {
        return null;
      }

      const adminDb = mongoose.connection.db.admin();
      const dbStats = await mongoose.connection.db.stats();
      const serverStatus = await adminDb.serverStatus();

      return {
        database: mongoose.connection.name,
        collections: dbStats.collections,
        documents: dbStats.objects,
        dataSize: this.formatBytes(dbStats.dataSize),
        storageSize: this.formatBytes(dbStats.storageSize),
        indexes: dbStats.indexes,
        indexSize: this.formatBytes(dbStats.indexSize),
        avgObjSize: this.formatBytes(dbStats.avgObjSize),
        connections: {
          current: serverStatus.connections?.current,
          available: serverStatus.connections?.available,
          totalCreated: serverStatus.connections?.totalCreated
        },
        uptime: this.formatUptime(serverStatus.uptime),
        version: serverStatus.version,
        isConnected: this.isConnected
      };
    } catch (error) {
      logger.error('Error getting database stats:', error);
      return null;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName) {
    try {
      if (!this.isConnected) {
        return null;
      }

      const collection = mongoose.connection.db.collection(collectionName);
      const stats = await collection.stats();

      return {
        name: collectionName,
        count: stats.count,
        size: this.formatBytes(stats.size),
        avgObjSize: this.formatBytes(stats.avgObjSize),
        storageSize: this.formatBytes(stats.storageSize),
        totalIndexSize: this.formatBytes(stats.totalIndexSize),
        indexCount: stats.nindexes
      };
    } catch (error) {
      logger.error(`Error getting collection stats for ${collectionName}:`, error);
      return null;
    }
  }

  /**
   * Run database maintenance tasks
   */
  async runMaintenance() {
    try {
      if (!this.isConnected) {
        logger.warn('Cannot run maintenance: Database not connected');
        return;
      }

      logger.info('Running database maintenance...');

      // Compact collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      for (const collection of collections) {
        try {
          await mongoose.connection.db.command({
            compact: collection.name
          });
          logger.info(`Compacted collection: ${collection.name}`);
        } catch (error) {
          logger.warn(`Could not compact ${collection.name}:`, error.message);
        }
      }

      // Rebuild indexes
      for (const collection of collections) {
        try {
          const coll = mongoose.connection.db.collection(collection.name);
          await coll.reIndex();
          logger.info(`Reindexed collection: ${collection.name}`);
        } catch (error) {
          logger.warn(`Could not reindex ${collection.name}:`, error.message);
        }
      }

      logger.info('✅ Database maintenance completed');
    } catch (error) {
      logger.error('Error running maintenance:', error);
    }
  }

  /**
   * Create database backup metadata
   */
  async createBackupMetadata() {
    try {
      if (!this.isConnected) {
        return null;
      }

      const collections = await mongoose.connection.db.listCollections().toArray();
      const stats = await this.getStats();

      const metadata = {
        timestamp: new Date().toISOString(),
        database: mongoose.connection.name,
        host: mongoose.connection.host,
        collections: collections.map(c => ({
          name: c.name,
          type: c.type
        })),
        stats: stats,
        mongoVersion: mongoose.version
      };

      return metadata;
    } catch (error) {
      logger.error('Error creating backup metadata:', error);
      return null;
    }
  }

  /**
   * Test database write operations
   */
  async testWrite() {
    try {
      if (!this.isConnected) {
        return false;
      }

      // Create a test collection
      const testCollection = mongoose.connection.db.collection('_health_check');
      
      // Write test document
      const testDoc = {
        timestamp: new Date(),
        test: true,
        random: Math.random()
      };

      await testCollection.insertOne(testDoc);
      
      // Read it back
      const found = await testCollection.findOne({ _id: testDoc._id });
      
      // Delete it
      await testCollection.deleteOne({ _id: testDoc._id });

      return found !== null;
    } catch (error) {
      logger.error('Database write test failed:', error);
      return false;
    }
  }

  /**
   * Get slow queries
   */
  async getSlowQueries(thresholdMs = 100) {
    try {
      if (!this.isConnected) {
        return [];
      }

      const adminDb = mongoose.connection.db.admin();
      const result = await adminDb.command({
        currentOp: true,
        $all: true,
        active: true,
        microsecs_running: { $gte: thresholdMs * 1000 }
      });

      return result.inprog || [];
    } catch (error) {
      logger.error('Error getting slow queries:', error);
      return [];
    }
  }

  /**
   * Kill slow operations
   */
  async killSlowOperations(thresholdMs = 60000) {
    try {
      const slowOps = await this.getSlowQueries(thresholdMs);
      let killed = 0;

      for (const op of slowOps) {
        if (op.opid && !op.op?.includes('command')) {
          try {
            await mongoose.connection.db.admin().command({
              killOp: 1,
              op: op.opid
            });
            killed++;
            logger.info(`Killed slow operation: ${op.opid}`);
          } catch (error) {
            logger.warn(`Could not kill operation ${op.opid}:`, error.message);
          }
        }
      }

      return killed;
    } catch (error) {
      logger.error('Error killing slow operations:', error);
      return 0;
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format uptime to human readable
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Check if connected
   */
  isDbConnected() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * Get connection state
   */
  getConnectionState() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized'
    };

    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      stateText: states[mongoose.connection.readyState] || 'unknown',
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  /**
   * Initialize indexes for all collections
   */
  async initializeIndexes() {
    try {
      logger.info('Initializing database indexes...');

      // Define indexes for each collection
      const indexes = {
        users: [
          { telegramId: 1 },
          { username: 1 },
          { createdAt: -1 }
        ],
        articles: [
          { publishedAt: -1 },
          { category: 1, publishedAt: -1 },
          { tags: 1 },
          { title: 'text', content: 'text' }
        ],
        subscriptions: [
          { userId: 1, channelId: 1 },
          { userId: 1, topic: 1 },
          { isActive: 1 }
        ],
        scheduledposts: [
          { scheduledTime: 1, status: 1 },
          { recurringPattern: 1 },
          { createdBy: 1 }
        ],
        messagequeues: [
          { status: 1, priority: -1, createdAt: 1 },
          { chatId: 1, status: 1 },
          { scheduledFor: 1 }
        ],
        reactions: [
          { messageId: 1, userId: 1 },
          { messageId: 1 },
          { userId: 1 }
        ]
      };

      for (const [collectionName, collectionIndexes] of Object.entries(indexes)) {
        try {
          const collection = mongoose.connection.db.collection(collectionName);
          
          for (const index of collectionIndexes) {
            await collection.createIndex(index);
          }
          
          logger.info(`✅ Indexes created for ${collectionName}`);
        } catch (error) {
          logger.warn(`Could not create indexes for ${collectionName}:`, error.message);
        }
      }

      logger.info('✅ All indexes initialized');
    } catch (error) {
      logger.error('Error initializing indexes:', error);
    }
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(daysToKeep = 30) {
    try {
      logger.info(`Cleaning up data older than ${daysToKeep} days...`);
      
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      const results = {};

      // Clean up old messages from queue
      const messageQueue = mongoose.connection.db.collection('messagequeues');
      const messagesDeleted = await messageQueue.deleteMany({
        status: { $in: ['sent', 'failed'] },
        createdAt: { $lt: cutoffDate }
      });
      results.messageQueue = messagesDeleted.deletedCount;

      // Clean up old stats
      const dailyStats = mongoose.connection.db.collection('dailystats');
      const statsDeleted = await dailyStats.deleteMany({
        date: { $lt: cutoffDate }
      });
      results.dailyStats = statsDeleted.deletedCount;

      // Archive old articles
      const articles = mongoose.connection.db.collection('articles');
      const articlesArchived = await articles.updateMany(
        { publishedAt: { $lt: cutoffDate }, isActive: true },
        { $set: { isActive: false } }
      );
      results.articlesArchived = articlesArchived.modifiedCount;

      logger.info('✅ Cleanup completed:', results);
      return results;
    } catch (error) {
      logger.error('Error cleaning up old data:', error);
      return null;
    }
  }
}

// Export singleton instance
module.exports = new DatabaseService();
