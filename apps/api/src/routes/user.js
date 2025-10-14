const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../server');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/user/profile
router.get('/user/profile', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) }, { projection: { password: 0 } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// POST /api/user/bookmark
router.post('/user/bookmark', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      { $addToSet: { bookmarks: { articleId: req.body.articleId, addedAt: new Date() } } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to bookmark' });
  }
});

// GET /api/user/bookmarks
router.get('/user/bookmarks', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    const articleIds = (user?.bookmarks || []).map((b) => new ObjectId(b.articleId));
    const articles = articleIds.length
      ? await db.collection('articles').find({ _id: { $in: articleIds } }).toArray()
      : [];
    res.json({ success: true, bookmarks: articles });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get bookmarks' });
  }
});

// POST /api/article/:articleId/comment
router.post('/article/:articleId/comment', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const comment = {
      _id: new ObjectId(),
      articleId: req.params.articleId,
      userId: req.userId,
      content: req.body.content,
      createdAt: new Date(),
      likes: 0
    };
    await db.collection('comments').insertOne(comment);
    await db.collection('articles').updateOne({ _id: new ObjectId(req.params.articleId) }, { $inc: { comments: 1 } });
    res.json({ success: true, comment });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// GET /api/article/:articleId/comments
router.get('/article/:articleId/comments', async (req, res) => {
  try {
    const db = await getDb();
    const comments = await db.collection('comments').find({ articleId: req.params.articleId }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, comments });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// POST /api/article/:articleId/like
router.post('/article/:articleId/like', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const liked = !!req.body.liked;
    const articleId = req.params.articleId;
    if (liked) {
      await db.collection('users').updateOne({ _id: new ObjectId(req.userId) }, { $addToSet: { likedArticles: articleId } });
      await db.collection('articles').updateOne({ _id: new ObjectId(articleId) }, { $inc: { likes: 1 } });
    } else {
      await db.collection('users').updateOne({ _id: new ObjectId(req.userId) }, { $pull: { likedArticles: articleId } });
      await db.collection('articles').updateOne({ _id: new ObjectId(articleId) }, { $inc: { likes: -1 } });
    }
    res.json({ success: true, liked });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update like' });
  }
});

// POST /api/article/:articleId/share
router.post('/article/:articleId/share', async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('articles').updateOne({ _id: new ObjectId(req.params.articleId) }, { $inc: { shares: 1 } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to track share' });
  }
});

// GET /api/user/feed
router.get('/user/feed', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    const categories = user?.preferences?.categories || ['local', 'technology'];
    const articles = await db
      .collection('articles')
      .find({ category: { $in: categories } })
      .sort({ publishedAt: -1, 'engagement.score': -1 })
      .limit(20)
      .toArray();
    const transformed = articles.map((a) => ({
      id: String(a._id),
      title: a.title,
      summary: a.summary,
      category: a.category,
      image: a.images?.[0],
      timeAgo: `${Math.ceil((Date.now() - new Date(a.publishedAt)) / 3600000)}h ago`,
      likes: a.likes || 0,
      comments: a.comments || 0,
      shares: a.shares || 0,
      views: a.views || 0,
      readTime: `${Math.ceil((a.content?.length || 1000) / 200)} min`
    }));
    res.json({ success: true, articles: transformed });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// POST /api/user/push-subscription
router.post('/user/push-subscription', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.userId) },
      { $set: { pushSubscription: req.body, notificationsEnabled: true } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

module.exports = router;
