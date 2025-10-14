#!/usr/bin/env node

/**
 * Initialize Database Indexes Script
 * Run this to create/update all database indexes
 */

const { MongoClient } = require('mongodb');
const DatabaseIndexingService = require('../services/database-indexing.service');
const { logger } = require('../services/logger-service');

async function main() {
    let client;
    
    try {
        // Get MongoDB URL from environment
        const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        
        logger.info('Connecting to MongoDB for index initialization...', {
            url: mongoUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
        });
        
        // Connect to MongoDB
        client = new MongoClient(mongoUrl);
        await client.connect();
        
        const db = client.db();
        logger.info('Connected to database');
        
        // Initialize indexing service
        const indexingService = new DatabaseIndexingService(db);
        
        // Create all indexes
        logger.info('Creating database indexes...');
        const results = await indexingService.initializeIndexes();
        
        // Log results
        console.log('\n📊 Index Initialization Results:');
        console.log('================================');
        console.log(`✅ Created: ${results.created.length} new indexes`);
        console.log(`📌 Existing: ${results.existing.length} indexes already present`);
        console.log(`❌ Errors: ${results.errors.length} failed attempts`);
        console.log(`⏱️ Time: ${results.totalTime}ms\n`);
        
        if (results.created.length > 0) {
            console.log('New Indexes Created:');
            results.created.forEach(idx => {
                console.log(`  - ${idx.collection}: ${idx.description}`);
            });
            console.log('');
        }
        
        if (results.errors.length > 0) {
            console.log('⚠️ Errors Encountered:');
            results.errors.forEach(err => {
                console.log(`  - ${err.collection}: ${err.error}`);
            });
            console.log('');
        }
        
        // Get index statistics
        logger.info('Gathering index statistics...');
        const stats = await indexingService.getIndexStats();
        
        console.log('📈 Index Statistics:');
        console.log('==================');
        console.log(`Total Indexes: ${stats.totalIndexes}`);
        console.log(`Total Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB\n`);
        
        console.log('Per Collection:');
        for (const [collection, collStats] of Object.entries(stats.collections)) {
            console.log(`  ${collection}:`);
            console.log(`    - Indexes: ${collStats.indexCount}`);
            console.log(`    - Documents: ${collStats.documentCount.toLocaleString()}`);
            console.log(`    - Index Size: ${(collStats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
        }
        
        // Analyze slow queries (optional)
        if (process.argv.includes('--analyze')) {
            logger.info('Analyzing slow queries...');
            const slowAnalysis = await indexingService.optimizeSlowQueries();
            
            if (slowAnalysis.suggestions.length > 0) {
                console.log('\n🔍 Index Suggestions Based on Slow Queries:');
                console.log('==========================================');
                slowAnalysis.suggestions.forEach(suggestion => {
                    console.log(`  Collection: ${suggestion.collection}`);
                    console.log(`  Suggested Index: ${JSON.stringify(suggestion.suggestedIndex)}`);
                    console.log(`  Reason: ${suggestion.reason}`);
                    console.log(`  Impact: ${suggestion.impact}\n`);
                });
            }
        }
        
        // Check for unused indexes (optional)
        if (process.argv.includes('--cleanup')) {
            logger.info('Checking for unused indexes...');
            const unused = await indexingService.removeUnusedIndexes(true);
            
            if (unused.length > 0) {
                console.log('\n🗑️ Unused Indexes (dry run):');
                console.log('============================');
                unused.forEach(idx => {
                    console.log(`  - ${idx.collection}.${idx.index} (${idx.action})`);
                });
                console.log('\nTo remove unused indexes, run with --cleanup --force');
            }
        }
        
        logger.info('Index initialization complete!');
        
    } catch (error) {
        logger.error('Failed to initialize indexes', {
            error: error.message,
            stack: error.stack
        });
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            logger.info('Database connection closed');
        }
    }
}

// Run if called directly
if (require.main === module) {
    console.log('🚀 MongoDB Index Initialization Tool');
    console.log('=====================================\n');
    
    console.log('Options:');
    console.log('  --analyze  : Analyze slow queries and suggest indexes');
    console.log('  --cleanup  : Check for unused indexes (dry run)');
    console.log('  --force    : Actually remove unused indexes (use with --cleanup)\n');
    
    main().catch(error => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = { main };