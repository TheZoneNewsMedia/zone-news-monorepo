### Deployment (PM2 + Nginx)

- Purpose: Document monorepo deployment path.

Steps
1) SSH: `ssh -i ~/telegramNewsBot/terraform/zone_news_private_key root@67.219.107.230`
2) Upload or pull repo → /opt/zone-news/zone-news-monorepo
3) Set env: `export MONGODB_URI=... JWT_SECRET=... INTERNAL_TOKEN=...`
4) Run: `bash scripts/deploy-monorepo.sh`
5) Verify: curl /health for 3001, 3011, 3012, 3014; `pm2 ls`, `pm2 logs <name>`

PM2 config: `config/pm2/ecosystem.monorepo.config.js`

Nginx
- Upstreams to service ports
- TLS via Cloudflare
- Health checks route to /health

Rollback
- `pm2 revert <id>` or `pm2 delete <name>`; re-run deploy

Notes
- Keep gateway thin; forward to services
- Prefer /ready for readiness probes