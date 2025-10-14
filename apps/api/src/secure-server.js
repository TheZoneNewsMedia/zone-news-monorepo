/**
 * Zone News API Server - Production Security Enhanced
 * Comprehensive security implementation with all safeguards
 */

const express = require('express');
const { MongoClient } = require('mongodb');

// Import security utilities
const { 
    setupProductionSecurity, 
    createSecureServer, 
    addSecurityHealthCheck 
} = require('@zone/shared');

// Telegram bot service integration
let telegramBotService = null;
try { 
    telegramBotService = require('./services/telegram-bot-service'); 
} catch (_) {}

const app = express();

// Environment configuration
const config = {
    PORT: process.env.PORT || 3001,
    HTTPS_PORT: process.env.HTTPS_PORT || 3443,
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production',
    DB_NAME: 'zone_news_production',
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    API_KEYS: (process.env.API_KEYS || '').split(',').filter(Boolean),
    NODE_ENV: process.env.NODE_ENV || 'development'
};

// Security configuration
const securityOptions = {
    service: 'zone-news-api',
    enableTelegramWebhook: true,
    botToken: config.BOT_TOKEN,
    apiKeys: config.API_KEYS,
    customCorsOrigins: [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://zonenews.com.au',
        'https://api.zonenews.com.au',
        ...(process.env.CORS_ORIGINS || '').split(',').filter(Boolean)
    ],
    enableRateLimit: true,
    enableSpeedLimit: true,
    enableInputValidation: true,
    enableHelmet: true,
    enableCors: true,
    enableLogging: config.NODE_ENV !== 'test',
    enableErrorHandler: true
};

// Database connection
let db;
let client;

async function connectDB() {
    try {
        client = new MongoClient(config.MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        await client.connect();
        db = client.db(config.DB_NAME);
        console.log('✅ Connected to MongoDB with security options');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}

// Expose DB accessor for route modules
async function getDb() {
    if (!db) {
        await connectDB();
    }
    return db;
}

// Setup production security
const security = setupProductionSecurity(app, securityOptions);

// Add security health check
addSecurityHealthCheck(app);

// Enhanced webhook endpoint with comprehensive security
app.post('/webhook', async (req, res) => {
    try {
        // Security validation is handled by middleware
        // Additional business logic validation
        if (!req.body.update_id) {
            return res.status(400).json({ 
                error: 'Missing update_id',
                code: 'INVALID_WEBHOOK_PAYLOAD' 
            });
        }

        // Log successful webhook reception
        console.log(`📨 Webhook received: update_id=${req.body.update_id}, IP=${req.ip}`);

        // Acknowledge immediately to avoid Telegram retries
        res.status(200).json({ status: 'ok', received: req.body.update_id });

        // Process update asynchronously with error handling
        setImmediate(async () => {
            try {
                if (telegramBotService && typeof telegramBotService.processUpdate === 'function') {
                    await telegramBotService.processUpdate(req.body);
                    console.log(`✅ Webhook processed: update_id=${req.body.update_id}`);
                } else {
                    console.warn('⚠️ Telegram bot service not available for webhook processing');
                }
            } catch (error) {
                console.error('❌ Webhook processing error:', {
                    updateId: req.body.update_id,
                    error: error.message,
                    stack: error.stack
                });
            }
        });

    } catch (error) {
        console.error('❌ Webhook endpoint error:', error);
        // Always return 200 to prevent Telegram retries on server errors
        res.status(200).json({ status: 'error', message: 'Internal processing error' });
    }
});

// Category mapping for content classification
const categoryMap = {
    'business': ['business', 'commerce', 'trade', 'company', 'corporate', 'market'],
    'economics': ['economy', 'economic', 'gdp', 'inflation', 'unemployment', 'fiscal'],
    'finance': ['finance', 'banking', 'investment', 'stocks', 'trading', 'money'],
    'property': ['property', 'real estate', 'housing', 'rental', 'mortgage', 'development'],
    'government': ['government', 'politics', 'policy', 'minister', 'parliament', 'council'],
    'health': ['health', 'medical', 'hospital', 'doctor', 'covid', 'disease', 'wellness'],
    'innovations': ['innovation', 'technology', 'startup', 'tech', 'digital', 'ai', 'research'],
    'truecrime': ['crime', 'police', 'court', 'investigation', 'criminal', 'arrest'],
    'analysis': ['analysis', 'opinion', 'editorial', 'insight', 'perspective', 'review']
};

// Helper functions for content processing
function categorizeArticle(article) {
    const content = (article.title + ' ' + article.content).toLowerCase();
    
    for (const [category, keywords] of Object.entries(categoryMap)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return category;
        }
    }
    
    return 'general';
}

function determineScope(article) {
    const content = (article.title + ' ' + article.content).toLowerCase();
    
    if (content.includes('world') || content.includes('global') || content.includes('international')) {
        return 'global';
    }
    
    if (content.includes('australia') || content.includes('federal') || content.includes('national')) {
        return 'national';
    }
    
    return 'local';
}

function determineCity(article) {
    const content = (article.title + ' ' + article.content).toLowerCase();
    
    const cities = {
        'adelaide': ['adelaide', 'sa', 'south australia'],
        'sydney': ['sydney', 'nsw', 'new south wales'],
        'melbourne': ['melbourne', 'vic', 'victoria'],
        'brisbane': ['brisbane', 'qld', 'queensland'],
        'perth': ['perth', 'wa', 'western australia'],
        'darwin': ['darwin', 'nt', 'northern territory'],
        'hobart': ['hobart', 'tas', 'tasmania'],
        'canberra': ['canberra', 'act', 'capital territory']
    };
    
    for (const [city, keywords] of Object.entries(cities)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return city.charAt(0).toUpperCase() + city.slice(1);
        }
    }
    
    return 'Adelaide';
}

// Secure API endpoints with input validation
app.get('/api/news', async (req, res) => {
    try {
        // Input validation with secure defaults
        const {
            category = 'all',
            scope = 'all', 
            city = 'Adelaide',
            page = 1,
            limit = 20,
            search = ''
        } = req.query;

        // Validate and sanitize inputs
        const validatedPage = Math.max(1, Math.min(parseInt(page) || 1, 1000));
        const validatedLimit = Math.max(1, Math.min(parseInt(limit) || 20, 100));
        const sanitizedSearch = search.toString().substring(0, 100);

        // Build secure query
        let query = {
            $or: [
                { 'zone_news_data.channel': '@ZoneNewsAdl' },
                { source: { $regex: 'Zone News', $options: 'i' } },
                { 'source_metadata.is_original_source': true }
            ]
        };

        // Add search filter with MongoDB text search
        if (sanitizedSearch) {
            query.$and = [
                { $or: query.$or },
                {
                    $or: [
                        { title: { $regex: sanitizedSearch, $options: 'i' } },
                        { content: { $regex: sanitizedSearch, $options: 'i' } }
                    ]
                }
            ];
        }

        // Execute query with timeout protection
        const dbInstance = await getDb();
        const articles = await Promise.race([
            dbInstance.collection('news_articles')
                .find(query)
                .sort({ published_date: -1, 'zone_news_data.message_id': -1 })
                .skip((validatedPage - 1) * validatedLimit)
                .limit(validatedLimit)
                .toArray(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database query timeout')), 10000)
            )
        ]);

        // Process articles with security considerations
        const processedArticles = articles.map(article => {
            const articleCategory = categorizeArticle(article);
            const articleScope = determineScope(article);
            const articleCity = determineCity(article);
            
            return {
                id: article._id,
                title: article.title?.substring(0, 200) || 'Untitled',
                content: article.content?.substring(0, 1000) || '',
                excerpt: (article.summary || article.content || '').substring(0, 200) + '...',
                category: articleCategory,
                scope: articleScope,
                city: articleCity,
                source: article.source || 'Zone News',
                published_date: article.published_date || article.created_at,
                views: Math.max(0, article.views || article.zone_news_data?.views || 0),
                reactions: article.reactions || {},
                isPremium: articleCategory === 'analysis',
                messageId: article.zone_news_data?.message_id,
                channelUrl: article.zone_news_data?.message_id 
                    ? `https://t.me/ZoneNewsAdl/${article.zone_news_data.message_id}`
                    : null
            };
        });

        // Apply filters securely
        let filteredArticles = processedArticles;
        if (category && category !== 'all' && Object.keys(categoryMap).includes(category)) {
            filteredArticles = filteredArticles.filter(a => a.category === category);
        }

        if (scope && scope !== 'all' && ['local', 'national', 'global'].includes(scope)) {
            filteredArticles = filteredArticles.filter(a => a.scope === scope);
        }

        if (scope === 'local' && city) {
            filteredArticles = filteredArticles.filter(a => a.city === city);
        }

        // Get total count for pagination
        const totalCount = await dbInstance.collection('news_articles').countDocuments(query);

        res.json({
            success: true,
            articles: filteredArticles,
            totalArticles: filteredArticles.length,
            totalPages: Math.ceil(totalCount / validatedLimit),
            currentPage: validatedPage,
            metadata: {
                scope,
                category,
                city: scope === 'local' ? city : null,
                source: 'Zone News Adelaide Channel',
                cached: false,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Error fetching news:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch news articles',
            code: 'NEWS_FETCH_ERROR'
        });
    }
});

// Additional secure endpoints with similar patterns
app.get('/api/trending', async (req, res) => {
    try {
        const dbInstance = await getDb();
        const trending = await dbInstance.collection('news_articles')
            .find({
                $or: [
                    { 'zone_news_data.channel': '@ZoneNewsAdl' },
                    { source: { $regex: 'Zone News', $options: 'i' } }
                ]
            })
            .sort({ views: -1, 'zone_news_data.views': -1 })
            .limit(10)
            .toArray();

        const processedTrending = trending.map(article => ({
            id: article._id,
            title: article.title?.substring(0, 200) || 'Untitled',
            views: Math.max(0, article.views || article.zone_news_data?.views || 0),
            category: categorizeArticle(article)
        }));

        res.json({
            success: true,
            trending: processedTrending,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching trending:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch trending articles',
            code: 'TRENDING_FETCH_ERROR'
        });
    }
});

app.get('/api/breaking', async (req, res) => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const dbInstance = await getDb();
        
        const breaking = await dbInstance.collection('news_articles')
            .find({
                $and: [
                    {
                        $or: [
                            { 'zone_news_data.channel': '@ZoneNewsAdl' },
                            { source: { $regex: 'Zone News', $options: 'i' } }
                        ]
                    },
                    {
                        published_date: { $gte: twentyFourHoursAgo }
                    }
                ]
            })
            .sort({ published_date: -1 })
            .limit(5)
            .toArray();

        const processedBreaking = breaking.map(article => ({
            id: article._id,
            title: article.title?.substring(0, 200) || 'Untitled',
            content: (article.content || '').substring(0, 150) + '...',
            publishedAt: article.published_date,
            category: categorizeArticle(article)
        }));

        res.json({
            success: true,
            breaking: processedBreaking,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching breaking news:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch breaking news',
            code: 'BREAKING_FETCH_ERROR'
        });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dbInstance = await getDb();
        const stats = {
            totalArticles: await dbInstance.collection('news_articles').countDocuments(),
            todayArticles: await dbInstance.collection('news_articles').countDocuments({
                published_date: { $gte: today }
            }),
            categories: {}
        };

        // Count by category efficiently
        const pipeline = [
            { $match: {} },
            { $group: { _id: null, articles: { $push: "$$ROOT" } } }
        ];
        
        const result = await dbInstance.collection('news_articles').aggregate(pipeline).toArray();
        if (result.length > 0) {
            const articles = result[0].articles;
            for (const category of Object.keys(categoryMap)) {
                stats.categories[category] = articles.filter(a => 
                    categorizeArticle(a) === category
                ).length;
            }
        }

        res.json({
            success: true,
            stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics',
            code: 'STATS_FETCH_ERROR'
        });
    }
});

// Enhanced health check with security status
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Zone News API',
        database: db ? 'connected' : 'disconnected',
        security: 'enabled',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// Mount additional routers with error handling
const routers = [
    'admin', 'user', 'channels', 'settings', 'articles', 
    'news', 'analytics', 'bot', 'workflow', 'subscription'
];

routers.forEach(routerName => {
    try {
        const router = require(`./routes/${routerName}`);
        app.use('/api', router);
        console.log(`✅ Mounted ${routerName} router`);
    } catch (error) {
        console.warn(`⚠️ Router ${routerName} not available:`, error.message);
    }
});

// Start secure server
async function startServer() {
    try {
        // Initialize database
        await connectDB();
        
        // Initialize Telegram bot service
        if (telegramBotService && typeof telegramBotService.initialize === 'function') {
            await telegramBotService.initialize();
            console.log('✅ Telegram Bot Service ready for webhook updates');
        } else {
            console.warn('⚠️ Telegram bot service not available; webhook will handle updates internally');
        }

        // Create secure server
        const server = createSecureServer(app, {
            port: config.PORT,
            httpsPort: config.HTTPS_PORT,
            host: '0.0.0.0'
        });

        console.log('🚀 Zone News API Server Started');
        console.log(`🌐 HTTP: http://0.0.0.0:${config.PORT}`);
        if (security.envConfig.enableSSL) {
            console.log(`🔒 HTTPS: https://0.0.0.0:${config.HTTPS_PORT}`);
        }
        console.log(`📡 API: /api/news`);
        console.log(`📬 Webhook: /webhook`);
        console.log(`🛡️ Security: ENABLED`);

        return server;

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown with security cleanup
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    if (client) {
        await client.close();
        console.log('✅ Database connection closed');
    }
    console.log('👋 Server shutdown complete');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 SIGTERM received, shutting down...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});

// Export for testing
module.exports = { app, startServer, getDb };

// Start server if run directly
if (require.main === module) {
    startServer().catch(console.error);
}