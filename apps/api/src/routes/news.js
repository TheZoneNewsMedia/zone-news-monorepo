const express = require('express');
const { getDb } = require('../server');

const router = express.Router();

const categoryMap = {
  business: ['business', 'commerce', 'trade', 'company', 'corporate', 'market'],
  economics: ['economy', 'economic', 'gdp', 'inflation', 'unemployment', 'fiscal'],
  finance: ['finance', 'banking', 'investment', 'stocks', 'trading', 'money'],
  property: ['property', 'real estate', 'housing', 'rental', 'mortgage', 'development'],
  government: ['government', 'politics', 'policy', 'minister', 'parliament', 'council'],
  health: ['health', 'medical', 'hospital', 'doctor', 'covid', 'disease', 'wellness'],
  innovations: ['innovation', 'technology', 'startup', 'tech', 'digital', 'ai', 'research'],
  truecrime: ['crime', 'police', 'court', 'investigation', 'criminal', 'arrest'],
  analysis: ['analysis', 'opinion', 'editorial', 'insight', 'perspective', 'review']
};

function categorizeArticle(article) {
  const content = `${article.title ?? ''} ${article.content ?? ''}`.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (keywords.some((k) => content.includes(k))) return category;
  }
  return 'general';
}

function determineScope(article) {
  const content = `${article.title ?? ''} ${article.content ?? ''}`.toLowerCase();
  if (content.includes('world') || content.includes('global') || content.includes('international')) return 'global';
  if (content.includes('australia') || content.includes('federal') || content.includes('national')) return 'national';
  return 'local';
}

function determineCity(article) {
  const content = `${article.title ?? ''} ${article.content ?? ''}`.toLowerCase();
  const cities = {
    adelaide: ['adelaide', 'sa', 'south australia'],
    sydney: ['sydney', 'nsw', 'new south wales'],
    melbourne: ['melbourne', 'vic', 'victoria'],
    brisbane: ['brisbane', 'qld', 'queensland'],
    perth: ['perth', 'wa', 'western australia'],
    darwin: ['darwin', 'nt', 'northern territory'],
    hobart: ['hobart', 'tas', 'tasmania'],
    canberra: ['canberra', 'act', 'capital territory']
  };
  for (const [city, keywords] of Object.entries(cities)) {
    if (keywords.some((k) => content.includes(k))) return city[0].toUpperCase() + city.slice(1);
  }
  return 'Adelaide';
}

router.get('/news', async (req, res) => {
  try {
    const { category = 'all', scope = 'all', city = 'Adelaide', page = 1, limit = 20, search = '' } = req.query;
    const db = await getDb();

    let baseOr = [
      { 'zone_news_data.channel': '@ZoneNewsAdl' },
      { source: { $regex: 'Zone News', $options: 'i' } },
      { 'source_metadata.is_original_source': true }
    ];

    let query = { $or: baseOr };
    if (search) {
      query = { $and: [{ $or: baseOr }, { $or: [{ title: { $regex: search, $options: 'i' } }, { content: { $regex: search, $options: 'i' } }] }] };
    }

    const articles = await db
      .collection('news_articles')
      .find(query)
      .sort({ published_date: -1, 'zone_news_data.message_id': -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .toArray();

    const processed = articles.map((a) => ({
      id: a._id,
      title: a.title,
      content: a.content ?? a.summary ?? '',
      excerpt: a.summary ?? (a.content ? `${a.content.substring(0, 200)}...` : ''),
      category: categorizeArticle(a),
      scope: determineScope(a),
      city: determineCity(a),
      source: a.source ?? 'Zone News',
      published_date: a.published_date ?? a.created_at,
      views: a.views ?? a.zone_news_data?.views ?? 0,
      reactions: a.reactions ?? {},
      isPremium: categorizeArticle(a) === 'analysis',
      messageId: a.zone_news_data?.message_id,
      channelUrl: a.zone_news_data?.message_id ? `https://t.me/ZoneNewsAdl/${a.zone_news_data.message_id}` : null
    }));

    let filtered = processed;
    if (category !== 'all') filtered = filtered.filter((a) => a.category === category);
    if (scope !== 'all') filtered = filtered.filter((a) => a.scope === scope);
    if (scope === 'local' && city) filtered = filtered.filter((a) => a.city === city);

    const totalCount = await db.collection('news_articles').countDocuments(query);

    res.json({
      success: true,
      articles: filtered,
      totalArticles: filtered.length,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      currentPage: parseInt(page),
      metadata: { scope, category, city: scope === 'local' ? city : null, source: 'Zone News Adelaide Channel' }
    });
  } catch (e) {
    console.error('news route error', e);
    res.status(500).json({ success: false, error: 'Failed to fetch news articles' });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const db = await getDb();
    const trending = await db
      .collection('news_articles')
      .find({ $or: [{ 'zone_news_data.channel': '@ZoneNewsAdl' }, { source: { $regex: 'Zone News', $options: 'i' } }] })
      .sort({ views: -1, 'zone_news_data.views': -1 })
      .limit(10)
      .toArray();

    const processed = trending.map((a) => ({ id: a._id, title: a.title, views: a.views ?? a.zone_news_data?.views ?? 0, category: categorizeArticle(a) }));
    res.json({ success: true, trending: processed });
  } catch (e) {
    console.error('trending route error', e);
    res.status(500).json({ success: false, error: 'Failed to fetch trending articles' });
  }
});

router.get('/breaking', async (req, res) => {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const breaking = await db
      .collection('news_articles')
      .find({
        $and: [
          { $or: [{ 'zone_news_data.channel': '@ZoneNewsAdl' }, { source: { $regex: 'Zone News', $options: 'i' } }] },
          { published_date: { $gte: since } }
        ]
      })
      .sort({ published_date: -1 })
      .limit(5)
      .toArray();

    const processed = breaking.map((a) => ({ id: a._id, title: a.title, content: a.content ? `${a.content.substring(0, 150)}...` : '', publishedAt: a.published_date, category: categorizeArticle(a) }));
    res.json({ success: true, breaking: processed });
  } catch (e) {
    console.error('breaking route error', e);
    res.status(500).json({ success: false, error: 'Failed to fetch breaking news' });
  }
});

// Compatibility alias
router.get('/news/breaking', async (req, res) => {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const breaking = await db
      .collection('news_articles')
      .find({
        $and: [
          { $or: [{ 'zone_news_data.channel': '@ZoneNewsAdl' }, { source: { $regex: 'Zone News', $options: 'i' } }] },
          { published_date: { $gte: since } }
        ]
      })
      .sort({ published_date: -1 })
      .limit(5)
      .toArray();

    const processed = breaking.map((a) => ({ id: a._id, title: a.title, content: a.content ? `${a.content.substring(0, 150)}...` : '', publishedAt: a.published_date, category: categorizeArticle(a) }));
    res.json({ success: true, breaking: processed });
  } catch (e) {
    console.error('breaking alias route error', e);
    res.status(500).json({ success: false, error: 'Failed to fetch breaking news' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalArticles = await db.collection('news_articles').countDocuments();
    const todayArticles = await db.collection('news_articles').countDocuments({ published_date: { $gte: today } });
    const articles = await db.collection('news_articles').find({}).toArray();
    const categories = Object.keys(categoryMap).reduce((acc, c) => {
      acc[c] = articles.filter((a) => categorizeArticle(a) === c).length;
      return acc;
    }, {});

    res.json({ success: true, stats: { totalArticles, todayArticles, categories } });
  } catch (e) {
    console.error('stats route error', e);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
