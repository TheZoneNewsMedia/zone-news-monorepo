#!/usr/bin/env node

/**
 * Database Migration Script for Zone News Bot
 * Handles database schema updates and data migrations
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function runMigrations() {
    console.log('🗄️ Zone News Bot - Database Migration');
    console.log('=====================================');

    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        console.log(`📡 Connecting to: ${mongoUri}`);
        
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        // Migration 1: Ensure indexes exist
        console.log('🔄 Creating indexes...');
        
        await db.collection('users').createIndex({ user_id: 1 }, { unique: true });
        await db.collection('users').createIndex({ username: 1 });
        await db.collection('users').createIndex({ last_active: -1 });
        
        await db.collection('news_articles').createIndex({ published_date: -1 });
        await db.collection('news_articles').createIndex({ category: 1, published_date: -1 });
        await db.collection('news_articles').createIndex({ title: 'text', content: 'text' });
        
        await db.collection('bot_admins').createIndex({ telegram_id: 1 }, { unique: true });
        
        await db.collection('command_usage').createIndex({ user_id: 1, timestamp: -1 });
        await db.collection('command_usage').createIndex({ command: 1, timestamp: -1 });
        
        console.log('✅ Indexes created successfully');

        // Migration 2: Update user preferences structure
        console.log('🔄 Updating user preferences structure...');
        
        const usersUpdated = await db.collection('users').updateMany(
            { preferences: { $exists: false } },
            {
                $set: {
                    preferences: {
                        notifications: true,
                        language: 'en',
                        timezone: 'Australia/Adelaide'
                    },
                    categories: ['general'],
                    updated_at: new Date()
                }
            }
        );
        console.log(`✅ Updated ${usersUpdated.modifiedCount} user records`);

        // Migration 3: Ensure admin permissions
        console.log('🔄 Setting up admin permissions...');
        
        const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id.trim())) || [];
        
        for (const adminId of adminIds) {
            await db.collection('bot_admins').updateOne(
                { telegram_id: adminId },
                {
                    $set: {
                        telegram_id: adminId,
                        role: 'super_admin',
                        permissions: ['*'],
                        active: true,
                        created_at: new Date(),
                        updated_at: new Date()
                    }
                },
                { upsert: true }
            );
        }
        console.log(`✅ Configured ${adminIds.length} admin users`);

        // Migration 4: Clean up old data
        console.log('🔄 Cleaning up old data...');
        
        const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        
        const cleanupResult = await db.collection('command_usage').deleteMany({
            timestamp: { $lt: cutoffDate }
        });
        console.log(`✅ Removed ${cleanupResult.deletedCount} old command usage records`);

        console.log('');
        console.log('✅ All migrations completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Database connection closed');
    }
}

// Run migrations
if (require.main === module) {
    runMigrations().catch(error => {
        console.error('❌ Fatal migration error:', error);
        process.exit(1);
    });
}

module.exports = { runMigrations };