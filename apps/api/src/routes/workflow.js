const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../server');

const router = express.Router();

// POST /api/workflow/start
router.post('/workflow/start', async (req, res) => {
  try {
    const { userId, collaborativeArticle, options = {} } = req.body || {};
    if (!userId || !collaborativeArticle) {
      return res.status(400).json({ success: false, error: 'Missing userId or collaborativeArticle' });
    }
    const db = await getDb();
    const workflow = {
      userId: String(userId),
      articleId: String(collaborativeArticle.id || collaborativeArticle.articleId || new ObjectId()),
      currentStage: 'pro',
      stages: ['pro'],
      startedAt: Date.now(),
      completedAt: null,
      metadata: {
        collaborators: (collaborativeArticle.collaborators || []).map((c) => c.userId).filter(Boolean),
        targetChannels: options.targetChannels || [],
        publishingMode: options.publishingMode || 'manual',
        template: options.template || 'news_formal'
      }
    };
    const result = await db.collection('workflows').insertOne(workflow);
    // Simulate curated transition
    workflow.currentStage = 'curated';
    workflow.stages.push('curated');
    await db.collection('workflows').updateOne({ _id: result.insertedId }, { $set: { currentStage: workflow.currentStage, stages: workflow.stages } });
    res.json({ success: true, data: { workflowId: String(result.insertedId), collaborativeArticle, curatedArticle: { id: workflow.articleId, title: collaborativeArticle.title, template: workflow.metadata.template } } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/workflow/:workflowId
router.get('/workflow/:workflowId', async (req, res) => {
  try {
    const db = await getDb();
    const wf = await db.collection('workflows').findOne({ _id: new ObjectId(req.params.workflowId) });
    if (!wf) return res.status(404).json({ success: false, error: 'Workflow not found' });
    const duration = (wf.completedAt ? wf.completedAt : Date.now()) - wf.startedAt;
    res.json({ success: true, data: { workflow: { id: String(wf._id), currentStage: wf.currentStage, startedAt: wf.startedAt, completedAt: wf.completedAt, duration, stages: wf.stages, metadata: wf.metadata } } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/workflow/:workflowId/forward
router.post('/workflow/:workflowId/forward', async (req, res) => {
  try {
    const { targets = {}, options = {} } = req.body || {};
    const db = await getDb();
    const _id = new ObjectId(req.params.workflowId);
    await db.collection('workflows').updateOne({ _id }, { $set: { currentStage: 'forwarded' }, $push: { stages: 'forwarded' } });
    res.json({ success: true, data: { workflowId: String(_id), results: { targetChats: targets.chats || [], shareWithUsers: targets.users || [], businessPublishing: !!options.businessPublishing } } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/workflow/:workflowId/business
router.post('/workflow/:workflowId/business', async (req, res) => {
  try {
    const db = await getDb();
    const _id = new ObjectId(req.params.workflowId);
    await db.collection('workflows').updateOne({ _id }, { $set: { currentStage: 'business' }, $push: { stages: 'business' } });
    res.json({ success: true, data: { workflowId: String(_id), results: { status: 'published' } } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/workflows/user/:userId
router.get('/workflows/user/:userId', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const db = await getDb();
    let workflows = await db.collection('workflows').find({ userId: String(req.params.userId) }).sort({ startedAt: -1 }).limit(parseInt(limit)).toArray();
    if (status) workflows = workflows.filter((w) => w.currentStage === status);
    res.json({ success: true, data: { workflows: workflows.map((w) => ({ id: String(w._id), currentStage: w.currentStage, startedAt: w.startedAt, completedAt: w.completedAt, duration: (w.completedAt ? w.completedAt : Date.now()) - w.startedAt, collaborators: w.metadata?.collaborators?.length || 0, status: w.currentStage === 'completed' ? 'completed' : 'active' })), total: workflows.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/workflow/stats
router.get('/workflow/stats', async (req, res) => {
  try {
    const db = await getDb();
    const total = await db.collection('workflows').countDocuments();
    const byStage = await db.collection('workflows').aggregate([{ $group: { _id: '$currentStage', count: { $sum: 1 } } }]).toArray();
    res.json({ success: true, data: { stats: { total, byStage }, timestamp: new Date().toISOString() } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
