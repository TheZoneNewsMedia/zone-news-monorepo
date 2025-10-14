#!/usr/bin/env node
/**
 * Database Optimization Script
 * Run database optimization for Zone News Bot
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const DatabaseOptimization = require('./apps/bot/src/utils/database-optimization');

async function runOptimization() {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
    let client;

    try {
        console.log('🚀 Starting database optimization...');
        console.log(`📊 Connecting to: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);

        // Connect to MongoDB
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        const db = client.db('zone_news_production');

        console.log('✅ Connected to MongoDB');

        // Initialize optimization utility
        const optimizer = new DatabaseOptimization(db);

        // Run performance analysis
        console.log('\n📊 PHASE 1: Performance Analysis');
        const analysis = await optimizer.analyzeQueryPerformance();

        // Create optimized indexes
        console.log('\n🔧 PHASE 2: Index Optimization');
        await optimizer.optimizeReactionIndexes();

        // Get recommendations
        console.log('\n💡 PHASE 3: Optimization Recommendations');
        const recommendations = await optimizer.getOptimizationRecommendations();
        
        if (recommendations.length > 0) {
            console.log('📋 Recommendations:');
            recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.collection}: ${rec.recommendation}`);
            });
        } else {
            console.log('✅ No additional optimizations needed');
        }

        // Clean up old data
        console.log('\n🧹 PHASE 4: Data Cleanup');
        const cleanedCount = await optimizer.cleanupOldReactions();

        // Performance summary
        console.log('\n📊 OPTIMIZATION SUMMARY:');
        console.log('========================');
        console.log('✅ Indexes optimized for reaction queries');
        console.log('✅ Query performance analyzed');
        console.log(`🧹 Cleaned up ${cleanedCount} old reactions`);
        console.log('✅ Database optimization completed successfully');

        // Test optimized performance
        console.log('\n⚡ PERFORMANCE TEST:');
        const testStart = Date.now();
        await db.collection('user_reactions').findOne({ user_id: 12345 });
        console.log(`📈 User reaction lookup: ${Date.now() - testStart}ms`);

        const testStart2 = Date.now();
        await db.collection('news_articles').find({}).sort({ published_date: -1 }).limit(5).toArray();
        console.log(`📈 Article listing: ${Date.now() - testStart2}ms`);

    } catch (error) {
        console.error('❌ Optimization failed:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log('👋 Database connection closed');
        }
    }
}

// Run optimization if called directly
if (require.main === module) {
    runOptimization().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runOptimization };