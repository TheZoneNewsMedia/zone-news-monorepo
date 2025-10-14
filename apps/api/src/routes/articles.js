const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../server');

const router = express.Router();

function toSummary(article) {
  return {
    id: String(article._id || article.id),
    title: article.title,
    summary: article.summary || (article.content ? `${article.content.substring(0, 200)}...` : ''),
    category: article.category || 'General',
    published_at: article.publishedAt || article.published_date || article.createdAt || new Date(),
    image: article.images?.[0] || article.image || null,
    source: article.source || 'Zone News',
    location: article.location || 'Adelaide',
  };
}

// GET /api/search
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '10')));
    if (q.length < 2) return res.status(400).json({ error: 'Search query must be at least 2 characters' });

    const db = await getDb();
    const results = await db
      .collection('articles')
      .find({ $or: [{ title: { $regex: q, $options: 'i' } }, { content: { $regex: q, $options: 'i' } }] })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ success: true, query: q, results: results.map(toSummary), total: results.length });
  } catch (e) {
    console.error('search error', e);
    res.status(500).json({ error: 'Search temporarily unavailable' });
  }
});

// GET /api/article/:id
router.get('/article/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    let doc = null;
    try { doc = await db.collection('articles').findOne({ _id: new ObjectId(id) }); } catch {}
    if (!doc) { doc = await db.collection('articles').findOne({ id }); }
    if (!doc) return res.status(404).json({ error: 'Article not found' });

    const detailed = {
      id: String(doc._id || doc.id),
      title: doc.title,
      summary: doc.summary,
      content: doc.content || doc.summary || '',
      category: doc.category || 'General',
      published_at: doc.publishedAt || doc.createdAt || new Date(),
      image: doc.image || doc.images?.[0] || null,
      location: doc.location || 'Adelaide, Australia',
      source: doc.source || 'Zone News',
      url: doc.url || null,
      tags: doc.tags || [],
      views: doc.views || 0,
      likes: doc.likes || 0,
      comments: doc.comments || 0
    };

    res.json({ success: true, ...detailed, sourceKind: 'database' });
  } catch (e) {
    console.error('article detail error', e);
    res.status(500).json({ error: 'Unable to fetch article' });
  }
});

// GET /api/articles
router.get('/articles', async (req, res) => {
  try {
    const db = await getDb();
    const items = await db
      .collection('articles')
      .find({}, { projection: { title: 1, created: 1, views: 1, comments: 1, reactions: 1 } })
      .sort({ created: -1 })
      .limit(50)
      .toArray();
    res.json(items);
  } catch (e) {
    console.error('articles list error', e);
    res.json([]);
  }
});

// GET /api/articles/:articleId/share-suggestions
router.get('/articles/:articleId/share-suggestions', async (req, res) => {
  try {
    const { articleId } = req.params;
    const platforms = String(req.query.platforms || 'twitter,telegram,facebook,linkedin,instagram')
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);

    let articleTitle = 'Latest story';
    try {
      const db = await getDb();
      const article = await db.collection('articles').findOne({ _id: new ObjectId(articleId) });
      articleTitle = article?.title || articleTitle;
    } catch {}

    const baseCaptions = {
      twitter: { method: 'ai-generated', caption: 'Breaking insight: {{title}} — key takeaways inside. #ZoneNews' },
      telegram: { method: 'template-based', caption: '📰 {{title}}\n\nRead more and discuss in the channel. #Adelaide #News' },
      facebook: { method: 'template-based', caption: 'Today’s highlight: {{title}} — what do you think?' },
      linkedin: { method: 'ai-generated', caption: 'Perspective: {{title}}. Implications for business and policy.' },
      instagram: { method: 'template-based', caption: 'Quick take: {{title}} ✨\n#news #australia #zonenews' }
    };

    const suggestions = platforms
      .filter((p) => baseCaptions[p])
      .map((p) => ({ platform: p, method: baseCaptions[p].method, caption: baseCaptions[p].caption.replace('{{title}}', articleTitle) }));

    const viralPotential = Math.min(95, Math.max(25, Math.round(Math.random() * 70 + 25)));

    res.json({ success: true, data: { articleId, viralPotential, suggestions } });
  } catch (e) {
    console.error('share-suggestions error', e);
    res.status(500).json({ success: false, error: 'Failed to build suggestions' });
  }
});

// POST /api/articles/:articleId/generate-caption
router.post('/articles/:articleId/generate-caption', async (req, res) => {
  try {
    const { articleId } = req.params;
    const { platform = 'twitter', generateVariants = false } = req.body || {};

    let articleTitle = 'Latest story';
    try {
      const db = await getDb();
      const article = await db.collection('articles').findOne({ _id: new ObjectId(articleId) });
      articleTitle = article?.title || articleTitle;
    } catch {}

    const templates = [
      { method: 'ai-generated', caption: `Hot take: ${articleTitle} — here’s why it matters. 🔥` },
      { method: 'template-based', caption: `📰 ${articleTitle}\n\nRead more with Zone News.` },
      { method: 'ai-generated', caption: `${articleTitle} — the 30-second breakdown. ⚡` }
    ];

    if (generateVariants) {
      const variants = templates.map((t) => ({ ...t }));
      return res.json({ success: true, data: { platform, variants } });
    }

    const choice = templates[Math.floor(Math.random() * templates.length)];
    res.json({ success: true, data: { platform, ...choice } });
  } catch (e) {
    console.error('generate-caption error', e);
    res.status(500).json({ success: false, error: 'Failed to generate caption' });
  }
});

module.exports = router;
