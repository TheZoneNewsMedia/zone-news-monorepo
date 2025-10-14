/**
 * Database Indexing Service
 * Optimizes MongoDB queries with proper indexes
 */

const { logger } = require('./logger-service');

class DatabaseIndexingService {
    constructor(db) {
        this.db = db;
        this.indexes = this.getIndexDefinitions();
        this.performanceMetrics = {};
    }
    
    /**
     * Get all index definitions for collections
     */
    getIndexDefinitions() {
        return {
            // Users collection
            users: [
                { 
                    keys: { telegram_id: 1 }, 
                    options: { unique: true, background: true },
                    description: 'Unique user telegram ID lookup'
                },
                { 
                    keys: { username: 1 }, 
                    options: { background: true, sparse: true },
                    description: 'Username search'
                },
                { 
                    keys: { lastActive: -1 }, 
                    options: { background: true },
                    description: 'Active users sorting'
                },
                { 
                    keys: { createdAt: -1 }, 
                    options: { background: true },
                    description: 'New users sorting'
                },
                {
                    keys: { subscription_tier: 1, lastActive: -1 },
                    options: { background: true },
                    description: 'Premium users activity'
                }
            ],
            
            // News articles collection
            news_articles: [
                {
                    keys: { 'zone_news_data.message_id': 1 },
                    options: { background: true, sparse: true },
                    description: 'Message ID lookup for reactions'
                },
                {
                    keys: { published_date: -1 },
                    options: { background: true },
                    description: 'Latest articles sorting'
                },
                {
                    keys: { category: 1, published_date: -1 },
                    options: { background: true },
                    description: 'Category-based article listing'
                },
                {
                    keys: { views: -1 },
                    options: { background: true },
                    description: 'Popular articles sorting'
                },
                {
                    keys: { title: 'text', content: 'text', summary: 'text' },
                    options: { background: true },
                    description: 'Full-text search'
                },
                {
                    keys: { author_id: 1, published_date: -1 },
                    options: { background: true, sparse: true },
                    description: 'Author articles listing'
                },
                {
                    keys: { status: 1, published_date: -1 },
                    options: { background: true },
                    description: 'Draft/published filtering'
                },
                {
                    keys: { 'zone_news_data.channel': 1, 'zone_news_data.message_id': 1 },
                    options: { background: true, sparse: true },
                    description: 'Channel-specific message lookup'
                }
            ],
            
            // Reactions collection
            zone_persistent_reactions: [
                {
                    keys: { message_id: 1 },
                    options: { unique: true, background: true },
                    description: 'Unique message reaction tracking'
                },
                {
                    keys: { 'zone_news_data.channel': 1, 'zone_news_data.message_id': 1 },
                    options: { background: true },
                    description: 'Channel-message reaction lookup'
                },
                {
                    keys: { last_updated: -1 },
                    options: { background: true },
                    description: 'Recent reaction updates'
                },
                {
                    keys: { total_reactions: -1 },
                    options: { background: true },
                    description: 'Most reacted posts'
                }
            ],
            
            // User reactions collection
            user_reactions: [
                {
                    keys: { user_id: 1, message_id: 1, emoji: 1 },
                    options: { unique: true, background: true },
                    description: 'Prevent duplicate reactions'
                },
                {
                    keys: { message_id: 1 },
                    options: { background: true },
                    description: 'All reactions for a message'
                },
                {
                    keys: { user_id: 1, timestamp: -1 },
                    options: { background: true },
                    description: 'User reaction history'
                }
            ],
            
            // Subscriptions collection
            subscriptions: [
                {
                    keys: { user_id: 1 },
                    options: { unique: true, background: true },
                    description: 'User subscription lookup'
                },
                {
                    keys: { status: 1, expires_at: 1 },
                    options: { background: true },
                    description: 'Active subscription filtering'
                },
                {
                    keys: { expires_at: 1 },
                    options: { background: true },
                    description: 'Expiration monitoring'
                }
            ],
            
            // Payment intents collection
            payment_intents: [
                {
                    keys: { user_id: 1, created_at: -1 },
                    options: { background: true },
                    description: 'User payment history'
                },
                {
                    keys: { status: 1, created_at: -1 },
                    options: { background: true },
                    description: 'Payment status filtering'
                },
                {
                    keys: { payment_intent_id: 1 },
                    options: { unique: true, background: true, sparse: true },
                    description: 'Stripe payment intent lookup'
                }
            ],
            
            // Affiliates collection
            affiliates: [
                {
                    keys: { user_id: 1 },
                    options: { unique: true, background: true },
                    description: 'User affiliate account'
                },
                {
                    keys: { code: 1 },
                    options: { unique: true, background: true },
                    description: 'Affiliate code lookup'
                },
                {
                    keys: { total_earnings: -1 },
                    options: { background: true },
                    description: 'Top earners sorting'
                }
            ],
            
            // Referrals collection
            referrals: [
                {
                    keys: { referred_user_id: 1 },
                    options: { unique: true, background: true },
                    description: 'Prevent duplicate referrals'
                },
                {
                    keys: { referring_user_id: 1, created_at: -1 },
                    options: { background: true },
                    description: 'User referral history'
                },
                {
                    keys: { status: 1, created_at: -1 },
                    options: { background: true },
                    description: 'Referral status tracking'
                }
            ],
            
            // Admin config collection
            admin_config: [
                {
                    keys: { telegram_id: 1 },
                    options: { unique: true, background: true },
                    description: 'Admin user lookup'
                }
            ],
            
            // Analytics collection (if exists)
            analytics_events: [
                {
                    keys: { user_id: 1, event_type: 1, timestamp: -1 },
                    options: { background: true },
                    description: 'User event tracking'
                },
                {
                    keys: { event_type: 1, timestamp: -1 },
                    options: { background: true },
                    description: 'Event type analytics'
                },
                {
                    keys: { timestamp: -1 },
                    options: { 
                        background: true,
                        expireAfterSeconds: 2592000 // 30 days TTL
                    },
                    description: 'Auto-cleanup old events'
                }
            ]
        };
    }
    
    /**
     * Initialize all indexes
     */
    async initializeIndexes() {
        logger.info('Starting database index initialization');
        
        const results = {
            created: [],
            existing: [],
            errors: [],
            totalTime: 0
        };
        
        const startTime = Date.now();
        
        for (const [collectionName, indexes] of Object.entries(this.indexes)) {
            try {
                const collection = this.db.collection(collectionName);
                
                // Check if collection exists
                const collections = await this.db.listCollections({ name: collectionName }).toArray();
                if (collections.length === 0) {
                    logger.debug(`Skipping indexes for non-existent collection: ${collectionName}`);
                    continue;
                }
                
                for (const indexDef of indexes) {
                    try {
                        const indexName = await this.createIndex(
                            collection,
                            indexDef.keys,
                            indexDef.options,
                            indexDef.description
                        );
                        
                        if (indexName) {
                            results.created.push({
                                collection: collectionName,
                                index: indexName,
                                description: indexDef.description
                            });
                        } else {
                            results.existing.push({
                                collection: collectionName,
                                keys: indexDef.keys,
                                description: indexDef.description
                            });
                        }
                    } catch (error) {
                        results.errors.push({
                            collection: collectionName,
                            keys: indexDef.keys,
                            error: error.message
                        });
                        logger.error('Index creation failed', {
                            collection: collectionName,
                            keys: indexDef.keys,
                            error: error.message
                        });
                    }
                }
            } catch (error) {
                logger.error(`Failed to process collection ${collectionName}`, {
                    error: error.message
                });
            }
        }
        
        results.totalTime = Date.now() - startTime;
        
        // Log summary
        logger.info('Database indexing complete', {
            created: results.created.length,
            existing: results.existing.length,
            errors: results.errors.length,
            duration: `${results.totalTime}ms`
        });
        
        if (results.created.length > 0) {
            logger.info('New indexes created:', results.created);
        }
        
        if (results.errors.length > 0) {
            logger.warn('Index creation errors:', results.errors);
        }
        
        return results;
    }
    
    /**
     * Create a single index
     */
    async createIndex(collection, keys, options = {}, description) {
        try {
            // Check if index already exists
            const existingIndexes = await collection.indexes();
            const keyPattern = JSON.stringify(keys);
            
            const exists = existingIndexes.some(idx => 
                JSON.stringify(idx.key) === keyPattern
            );
            
            if (exists) {
                logger.debug(`Index already exists: ${collection.collectionName}`, { keys });
                return null;
            }
            
            // Create index with options
            const indexOptions = {
                ...options,
                name: this.generateIndexName(keys, description)
            };
            
            const indexName = await collection.createIndex(keys, indexOptions);
            
            logger.info(`Created index: ${indexName}`, {
                collection: collection.collectionName,
                keys,
                description
            });
            
            return indexName;
        } catch (error) {
            if (error.code === 85) {
                // Index already exists with different options
                logger.debug('Index exists with different options', { keys });
                return null;
            }
            throw error;
        }
    }
    
    /**
     * Generate index name from keys
     */
    generateIndexName(keys, description) {
        const keyParts = Object.entries(keys).map(([field, direction]) => {
            if (direction === 'text') return `${field}_text`;
            return `${field}_${direction === 1 ? 'asc' : 'desc'}`;
        });
        
        const name = keyParts.join('_').substring(0, 63);
        return name;
    }
    
    /**
     * Analyze index usage
     */
    async analyzeIndexUsage(collectionName) {
        const collection = this.db.collection(collectionName);
        
        try {
            // Get index stats
            const stats = await collection.aggregate([
                { $indexStats: {} }
            ]).toArray();
            
            const analysis = stats.map(stat => ({
                name: stat.name,
                usageCount: stat.accesses?.ops || 0,
                lastUsed: stat.accesses?.since || null,
                size: stat.size || 0
            }));
            
            // Sort by usage count
            analysis.sort((a, b) => b.usageCount - a.usageCount);
            
            logger.info(`Index usage analysis for ${collectionName}:`, analysis);
            
            return analysis;
        } catch (error) {
            logger.error(`Failed to analyze index usage for ${collectionName}`, {
                error: error.message
            });
            return [];
        }
    }
    
    /**
     * Optimize slow queries
     */
    async optimizeSlowQueries() {
        const slowQueries = [];
        
        try {
            // Get slow query log from MongoDB
            const adminDb = this.db.admin();
            const profile = await adminDb.command({
                profile: 2,
                slowms: 100
            });
            
            // Get recent slow queries
            const systemProfile = this.db.collection('system.profile');
            const queries = await systemProfile.find({
                millis: { $gt: 100 }
            }).sort({ ts: -1 }).limit(50).toArray();
            
            for (const query of queries) {
                slowQueries.push({
                    collection: query.ns,
                    operation: query.op,
                    duration: query.millis,
                    timestamp: query.ts,
                    query: query.command?.filter || query.command
                });
            }
            
            logger.warn('Slow queries detected:', slowQueries);
            
            // Suggest indexes for slow queries
            const suggestions = this.suggestIndexes(slowQueries);
            
            return {
                slowQueries,
                suggestions
            };
        } catch (error) {
            logger.error('Failed to optimize slow queries', {
                error: error.message
            });
            return { slowQueries: [], suggestions: [] };
        }
    }
    
    /**
     * Suggest indexes based on slow queries
     */
    suggestIndexes(slowQueries) {
        const suggestions = [];
        const queryPatterns = {};
        
        for (const query of slowQueries) {
            if (!query.query) continue;
            
            const fields = Object.keys(query.query);
            const pattern = fields.sort().join(',');
            
            if (!queryPatterns[pattern]) {
                queryPatterns[pattern] = {
                    fields,
                    count: 0,
                    totalDuration: 0,
                    collection: query.collection
                };
            }
            
            queryPatterns[pattern].count++;
            queryPatterns[pattern].totalDuration += query.duration;
        }
        
        // Create suggestions for frequent patterns
        for (const [pattern, data] of Object.entries(queryPatterns)) {
            if (data.count >= 3 || data.totalDuration > 500) {
                const indexKeys = {};
                data.fields.forEach(field => {
                    indexKeys[field] = 1;
                });
                
                suggestions.push({
                    collection: data.collection,
                    suggestedIndex: indexKeys,
                    reason: `${data.count} slow queries, ${data.totalDuration}ms total`,
                    impact: 'HIGH'
                });
            }
        }
        
        return suggestions;
    }
    
    /**
     * Remove unused indexes
     */
    async removeUnusedIndexes(dryRun = true) {
        const removed = [];
        
        for (const collectionName of Object.keys(this.indexes)) {
            const usage = await this.analyzeIndexUsage(collectionName);
            
            for (const index of usage) {
                // Skip primary key and recently used indexes
                if (index.name === '_id_' || index.usageCount > 0) continue;
                
                // Check if index hasn't been used in 30 days
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                if (index.lastUsed && new Date(index.lastUsed) > thirtyDaysAgo) continue;
                
                if (dryRun) {
                    removed.push({
                        collection: collectionName,
                        index: index.name,
                        action: 'WOULD_REMOVE'
                    });
                } else {
                    try {
                        await this.db.collection(collectionName).dropIndex(index.name);
                        removed.push({
                            collection: collectionName,
                            index: index.name,
                            action: 'REMOVED'
                        });
                        logger.info(`Removed unused index: ${index.name}`, {
                            collection: collectionName
                        });
                    } catch (error) {
                        logger.error(`Failed to remove index ${index.name}`, {
                            collection: collectionName,
                            error: error.message
                        });
                    }
                }
            }
        }
        
        return removed;
    }
    
    /**
     * Get index statistics for monitoring
     */
    async getIndexStats() {
        const stats = {
            collections: {},
            totalIndexes: 0,
            totalSize: 0
        };
        
        for (const collectionName of Object.keys(this.indexes)) {
            try {
                const collection = this.db.collection(collectionName);
                const indexes = await collection.indexes();
                const collStats = await collection.stats();
                
                stats.collections[collectionName] = {
                    indexCount: indexes.length,
                    indexes: indexes.map(idx => ({
                        name: idx.name,
                        keys: idx.key,
                        unique: idx.unique || false,
                        sparse: idx.sparse || false
                    })),
                    totalIndexSize: collStats.totalIndexSize || 0,
                    documentCount: collStats.count || 0
                };
                
                stats.totalIndexes += indexes.length;
                stats.totalSize += collStats.totalIndexSize || 0;
            } catch (error) {
                logger.error(`Failed to get stats for ${collectionName}`, {
                    error: error.message
                });
            }
        }
        
        return stats;
    }
    
    /**
     * Monitor query performance
     */
    async monitorQueryPerformance(query, collection) {
        const startTime = Date.now();
        
        try {
            // Execute query with explain
            const explanation = await this.db.collection(collection)
                .find(query)
                .explain('executionStats');
            
            const duration = Date.now() - startTime;
            
            const metrics = {
                duration,
                documentsExamined: explanation.executionStats.totalDocsExamined,
                documentsReturned: explanation.executionStats.nReturned,
                indexUsed: explanation.executionStats.executionStages?.inputStage?.indexName || 'NONE',
                efficiency: explanation.executionStats.nReturned / 
                           (explanation.executionStats.totalDocsExamined || 1)
            };
            
            // Log if query is inefficient
            if (metrics.efficiency < 0.5 || duration > 100) {
                logger.warn('Inefficient query detected', {
                    collection,
                    query,
                    metrics
                });
            }
            
            return metrics;
        } catch (error) {
            logger.error('Failed to monitor query performance', {
                collection,
                query,
                error: error.message
            });
            return null;
        }
    }
}

module.exports = DatabaseIndexingService;