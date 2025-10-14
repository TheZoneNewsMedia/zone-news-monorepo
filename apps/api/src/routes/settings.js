const express = require('express');

const router = express.Router();

router.get('/settings', async (req, res) => {
  try {
    const settings = {
      autoRss: false,
      moderation: true,
      analytics: true,
      notifications: false,
      webhook: false
    };
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const settings = req.body || {};
    // In this minimal version we just echo back provided settings
    res.json({ success: true, settings });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
