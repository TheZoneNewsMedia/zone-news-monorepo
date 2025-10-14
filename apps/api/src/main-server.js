#!/usr/bin/env node

/**
 * Zone News API Server
 * Connects Mini App to existing multi-agent system
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
// Telegram bot (webhook-driven) service wiring
let telegramBotService = null;
let botConfig = null;
try {
    telegramBotService = require('./services/telegram-bot-service');
    botConfig = require('./config/bot-config');
} catch (_) {}
let ChannelBinding;
try { ChannelBinding = require('./models/ChannelBinding'); } catch (_) { ChannelBinding = null; }
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
let db = null;

async function connectDB() {
    try {
        const client = await MongoClient.connect(mongoUri);
        db = client.db();
        console.log('Connected to MongoDB for API server');
        return db;
    } catch (error) {
        console.error('MongoDB connection failed:', error);
        return null;
    }
}

// Connect to database on startup
connectDB();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'zone-news-secret-2025';
const JWT_EXPIRES_IN = '30d';

// Simple anonymous paywall (per IP/device via cookie)
const PAYWALL_LIMIT = Number(process.env.ANON_FREE_ARTICLES_PER_DAY || 3);
const PAYWALL_COOKIE = 'zn_anon_views';
function getResetAtISO() {
    const now = new Date();
    const reset = new Date(now);
    reset.setUTCHours(24,0,0,0); // next UTC midnight
    return reset.toISOString();
}
function parsePaywallCookie(cookieValue) {
    try { return JSON.parse(decodeURIComponent(cookieValue)); } catch { return null; }
}
function checkAndIncrementAnonViews(req, res) {
    try {
        const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c=>c.trim().split('=')));
        let state = cookies[PAYWALL_COOKIE] ? parsePaywallCookie(cookies[PAYWALL_COOKIE]) : null;
        const today = new Date().toISOString().slice(0,10);
        if (!state || state.date !== today) {
            state = { date: today, views: 0 };
        }
        if (state.views >= PAYWALL_LIMIT) {
            return false;
        }
        state.views += 1;
        const expires = new Date();
        expires.setUTCHours(24,0,0,0);
        res.setHeader('Set-Cookie', `${PAYWALL_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Expires=${expires.toUTCString()}; SameSite=Lax`);
        return true;
    } catch {
        return true; // fail-open
    }
}

// Helper function for time ago
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

// Generate JWT token
function generateToken(userId) {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Auth middleware
async function authMiddleware(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        
        // Get user from DB
        const user = await db.collection('users').findOne(
            { _id: new ObjectId(decoded.id) },
            { projection: { password: 0 } }
        );
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Import existing services
let getService;
try {
    const { getService: getServiceFn } = require('./services/ServiceRegistry');
    getService = getServiceFn || (() => null);
} catch (error) {
    // Fallback if ServiceRegistry doesn't exist
    getService = () => null;
}

let logger;
try {
    logger = require('./config/logger');
} catch (error) {
    // Fallback logger
    logger = {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: console.debug
    };
}

const app = express();
const PORT = process.env.API_PORT || 3003;

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdn.tailwindcss.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            connectSrc: ["'self'", 'https://thezonenews.com', 'https://www.thezonenews.com'],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: [
        'https://thezonenews.com',
        'https://www.thezonenews.com',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003'
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply security headers from Terraform-provided env (optional)
// Usage: set TF_SECURITY_HEADERS to a JSON object of header/value pairs
// Example: TF_SECURITY_HEADERS='{"Strict-Transport-Security":"max-age=63072000; includeSubDomains; preload","X-Frame-Options":"DENY"}'
try {
  const tfHeadersRaw = process.env.TF_SECURITY_HEADERS;
  if (tfHeadersRaw) {
    const tfHeaders = JSON.parse(tfHeadersRaw);
    app.use((req, res, next) => {
      for (const [name, value] of Object.entries(tfHeaders)) {
        if (typeof value === 'string' && value.length > 0) {
          res.setHeader(name, value);
        }
      }
      next();
    });
  }
} catch (e) {
  logger?.warn?.('Failed to parse TF_SECURITY_HEADERS; skipping', { error: e.message });
}

// Serve global static assets (manifest, sw, images)
try {
    const staticPath = path.join(__dirname, 'public');
    app.use(express.static(staticPath));
    logger.info(`Static assets served from ${staticPath}`);
} catch (e) {
    logger.warn('Public static directory not available');
}

// Expose service worker at root scope
app.get('/service-worker.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'service-worker.js'));
});

// Telegram webhook endpoint (optional: prefer dedicated WebhookService)
if (process.env.TELEGRAM_WEBHOOK_VIA_API === 'true') {
  app.post('/webhook', (req, res) => {
      try {
          const providedSecret = req.headers['x-telegram-bot-api-secret-token'] || req.query.secret;
          const expectedSecret = process.env.WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';
          if (expectedSecret && providedSecret !== expectedSecret) {
              return res.status(403).json({ error: 'Forbidden' });
          }

          // Acknowledge immediately to avoid Telegram retries
          res.sendStatus(200);

          // Process update asynchronously
          setImmediate(() => {
              try {
                  const botService = require('./services/telegram-bot-service');
                  if (botService && typeof botService.processUpdate === 'function') {
                      botService.processUpdate(req.body);
                  } else if (botService && typeof botService.handleUpdate === 'function') {
                      botService.handleUpdate(req.body);
                  } else {
                      logger.warn('telegram-bot-service missing processUpdate/handleUpdate');
                  }
              } catch (e) {
                  logger.error('webhook processing error', e);
              }
          });
      } catch (e) {
          logger.error('webhook endpoint error', e);
          res.sendStatus(200);
      }
  });
}

// Mount versioned API
app.use('/v1', require('./routes/v1'));

// Serve Mini App static files
app.use('/miniapp', express.static(path.join(__dirname, 'mini-app')));

// Serve CMS (basic static) if present
try {
    app.use('/cms', express.static(path.join(__dirname, 'cms-system', 'public')));
    logger.info('CMS static served at /cms');
} catch (_) {}

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, { 
        ip: req.ip, 
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Zone News API',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
    });
});

// Homepage route - serves the main blog/website
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'zone-news-home.html'));
});

// Admin routes
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-auth.html'));
});

// Mini App routes
app.get('/miniapp', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'index.html'));
});

app.get('/miniapp/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'index.html'));
});

app.get('/miniapp/bot-control', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'bot-control.html'));
});

// Mini App article and settings routes
app.get('/miniapp/article/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'article.html'));
});

app.get('/miniapp/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'settings.html'));
});

app.get('/miniapp/channels', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'channels.html'));
});

app.get('/miniapp/groups', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'groups.html'));
});

app.get('/miniapp/tiers', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'tiers.html'));
});

app.get('/miniapp/commands', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'commands.html'));
});

// Redirect legacy path to miniapp
app.get('/telegram-mini-app', (req, res) => {
    res.redirect(301, '/miniapp');
});

// Redirect legacy blog paths to Opinion view
app.get(['/blog', '/blog.html'], (req, res) => {
    res.redirect(301, '/news.html?category=opinion');
});

app.get('/miniapp/bot-control.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'bot-control.html'));
});

// Admin/Bot control routes
app.get('/bot', (req, res) => {
    res.sendFile(path.join(__dirname, 'mini-app', 'bot-control.html'));
});

// Auth page route
app.get(['/auth', '/login', '/signup'], (req, res) => {
    // Redirect legacy auth routes to CMS login page
    res.redirect(302, '/cms/login.html');
});

// Article detail page
app.get('/article/:id', async (req, res) => {
    try {
        const articleId = req.params.id;
        
        // Try to get from MongoDB
        if (db) {
            let article;
            
            // Try as ObjectId first
            try {
                const ObjectId = require('mongodb').ObjectId;
                article = await db.collection('articles').findOne({ _id: new ObjectId(articleId) });
            } catch (e) {
                // If not valid ObjectId, try as string ID
                article = await db.collection('articles').findOne({ id: articleId });
            }
            
            if (article) {
                // Increment view count
                await db.collection('articles').updateOne(
                    { _id: article._id },
                    { $inc: { views: 1 } }
                );
                
                // Return article page (you could return JSON or render a template)
                return res.json({
                    success: true,
                    article: {
                        id: article._id.toString(),
                        title: article.title,
                        content: article.content,
                        summary: article.summary,
                        category: article.category,
                        published_at: article.publishedAt,
                        image: article.images?.[0] || article.image,
                        author: article.author || 'Zone News',
                        views: article.views || 0,
                        source: article.source,
                        telegram_views: article.telegram_views || 0
                    }
                });
            }
        }
        
        res.status(404).json({ error: 'Article not found' });
    } catch (error) {
        logger.error('Error fetching article:', error);
        res.status(500).json({ error: 'Failed to load article' });
    }
});

/**
 * News API Endpoints
 */

// Get latest news from MongoDB
app.get('/api/news', async (req, res) => {
    try {
        const { limit = 10, category = '', location = '', page = 1 } = req.query;
        
        logger.info('News API request:', { limit, category, location });
        
        // Try to get from MongoDB first
        if (db) {
            try {
                const newsQuery = {};
                if (location) {
                    newsQuery.location = new RegExp(location, 'i');
                }

                const newsArticles = await db.collection('articles')
                    .find(newsQuery)
                    .sort({ publishedAt: -1 })
                    .limit(parseInt(limit))
                    .toArray();

                // Include blog posts as Opinion in the unified feed
                let blogPosts = [];
                try {
                    blogPosts = await db.collection('blogposts')
                        .find({ status: 'published' })
                        .sort({ publishedAt: -1 })
                        .limit(parseInt(limit))
                        .toArray();
                } catch (blogErr) {
                    logger.warn('Blog collection fetch failed (optional):', blogErr.message);
                }

                const transformedNews = (newsArticles || []).map(article => ({
                    id: article._id?.toString?.() || article.id,
                    title: article.title,
                    summary: article.summary || article.content?.substring(0, 200) || '',
                    content: article.content || article.summary || '',
                    category: article.category || 'General',
                    published_at: article.publishedAt || new Date(),
                    image: article.images?.[0] || article.image || null,
                    source: article.source || 'Zone News',
                    location: article.location || 'Adelaide',
                    excerpt: article.summary || article.content?.substring(0, 150) || '',
                    timeAgo: getTimeAgo(article.publishedAt)
                }));

                const transformedOpinions = (blogPosts || []).map(post => ({
                    id: post._id?.toString?.(),
                    title: post.title,
                    summary: post.excerpt || post.telegramSummary || '',
                    content: post.content || post.excerpt || '',
                    category: 'Opinion',
                    published_at: post.publishedAt || post.createdAt || new Date(),
                    image: post.featuredImage?.url || null,
                    source: 'Opinion',
                    location: 'Adelaide',
                    excerpt: post.excerpt || '',
                    timeAgo: getTimeAgo(post.publishedAt || post.createdAt)
                }));

                // Merge, optionally filter by category, then paginate
                let merged = [...transformedNews, ...transformedOpinions]
                    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

                if (category && category !== 'all') {
                    const catLower = String(category).toLowerCase();
                    merged = merged.filter(a => (a.category || '').toLowerCase().includes(catLower));
                }

                const pageNum = Math.max(1, parseInt(page));
                const pageSize = Math.max(1, parseInt(limit));
                const start = (pageNum - 1) * pageSize;
                const end = start + pageSize;
                const limited = merged.slice(start, end);

                return res.json({
                    success: true,
                    articles: limited,
                    total: merged.length,
                    page: pageNum,
                    limit: pageSize,
                    totalPages: Math.max(1, Math.ceil(merged.length / pageSize)),
                    source: 'database+blog',
                    timestamp: new Date().toISOString()
                });
            } catch (dbError) {
                logger.error('Database query error:', dbError);
            }
        }
        
        // Fallback to ProductionNewsService if available
        const productionNewsService = getService('productionNewsService');
        
        if (!productionNewsService) {
            logger.error('ProductionNewsService not available, using fallback');
            return res.json({
                success: true,
                articles: getFallbackNews(req.query),
                total: 5,
                source: 'fallback',
                timestamp: new Date().toISOString()
            });
        }

        // Process news with multi-agent system
        const newsOptions = {
            category: category || 'general',
            location: location || 'Australia',
            limit: parseInt(limit),
            priority: 'high',
            source: 'mini-app'
        };

        const newsResult = await productionNewsService.processNews(newsOptions);
        
        if (newsResult && newsResult.articles) {
            // Transform for Mini App format
            const transformedArticles = newsResult.articles.map(article => ({
                id: article.id || Math.random().toString(36).substr(2, 9),
                title: article.title || 'Untitled',
                summary: article.summary || article.description || '',
                content: article.content || '',
                category: article.category || category || 'General',
                time: article.publishedAt || article.time || 'Just now',
                published_at: article.publishedAt || new Date().toISOString(),
                image: article.image || article.urlToImage || null,
                location: article.location || location || null,
                source: article.source || 'Zone News',
                url: article.url || null,
                credibility_score: article.credibilityScore || 0.8,
                engagement_score: article.engagementScore || 0.7
            }));

            // Best-effort persistence so DB isn't empty next time
            try {
                if (db) {
                    const ops = transformedArticles.map(a => ({
                        updateOne: {
                            filter: { title: a.title, publishedAt: new Date(a.published_at) },
                            update: {
                                $setOnInsert: {
                                    createdAt: new Date()
                                },
                                $set: {
                                    title: a.title,
                                    summary: a.summary,
                                    content: a.content,
                                    category: a.category,
                                    publishedAt: new Date(a.published_at),
                                    image: a.image,
                                    location: a.location || 'Adelaide, Australia',
                                    source: a.source || 'Zone News',
                                    url: a.url || null,
                                    updatedAt: new Date()
                                }
                            },
                            upsert: true
                        }
                    }));
                    if (ops.length > 0) {
                        await db.collection('articles').bulkWrite(ops, { ordered: false });
                    }
                }
            } catch (persistErr) {
                logger.warn('Non-fatal: failed to persist fetched articles', { error: persistErr.message });
            }

            res.json({
                success: true,
                articles: transformedArticles,
                total: transformedArticles.length,
                source: 'multi-agent-ai',
                processed_by: 'ProductionNewsService',
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('No articles returned from news service');
        }

    } catch (error) {
        logger.error('News API error:', error);
        
        // Return fallback data
        res.json({
            success: true,
            articles: getFallbackNews(req.query),
            total: 5,
            source: 'fallback',
            error: 'Service temporarily unavailable - using cached data',
            timestamp: new Date().toISOString()
        });
    }
});

// Get trending news
app.get('/api/trending', async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        
        // Use existing analytics service for trending calculation
        const analyticsService = getService('analyticsService');
        const productionNewsService = getService('productionNewsService');
        
        let trendingArticles = [];
        
        if (analyticsService && productionNewsService) {
            // Get trending topics from analytics
            const trendingTopics = await analyticsService.getTrendingTopics(limit);
            
            // Process trending news
            const newsOptions = {
                topics: trendingTopics,
                priority: 'high',
                limit: parseInt(limit)
            };
            
            const newsResult = await productionNewsService.processNews(newsOptions);
            trendingArticles = newsResult.articles || [];
        }
        
        if (trendingArticles.length === 0) {
            trendingArticles = getFallbackTrending();
        }
        
        res.json({
            success: true,
            trending: trendingArticles.map(article => ({
                id: article.id,
                title: article.title,
                summary: article.summary,
                category: article.category,
                views: article.views || Math.floor(Math.random() * 5000) + 1000,
                engagement: article.engagement || Math.floor(Math.random() * 100) + 50,
                trend_score: article.trendScore || Math.random() * 0.5 + 0.5
            })),
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Trending API error:', error);
        res.json({
            success: true,
            trending: getFallbackTrending(),
            source: 'fallback'
        });
    }
});

// Themes (multi-source coverage) from RSS aggregator
app.get('/api/news/themes', async (req, res) => {
  try {
    const rssService = getService('rssAggregator');
    if (!rssService) {
      return res.status(503).json({ error: 'RSS service unavailable' });
    }
    const data = await rssService.getThemes();
    res.json(data);
  } catch (error) {
    logger.error('Themes API error:', error);
    const rssService = getService('rssAggregator');
    const cached = rssService?.getCachedThemes?.();
    if (cached && cached.themes?.length) return res.json(cached);
    res.status(500).json({ error: 'Failed to build themes' });
  }
});

// Breaking news derived from most recent themed articles
app.get('/api/news/breaking', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(25, parseInt(req.query.limit || '10')));
    const rssService = getService('rssAggregator');
    if (!rssService) {
      return res.status(503).json({ error: 'RSS service unavailable' });
    }
    const { themes } = await rssService.getThemes();
    const all = (themes || []).flatMap(t => (t.articles || []).map(a => ({ ...a, topic: t.name })));
    const recent = all
      .filter(a => a.publishedAt)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, limit);
    res.json({ success: true, items: recent });
  } catch (error) {
    logger.error('Breaking API error:', error);
    res.status(500).json({ success: false, items: [] });
  }
});
// Search news
app.get('/api/search', async (req, res) => {
    try {
        const { q: query, limit = 10 } = req.query;
        
        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Search query must be at least 2 characters'
            });
        }
        
        logger.info('Search request:', { query, limit });
        
        const productionNewsService = getService('productionNewsService');
        
        if (productionNewsService) {
            const searchOptions = {
                searchQuery: query,
                limit: parseInt(limit),
                priority: 'normal'
            };
            
            const searchResult = await productionNewsService.processNews(searchOptions);
            
            res.json({
                success: true,
                query: query,
                results: searchResult.articles || [],
                total: searchResult.articles?.length || 0,
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('Search service unavailable');
        }
        
    } catch (error) {
        logger.error('Search API error:', error);
        res.status(500).json({
            error: 'Search temporarily unavailable',
            query: req.query.q
        });
    }
});

// Get individual article by ID
app.get('/api/article/:id', async (req, res) => {
    // Paywall check for anonymous users
    if (!req.headers.authorization) {
        const allowed = checkAndIncrementAnonViews(req, res);
        if (!allowed) {
            return res.status(402).json({
                success: false,
                paywall: true,
                error: 'Free article limit reached',
                limit: PAYWALL_LIMIT,
                reset_at: getResetAtISO(),
                upgrade_url: '/miniapp/tiers'
            });
        }
    }
    try {
        const { id } = req.params;
        
        if (!id || id.trim().length === 0) {
            return res.status(400).json({
                error: 'Article ID is required'
            });
        }
        
        logger.info('Article request:', { id });
        
        // First try to get from production news service
        const productionNewsService = getService('productionNewsService');
        
        if (productionNewsService && productionNewsService.getArticleById) {
            try {
                const article = await productionNewsService.getArticleById(id);
                if (article) {
                    const detailed = transformArticleForDetail(article);
                    const related = await getRelatedArticles(detailed, 6);
                    return res.json({
                        success: true,
                        ...detailed,
                        related,
                        source: 'production-service',
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                logger.error('Error fetching from production service:', error);
            }
        }
        
        // Fallback: Try to find in recent news
        try {
            const newsOptions = {
                limit: 50,
                priority: 'normal'
            };
            
            const newsResult = await productionNewsService?.processNews(newsOptions);
            const foundArticle = newsResult?.articles?.find(article => article.id === id);
            
            if (foundArticle) {
                const detailed = transformArticleForDetail(foundArticle);
                const related = await getRelatedArticles(detailed, 6);
                return res.json({
                    success: true,
                    ...detailed,
                    related,
                    source: 'news-service',
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            logger.error('Error searching recent news:', error);
        }

        // Try MongoDB articles
        try {
            if (db) {
                let doc = null;
                try { doc = await db.collection('articles').findOne({ _id: new ObjectId(id) }); } catch {}
                if (!doc) { doc = await db.collection('articles').findOne({ id }); }
                if (doc) {
                    const detailed = transformArticleForDetail({
                        id: String(doc._id || doc.id),
                        title: doc.title,
                        summary: doc.summary,
                        content: doc.content,
                        category: doc.category,
                        publishedAt: doc.publishedAt,
                        image: doc.image,
                        location: doc.location,
                        source: doc.source,
                        url: doc.url,
                        tags: doc.tags || []
                    });
                    const related = await getRelatedArticles(detailed, 6);
                    return res.json({ success: true, ...detailed, related, source: 'database', timestamp: new Date().toISOString() });
                }
            }
        } catch (dbErr) {
            logger.error('DB article lookup failed:', dbErr);
        }

        // Try blogposts (Opinion)
        try {
            if (db) {
                let post = null;
                try { post = await db.collection('blogposts').findOne({ _id: new ObjectId(id) }); } catch {}
                if (!post) { post = await db.collection('blogposts').findOne({ slug: id }); }
                if (post) {
                    const detailed = transformBlogPostForDetail(post);
                    const related = await getRelatedArticles(detailed, 6);
                    return res.json({ success: true, ...detailed, related, source: 'blog', timestamp: new Date().toISOString() });
                }
            }
        } catch (bpErr) {
            logger.error('Blogpost lookup failed:', bpErr);
        }
        
        // Final fallback: Generate article based on ID pattern
        const fallbackArticle = generateFallbackArticle(id);
        const related = await getRelatedArticles(fallbackArticle, 6);
        res.json({
            success: true,
            ...fallbackArticle,
            related,
            source: 'fallback',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Article API error:', error);
        res.status(500).json({
            error: 'Unable to fetch article',
            id: req.params.id
        });
    }
});

/**
 * Article Transformation Functions
 */

function transformArticleForDetail(article) {
    // Transform article data for article detail page
    return {
        id: article.id || Math.random().toString(36).substr(2, 9),
        title: article.title || 'Untitled Article',
        summary: article.summary || article.description || '',
        content: expandArticleContent(article.content || article.summary || ''),
        category: article.category || 'News',
        published_at: article.publishedAt || article.time || new Date().toISOString(),
        image: article.image || article.urlToImage || getRandomImage(article.category),
        location: article.location || 'Adelaide, Australia',
        source: article.source || 'Zone News',
        url: article.url || null,
        author: article.author || 'Zone News Team',
        author_title: article.author_title || 'News Review & Analysis Team',
        author_bio: article.author_bio || 'Providing expert review, aggregation, and analysis of Adelaide and Australian news with intelligent insights.',
        author_image: article.author_image || getRandomAuthorImage(),
        tags: article.tags || extractTags(article),
        views: article.views || Math.floor(Math.random() * 5000 + 500),
        likes: article.likes || Math.floor(Math.random() * 200 + 20),
        comments: article.comments || Math.floor(Math.random() * 50 + 5),
        credibility_score: article.credibilityScore || 0.8,
        engagement_score: article.engagementScore || 0.7
    };
}

function transformBlogPostForDetail(post) {
    return {
        id: String(post._id || post.slug || Math.random().toString(36).substr(2, 9)),
        title: post.title,
        summary: post.excerpt || post.telegramSummary || '',
        content: expandArticleContent(post.content || post.excerpt || ''),
        category: 'Opinion',
        published_at: post.publishedAt || post.createdAt || new Date().toISOString(),
        image: post.featuredImage?.url || getRandomImage('Opinion'),
        location: 'Adelaide, Australia',
        source: 'Opinion',
        url: null,
        author: post.author || 'Zone News Team',
        author_title: 'Opinion Contributor',
        author_bio: 'Opinion and analysis from our community and editorial team.',
        author_image: getRandomAuthorImage(),
        tags: post.tags || ['Opinion'],
        views: post.views || Math.floor(Math.random() * 2000 + 200),
        likes: post.likes || Math.floor(Math.random() * 200 + 20),
        comments: (post.comments || []).length
    };
}

async function getRelatedArticles(baseArticle, limit = 6) {
    try {
        if (!db) return [];
        const category = baseArticle.category || 'General';
        const objectId = (() => { try { return new ObjectId(baseArticle.id); } catch { return null; } })();

        const fromArticles = await db.collection('articles')
            .find({
                category: { $regex: new RegExp(category, 'i') },
                ...(objectId ? { _id: { $ne: objectId } } : {})
            })
            .sort({ publishedAt: -1 })
            .limit(limit)
            .toArray();

        const mappedArticles = fromArticles.map(a => ({
            id: String(a._id),
            title: a.title,
            summary: a.summary,
            category: a.category,
            published_at: a.publishedAt,
            image: a.image,
            source: a.source || 'Zone News'
        }));

        if (mappedArticles.length >= limit) return mappedArticles.slice(0, limit);

        const remaining = limit - mappedArticles.length;
        const fromPosts = await db.collection('blogposts')
            .find({})
            .sort({ publishedAt: -1 })
            .limit(remaining)
            .toArray();

        const mappedPosts = fromPosts.map(p => ({
            id: String(p._id),
            title: p.title,
            summary: p.excerpt || p.telegramSummary,
            category: 'Opinion',
            published_at: p.publishedAt || p.createdAt,
            image: p.featuredImage?.url,
            source: 'Opinion'
        }));

        return [...mappedArticles, ...mappedPosts];
    } catch (e) {
        logger.warn('getRelatedArticles failed', { error: e.message });
        return [];
    }
}

function expandArticleContent(originalContent) {
    if (!originalContent || originalContent.length < 50) {
        return getDefaultExpandedContent();
    }
    
    // Expand the content with additional paragraphs for better reading experience
    const paragraphs = originalContent.split('\n').filter(p => p.trim());
    let expandedContent = paragraphs.join('\n\n');
    
    // Add additional context paragraphs if content seems too short
    if (expandedContent.length < 800) {
        expandedContent += '\n\n';
        expandedContent += getAdditionalContext();
    }
    
    return expandedContent;
}

function getDefaultExpandedContent() {
    return `This is a developing news story from Adelaide and South Australia. Our reporters are working to bring you the most accurate and up-to-date information as it becomes available.

The story continues to unfold as authorities and relevant parties work to address the situation. We are monitoring developments closely and will provide updates as new information comes to light.

Local residents and stakeholders are encouraged to stay informed through official channels and trusted news sources. The impact of these developments on the community is being carefully assessed.

# Current Situation

The current situation remains dynamic, with multiple agencies coordinating their response efforts. Officials have emphasized the importance of accurate information and have committed to transparency in their communications with the public.

# What We Know

Based on verified information from reliable sources, we can confirm that the situation is being actively managed by appropriate authorities. Community safety and well-being remain the top priorities.

# Next Steps

Authorities are expected to provide further updates as the situation progresses. The community is advised to stay tuned for official announcements and to follow guidance from local officials.

This story will be updated as more information becomes available. Zone News is committed to providing accurate, timely reporting on matters affecting the Adelaide community.`;
}

function getAdditionalContext() {
    const contexts = [
        "Community leaders have expressed their commitment to transparency and keeping residents informed throughout this process.",
        "Local authorities are working closely with relevant agencies to ensure a coordinated response to the situation.",
        "The impact on local services and infrastructure is being carefully monitored and managed by city officials.",
        "Residents are encouraged to stay informed through official channels and verified news sources.",
        "This development represents a significant moment for the Adelaide community and the broader South Australian region."
    ];
    
    return contexts[Math.floor(Math.random() * contexts.length)];
}

function generateFallbackArticle(id) {
    const titles = [
        "Adelaide Community Development Initiative Gains Momentum",
        "South Australia Leads Innovation in Sustainable Technology",
        "Local Business Success Story Inspires Regional Growth",
        "Adelaide Infrastructure Project Reaches New Milestone",
        "Community Partnership Delivers Positive Results",
        "South Australian Research Breakthrough Makes Headlines",
        "Adelaide Cultural Event Celebrates Local Heritage",
        "Regional Economic Growth Shows Positive Trends"
    ];
    
    const categories = ['Community', 'Business', 'Technology', 'Culture', 'Politics', 'Environment'];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const title = titles[Math.floor(Math.random() * titles.length)];
    
    return {
        id: id,
        title: title,
        summary: `A comprehensive look at recent developments in ${category.toLowerCase()} affecting the Adelaide community and South Australia region.`,
        content: `This article examines the recent developments in ${category.toLowerCase()} within the Adelaide area and broader South Australia region.

The situation has been developing over recent weeks, with multiple stakeholders working together to ensure positive outcomes for the community. Local officials have praised the collaborative approach being taken.

# Background

The initiative represents a significant step forward for the region, building on previous successes and lessons learned from similar projects. Community input has been an essential component throughout the planning process.

# Current Progress

Substantial progress has been made, with key milestones achieved ahead of schedule. The project team has emphasized the importance of maintaining momentum while ensuring quality outcomes.

# Community Impact

The positive impact on the local community is already becoming evident, with residents expressing optimism about future developments. Local businesses have also noted increased confidence in the region's prospects.

# Looking Forward

Plans for the next phase are already underway, with further community consultation scheduled. Officials remain committed to transparent communication and regular updates.

This represents an important development for Adelaide and demonstrates the region's commitment to progress and innovation.`,
        category: category,
        published_at: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
        image: getRandomImage(category),
        location: 'Adelaide, Australia',
        source: 'Zone News',
        author: 'Zone News Team',
        author_title: 'News Review & Analysis Team',
        author_bio: 'Providing expert review, aggregation, and analysis of Adelaide and Australian news with intelligent insights.',
        author_image: getRandomAuthorImage(),
        tags: [category, 'Adelaide', 'South Australia', 'Community'],
        views: Math.floor(Math.random() * 5000 + 500),
        likes: Math.floor(Math.random() * 200 + 20),
        comments: Math.floor(Math.random() * 50 + 5),
        credibility_score: 0.8,
        engagement_score: 0.7
    };
}

function extractTags(article) {
    const commonTags = ['Adelaide', 'South Australia', 'News'];
    if (article.category) commonTags.unshift(article.category);
    if (article.location && !commonTags.includes(article.location)) {
        commonTags.push(article.location);
    }
    return commonTags;
}

function getRandomImage(category) {
    const imageMap = {
        'Politics': 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=400&fit=crop',
        'Business': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=400&fit=crop',
        'Technology': 'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=800&h=400&fit=crop',
        'Community': 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&h=400&fit=crop',
        'Culture': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&h=400&fit=crop',
        'Environment': 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=400&fit=crop'
    };
    
    return imageMap[category] || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=400&fit=crop';
}

function getRandomAuthor() {
    const authors = [
        'Sarah Chen', 'Michael Roberts', 'Emma Thompson', 'David Kim', 
        'Lisa Anderson', 'James Wilson', 'Rachel Martinez', 'Tom Johnson'
    ];
    return authors[Math.floor(Math.random() * authors.length)];
}

function getRandomAuthorImage() {
    const avatars = [
        'https://images.unsplash.com/photo-1494790108755-2616b332-f?w=120&h=120&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face'
    ];
    return avatars[Math.floor(Math.random() * avatars.length)];
}

/**
 * Bot Control API Endpoints
 */

// Create post through bot
app.post('/api/bot/post', async (req, res) => {
    try {
        const { content, reactions, userId, schedule } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }
        
        // Get the telegram bot service
        const telegramService = getService('telegramService');
        const postManager = getService('postManager');
        
        if (!telegramService || !postManager) {
            return res.status(503).json({ error: 'Bot services not available' });
        }
        
        // Create post options
        const options = {};
        if (reactions && reactions.length > 0) {
            options.customReactions = reactions;
        }
        if (schedule) {
            options.scheduleTime = new Date(schedule);
        }
        
        // Post to channels
        const result = await postManager.postToChannels(content, options);
        
        // Track analytics
        if (result.success) {
            const analyticsService = getService('analyticsTracker');
            if (analyticsService) {
                await analyticsService.trackPost(
                    result.messageKey,
                    content,
                    result.destinations,
                    reactions
                );
            }
        }
        
        res.json(result);
    } catch (error) {
        logger.error('Bot post creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get bot analytics
app.get('/api/analytics', async (req, res) => {
    try {
        const analyticsService = getService('analyticsTracker');
        const rssService = getService('rssAggregator');
        const webhookService = getService('webhookHandler');
        
        const stats = {
            totalPosts: 0,
            totalReactions: 0,
            totalViews: 0,
            activeUsers: 0,
            topReactions: []
        };
        
        if (analyticsService) {
            const analyticsStats = await analyticsService.getStats();
            Object.assign(stats, analyticsStats);
        }
        
        // Get RSS stats
        if (rssService) {
            stats.rss = await rssService.getStats();
        }
        
        // Get webhook stats
        if (webhookService) {
            stats.webhook = webhookService.getStats();
        }
        
        res.json(stats);
    } catch (error) {
        logger.error('Analytics fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Basic articles list for bot-control UI
app.get('/api/articles', async (req, res) => {
    try {
        if (!db) return res.json([]);
        const items = await db.collection('articles')
            .find({}, { projection: { title: 1, created: 1, views: 1, comments: 1, reactions: 1 } })
            .sort({ created: -1 })
            .limit(50)
            .toArray();
        res.json(items);
    } catch (e) {
        logger.error('articles list error', e);
        res.json([]);
    }
});

// Bot commands discovery
app.get('/api/bot/commands', async (req, res) => {
    try {
        let commands = [];
        try {
            const botService = getService('bot') || require('./services/telegramBot');
            const names = new Set();
            if (botService?.commands) {
                for (const name of botService.commands.keys()) names.add(name);
            }
            if (botService?.commandHandlers) {
                for (const name of botService.commandHandlers.keys()) names.add(name);
            }
            commands = Array.from(names).sort();
        } catch (e) {
            logger.warn('bot commands discovery failed, using fallback');
            commands = ['start','help','news','trending','digest','settings','timezone','subscription','upgrade','post','channels','group','reactions','reactionset','reactionstats','forwardreactions'];
        }
        res.json({ success: true, commands });
    } catch (e) {
        res.json({ success: true, commands: [] });
    }
});

// Admin check endpoint (JWT or header owner id)
app.get('/api/admin/check', async (req, res) => {
    try {
        let isAdmin = false;
        if (req.headers.authorization) {
            // Try auth middleware logic inline
            try {
                const token = req.headers.authorization.replace('Bearer ', '');
                const decoded = jwt.verify(token, JWT_SECRET);
                const user = await db?.collection('users').findOne({ _id: new ObjectId(decoded.id) });
                isAdmin = !!(user && ['admin','superadmin'].includes(user.role));
            } catch (_) {}
        }
        if (!isAdmin && req.headers['x-owner-id']) {
            const user = await db?.collection('users').findOne({ telegramId: String(req.headers['x-owner-id']) });
            isAdmin = !!(user && ['admin','superadmin'].includes(user.role));
        }
        res.json({ success: true, isAdmin });
    } catch (e) {
        res.json({ success: true, isAdmin: false });
    }
});

// Subscription upgrade (simple)
app.post('/api/user/subscription/upgrade', async (req, res) => {
    try {
        const { telegram_id, tier } = req.body || {};
        if (!telegram_id || !tier) return res.status(400).json({ error: 'telegram_id and tier required' });
        if (!db) await connectDB();
        if (!db) return res.status(500).json({ error: 'db unavailable' });
        const allowed = ['free','basic','pro','business','admin'];
        if (!allowed.includes(String(tier).toLowerCase())) return res.status(400).json({ error: 'invalid tier' });
        const result = await db.collection('users').findOneAndUpdate(
            { telegramId: String(telegram_id) },
            { $set: { subscription: { tier: String(tier).toLowerCase(), status: tier === 'free' ? 'inactive' : 'active', updatedAt: new Date() } } },
            { returnDocument: 'after' }
        );
        res.json({ success: true, user: result.value });
    } catch (e) {
        logger.error('subscription upgrade error', e);
        res.status(500).json({ error: 'upgrade failed' });
    }
});
/**
 * Channels & Groups management (bindings)
 */
app.get('/api/channels', async (req, res) => {
    try {
        if (ChannelBinding) {
            const items = await ChannelBinding.find({ type: 'channel' }).lean();
            return res.json({ channels: items.map(mapBinding) });
        }
        // Fallback from raw DB
        const items = await db?.collection('channel_bindings')?.find({ type: 'channel' }).toArray() || [];
        res.json({ channels: items.map(mapBinding) });
    } catch (e) {
        logger.error('channels list error', e);
        res.json({ channels: [] });
    }
});

// Create and send a Telegram Stars/TON subscription invoice via bot
app.post('/api/pay/subscribe', async (req, res) => {
    try {
        const { tier = 'pro', method = 'stars' } = req.body || {};
        const ownerId = String(req.headers['x-owner-id'] || '').trim();
        if (!ownerId) return res.status(400).json({ error: 'x-owner-id (telegram id) required' });

        const allowed = ['basic','pro','business','enterprise'];
        if (!allowed.includes(String(tier).toLowerCase())) {
            return res.status(400).json({ error: 'invalid tier' });
        }

        const botService = getService('bot');
        const paymentService = getService('telegramPaymentService');
        if (!botService?.bot || !paymentService) {
            return res.status(503).json({ error: 'payment service unavailable' });
        }

        const invoice = await paymentService.createSubscriptionInvoice(ownerId, tier.toLowerCase(), method.toLowerCase());

        // Send invoice to the user chat (chat id == user id in PM)
        await botService.bot.sendInvoice(
            Number(ownerId),
            invoice.title,
            invoice.description,
            invoice.payload,
            invoice.provider_token,
            invoice.currency,
            invoice.prices,
            {
                start_parameter: invoice.start_parameter,
                photo_url: invoice.photo_url,
                photo_height: invoice.photo_height,
                photo_width: invoice.photo_width,
                need_email: true,
                send_email_to_provider: true,
                is_flexible: false
            }
        );

        res.json({ success: true, message: 'Invoice sent in Telegram chat' });
    } catch (e) {
        logger.error('pay/subscribe error', e);
        res.status(500).json({ error: 'failed to create invoice' });
    }
});

app.post('/api/channels/register', async (req, res) => {
    try {
        const { chatId, alias } = req.body || {};
        if (!chatId) return res.status(400).json({ error: 'chatId required' });
        const doc = {
            ownerTelegramId: String(req.headers['x-owner-id'] || 'admin'),
            chatId: String(chatId),
            type: 'channel',
            alias: alias || undefined,
            approved: true,
            syncEnabled: true
        };
        if (ChannelBinding) {
            await ChannelBinding.updateOne({ ownerTelegramId: doc.ownerTelegramId, chatId: doc.chatId }, { $set: doc }, { upsert: true });
        } else if (db) {
            await db.collection('channel_bindings').updateOne({ ownerTelegramId: doc.ownerTelegramId, chatId: doc.chatId }, { $set: doc }, { upsert: true });
        }
        res.json({ success: true });
    } catch (e) {
        logger.error('channels register error', e);
        res.status(500).json({ error: 'failed' });
    }
});

app.delete('/api/channels/:chatId', async (req, res) => {
    try {
        const chatId = String(req.params.chatId);
        if (ChannelBinding) {
            await ChannelBinding.deleteOne({ chatId });
        } else if (db) {
            await db.collection('channel_bindings').deleteOne({ chatId });
        }
        res.json({ success: true });
    } catch (e) {
        logger.error('channels delete error', e);
        res.status(500).json({ error: 'failed' });
    }
});

app.get('/api/groups', async (req, res) => {
    try {
        if (ChannelBinding) {
            const items = await ChannelBinding.find({ type: 'group' }).lean();
            return res.json({ groups: items.map(mapBinding) });
        }
        const items = await db?.collection('channel_bindings')?.find({ type: 'group' }).toArray() || [];
        res.json({ groups: items.map(mapBinding) });
    } catch (e) {
        logger.error('groups list error', e);
        res.json({ groups: [] });
    }
});

app.post('/api/groups/register', async (req, res) => {
    try {
        const { chatId, alias, threadId } = req.body || {};
        if (!chatId) return res.status(400).json({ error: 'chatId required' });
        const doc = {
            ownerTelegramId: String(req.headers['x-owner-id'] || 'admin'),
            chatId: String(chatId),
            type: 'group',
            alias: alias || undefined,
            threadId: threadId || undefined,
            approved: true,
            syncEnabled: true
        };
        if (ChannelBinding) {
            await ChannelBinding.updateOne({ ownerTelegramId: doc.ownerTelegramId, chatId: doc.chatId }, { $set: doc }, { upsert: true });
        } else if (db) {
            await db.collection('channel_bindings').updateOne({ ownerTelegramId: doc.ownerTelegramId, chatId: doc.chatId }, { $set: doc }, { upsert: true });
        }
        res.json({ success: true });
    } catch (e) {
        logger.error('groups register error', e);
        res.status(500).json({ error: 'failed' });
    }
});

app.delete('/api/groups/:chatId', async (req, res) => {
    try {
        const chatId = String(req.params.chatId);
        if (ChannelBinding) {
            await ChannelBinding.deleteOne({ chatId });
        } else if (db) {
            await db.collection('channel_bindings').deleteOne({ chatId });
        }
        res.json({ success: true });
    } catch (e) {
        logger.error('groups delete error', e);
        res.status(500).json({ error: 'failed' });
    }
});

function mapBinding(b) {
    return {
        id: b.chatId || b.id,
        title: b.alias || b.title || b.username || b.chatId,
        type: b.type,
        hasTopics: !!b.threadId
    };
}

// Get/Update bot settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await getService('settingsService')?.getSettings() || {
            autoRss: false,
            moderation: true,
            analytics: true,
            notifications: false,
            webhook: false
        };
        
        res.json(settings);
    } catch (error) {
        logger.error('Settings fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        const settingsService = getService('settingsService');
        
        if (settingsService) {
            await settingsService.updateSettings(settings);
        }
        
        // Apply settings
        if (settings.autoRss !== undefined) {
            const rssService = getService('rssAggregator');
            if (rssService) {
                if (settings.autoRss) {
                    rssService.startAutoCheck();
                } else {
                    rssService.stopAutoCheck();
                }
            }
        }
        
        if (settings.webhook !== undefined) {
            const webhookService = getService('webhookHandler');
            if (webhookService) {
                if (settings.webhook) {
                    await webhookService.start();
                } else {
                    await webhookService.stop();
                }
            }
        }
        
        res.json({ success: true, settings });
    } catch (error) {
        logger.error('Settings update error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Premium API Endpoints
 */

// Get user subscription status
app.get('/api/user/subscription', async (req, res) => {
    try {
        const { telegram_id } = req.query;
        
        if (!telegram_id) {
            return res.status(400).json({ error: 'telegram_id required' });
        }
        
        const subscriptionService = getService('subscriptionService');
        
        if (subscriptionService) {
            const subscription = await subscriptionService.getUserSubscription(telegram_id);
            
            res.json({
                success: true,
                subscription: {
                    active: subscription?.active || false,
                    tier: subscription?.tier || 'free',
                    expires_at: subscription?.expiresAt || null,
                    features: subscription?.features || ['basic_news']
                }
            });
        } else {
            // Fallback subscription data
            res.json({
                success: true,
                subscription: {
                    active: false,
                    tier: 'free',
                    expires_at: null,
                    features: ['basic_news', 'search']
                }
            });
        }
        
    } catch (error) {
        logger.error('Subscription API error:', error);
        res.status(500).json({ error: 'Unable to fetch subscription' });
    }
});

/**
 * Fallback Data Functions
 */

function getFallbackNews(query = {}) {
    const { category = 'general', limit = 10 } = query;
    
    let fallbackArticles = [
        {
            id: 'fb1',
            title: '🚨 Breaking: Major Infrastructure Investment Announced',
            summary: 'Government announces $2.1B investment in transport infrastructure across Sydney',
            category: 'Politics',
            time: '5 min ago',
            published_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            image: 'https://picsum.photos/300/200?government',
            location: 'Sydney, Australia',
            source: 'Zone News',
            credibility_score: 0.9,
            engagement_score: 0.8
        },
        {
            id: 'fb2',
            title: '⚡ Tech Startup Raises Record $50M Series B',
            summary: 'Local AI company secures major funding round from international investors',
            category: 'Business',
            time: '15 min ago',
            published_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
            image: 'https://picsum.photos/300/200?tech',
            location: 'Sydney, Australia',
            source: 'Zone News',
            credibility_score: 0.85,
            engagement_score: 0.9
        },
        {
            id: 'fb3',
            title: '🌧️ Severe Weather Warning for Greater Sydney',
            summary: 'Bureau of Meteorology warns of damaging winds and heavy rainfall',
            category: 'Weather',
            time: '1 hour ago',
            published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            image: 'https://picsum.photos/300/200?weather',
            location: 'Greater Sydney',
            source: 'Zone News',
            credibility_score: 0.95,
            engagement_score: 0.7
        },
        {
            id: 'fb4',
            title: '🏥 New Medical Research Breakthrough',
            summary: 'University of Sydney researchers make significant discovery in cancer treatment',
            category: 'Health',
            time: '2 hours ago',
            published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            image: 'https://picsum.photos/300/200?medical',
            location: 'Sydney, Australia',
            source: 'Zone News',
            credibility_score: 0.92,
            engagement_score: 0.75
        },
        {
            id: 'fb5',
            title: '🏈 Local Sports Team Advances to Finals',
            summary: 'Sydney team secures spot in championship after thrilling victory',
            category: 'Sports',
            time: '3 hours ago',
            published_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            image: 'https://picsum.photos/300/200?sports',
            location: 'Sydney, Australia',
            source: 'Zone News',
            credibility_score: 0.8,
            engagement_score: 0.95
        }
    ];
    
    // Ensure content is present for front-end rendering
    fallbackArticles = fallbackArticles.map(a => ({
        ...a,
        content: a.content || a.summary || ''
    }));
    
    // Filter by category if specified
    let filtered = fallbackArticles;
    if (category && category !== 'general') {
        filtered = fallbackArticles.filter(article => 
            article.category.toLowerCase() === category.toLowerCase()
        );
    }
    
    return filtered.slice(0, parseInt(limit));
}

function getFallbackTrending() {
    return [
        {
            id: 'tr1',
            title: 'Infrastructure Investment',
            views: 3500,
            engagement: 85,
            trend_score: 0.9
        },
        {
            id: 'tr2', 
            title: 'Tech Funding',
            views: 2800,
            engagement: 92,
            trend_score: 0.85
        },
        {
            id: 'tr3',
            title: 'Weather Alert',
            views: 4200,
            engagement: 78,
            trend_score: 0.8
        }
    ];
}

/**
 * Workflow API Endpoints - Pro → Curated → Forward → Business
 */

// Start a Pro collaboration workflow
app.post('/api/workflow/start', async (req, res) => {
    try {
        const { userId, collaborativeArticle, options = {} } = req.body;
        
        if (!userId || !collaborativeArticle) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId or collaborativeArticle'
            });
        }
        
        const workflowOrchestrator = getService('workflowOrchestrator');
        if (!workflowOrchestrator) {
            return res.status(503).json({
                success: false,
                error: 'Workflow orchestrator not available'
            });
        }
        
        logger.info('Starting workflow:', { userId, articleId: collaborativeArticle.id });
        
        const workflowId = await workflowOrchestrator.startProCollaboration(
            userId, 
            collaborativeArticle.id, 
            {
                collaborators: collaborativeArticle.collaborators?.map(c => c.userId) || [userId],
                targetChannels: options.targetChannels || [],
                publishingMode: options.publishingMode || 'manual'
            }
        );
        
        // Transition to curated stage
        const curatedArticle = await workflowOrchestrator.transitionToCurated(
            workflowId, 
            collaborativeArticle, 
            {
                template: options.template || 'news_formal'
            }
        );
        
        res.json({
            success: true,
            data: {
                workflowId,
                collaborativeArticle,
                curatedArticle: {
                    id: curatedArticle._id,
                    title: curatedArticle.title,
                    url: curatedArticle.url,
                    template: curatedArticle.template
                }
            }
        });
        
    } catch (error) {
        logger.error('Error starting workflow:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get workflow status
app.get('/api/workflow/:workflowId', async (req, res) => {
    try {
        const { workflowId } = req.params;
        
        const workflowOrchestrator = getService('workflowOrchestrator');
        if (!workflowOrchestrator) {
            return res.status(503).json({
                success: false,
                error: 'Workflow orchestrator not available'
            });
        }
        
        const workflow = workflowOrchestrator.getWorkflow(workflowId);
        if (!workflow) {
            return res.status(404).json({
                success: false,
                error: 'Workflow not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                workflow: {
                    id: workflow.id,
                    currentStage: workflow.currentStage,
                    startedAt: workflow.startedAt,
                    completedAt: workflow.completedAt,
                    duration: workflow.completedAt ? 
                        workflow.completedAt - workflow.startedAt :
                        Date.now() - workflow.startedAt,
                    stages: workflow.stages,
                    metadata: workflow.metadata
                }
            }
        });
        
    } catch (error) {
        logger.error('Error getting workflow status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Forward article to targets
app.post('/api/workflow/:workflowId/forward', async (req, res) => {
    try {
        const { workflowId } = req.params;
        const { targets, options = {} } = req.body;
        
        if (!targets) {
            return res.status(400).json({
                success: false,
                error: 'Missing targets'
            });
        }
        
        const workflowOrchestrator = getService('workflowOrchestrator');
        if (!workflowOrchestrator) {
            return res.status(503).json({
                success: false,
                error: 'Workflow orchestrator not available'
            });
        }
        
        const forwardingResults = await workflowOrchestrator.processArticleForwarding(workflowId, {
            targetChats: targets.chats || [],
            shareWithUsers: targets.users || [],
            businessPublishing: options.businessPublishing || false
        });
        
        logger.info(`Forwarding completed for workflow: ${workflowId}`);
        
        res.json({
            success: true,
            data: {
                workflowId,
                results: forwardingResults
            }
        });
        
    } catch (error) {
        logger.error('Error in forwarding:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Publish to business channels
app.post('/api/workflow/:workflowId/business', async (req, res) => {
    try {
        const { workflowId } = req.params;
        const { publishingOptions = {} } = req.body;
        
        const workflowOrchestrator = getService('workflowOrchestrator');
        if (!workflowOrchestrator) {
            return res.status(503).json({
                success: false,
                error: 'Workflow orchestrator not available'
            });
        }
        
        const publishingResults = await workflowOrchestrator.processBusinessPublishing(
            workflowId, 
            publishingOptions
        );
        
        logger.info(`Business publishing completed for workflow: ${workflowId}`);
        
        res.json({
            success: true,
            data: {
                workflowId,
                results: publishingResults
            }
        });
        
    } catch (error) {
        logger.error('Error in business publishing:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get user's workflows
app.get('/api/workflows/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, limit = 50 } = req.query;
        
        const workflowOrchestrator = getService('workflowOrchestrator');
        if (!workflowOrchestrator) {
            return res.status(503).json({
                success: false,
                error: 'Workflow orchestrator not available'
            });
        }
        
        let userWorkflows = workflowOrchestrator.getUserWorkflows(userId);
        
        // Filter by status if provided
        if (status) {
            userWorkflows = userWorkflows.filter(w => w.currentStage === status);
        }
        
        // Limit results
        userWorkflows = userWorkflows.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            data: {
                workflows: userWorkflows.map(workflow => ({
                    id: workflow.id,
                    currentStage: workflow.currentStage,
                    startedAt: workflow.startedAt,
                    completedAt: workflow.completedAt,
                    duration: workflow.completedAt ? 
                        workflow.completedAt - workflow.startedAt :
                        Date.now() - workflow.startedAt,
                    collaborators: workflow.metadata.collaborators?.length || 0,
                    status: workflow.currentStage === 'completed' ? 'completed' : 'active'
                })),
                total: userWorkflows.length
            }
        });
        
    } catch (error) {
        logger.error('Error getting user workflows:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get workflow statistics
app.get('/api/workflow/stats', async (req, res) => {
    try {
        const workflowOrchestrator = getService('workflowOrchestrator');
        if (!workflowOrchestrator) {
            return res.status(503).json({
                success: false,
                error: 'Workflow orchestrator not available'
            });
        }
        
        const stats = workflowOrchestrator.getWorkflowStats();
        
        res.json({
            success: true,
            data: {
                stats,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        logger.error('Error getting workflow stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Collaborative articles API endpoints

// Get user's collaborative articles
app.get('/api/collaborative/articles/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, limit = 20 } = req.query;
        
        const proCollaborationService = getService('proCollaborationService');
        if (!proCollaborationService) {
            return res.status(503).json({
                success: false,
                error: 'Pro collaboration service not available'
            });
        }
        
        // Mock data - would integrate with actual service
        const articles = [
            {
                id: 'collab_1',
                title: 'Breaking: Major Economic Update',
                status: status || 'draft',
                collaborators: 3,
                lastModified: new Date().toISOString(),
                owner: userId,
                wordCount: 1250
            },
            {
                id: 'collab_2', 
                title: 'Technology Trends 2025',
                status: 'review',
                collaborators: 2,
                lastModified: new Date(Date.now() - 86400000).toISOString(),
                owner: userId,
                wordCount: 890
            }
        ];
        
        res.json({
            success: true,
            data: {
                articles: articles.slice(0, parseInt(limit)),
                total: articles.length
            }
        });
        
    } catch (error) {
        logger.error('Error getting collaborative articles:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create new collaborative article
app.post('/api/collaborative/articles', async (req, res) => {
    try {
        const { title, content, userId, collaborators = [] } = req.body;
        
        if (!title || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing title or userId'
            });
        }
        
        const articleId = `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const article = {
            id: articleId,
            title,
            content: content || '',
            createdBy: userId,
            createdAt: new Date().toISOString(),
            collaborators: [
                {
                    userId,
                    role: 'owner',
                    permissions: ['read', 'write', 'admin', 'share'],
                    joinedAt: new Date().toISOString()
                },
                ...collaborators.map(collab => ({
                    userId: collab.userId,
                    role: collab.role || 'editor',
                    permissions: collab.permissions || ['read', 'write'],
                    joinedAt: new Date().toISOString()
                }))
            ],
            status: 'draft',
            version: 1
        };
        
        logger.info('Created collaborative article:', { articleId, title, collaborators: article.collaborators.length });
        
        res.json({
            success: true,
            data: { article }
        });
        
    } catch (error) {
        logger.error('Error creating collaborative article:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * User Authentication & Management Routes
 */

// User Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, username, password, fullName } = req.body;
        
        if (!db) await connectDB();
        if (!db) return res.status(500).json({ error: 'Database unavailable' });
        
        const existing = await db.collection('users').findOne({
            $or: [{ email }, { username }]
        });
        
        if (existing) {
            return res.status(400).json({ 
                error: existing.email === email ? 'Email already registered' : 'Username taken' 
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = {
            email,
            username,
            password: hashedPassword,
            fullName,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=4A9FFF&color=fff`,
            preferences: { categories: ['local', 'technology', 'business'], theme: 'dark-blue' },
            bookmarks: [],
            createdAt: new Date(),
            role: 'user'
        };
        
        const result = await db.collection('users').insertOne(user);
        const token = generateToken(result.insertedId);
        
        delete user.password;
        res.json({ success: true, user: { ...user, id: result.insertedId }, token });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { emailOrUsername, password } = req.body;
        
        if (!db) await connectDB();
        if (!db) return res.status(500).json({ error: 'Database unavailable' });
        
        const user = await db.collection('users').findOne({
            $or: [{ email: emailOrUsername }, { username: emailOrUsername }]
        });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = generateToken(user._id);
        delete user.password;
        res.json({ success: true, user: { ...user, id: user._id }, token });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get Profile
app.get('/api/user/profile', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
});

// Add Bookmark
app.post('/api/user/bookmark', authMiddleware, async (req, res) => {
    try {
        await db.collection('users').updateOne(
            { _id: new ObjectId(req.userId) },
            { $addToSet: { bookmarks: { articleId: req.body.articleId, addedAt: new Date() } } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to bookmark' });
    }
});

// Get Bookmarks
app.get('/api/user/bookmarks', authMiddleware, async (req, res) => {
    try {
        const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
        const articleIds = user.bookmarks.map(b => new ObjectId(b.articleId));
        const articles = await db.collection('articles').find({ _id: { $in: articleIds } }).toArray();
        res.json({ success: true, bookmarks: articles });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get bookmarks' });
    }
});

// Add Comment
app.post('/api/article/:articleId/comment', authMiddleware, async (req, res) => {
    try {
        const comment = {
            _id: new ObjectId(),
            articleId: req.params.articleId,
            userId: req.userId,
            userName: req.user.fullName,
            userAvatar: req.user.avatar,
            content: req.body.content,
            createdAt: new Date(),
            likes: 0
        };
        
        await db.collection('comments').insertOne(comment);
        await db.collection('articles').updateOne(
            { _id: new ObjectId(req.params.articleId) },
            { $inc: { comments: 1 } }
        );
        
        res.json({ success: true, comment });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// Get Comments
app.get('/api/article/:articleId/comments', async (req, res) => {
    try {
        const comments = await db.collection('comments')
            .find({ articleId: req.params.articleId })
            .sort({ createdAt: -1 })
            .toArray();
        res.json({ success: true, comments });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get comments' });
    }
});

// Like/Unlike Article
app.post('/api/article/:articleId/like', authMiddleware, async (req, res) => {
    try {
        const { liked } = req.body;
        const articleId = req.params.articleId;
        
        if (liked) {
            await db.collection('users').updateOne(
                { _id: new ObjectId(req.userId) },
                { $addToSet: { likedArticles: articleId } }
            );
            await db.collection('articles').updateOne(
                { _id: new ObjectId(articleId) },
                { $inc: { likes: 1 } }
            );
        } else {
            await db.collection('users').updateOne(
                { _id: new ObjectId(req.userId) },
                { $pull: { likedArticles: articleId } }
            );
            await db.collection('articles').updateOne(
                { _id: new ObjectId(articleId) },
                { $inc: { likes: -1 } }
            );
        }
        
        res.json({ success: true, liked });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update like' });
    }
});

// Track Article Share
app.post('/api/article/:articleId/share', async (req, res) => {
    try {
        await db.collection('articles').updateOne(
            { _id: new ObjectId(req.params.articleId) },
            { $inc: { shares: 1 } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to track share' });
    }
});

// Get Personalized Feed
app.get('/api/user/feed', authMiddleware, async (req, res) => {
    try {
        const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
        const categories = user?.preferences?.categories || ['local', 'technology'];
        
        const articles = await db.collection('articles')
            .find({ category: { $in: categories } })
            .sort({ publishedAt: -1, 'engagement.score': -1 })
            .limit(20)
            .toArray();
        
        const transformedArticles = articles.map(article => ({
            id: article._id.toString(),
            title: article.title,
            summary: article.summary,
            category: article.category,
            image: article.images?.[0],
            author: article.author,
            timeAgo: getTimeAgo(article.publishedAt),
            likes: article.likes || 0,
            comments: article.comments || 0,
            shares: article.shares || 0,
            views: article.views || 0,
            readTime: Math.ceil((article.content?.length || 1000) / 200) + ' min'
        }));
        
        res.json({ success: true, articles: transformedArticles });
    } catch (error) {
        logger.error('Feed error:', error);
        res.status(500).json({ error: 'Failed to get feed' });
    }
});

// Follow/Unfollow User
app.post('/api/user/:targetUserId/follow', authMiddleware, async (req, res) => {
    try {
        const targetUserId = req.params.targetUserId;
        const { follow } = req.body;
        
        if (follow) {
            // Add to following list
            await db.collection('users').updateOne(
                { _id: new ObjectId(req.userId) },
                { $addToSet: { following: targetUserId } }
            );
            // Add to followers list
            await db.collection('users').updateOne(
                { _id: new ObjectId(targetUserId) },
                { $addToSet: { followers: req.userId } }
            );
        } else {
            // Remove from following
            await db.collection('users').updateOne(
                { _id: new ObjectId(req.userId) },
                { $pull: { following: targetUserId } }
            );
            // Remove from followers
            await db.collection('users').updateOne(
                { _id: new ObjectId(targetUserId) },
                { $pull: { followers: req.userId } }
            );
        }
        
        res.json({ success: true, following: follow });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update follow status' });
    }
});

// Save Push Subscription
app.post('/api/user/push-subscription', authMiddleware, async (req, res) => {
    try {
        const subscription = req.body;
        
        await db.collection('users').updateOne(
            { _id: new ObjectId(req.userId) },
            { $set: { pushSubscription: subscription, notificationsEnabled: true } }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// Get Breaking News
app.get('/api/breaking-news', async (req, res) => {
    try {
        const breakingArticle = await db.collection('articles')
            .findOne(
                { isBreaking: true, publishedAt: { $gte: new Date(Date.now() - 3600000) } },
                { sort: { publishedAt: -1 } }
            );
        
        if (breakingArticle) {
            res.json({
                breaking: true,
                article: {
                    id: breakingArticle._id,
                    title: breakingArticle.title,
                    summary: breakingArticle.summary
                }
            });
        } else {
            res.json({ breaking: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to check breaking news' });
    }
});

app.post('/api/admin/post', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!process.env.ADMIN_POST_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!secret || secret !== process.env.ADMIN_POST_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { text, photo, video, topic, reactions, channels } = req.body || {};
    const content = photo ? { photo, caption: text } : video ? { video, caption: text } : (text || '');
    const options = {
      topic,
      customReactions: Array.isArray(reactions) ? reactions : undefined,
      channels: Array.isArray(channels) ? channels : undefined,
      ownerTelegramId: req.headers['x-owner-id'] ? String(req.headers['x-owner-id']) : undefined
    };

    const postManager = getService('postManager');
    if (!postManager) return res.status(503).json({ error: 'Post manager not available' });

    const result = await postManager.postToChannels(content, options);

    // Log event
    try { const Event = require('./models/Event'); await Event.create({ tenantId: req.headers['x-tenant-id'] || 'default', userId: String(options.ownerTelegramId || 'admin'), action: 'post.create', targetType: 'telegram', properties: { result } }); } catch {}

    res.json(result);
  } catch (error) {
    logger.error('admin post error', error);
    res.status(500).json({ error: 'Failed to post' });
  }
});

/**
 * Social Sharing Suggestions API (used by mini-app)
 */
app.get('/api/articles/:articleId/share-suggestions', async (req, res) => {
  try {
    const { articleId } = req.params;
    const platforms = (req.query.platforms || 'twitter,telegram,facebook,linkedin,instagram')
      .split(',')
      .map(p => p.trim().toLowerCase())
      .filter(Boolean);

    const baseCaptions = {
      twitter: {
        method: 'ai-generated',
        caption: 'Breaking insight: {{title}} — key takeaways inside. #ZoneNews'
      },
      telegram: {
        method: 'template-based',
        caption: '📰 {{title}}\n\nRead more and discuss in the channel. #Adelaide #News'
      },
      facebook: {
        method: 'template-based',
        caption: 'Today’s highlight: {{title}} — what do you think?'
      },
      linkedin: {
        method: 'ai-generated',
        caption: 'Perspective: {{title}}. Implications for business and policy.'
      },
      instagram: {
        method: 'template-based',
        caption: 'Quick take: {{title}} ✨\n#news #australia #zonenews'
      }
    };

    // Try to fetch article title for better captions
    let articleTitle = 'Latest story';
    try {
      const article = await db?.collection('articles').findOne({ _id: new ObjectId(articleId) });
      articleTitle = article?.title || articleTitle;
    } catch {}

    const suggestions = platforms
      .filter(p => baseCaptions[p])
      .map(p => ({
        platform: p,
        method: baseCaptions[p].method,
        caption: baseCaptions[p].caption.replace('{{title}}', articleTitle)
      }));

    const viralPotential = Math.min(95, Math.max(25, Math.round(Math.random() * 70 + 25)));

    res.json({ success: true, data: { articleId, viralPotential, suggestions } });
  } catch (error) {
    logger.error('share-suggestions error', error);
    res.status(500).json({ success: false, error: 'Failed to build suggestions' });
  }
});

app.post('/api/articles/:articleId/generate-caption', async (req, res) => {
  try {
    const { articleId } = req.params;
    const { platform = 'twitter', generateVariants = false } = req.body || {};

    // Fetch article title if available
    let articleTitle = 'Latest story';
    try {
      const article = await db?.collection('articles').findOne({ _id: new ObjectId(articleId) });
      articleTitle = article?.title || articleTitle;
    } catch {}

    const templates = [
      { method: 'ai-generated', caption: `Hot take: ${articleTitle} — here’s why it matters. 🔥` },
      { method: 'template-based', caption: `📰 ${articleTitle}\n\nRead more with Zone News.` },
      { method: 'ai-generated', caption: `${articleTitle} — the 30-second breakdown. ⚡` },
    ];

    if (generateVariants) {
      const variants = templates.map(t => ({ ...t }));
      return res.json({ success: true, data: { platform, variants } });
    }

    const choice = templates[Math.floor(Math.random() * templates.length)];
    res.json({ success: true, data: { platform, ...choice } });
  } catch (error) {
    logger.error('generate-caption error', error);
    res.status(500).json({ success: false, error: 'Failed to generate caption' });
  }
});

/**
 * Error handling
 */
app.use((err, req, res, next) => {
    logger.error('API Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl
    });
});

/**
 * Server startup
 */
async function startServer() {
    try {
        // Initialize service registry (skip if not available)
        try {
            const { ServiceRegistry } = require('./services/ServiceRegistry');
            if (ServiceRegistry && ServiceRegistry.initialize) {
                ServiceRegistry.initialize();
                logger.info('Service registry initialized');
            }
        } catch (error) {
            logger.info('Service registry not available, using fallback mode');
        }
        
        // Initialize Telegram bot service for webhook processing only if API handles webhook
        if (process.env.TELEGRAM_WEBHOOK_VIA_API === 'true') {
          try {
              if (telegramBotService && typeof telegramBotService.initialize === 'function') {
                  await telegramBotService.initialize();
                  logger.info('✅ Telegram Bot Service ready for /webhook updates (via api-server)');

                  if (String(process.env.SET_WEBHOOK || '').toLowerCase() === 'true') {
                      const webhookUrl = (botConfig && botConfig.bot && botConfig.bot.webhookUrl) || process.env.WEBHOOK_URL;
                      if (webhookUrl && typeof telegramBotService.setWebhook === 'function') {
                          await telegramBotService.setWebhook(webhookUrl);
                          logger.info(`🔗 Telegram webhook configured: ${webhookUrl}`);
                      } else {
                          logger.warn('SET_WEBHOOK enabled but WEBHOOK_URL/botConfig missing');
                      }
                  }
              } else {
                  logger.warn('telegram-bot-service not available; /webhook will be a no-op');
              }
          } catch (e) {
              logger.error('Telegram bot service initialization failed', e);
          }
        }
        
        app.listen(PORT, '0.0.0.0', () => {
            logger.info(`🚀 Zone News API Server running on port ${PORT}`);
            logger.info(`📡 Health check: http://localhost:${PORT}/health`);
            logger.info(`📰 News API: http://localhost:${PORT}/api/news`);
            logger.info(`📄 Article Detail API: http://localhost:${PORT}/api/article/:id`);
            logger.info(`🔥 Trending API: http://localhost:${PORT}/api/trending`);
            logger.info(`🧵 Themes API: http://localhost:${PORT}/api/news/themes`);
            logger.info(`🚨 Breaking API: http://localhost:${PORT}/api/news/breaking`);
            logger.info(`🔍 Search API: http://localhost:${PORT}/api/search`);
            logger.info(`🔄 Workflow API: http://localhost:${PORT}/api/workflow/*`);
            logger.info(`👥 Collaborative Articles API: http://localhost:${PORT}/api/collaborative/*`);
        });
        
    } catch (error) {
        logger.error('Failed to start API server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

if (require.main === module) {
    startServer();
}

module.exports = app;