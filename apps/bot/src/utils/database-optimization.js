/**
 * Database Optimization Utility
 * Creates optimized indexes for reaction system performance
 */

class DatabaseOptimization {
    constructor(db) {
        this.db = db;
    }

    /**
     * Create optimized indexes for reaction collections
     */
    async optimizeReactionIndexes() {
        console.log('🔧 Optimizing reaction database indexes...');
        
        try {
            // 1. user_reactions - Most critical for user interaction
            // First clean null values
            await this.db.collection('user_reactions').deleteMany({
                $or: [
                    { user_id: null },
                    { post_id: null },
                    { reaction: null }
                ]
            });
            
            await this.db.collection('user_reactions').createIndex(
                { user_id: 1, post_id: 1, reaction: 1 },
                { 
                    name: 'user_post_reaction_lookup',
                    background: true,
                    sparse: true // Handle null values gracefully
                }
            );
            
            await this.db.collection('user_reactions').createIndex(
                { post_id: 1, reaction: 1 },
                { 
                    name: 'post_reaction_aggregation',
                    background: true 
                }
            );
            
            await this.db.collection('user_reactions').createIndex(
                { created_at: -1 },
                { 
                    name: 'reaction_time_series',
                    background: true,
                    expireAfterSeconds: 7776000 // 90 days TTL
                }
            );

            // 2. post_reactions - Reaction count aggregation
            await this.db.collection('post_reactions').createIndex(
                { post_id: 1 },
                { 
                    name: 'post_reactions_lookup',
                    background: true,
                    unique: true 
                }
            );

            // 3. news_articles - Article performance tracking
            await this.db.collection('news_articles').createIndex(
                { 'zone_news_data.message_id': 1 },
                { 
                    name: 'zone_message_lookup',
                    background: true,
                    sparse: true 
                }
            );
            
            await this.db.collection('news_articles').createIndex(
                { published_date: -1, category: 1 },
                { 
                    name: 'article_listing_optimized',
                    background: true 
                }
            );

            // 4. reaction_counts - Fast count retrieval
            await this.db.collection('reaction_counts').createIndex(
                { message_id: 1, chat_id: 1 },
                { 
                    name: 'message_reaction_counts',
                    background: true,
                    unique: true 
                }
            );

            console.log('✅ Reaction database indexes optimized');
            return true;

        } catch (error) {
            console.error('❌ Database optimization failed:', error);
            throw error;
        }
    }

    /**
     * Analyze query performance
     */
    async analyzeQueryPerformance() {
        console.log('📊 Analyzing reaction query performance...');
        
        const collections = [
            'user_reactions',
            'post_reactions', 
            'news_articles',
            'reaction_counts'
        ];

        const results = {};

        for (const collectionName of collections) {
            try {
                const collection = this.db.collection(collectionName);
                
                // Get collection stats using estimatedDocumentCount
                const docCount = await collection.estimatedDocumentCount();
                const indexes = await collection.listIndexes().toArray();
                
                // Test common query patterns
                const sampleQueries = await this.runSampleQueries(collection, collectionName);
                
                results[collectionName] = {
                    documentCount: docCount || 0,
                    indexCount: indexes.length || 0,
                    indexes: indexes.map(idx => idx.name),
                    queryPerformance: sampleQueries
                };

            } catch (error) {
                results[collectionName] = { error: error.message };
            }
        }

        console.log('📊 Query Performance Analysis:', JSON.stringify(results, null, 2));
        return results;
    }

    /**
     * Run sample queries to test performance
     */
    async runSampleQueries(collection, collectionName) {
        const queries = {};
        
        try {
            switch (collectionName) {
                case 'user_reactions':
                    // Test user reaction lookup
                    const start1 = Date.now();
                    await collection.findOne({ user_id: 12345 });
                    queries.userLookup = `${Date.now() - start1}ms`;
                    
                    // Test post reactions aggregation
                    const start2 = Date.now();
                    await collection.find({ post_id: 'test' }).limit(10).toArray();
                    queries.postReactions = `${Date.now() - start2}ms`;
                    break;

                case 'news_articles':
                    // Test article listing
                    const start3 = Date.now();
                    await collection.find({}).sort({ published_date: -1 }).limit(20).toArray();
                    queries.articleListing = `${Date.now() - start3}ms`;
                    break;

                case 'post_reactions':
                    // Test reaction count retrieval
                    const start4 = Date.now();
                    await collection.findOne({ post_id: 'test' });
                    queries.countLookup = `${Date.now() - start4}ms`;
                    break;
            }
        } catch (error) {
            queries.error = error.message;
        }

        return queries;
    }

    /**
     * Clean up old reaction data
     */
    async cleanupOldReactions() {
        console.log('🧹 Cleaning up old reaction data...');
        
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        try {
            // Remove reactions older than 30 days for non-trending posts
            const result = await this.db.collection('user_reactions').deleteMany({
                created_at: { $lt: thirtyDaysAgo },
                'post_trending': { $ne: true }
            });

            console.log(`🧹 Cleaned up ${result.deletedCount} old reactions`);
            return result.deletedCount;

        } catch (error) {
            console.error('❌ Cleanup failed:', error);
            throw error;
        }
    }

    /**
     * Get optimization recommendations
     */
    async getOptimizationRecommendations() {
        const analysis = await this.analyzeQueryPerformance();
        const recommendations = [];

        for (const [collection, stats] of Object.entries(analysis)) {
            if (stats.error) continue;

            // Check document count vs index count
            if (stats.documentCount > 10000 && stats.indexCount < 3) {
                recommendations.push({
                    collection,
                    type: 'indexing',
                    priority: 'high',
                    recommendation: `Add compound indexes for ${collection} (${stats.documentCount} documents)`
                });
            }

            // Check average object size
            if (stats.avgObjSize > 10000) {
                recommendations.push({
                    collection,
                    type: 'schema',
                    priority: 'medium', 
                    recommendation: `Consider schema optimization for ${collection} (avg size: ${stats.avgObjSize} bytes)`
                });
            }
        }

        return recommendations;
    }

    /**
     * Monitor real-time performance
     */
    async monitorPerformance() {
        console.log('📊 Starting real-time performance monitoring...');
        
        const monitor = {
            startTime: new Date(),
            queryCount: 0,
            slowQueries: [],
            averageResponseTime: 0
        };

        // Set up profiling for slow queries (>10ms)
        await this.db.command({
            profile: 2,
            slowms: 10
        });

        return monitor;
    }
}

module.exports = DatabaseOptimization;