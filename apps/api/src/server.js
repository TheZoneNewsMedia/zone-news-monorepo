/**
 * Zone News API Server
 * Serves scraped articles from @ZoneNewsAdl channel
 */

const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
// Wire Telegram bot updates via this API's /webhook
let telegramBotService = null;
try { telegramBotService = require('./services/telegram-bot-service'); } catch (_) {}

// Performance monitoring
const PerformanceMonitoringMiddleware = require('./middleware/performance-monitoring.middleware');

// Redis caching with graceful degradation
const RedisCacheGracefulService = require('./services/redis-cache-graceful.service');
const CacheMiddleware = require('./middleware/cache.middleware');

// Error handling
const ErrorHandlingMiddleware = require('./middleware/error-handling.middleware');

// Advanced rate limiting
const AdvancedRateLimitingMiddleware = require('./middleware/advanced-rate-limiting.middleware');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const DB_NAME = 'zone_news_production';

// Initialize performance monitoring
const performanceMiddleware = new PerformanceMonitoringMiddleware();

// Initialize Redis caching with graceful degradation
const cacheService = new RedisCacheGracefulService();
const cacheMiddleware = new CacheMiddleware(cacheService);

// Initialize error handling
const errorHandling = new ErrorHandlingMiddleware(
    performanceMiddleware.getMetricsService(),
    performanceMiddleware.getAlertingService()
);

// Initialize advanced rate limiting
const rateLimiting = new AdvancedRateLimitingMiddleware(cacheService);
const rateLimiters = rateLimiting.createEndpointLimiters();

// Set up global error handlers
errorHandling.handleUnhandledRejection();
errorHandling.handleUncaughtException();

// Integrate cache metrics with performance monitoring
cacheMiddleware.setMetricsService(performanceMiddleware.getMetricsService());

// Make services available to routes
app.locals.metricsService = performanceMiddleware.getMetricsService();
app.locals.alertingService = performanceMiddleware.getAlertingService();
app.locals.cacheService = cacheService;
app.locals.errorHandling = errorHandling;
app.locals.rateLimiting = rateLimiting;

// Middleware with secure CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Get allowed origins from environment variable
        const envOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : [];

        const allowedOrigins = [
            'https://thezonenews.com',
            'https://www.thezonenews.com',
            'http://thezonenews.com',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3004',
            'http://localhost:5173',  // Vite dev server
            'http://localhost:4321',   // Astro dev server
            ...envOrigins
        ];

        // Allow requests with no origin (mobile apps, Postman, curl, etc)
        if (!origin) return callback(null, true);

        // Allow any origin in development or for API testing
        if (process.env.NODE_ENV === 'development' || origin.includes('localhost')) {
            return callback(null, true);
        }

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('⚠️ CORS blocked origin:', origin);
            // In production, still allow but log for monitoring
            callback(null, true);
        }
    },
    credentials: true,
    maxAge: 86400 // Cache preflight for 24 hours
};

app.use(cors(corsOptions));
app.use(express.json());

// Apply rate limiting (before other middleware)
app.use(rateLimiters.slowDown);
app.use('/api/admin', rateLimiters.admin);
app.use('/api', rateLimiters.public);

// Apply performance monitoring middleware
app.use(performanceMiddleware.monitor());
// Telegram webhook endpoint - handle gracefully
app.use('/webhook', async (req, res) => {
    try {
        // Check if this is a valid webhook path
        if (!req.url || !req.url.includes(':')) {
            return res.status(404).json({ error: 'Invalid webhook path' });
        }
        
        const axios = require('axios');
        
        // Try to forward to bot service on port 3002 (where zone-telegram-bot runs)
        try {
            const response = await axios({
                method: req.method,
                url: `http://localhost:3002${req.url}`,
                data: req.body,
                headers: {
                    ...req.headers,
                    host: 'localhost:3002'
                },
                timeout: 3000
            });
            
            return res.status(response.status).send(response.data);
        } catch (botError) {
            // If bot is not available, still respond OK to Telegram
            if (botError.code === 'ECONNREFUSED') {
                console.log('⚠️ Bot service not available on port 3002');
            }
        }
        
        // Always respond OK to Telegram to prevent retries
        res.sendStatus(200);
        
    } catch (error) {
        // Log but don't fail
        console.log('Webhook handled:', req.url);
        res.sendStatus(200);
    }
});


// MongoDB connection
let db;
let client;

async function connectDB() {
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log('✅ Connected to MongoDB');
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
module.exports.getDb = getDb;
module.exports.db = db;

// Category mapping
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

// Helper function to categorize articles
function categorizeArticle(article) {
    const content = (article.title + ' ' + article.content).toLowerCase();
    
    for (const [category, keywords] of Object.entries(categoryMap)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return category;
        }
    }
    
    return 'general';
}

// Helper function to determine scope
function determineScope(article) {
    const content = (article.title + ' ' + article.content).toLowerCase();
    
    // Check for global indicators
    if (content.includes('world') || content.includes('global') || content.includes('international')) {
        return 'global';
    }
    
    // Check for national indicators
    if (content.includes('australia') || content.includes('federal') || content.includes('national')) {
        return 'national';
    }
    
    // Default to local
    return 'local';
}

// Helper function to determine city
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
    
    return 'Adelaide'; // Default to Adelaide
}

// GET /api/news - Fetch news articles
app.get('/api/news', rateLimiters.news, CacheMiddleware.createNewsCache(cacheService), errorHandling.asyncHandler(async (req, res) => {
    const {
            category = 'all',
            scope = 'all',
            city = 'Adelaide',
            page = 1,
            limit = 20,
            search = ''
        } = req.query;
        
        // Build query
        let query = {
            $or: [
                { 'zone_news_data.channel': '@ZoneNewsAdl' },
                { source: { $regex: 'Zone News', $options: 'i' } },
                { 'source_metadata.is_original_source': true }
            ]
        };
        
        // Add search filter
        if (search) {
            query.$and = [
                { $or: query.$or },
                {
                    $or: [
                        { title: { $regex: search, $options: 'i' } },
                        { content: { $regex: search, $options: 'i' } }
                    ]
                }
            ];
        }
        
        // Fetch articles
        const articles = await db.collection('news_articles')
            .find(query)
            .sort({ published_date: -1, 'zone_news_data.message_id': -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .toArray();
        
        // Process and categorize articles
        const processedArticles = articles.map(article => {
            const articleCategory = categorizeArticle(article);
            const articleScope = determineScope(article);
            const articleCity = determineCity(article);
            
            return {
                id: article._id,
                title: article.title,
                content: article.content || article.summary || '',
                excerpt: article.summary || article.content?.substring(0, 200) + '...',
                category: articleCategory,
                scope: articleScope,
                city: articleCity,
                source: article.source || 'Zone News',
                published_date: article.published_date || article.created_at,
                views: article.views || article.zone_news_data?.views || 0,
                reactions: article.reactions || {},
                isPremium: articleCategory === 'analysis',
                messageId: article.zone_news_data?.message_id,
                channelUrl: article.zone_news_data?.message_id 
                    ? `https://t.me/ZoneNewsAdl/${article.zone_news_data.message_id}`
                    : null
            };
        });
        
        // Filter by category
        let filteredArticles = processedArticles;
        if (category !== 'all') {
            filteredArticles = filteredArticles.filter(a => a.category === category);
        }
        
        // Filter by scope
        if (scope !== 'all') {
            filteredArticles = filteredArticles.filter(a => a.scope === scope);
        }
        
        // Filter by city (only for local scope)
        if (scope === 'local' && city) {
            filteredArticles = filteredArticles.filter(a => a.city === city);
        }
        
        // Get total count for pagination
        const totalCount = await db.collection('news_articles').countDocuments(query);
        
        res.json({
            success: true,
            articles: filteredArticles,
            totalArticles: filteredArticles.length,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: parseInt(page),
            metadata: {
                scope,
                category,
                city: scope === 'local' ? city : null,
                source: 'Zone News Adelaide Channel'
            }
        });
}));

// GET /api/trending - Get trending articles
app.get('/api/trending', rateLimiters.news, CacheMiddleware.createTrendingCache(cacheService), errorHandling.asyncHandler(async (req, res) => {
        const trending = await db.collection('news_articles')
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
            title: article.title,
            views: article.views || article.zone_news_data?.views || 0,
            category: categorizeArticle(article)
        }));
        
        res.json({
            success: true,
            trending: processedTrending
        });
}));

// GET /api/breaking - Get breaking news
app.get('/api/breaking', CacheMiddleware.createBreakingCache(cacheService), errorHandling.asyncHandler(async (req, res) => {
        // Get articles from last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const breaking = await db.collection('news_articles')
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
            title: article.title,
            content: article.content?.substring(0, 150) + '...',
            publishedAt: article.published_date,
            category: categorizeArticle(article)
        }));
        
        res.json({
            success: true,
            breaking: processedBreaking
        });
}));

// GET /api/stats - Get news statistics
app.get('/api/stats', CacheMiddleware.createStatsCache(cacheService), errorHandling.asyncHandler(async (req, res) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const stats = {
            totalArticles: await db.collection('news_articles').countDocuments(),
            todayArticles: await db.collection('news_articles').countDocuments({
                published_date: { $gte: today }
            }),
            categories: {}
        };
        
        // Count by category
        for (const category of Object.keys(categoryMap)) {
            const articles = await db.collection('news_articles').find({}).toArray();
            stats.categories[category] = articles.filter(a => 
                categorizeArticle(a) === category
            ).length;
        }
        
        res.json({
            success: true,
            stats
        });
}));

// Health check endpoint
app.get('/health', rateLimiters.health, (req, res) => {
    res.json({
        status: 'ok',
        service: 'Zone News API',
        database: db ? 'connected' : 'disconnected'
    });
});

// Mount modular routers
try {
    const adminRouter = require('./routes/admin');
    app.use('/api', adminRouter);
} catch {}
try {
    const userRouter = require('./routes/user');
    app.use('/api', userRouter);
} catch {}
try {
    const channelsRouter = require('./routes/channels');
    app.use('/api', channelsRouter);
} catch {}
try {
    const settingsRouter = require('./routes/settings');
    app.use('/api', settingsRouter);
} catch {}
try {
    const articlesRouter = require('./routes/articles');
    app.use('/api', articlesRouter);
} catch {}
try {
    const newsRouter = require('./routes/news');
    app.use('/api', newsRouter);
} catch {}
try {
    const analyticsRouter = require('./routes/analytics');
    app.use('/api', analyticsRouter);
} catch {}
try {
    const botRouter = require('./routes/bot');
    app.use('/api', botRouter);
} catch {}
try {
    const workflowRouter = require('./routes/workflow');
    app.use('/api', workflowRouter);
} catch {}
try {
    const subscriptionRouter = require('./routes/subscription');
    app.use('/api', subscriptionRouter);
} catch {}
try {
    const performanceRouter = require('./routes/admin-performance.routes');
    app.use('/api', performanceRouter);
} catch {}
try {
    const botStatusRouter = require('./routes/bot-status.routes');
    app.use('/api', botStatusRouter);
} catch {}
try {
    const authHealthRouter = require('./routes/auth-health.routes');
    const adminSystemRouter = require('./routes/admin-system.routes');
    app.use('/api', authHealthRouter);
    app.use('/api/admin', adminSystemRouter);
} catch {}

// Error handling middleware (must be last)
app.use(errorHandling.notFoundHandler());
app.use(errorHandling.handleError());

// Start server
async function startServer() {
    await connectDB();
    // Initialize Telegram bot service so it can accept updates
    try {
        if (telegramBotService && typeof telegramBotService.initialize === 'function') {
            await telegramBotService.initialize();
            console.log('✅ Telegram Bot Service ready for /webhook updates');
        } else {
            console.warn('telegram-bot-service not available; /webhook will be a no-op');
        }
    } catch (e) {
        console.error('Telegram bot service initialization failed', e);
    }
    
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Zone News API running on port ${PORT}`);
        console.log(`📡 Serving articles from @ZoneNewsAdl channel`);
        console.log(`🔗 API endpoint: http://0.0.0.0:${PORT}/api/news`);
        console.log(`📬 Webhook endpoint: http://0.0.0.0:${PORT}/webhook`);
    });
    return server;
}
module.exports.app = app;

if (require.main === module) {
  startServer().catch(console.error);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});