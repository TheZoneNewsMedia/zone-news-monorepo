# API Routes Overview

Created (awaiting mount if server differs):
- analytics.js: GET /api/analytics
- bot.js: GET /api/bot/commands, POST /api/admin/post
- admin.js: GET /api/admin/check
- channels.js: channels/groups CRUD
- settings.js: GET/POST /api/settings
- auth.js: POST /api/auth/register, POST /api/auth/login
- user.js: profile, bookmarks, comments, likes, feed, push-subscription
- news.js: /api/news, /api/trending, /api/breaking, /api/news/breaking, /api/stats
- articles.js: /api/search, /api/article/:id, /api/articles, share helpers

Note: If `src/server.js` is under active edit by another agent, mount these in a follow-up step to avoid conflicts.
