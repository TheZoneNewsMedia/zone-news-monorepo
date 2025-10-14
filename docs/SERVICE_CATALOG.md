### Service Catalog

- Purpose: One-stop index of all services, ports, status, and owners.

| Service | Folder | Port | Purpose | Owner | Status |
|--------|--------|------|---------|-------|--------|
| API Gateway | apps/api | 3001 | Request routing, auth, validation, rate limiting | Shared | WIP
| News API | apps/news-api | 3011 | News endpoints (list, trending, breaking, stats) | ChatGPT | Online
| Groups Service | apps/groups-service | 3012 | Groups CRUD, forum topics (super/giga groups) | ChatGPT | Online
| Channels Service | apps/channels-service | 3013 | Channels CRUD (planned split) | ChatGPT | Planned
| MTProto Sidecar | apps/mtproto-sidecar | 3014 | Internal-only MTProto jobs and lookups | ChatGPT | Online
| Auth Service | apps/auth-service | TBA | Register/Login/JWT | ChatGPT | Planned
| User Service | apps/user-service | TBA | Profile, bookmarks, likes, feed | ChatGPT | Planned
| Workflow Service | apps/workflow-service | TBA | Collaboration workflows | ChatGPT | Planned
| Settings Service | apps/settings-service | TBA | Feature flags/config | ChatGPT | Planned
| CMS (Strapi) | apps/cms | 1337 | Content management | Claude | Planned
| Web (Astro) | apps/web | 3000 | Public website | Claude | Planned
| Admin (Astro) | apps/admin | 3003 | Admin dashboard | Claude | Planned

Notes
- API Gateway should remain thin and forward to services.
- All services expose /health (fast) and /ready (DB/dep checks).