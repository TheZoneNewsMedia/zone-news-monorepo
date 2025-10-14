#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$REPO_ROOT_DIR"

# 1) Ensure Node and PM2
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Please install Node.js >= 18.x"
  exit 1
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing PM2 globally..."
  npm i -g pm2
fi

# 2) Install dependencies per service (microservices)
( cd apps/api && npm install )
( cd apps/news-api && npm install )

# 3) Start/Reload PM2 ecosystem
pm2 startOrReload config/pm2/ecosystem.monorepo.config.js || pm2 start config/pm2/ecosystem.monorepo.config.js
pm2 save
pm2 status

# 4) Health checks
sleep 2
set +e
curl -fsS http://127.0.0.1:3001/health && echo || echo "zone-api health check failed"
curl -fsS http://127.0.0.1:3011/health && echo || echo "news-api health check failed"
set -e

echo "Done. PM2 list above and health checks attempted."