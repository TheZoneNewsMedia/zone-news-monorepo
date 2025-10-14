#!/usr/bin/env bash
set -euo pipefail

# Bootstrap Strapi CMS inside monorepo at apps/cms
# This script is idempotent and safe to re-run.

MONOREPO_ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
CMS_DIR="$MONOREPO_ROOT_DIR/apps/cms"

if [ -f "$CMS_DIR/package.json" ]; then
  echo "Strapi already initialized in $CMS_DIR"
  exit 0
fi

mkdir -p "$CMS_DIR"
cd "$MONOREPO_ROOT_DIR"

# Prefer pnpm. Fallback to npx if pnpm is unavailable.
if command -v pnpm >/dev/null 2>&1; then
  echo "Scaffolding Strapi with pnpm dlx..."
  pnpm dlx create-strapi-app@latest apps/cms --quickstart --typescript || pnpm dlx create-strapi-app@latest apps/cms --quickstart
else
  echo "pnpm not found; using npx..."
  npx create-strapi-app@latest apps/cms --quickstart --typescript || npx create-strapi-app@latest apps/cms --quickstart
fi

# Post-create hints
cat <<'EONOTE'
Next steps:
1) Configure database and server URLs in apps/cms/.env
2) From monorepo root, run:
   - pnpm --filter @zone-news/cms dev    # if package name set
   - or: pnpm --filter ./apps/cms dev
3) Expose Strapi admin at /admin and API at /api (configure CORS for bot/api apps)
EONOTE
