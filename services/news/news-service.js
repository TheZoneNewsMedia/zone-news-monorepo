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

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const DB_NAME = 'zone_news_production';

// Middleware
app.use(cors());
app.use(express.json());
// Telegram webhook endpoint (fast-ack + optional secret validation)
app.post('/webhook', async (req, res) => {
    try {
        const providedSecret = req.headers['x-telegram-bot-api-secret-token'] || req.query.secret;
        const expectedSecret = process.env.WEBHOOK_SECRET || '';
        if (expectedSecret && providedSecret !== expectedSecret) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Acknowledge immediately to avoid Telegram retries
        res.sendStatus(200);

        // Process update asynchronously
        setImmediate(() => {
            try {
                if (telegramBotService && typeof telegramBotService.processUpdate === 'function') {
                    telegramBotService.processUpdate(req.body);
                }
            } catch (e) {
                console.error('webhook processing error', e);
            }
        });
    } catch (e) {
        console.error('webhook endpoint error', e);
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
app.get('/api/news', async (req, res) => {
    try {
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
        
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch news articles'
        });
    }
});

// GET /api/trending - Get trending articles
app.get('/api/trending', async (req, res) => {
    try {
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
        
    } catch (error) {
        console.error('Error fetching trending:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch trending articles'
        });
    }
});

// GET /api/breaking - Get breaking news
app.get('/api/breaking', async (req, res) => {
    try {
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
        
    } catch (error) {
        console.error('Error fetching breaking news:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch breaking news'
        });
    }
});

// GET /api/stats - Get news statistics
app.get('/api/stats', async (req, res) => {
    try {
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
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Zone News API',
        database: db ? 'connected' : 'disconnected'
    });
});

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
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Zone News API running on port ${PORT}`);
        console.log(`📡 Serving articles from @ZoneNewsAdl channel`);
        console.log(`🔗 API endpoint: http://0.0.0.0:${PORT}/api/news`);
        console.log(`📬 Webhook endpoint: http://0.0.0.0:${PORT}/webhook`);
    });
}

startServer().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});