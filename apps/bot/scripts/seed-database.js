#!/usr/bin/env node

/**
 * Database Seeding Script for Zone News Bot
 * Populates database with initial data for development/testing
 */

require('dotenv').config();
const mongoose = require('mongoose');

const sampleArticles = [
    {
        title: "Adelaide's New Technology Hub Opens",
        content: "A state-of-the-art technology hub has opened in Adelaide's CBD, providing space for startups and tech companies to collaborate and innovate.",
        summary: "New tech hub opens in Adelaide CBD for startups and innovation.",
        category: "technology",
        city: "Adelaide",
        source: "Zone News",
        published_date: new Date(),
        views: 0,
        reactions: { "👍": 0, "❤️": 0, "😯": 0 },
        tags: ["adelaide", "technology", "startup", "cbd"],
        is_premium: false,
        url: "https://thezonenews.com/adelaide-tech-hub"
    },
    {
        title: "South Australia Leads in Renewable Energy",
        content: "South Australia continues to be a leader in renewable energy adoption, with solar and wind power contributing over 60% of the state's electricity needs.",
        summary: "SA leads Australia in renewable energy with 60% clean electricity.",
        category: "business",
        city: "Adelaide",
        source: "Zone News",
        published_date: new Date(Date.now() - 86400000), // 1 day ago
        views: 0,
        reactions: { "👍": 0, "❤️": 0, "😯": 0 },
        tags: ["south-australia", "renewable-energy", "solar", "wind"],
        is_premium: true,
        url: "https://thezonenews.com/sa-renewable-energy"
    },
    {
        title: "Adelaide Festival Announces 2024 Lineup",
        content: "The Adelaide Festival has announced an exciting lineup for 2024, featuring international artists, local performers, and innovative productions.",
        summary: "Adelaide Festival 2024 lineup announced with international and local acts.",
        category: "entertainment",
        city: "Adelaide",
        source: "Zone News",
        published_date: new Date(Date.now() - 172800000), // 2 days ago
        views: 0,
        reactions: { "👍": 0, "❤️": 0, "😯": 0 },
        tags: ["adelaide", "festival", "arts", "entertainment"],
        is_premium: false,
        url: "https://thezonenews.com/adelaide-festival-2024"
    }
];

const sampleUsers = [
    {
        user_id: 123456789,
        username: "demo_user_1",
        first_name: "Demo",
        last_name: "User",
        is_bot: false,
        city: "Adelaide",
        categories: ["technology", "business"],
        preferences: {
            notifications: true,
            language: "en",
            timezone: "Australia/Adelaide"
        },
        subscription: {
            tier: "free",
            expires_at: null
        },
        created_at: new Date(),
        last_active: new Date(),
        updated_at: new Date()
    },
    {
        user_id: 987654321,
        username: "premium_user",
        first_name: "Premium",
        last_name: "User",
        is_bot: false,
        city: "Adelaide",
        categories: ["technology", "business", "entertainment"],
        preferences: {
            notifications: true,
            language: "en",
            timezone: "Australia/Adelaide"
        },
        subscription: {
            tier: "premium",
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        },
        created_at: new Date(),
        last_active: new Date(),
        updated_at: new Date()
    }
];

async function seedDatabase() {
    console.log('🌱 Zone News Bot - Database Seeding');
    console.log('===================================');

    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        console.log(`📡 Connecting to: ${mongoUri}`);
        
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        // Check if this is a fresh database
        const existingArticles = await db.collection('news_articles').countDocuments();
        const existingUsers = await db.collection('users').countDocuments();

        if (existingArticles > 0 || existingUsers > 0) {
            console.log('⚠️ Database already contains data');
            console.log(`📰 Articles: ${existingArticles}`);
            console.log(`👥 Users: ${existingUsers}`);
            
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const answer = await new Promise(resolve => {
                readline.question('Do you want to add sample data anyway? (y/N): ', resolve);
            });
            readline.close();
            
            if (answer.toLowerCase() !== 'y') {
                console.log('❌ Seeding cancelled');
                return;
            }
        }

        // Seed articles
        console.log('📰 Seeding sample articles...');
        
        for (const article of sampleArticles) {
            await db.collection('news_articles').updateOne(
                { title: article.title },
                { $set: article },
                { upsert: true }
            );
        }
        console.log(`✅ Seeded ${sampleArticles.length} articles`);

        // Seed users
        console.log('👥 Seeding sample users...');
        
        for (const user of sampleUsers) {
            await db.collection('users').updateOne(
                { user_id: user.user_id },
                { $set: user },
                { upsert: true }
            );
        }
        console.log(`✅ Seeded ${sampleUsers.length} users`);

        // Seed admin user if ADMIN_IDS is set
        const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id.trim())) || [];
        
        if (adminIds.length > 0) {
            console.log('🔐 Setting up admin users...');
            
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
        }

        // Create some sample stats
        console.log('📊 Creating sample statistics...');
        
        const today = new Date().toISOString().split('T')[0];
        await db.collection('daily_stats').updateOne(
            { date: today },
            {
                $set: {
                    date: today,
                    users_active: 2,
                    commands_used: 10,
                    articles_viewed: 15,
                    reactions_added: 5,
                    new_users: 2,
                    premium_users: 1,
                    created_at: new Date()
                }
            },
            { upsert: true }
        );
        console.log('✅ Sample statistics created');

        console.log('');
        console.log('✅ Database seeding completed successfully!');
        console.log('📊 Summary:');
        console.log(`  📰 Articles: ${sampleArticles.length}`);
        console.log(`  👥 Users: ${sampleUsers.length}`);
        console.log(`  🔐 Admins: ${adminIds.length}`);
        
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Database connection closed');
    }
}

// Run seeding
if (require.main === module) {
    seedDatabase().catch(error => {
        console.error('❌ Fatal seeding error:', error);
        process.exit(1);
    });
}

module.exports = { seedDatabase };