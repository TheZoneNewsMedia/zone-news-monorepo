const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3012;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const DB_NAME = process.env.DB_NAME || 'zone_news_production';

app.use(cors());
app.use(express.json());

let db;
let client;
async function getDb() {
  if (db) return db;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

// Health
app.get('/health', async (req, res) => {
  try { await getDb(); res.json({ status: 'ok', database: 'connected' }); } catch { res.status(500).json({ status: 'error' }); }
});

// CRUD: Groups
app.get('/v1/groups', async (req, res) => {
  try {
    const db = await getDb();
    const items = await db.collection('channel_bindings').find({ type: 'group' }).toArray();
    res.json({ groups: items.map(mapBinding) });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

app.post('/v1/groups', async (req, res) => {
  try {
    const { chatId, alias, threadId, title, username, giga } = req.body || {};
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    const db = await getDb();
    const doc = {
      ownerTelegramId: String(req.headers['x-owner-id'] || 'admin'),
      chatId: String(chatId),
      type: 'group',
      alias: alias || undefined,
      title: title || undefined,
      username: username || undefined,
      threadId: threadId || undefined,
      isGigaGroup: !!giga,
      approved: true,
      syncEnabled: true,
      updatedAt: new Date()
    };
    await db.collection('channel_bindings').updateOne({ chatId: doc.chatId, type: 'group' }, { $set: doc }, { upsert: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

app.get('/v1/groups/:chatId', async (req, res) => {
  try {
    const db = await getDb();
    const g = await db.collection('channel_bindings').findOne({ chatId: String(req.params.chatId), type: 'group' });
    if (!g) return res.status(404).json({ error: 'not found' });
    res.json({ group: mapBinding(g) });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

app.patch('/v1/groups/:chatId', async (req, res) => {
  try {
    const db = await getDb();
    const updates = { ...req.body, updatedAt: new Date() };
    await db.collection('channel_bindings').updateOne({ chatId: String(req.params.chatId), type: 'group' }, { $set: updates });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

app.delete('/v1/groups/:chatId', async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('channel_bindings').deleteOne({ chatId: String(req.params.chatId), type: 'group' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

// Topics (forum threads)
app.get('/v1/groups/:chatId/topics', async (req, res) => {
  try {
    const db = await getDb();
    const items = await db.collection('group_topics').find({ chatId: String(req.params.chatId) }).toArray();
    res.json({ topics: items.map(mapTopic) });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

app.post('/v1/groups/:chatId/topics', async (req, res) => {
  try {
    const db = await getDb();
    const { threadId, name } = req.body || {};
    if (!threadId) return res.status(400).json({ error: 'threadId required' });
    const doc = { _id: new ObjectId(), chatId: String(req.params.chatId), threadId: String(threadId), name: name || undefined, createdAt: new Date(), updatedAt: new Date() };
    await db.collection('group_topics').updateOne({ chatId: doc.chatId, threadId: doc.threadId }, { $set: doc }, { upsert: true });
    res.json({ success: true, topic: mapTopic(doc) });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

app.patch('/v1/groups/:chatId/topics/:threadId', async (req, res) => {
  try {
    const db = await getDb();
    const updates = { ...req.body, updatedAt: new Date() };
    await db.collection('group_topics').updateOne({ chatId: String(req.params.chatId), threadId: String(req.params.threadId) }, { $set: updates });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

app.delete('/v1/groups/:chatId/topics/:threadId', async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('group_topics').deleteOne({ chatId: String(req.params.chatId), threadId: String(req.params.threadId) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

function mapBinding(b) {
  return {
    chatId: b.chatId,
    title: b.alias || b.title || b.username || b.chatId,
    type: b.type,
    hasTopics: !!b.threadId,
    isGigaGroup: !!b.isGigaGroup
  };
}

function mapTopic(t) {
  return { chatId: t.chatId, threadId: t.threadId, name: t.name, createdAt: t.createdAt, updatedAt: t.updatedAt };
}

app.listen(PORT, '0.0.0.0', () => console.log(`groups-service listening on ${PORT}`));
