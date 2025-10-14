# API App

Express + MongoDB API for Zone News in the monorepo.

- Dev: `node --watch src/server.js`
- Routes mounted under `/api`.
- Configure environment via `.env` based on `.env.example`.

Routers:
- `routes/news.js`: news, trending, breaking, stats
- `routes/articles.js`: search, article detail, list, share helpers
- `routes/admin.js`: admin check
- `routes/channels.js`: channels/groups CRUD
- `routes/settings.js`: get/update settings
- `routes/auth.js`: register/login
- `routes/user.js`: profile, bookmarks, comments, likes, feed, push-subscription
- `routes/workflow.js`: start/status/forward/business/stats
- `routes/subscription.js`: user subscription status and upgrade
