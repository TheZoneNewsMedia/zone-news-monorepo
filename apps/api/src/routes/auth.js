const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getDb } = require('../server');

const crypto = require('crypto');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

router.post('/auth/register', async (req, res) => {
  try {
    const { email, username, password, fullName } = req.body || {};
    const db = await getDb();
    const existing = await db.collection('users').findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ error: existing.email === email ? 'Email already registered' : 'Username taken' });
    const hashed = await bcrypt.hash(password, 12);
    const user = {
      email,
      username,
      password: hashed,
      fullName,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName || username)}&background=4A9FFF&color=fff`,
      preferences: { categories: ['local', 'technology', 'business'], theme: 'dark-blue' },
      bookmarks: [],
      createdAt: new Date(),
      role: 'user'
    };
    const result = await db.collection('users').insertOne(user);
    const token = jwt.sign({ id: result.insertedId }, JWT_SECRET, { expiresIn: '30d' });
    delete user.password;
    res.json({ success: true, user: { ...user, id: result.insertedId }, token });
  } catch (e) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body || {};
    const db = await getDb();
    const user = await db.collection('users').findOne({ $or: [{ email: emailOrUsername }, { username: emailOrUsername }] });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    delete user.password;
    res.json({ success: true, user: { ...user, id: user._id }, token });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Telegram authentication
router.post('/auth/telegram/callback', async (req, res) => {
  try {
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = req.body;
    
    // Verify Telegram authentication data
    const secret = crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest();
    const checkString = Object.keys(req.body)
      .filter(key => key !== 'hash')
      .sort()
      .map(key => `${key}=${req.body[key]}`)
      .join('\n');
    
    const calculatedHash = crypto
      .createHmac('sha256', secret)
      .update(checkString)
      .digest('hex');
    
    if (calculatedHash !== hash) {
      return res.status(401).json({ error: 'Invalid authentication data' });
    }
    
    // Check if auth_date is not too old (5 minutes)
    const authTime = parseInt(auth_date);
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - authTime > 300) {
      return res.status(401).json({ error: 'Authentication data expired' });
    }
    
    const db = await getDb();
    
    // Find or create user
    let user = await db.collection('users').findOne({ telegramId: id });
    
    if (!user) {
      // Create new user from Telegram data
      const newUser = {
        telegramId: id,
        username: username || `user_${id}`,
        fullName: `${first_name} ${last_name || ''}`.trim(),
        avatar: photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(first_name)}&background=0088cc&color=fff`,
        email: null, // Telegram doesn't provide email
        role: 'user',
        isAdmin: false,
        preferences: { 
          categories: ['local', 'technology', 'business'], 
          theme: 'dark-blue' 
        },
        bookmarks: [],
        createdAt: new Date(),
        lastLogin: new Date(),
        authProvider: 'telegram'
      };
      
      // Check if user should be admin (based on Telegram ID)
      const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').filter(id => id);
      if (ADMIN_IDS.includes(id.toString())) {
        newUser.role = 'admin';
        newUser.isAdmin = true;
      }
      
      const result = await db.collection('users').insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };
    } else {
      // Update last login
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } }
      );
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        telegramId: user.telegramId,
        role: user.role,
        isAdmin: user.isAdmin
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    delete user.password;
    res.json({ 
      success: true, 
      user: { ...user, id: user._id }, 
      token,
      isAdmin: user.isAdmin || false
    });
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Verify token endpoint
router.get('/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    delete user.password;
    res.json({ 
      success: true, 
      user: { ...user, id: user._id },
      isAdmin: user.isAdmin || false
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
