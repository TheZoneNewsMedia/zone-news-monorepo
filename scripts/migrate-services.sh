#!/bin/bash

# Migration script to move existing services to monorepo structure
# This preserves working code while organizing into new structure

echo "🚀 Migrating Zone News Services to Monorepo"
echo "==========================================="

# Source directories
SOURCE_DIR="/Users/georgesimbe/telegramNewsBot"
TARGET_DIR="/Users/georgesimbe/telegramNewsBot/zone-news-monorepo"

# Bot Service Migration
echo "📦 Migrating Bot Service..."
if [ -f "$SOURCE_DIR/services/zone-bot-service.js" ]; then
    cp "$SOURCE_DIR/services/zone-bot-service.js" "$TARGET_DIR/apps/bot/src/server.js"
    echo "✅ Bot service migrated"
else
    echo "⚠️ Bot service not found at expected location"
fi

# Tier Service Migration
echo "📦 Migrating Tier Service..."
if [ -d "$SOURCE_DIR/services/tiers" ]; then
    cp -r "$SOURCE_DIR/services/tiers" "$TARGET_DIR/services/tiers/src/"
    echo "✅ Tier service migrated"
fi

# API Service Migration
echo "📦 Migrating API Service..."
if [ -f "$SOURCE_DIR/api-news.js" ]; then
    mkdir -p "$TARGET_DIR/apps/api/src/routes"
    cp "$SOURCE_DIR/api-news.js" "$TARGET_DIR/apps/api/src/server.js"
    echo "✅ API service migrated"
fi

# Cache Service Migration
echo "📦 Migrating Cache Service..."
if [ -f "$SOURCE_DIR/services/cache/redisCache.js" ]; then
    mkdir -p "$TARGET_DIR/libs/cache/src"
    cp "$SOURCE_DIR/services/cache/redisCache.js" "$TARGET_DIR/libs/cache/src/index.js"
    echo "✅ Cache service migrated"
fi

# User Repository Migration
echo "📦 Migrating User Repository..."
if [ -f "$SOURCE_DIR/services/repositories/UserRepository.js" ]; then
    mkdir -p "$TARGET_DIR/libs/database/src/repositories"
    cp "$SOURCE_DIR/services/repositories/UserRepository.js" "$TARGET_DIR/libs/database/src/repositories/"
    echo "✅ User repository migrated"
fi

# AI Services Migration
echo "📦 Migrating AI Services..."
if [ -d "$SOURCE_DIR/services/ai" ]; then
    cp -r "$SOURCE_DIR/services/ai" "$TARGET_DIR/services/ai/src/"
    echo "✅ AI services migrated"
fi

# Configuration Files
echo "📦 Migrating Configuration..."
if [ -f "$SOURCE_DIR/.env.production" ]; then
    cp "$SOURCE_DIR/.env.production" "$TARGET_DIR/.env.production"
    echo "✅ Production config migrated"
fi

echo ""
echo "✅ Migration complete!"
echo "Next steps:"
echo "1. cd $TARGET_DIR"
echo "2. pnpm install"
echo "3. pnpm build"
echo "4. pnpm dev (for development)"