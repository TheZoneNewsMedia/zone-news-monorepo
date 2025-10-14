#!/bin/bash

echo "🚀 Deploying Strapi CMS on Server"
echo "=================================="
echo ""

SERVER_IP="67.219.107.230"
SSH_KEY="~/telegramNewsBot/terraform/zone_news_private_key"

echo "📦 Setting up Strapi on server (Node 18 compatible)..."

ssh -i $SSH_KEY root@$SERVER_IP << 'EOF'
cd /root/zone-news-monorepo

echo "Creating Strapi structure..."
mkdir -p apps/cms

# Create minimal Strapi package.json
cat > apps/cms/package.json << 'PACKAGE'
{
  "name": "@zone/cms",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "develop": "strapi develop",
    "start": "strapi start",
    "build": "strapi build"
  },
  "dependencies": {
    "@strapi/strapi": "4.15.5",
    "@strapi/plugin-users-permissions": "4.15.5",
    "@strapi/plugin-i18n": "4.15.5",
    "better-sqlite3": "8.6.0"
  },
  "engines": {
    "node": ">=16.0.0 <=20.x.x",
    "npm": ">=6.0.0"
  }
}
PACKAGE

# Install Strapi
cd apps/cms
echo "Installing Strapi dependencies..."
npm install

# Create basic Strapi structure
mkdir -p config src/api public

# Database config
cat > config/database.js << 'DATABASE'
module.exports = ({ env }) => ({
  connection: {
    client: 'sqlite',
    connection: {
      filename: '.tmp/data.db',
    },
    useNullAsDefault: true,
  },
});
DATABASE

# Server config
cat > config/server.js << 'SERVER'
module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
});
SERVER

# Create .env
cat > .env << 'ENV'
HOST=0.0.0.0
PORT=1337
APP_KEYS=key1,key2,key3,key4
API_TOKEN_SALT=token123
ADMIN_JWT_SECRET=jwt123
TRANSFER_TOKEN_SALT=transfer123
JWT_SECRET=secret123
DATABASE_CLIENT=sqlite
DATABASE_FILENAME=.tmp/data.db
ENV

echo "Building Strapi..."
npm run build

echo "✅ Strapi CMS installed on server!"
echo "Port: 1337"
EOF

echo ""
echo "✅ Strapi deployment complete!"
echo ""
echo "📝 Access points:"
echo "• Admin: http://67.219.107.230:1337/admin"
echo "• API: http://67.219.107.230:1337/api"