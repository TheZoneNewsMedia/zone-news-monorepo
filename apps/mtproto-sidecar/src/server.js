const express = require('express');
const cors = require('cors');

const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'change-me';

const app = express();
const PORT = process.env.PORT || 3014;

app.use(cors());
app.use(express.json());

function requireInternalAuth(req, res, next) {
  const token = req.headers['x-internal-auth'];
  if (!token || token !== INTERNAL_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Stubs (wire with tdl later)
app.post('/v1/mtproto/scrape-topic', requireInternalAuth, async (req, res) => {
  const { chatId, threadId } = req.body || {};
  if (!chatId || !threadId) return res.status(400).json({ error: 'chatId and threadId required' });
  res.json({ success: true, jobId: `job_${Date.now()}`, chatId, threadId });
});

app.post('/v1/mtproto/scrape-channel', requireInternalAuth, async (req, res) => {
  const { username, chatId } = req.body || {};
  if (!username && !chatId) return res.status(400).json({ error: 'username or chatId required' });
  res.json({ success: true, jobId: `job_${Date.now()}`, username, chatId });
});

app.get('/v1/mtproto/message/:chatId/:messageId', requireInternalAuth, async (req, res) => {
  res.json({ success: true, data: { chatId: req.params.chatId, messageId: req.params.messageId } });
});

app.listen(PORT, '0.0.0.0', () => console.log(`mtproto-sidecar listening on ${PORT}`));
