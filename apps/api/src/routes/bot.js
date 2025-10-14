import express from 'express';

const router = express.Router();

router.get('/bot/commands', async (req, res) => {
  try {
    // Fallback list until service discovery is wired
    const commands = ['start','help','news','trending','digest','settings','subscription','upgrade','post','channels','groups','reactions'];
    res.json({ success: true, commands });
  } catch (e) {
    res.json({ success: true, commands: [] });
  }
});

// Telegram Webhook endpoint
router.post('/webhook', async (req, res) => {
  try {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;
    
    // Verify webhook secret if configured
    if (expectedSecret && secret !== expectedSecret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Forward webhook to bot service
    const botPort = process.env.BOT_PORT || 3002;
    const botUrl = `http://localhost:${botPort}/webhook`;
    
    try {
      const fetch = require('node-fetch');
      const response = await fetch(botUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': secret
        },
        body: JSON.stringify(req.body)
      });
      
      if (response.ok) {
        res.status(200).send('OK');
      } else {
        console.error('Bot service error:', response.status, response.statusText);
        res.status(200).send('OK'); // Still return OK to Telegram
      }
    } catch (error) {
      console.error('Error forwarding webhook to bot:', error);
      res.status(200).send('OK'); // Still return OK to Telegram
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(200).send('OK'); // Always return OK to Telegram
  }
});

router.post('/admin/post', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!process.env.ADMIN_POST_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!secret || secret !== process.env.ADMIN_POST_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Placeholder: echo content only
    const { text, photo, video, topic, reactions, channels } = req.body || {};
    res.json({ success: true, echoed: { text, photo: !!photo, video: !!video, topic, reactions, channels } });
  } catch (e) {
    res.status(500).json({ error: 'Failed to post' });
  }
});

export default router;
