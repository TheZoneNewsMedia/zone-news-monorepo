const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../server');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'zone-news-secret-2025';

router.get('/admin/check', async (req, res) => {
  try {
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice('Bearer '.length);
        const decoded = jwt.verify(token, JWT_SECRET);
        const db = await getDb();
        const user = await db.collection('users').findOne({ _id: decoded?.id ? new (await import('mongodb')).ObjectId(decoded.id) : undefined });
        isAdmin = !!(user && ['admin', 'superadmin'].includes(user.role));
      } catch {}
    }
    if (!isAdmin && req.headers['x-owner-id']) {
      const db = await getDb();
      const user = await db.collection('users').findOne({ telegramId: String(req.headers['x-owner-id']) });
      isAdmin = !!(user && ['admin', 'superadmin'].includes(user.role));
    }
    res.json({ success: true, isAdmin });
  } catch (e) {
    res.json({ success: true, isAdmin: false });
  }
});

module.exports = router;
