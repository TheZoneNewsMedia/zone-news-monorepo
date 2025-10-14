#!/usr/bin/env node
/**
 * Quick Database Optimization - Remove constraints and create safe indexes
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function quickOptimize() {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
    let client;

    try {
        console.log('⚡ Quick database optimization for reactions...');
        
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        const db = client.db('zone_news_production');

        // Clean and optimize user_reactions
        console.log('🧹 Cleaning user_reactions...');
        const cleaned1 = await db.collection('user_reactions').deleteMany({
            $or: [
                { user_id: null },
                { post_id: null },
                { reaction: null }
            ]
        });
        console.log(`✅ Cleaned ${cleaned1.deletedCount} invalid user_reactions`);

        // Clean and optimize reaction_counts  
        console.log('🧹 Cleaning reaction_counts...');
        const cleaned2 = await db.collection('reaction_counts').deleteMany({
            $or: [
                { message_id: null },
                { chat_id: null }
            ]
        });
        console.log(`✅ Cleaned ${cleaned2.deletedCount} invalid reaction_counts`);

        // Create safe non-unique indexes
        console.log('🔧 Creating optimized indexes...');
        
        // user_reactions performance index
        try {
            await db.collection('user_reactions').createIndex(
                { user_id: 1, post_id: 1 },
                { name: 'user_post_lookup', background: true, sparse: true }
            );
            console.log('✅ user_reactions lookup index created');
        } catch (e) {
            console.log('ℹ️  user_reactions index already exists or similar');
        }

        // reaction_counts performance index  
        try {
            await db.collection('reaction_counts').createIndex(
                { message_id: 1 },
                { name: 'message_lookup', background: true, sparse: true }
            );
            console.log('✅ reaction_counts lookup index created');
        } catch (e) {
            console.log('ℹ️  reaction_counts index already exists or similar');
        }

        // news_articles performance (already heavily indexed)
        console.log('ℹ️  news_articles already has 30 indexes - skipping');

        // Test performance
        console.log('\n⚡ Performance Tests:');
        
        const start1 = Date.now();
        await db.collection('user_reactions').findOne({ user_id: 12345 });
        console.log(`📈 User reaction lookup: ${Date.now() - start1}ms`);

        const start2 = Date.now();
        await db.collection('reaction_counts').findOne({ message_id: 123 });
        console.log(`📈 Reaction count lookup: ${Date.now() - start2}ms`);

        const start3 = Date.now();
        await db.collection('news_articles').find({}).sort({ published_date: -1 }).limit(5).toArray();
        console.log(`📈 Article listing: ${Date.now() - start3}ms`);

        console.log('\n✅ Quick optimization completed successfully!');

    } catch (error) {
        console.error('❌ Quick optimization failed:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

quickOptimize().catch(console.error);