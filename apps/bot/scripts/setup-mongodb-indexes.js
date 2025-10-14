#!/usr/bin/env node

/**
 * MongoDB Index Setup Script
 * Run this to create all necessary indexes for optimal performance
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function setupIndexes() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const db = client.db();
        
        // News Articles Indexes
        console.log('\n📰 Creating news_articles indexes...');
        try {
            // Check existing indexes first
            const existingIndexes = await db.collection('news_articles').indexes();
            const existingNames = existingIndexes.map(idx => idx.name);
            
            const indexesToCreate = [
                { key: { published_date: -1 }, name: 'published_date_desc' },
                { key: { category: 1, published_date: -1 }, name: 'category_date' },
                { key: { title: 'text', content: 'text' }, name: 'text_search' },
                { key: { 'total_reactions.like': -1 }, name: 'reactions_like' },
                { key: { 'total_reactions.love': -1 }, name: 'reactions_love' },
                { key: { 'total_reactions.fire': -1 }, name: 'reactions_fire' },
                { key: { last_reaction_at: -1 }, name: 'last_reaction' },
                { key: { url: 1 }, name: 'url_unique', unique: true, sparse: true }
            ];
            
            for (const index of indexesToCreate) {
                if (!existingNames.includes(index.name)) {
                    try {
                        await db.collection('news_articles').createIndex(index.key, { name: index.name, ...index });
                        console.log(`  ✅ Created index: ${index.name}`);
                    } catch (err) {
                        if (err.code === 85) {
                            console.log(`  ⚠️ Index already exists with different name for keys: ${JSON.stringify(index.key)}`);
                        } else {
                            console.log(`  ❌ Failed to create index ${index.name}: ${err.message}`);
                        }
                    }
                } else {
                    console.log(`  ✓ Index already exists: ${index.name}`);
                }
            }
        } catch (error) {
            console.log(`  ❌ Error with news_articles indexes: ${error.message}`);
        }
        
        // User Reactions Indexes
        console.log('\n💬 Creating user_reactions indexes...');
        await db.collection('user_reactions').createIndexes([
            { key: { user_id: 1, post_id: 1, reaction: 1 }, name: 'user_post_reaction', unique: true },
            { key: { article_id: 1 }, name: 'article_reactions' },
            { key: { user_id: 1, created_at: -1 }, name: 'user_history' },
            { key: { chat_id: 1, created_at: -1 }, name: 'chat_reactions' },
            { key: { created_at: -1 }, name: 'recent_reactions' }
        ]);
        console.log('✅ user_reactions indexes created');
        
        // Global Reactions Indexes
        console.log('\n🌍 Creating global_reactions indexes...');
        await db.collection('global_reactions').createIndexes([
            { key: { user_id: 1, article_id: 1, reaction_type: 1 }, name: 'global_unique', unique: true },
            { key: { article_id: 1, reaction_type: 1 }, name: 'article_type' },
            { key: { user_id: 1, last_reacted_at: -1 }, name: 'user_recent' },
            { key: { reaction_count: -1 }, name: 'top_reactors' }
        ]);
        console.log('✅ global_reactions indexes created');
        
        // Posted Articles Indexes
        console.log('\n📤 Creating posted_articles indexes...');
        await db.collection('posted_articles').createIndexes([
            { key: { message_id: 1, destination_chat_id: 1 }, name: 'message_chat', unique: true },
            { key: { article_id: 1 }, name: 'article_posts' },
            { key: { posted_at: -1 }, name: 'recent_posts' },
            { key: { can_edit_until: 1 }, name: 'editable_posts' },
            { key: { posted_by: 1, posted_at: -1 }, name: 'admin_posts' }
        ]);
        console.log('✅ posted_articles indexes created');
        
        // Users Indexes
        console.log('\n👤 Creating users indexes...');
        await db.collection('users').createIndexes([
            { key: { user_id: 1 }, name: 'user_id_unique', unique: true },
            { key: { username: 1 }, name: 'username', sparse: true },
            { key: { last_active: -1 }, name: 'active_users' },
            { key: { setup_complete: 1 }, name: 'setup_status' },
            { key: { city: 1 }, name: 'user_city' },
            { key: { notifications: 1 }, name: 'notification_prefs' }
        ]);
        console.log('✅ users indexes created');
        
        // Destinations Indexes
        console.log('\n📍 Creating destinations indexes...');
        await db.collection('destinations').createIndexes([
            { key: { id: 1 }, name: 'destination_id', unique: true },
            { key: { username: 1 }, name: 'destination_username', sparse: true },
            { key: { active: 1 }, name: 'active_destinations' },
            { key: { type: 1 }, name: 'destination_type' }
        ]);
        console.log('✅ destinations indexes created');
        
        // Bot Groups Indexes
        console.log('\n👥 Creating bot_groups indexes...');
        await db.collection('bot_groups').createIndexes([
            { key: { chat_id: 1 }, name: 'group_chat_id', unique: true },
            { key: { active: 1 }, name: 'active_groups' },
            { key: { added_at: -1 }, name: 'recent_groups' }
        ]);
        console.log('✅ bot_groups indexes created');
        
        // Command Usage Indexes (for analytics)
        console.log('\n📊 Creating command_usage indexes...');
        await db.collection('command_usage').createIndexes([
            { key: { user_id: 1, timestamp: -1 }, name: 'user_commands' },
            { key: { command: 1, timestamp: -1 }, name: 'command_stats' },
            { key: { timestamp: -1 }, name: 'recent_usage' },
            { key: { timestamp: 1 }, name: 'cleanup_old', expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days TTL
        ]);
        console.log('✅ command_usage indexes created');
        
        // Post Sessions Indexes (with TTL)
        console.log('\n⏱️ Creating post_sessions indexes...');
        await db.collection('post_sessions').createIndexes([
            { key: { user_id: 1 }, name: 'session_user' },
            { key: { expires_at: 1 }, name: 'session_expiry', expireAfterSeconds: 0 }
        ]);
        console.log('✅ post_sessions indexes created');
        
        // User Interactions Index
        console.log('\n🤝 Creating user_interactions indexes...');
        await db.collection('user_interactions').createIndexes([
            { key: { user_id: 1, action: 1, timestamp: -1 }, name: 'user_actions' },
            { key: { article_id: 1, action: 1 }, name: 'article_interactions' },
            { key: { timestamp: 1 }, name: 'interaction_cleanup', expireAfterSeconds: 7 * 24 * 60 * 60 } // 7 days TTL
        ]);
        console.log('✅ user_interactions indexes created');
        
        // Get all indexes for verification
        console.log('\n📋 Verifying all indexes...');
        const collections = await db.listCollections().toArray();
        
        for (const collection of collections) {
            const indexes = await db.collection(collection.name).indexes();
            console.log(`\n${collection.name}: ${indexes.length} indexes`);
        }
        
        console.log('\n✨ All indexes created successfully!');
        console.log('💡 Run this script periodically to ensure indexes are up to date');
        
    } catch (error) {
        console.error('❌ Error setting up indexes:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('\n👋 Database connection closed');
    }
}

// Run if executed directly
if (require.main === module) {
    setupIndexes().then(() => {
        console.log('\n✅ Index setup complete');
        process.exit(0);
    }).catch(error => {
        console.error('\n❌ Index setup failed:', error);
        process.exit(1);
    });
}

module.exports = setupIndexes;