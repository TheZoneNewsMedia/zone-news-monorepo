### Health & Readiness

- Purpose: Standardize /health and /ready across services.

- /health
  - Fast, no external dependencies
  - Returns { status: 'ok' }
- /ready
  - Checks DB/queues/external deps
  - Returns { ready: true } or 503 with details

Implementation snippet (Express):
```js
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (req, res) => {
  try { await db.command({ ping: 1 }); res.json({ ready: true }); }
  catch (e) { res.status(503).json({ ready: false, error: e.message }); }
});
```

Rollout
- Add to: api, news-api, groups-service, mtproto-sidecar, and future services