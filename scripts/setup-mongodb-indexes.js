#!/usr/bin/env node

/**
 * MongoDB Index Setup Script
 * Creates necessary indexes for optimal performance
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';

async function setupIndexes() {
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const db = client.db('zone_news_production');
        
        // News Articles Indexes
        console.log('\n📚 Creating indexes for news_articles...');
        const newsCollection = db.collection('news_articles');
        
        // Text search index
        await newsCollection.createIndex(
            { title: 'text', content: 'text', summary: 'text' },
            { name: 'text_search_index' }
        );
        console.log('  ✓ Text search index created');
        
        // Date sorting index
        await newsCollection.createIndex(
            { published_date: -1 },
            { name: 'published_date_desc' }
        );
        console.log('  ✓ Published date index created');
        
        // Category index
        await newsCollection.createIndex(
            { category: 1 },
            { name: 'category_index' }
        );
        console.log('  ✓ Category index created');
        
        // Status and date compound index
        await newsCollection.createIndex(
            { status: 1, published_date: -1 },
            { name: 'status_date_compound' }
        );
        console.log('  ✓ Status-date compound index created');
        
        // Views index for trending
        await newsCollection.createIndex(
            { views: -1 },
            { name: 'views_desc' }
        );
        console.log('  ✓ Views index created');
        
        // Users Indexes
        console.log('\n👤 Creating indexes for users...');
        const usersCollection = db.collection('users');
        
        // Unique telegram_id index
        await usersCollection.createIndex(
            { telegram_id: 1 },
            { unique: true, name: 'telegram_id_unique' }
        );
        console.log('  ✓ Telegram ID unique index created');
        
        // Username index
        await usersCollection.createIndex(
            { username: 1 },
            { name: 'username_index' }
        );
        console.log('  ✓ Username index created');
        
        // Tier index
        await usersCollection.createIndex(
            { tier: 1 },
            { name: 'tier_index' }
        );
        console.log('  ✓ Tier index created');
        
        // Admin Destinations Indexes
        console.log('\n📢 Creating indexes for admin_destinations...');
        const destCollection = db.collection('admin_destinations');
        
        // Telegram ID index
        await destCollection.createIndex(
            { telegram_id: 1 },
            { name: 'admin_telegram_id' }
        );
        console.log('  ✓ Admin telegram ID index created');
        
        // Destination ID index
        await destCollection.createIndex(
            { 'destinations.id': 1 },
            { name: 'destination_id_index' }
        );
        console.log('  ✓ Destination ID index created');
        
        // Posted Articles Indexes
        console.log('\n📮 Creating indexes for posted_articles...');
        const postedCollection = db.collection('posted_articles');
        
        // Posted date index
        await postedCollection.createIndex(
            { posted_at: -1 },
            { name: 'posted_at_desc' }
        );
        console.log('  ✓ Posted date index created');
        
        // Destination index
        await postedCollection.createIndex(
            { destination: 1 },
            { name: 'destination_index' }
        );
        console.log('  ✓ Destination index created');
        
        // Article ID index
        await postedCollection.createIndex(
            { article_id: 1 },
            { name: 'article_id_index' }
        );
        console.log('  ✓ Article ID index created');
        
        // Compound index for duplicate prevention
        await postedCollection.createIndex(
            { article_id: 1, destination: 1 },
            { unique: true, name: 'article_destination_unique' }
        );
        console.log('  ✓ Article-destination unique index created');
        
        // Sessions Indexes (for auth)
        console.log('\n🔐 Creating indexes for sessions...');
        const sessionsCollection = db.collection('sessions');
        
        // Session token index
        await sessionsCollection.createIndex(
            { token: 1 },
            { unique: true, name: 'session_token_unique' }
        );
        console.log('  ✓ Session token unique index created');
        
        // User ID index
        await sessionsCollection.createIndex(
            { user_id: 1 },
            { name: 'session_user_id' }
        );
        console.log('  ✓ Session user ID index created');
        
        // TTL index for auto-expiry
        await sessionsCollection.createIndex(
            { expires_at: 1 },
            { expireAfterSeconds: 0, name: 'session_ttl' }
        );
        console.log('  ✓ Session TTL index created');
        
        // Analytics Indexes
        console.log('\n📊 Creating indexes for analytics...');
        const analyticsCollection = db.collection('analytics');
        
        // Event type index
        await analyticsCollection.createIndex(
            { event_type: 1 },
            { name: 'event_type_index' }
        );
        console.log('  ✓ Event type index created');
        
        // Timestamp index
        await analyticsCollection.createIndex(
            { timestamp: -1 },
            { name: 'timestamp_desc' }
        );
        console.log('  ✓ Timestamp index created');
        
        // User ID index
        await analyticsCollection.createIndex(
            { user_id: 1 },
            { name: 'analytics_user_id' }
        );
        console.log('  ✓ Analytics user ID index created');
        
        // Compound index for queries
        await analyticsCollection.createIndex(
            { event_type: 1, timestamp: -1 },
            { name: 'event_timestamp_compound' }
        );
        console.log('  ✓ Event-timestamp compound index created');
        
        console.log('\n✅ All indexes created successfully!');
        
        // Display index statistics
        console.log('\n📈 Index Statistics:');
        const collections = ['news_articles', 'users', 'admin_destinations', 'posted_articles', 'sessions', 'analytics'];
        
        for (const collName of collections) {
            const coll = db.collection(collName);
            const indexes = await coll.indexes();
            console.log(`  ${collName}: ${indexes.length} indexes`);
        }
        
    } catch (error) {
        console.error('❌ Error setting up indexes:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('\n👋 MongoDB connection closed');
    }
}

// Run the setup
console.log('🚀 MongoDB Index Setup Script');
console.log('================================');
setupIndexes();