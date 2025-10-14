# Zone News File Naming Conventions

## Directory Structure
```
zone-news-monorepo/
├── apps/                   # Applications
│   ├── api/               # REST API service
│   ├── bot/               # Telegram bot service
│   ├── web/               # Public website (Astro)
│   ├── admin/             # Admin dashboard
│   ├── miniapp/           # Telegram mini app
│   └── cms/               # Strapi CMS
├── services/              # Shared business logic
│   ├── news/              # News aggregation
│   ├── ai/                # AI services
│   ├── users/             # User management
│   ├── channels/          # Channel management
│   ├── analytics/         # Analytics service
│   └── payments/          # Payment processing
├── libs/                  # Shared libraries
│   ├── database/          # Database utilities
│   ├── cache/             # Redis cache
│   ├── auth/              # Authentication
│   ├── queue/             # Job queue
│   ├── logger/            # Logging
│   └── shared/            # Common utilities
├── config/                # Configuration files
├── scripts/               # Build & deployment scripts
├── monitoring/            # Health checks & metrics
└── docs/                  # Documentation
```

## Naming Conventions

### 1. Files
- **Use kebab-case**: `user-service.js`, `news-api.js`
- **NO underscores**: ~~`user_service.js`~~
- **NO camelCase for files**: ~~`userService.js`~~
- **Descriptive names**: `telegram-bot-service.js` not `bot.js`

### 2. Directories
- **Use kebab-case**: `zone-news-monorepo/`
- **Plural for collections**: `services/`, `libs/`, `apps/`
- **Singular for specific**: `service/auth/`, `lib/database/`

### 3. Configuration Files
- **Dotfiles at root**: `.env`, `.gitignore`, `.eslintrc`
- **Config with extension**: `ecosystem.config.js`, `docker-compose.yml`
- **Environment specific**: `.env.production`, `.env.development`

### 4. Scripts
- **Action-based naming**: `deploy-production.sh`, `build-docker.sh`
- **Use hyphens**: `setup-database.sh` not `setup_database.sh`

### 5. Components (React/Vue)
- **PascalCase**: `NewsCard.tsx`, `UserProfile.vue`
- **Index files**: `index.ts` for barrel exports

### 6. API Routes
- **Resource-based**: `/api/news`, `/api/users/:id`
- **Use plural**: `/api/articles` not `/api/article`
- **Actions as sub-routes**: `/api/articles/:id/publish`

### 7. Database
- **Tables: snake_case**: `news_articles`, `user_profiles`
- **Columns: snake_case**: `created_at`, `user_id`
- **Indexes: descriptive**: `idx_articles_published_date`

### 8. Environment Variables
- **SCREAMING_SNAKE_CASE**: `MONGODB_URI`, `TELEGRAM_BOT_TOKEN`
- **Prefix with service**: `TELEGRAM_BOT_TOKEN`, `STRAPI_API_KEY`

### 9. Git Branches
- **Feature branches**: `feature/user-authentication`
- **Bugfix branches**: `bugfix/api-timeout-issue`
- **Release branches**: `release/v1.2.0`

### 10. Documentation
- **UPPERCASE for root docs**: `README.md`, `LICENSE.md`
- **Title case for guides**: `Installation-Guide.md`
- **Kebab-case for specifics**: `api-documentation.md`

## Examples

### ✅ Good
```
zone-news-monorepo/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── news-routes.js
│   │   │   │   └── user-routes.js
│   │   │   └── server.js
│   │   └── package.json
├── services/
│   ├── news/
│   │   ├── news-aggregator.js
│   │   └── news-processor.js
└── scripts/
    ├── deploy-production.sh
    └── setup-database.sh
```

### ❌ Bad
```
zoneNews/
├── Apps/
│   ├── API/
│   │   ├── newsRoutes.js      # Should be kebab-case
│   │   └── user_routes.js     # Should use hyphens
├── Services/
│   └── News/
│       └── aggregator.js      # Too generic
└── Scripts/
    └── deploy_prod.sh         # Should spell out 'production'
```

## Migration Checklist

- [ ] Rename all camelCase files to kebab-case
- [ ] Move files to proper directories
- [ ] Update import statements
- [ ] Update PM2 configs
- [ ] Update Docker configs
- [ ] Test all services
- [ ] Update documentation

## Automated Renaming Script

```bash
#!/bin/bash
# Convert camelCase to kebab-case
for file in *.js; do
  newname=$(echo "$file" | sed 's/\([A-Z]\)/-\L\1/g' | sed 's/^-//')
  if [ "$file" != "$newname" ]; then
    mv "$file" "$newname"
    echo "Renamed: $file → $newname"
  fi
done
```