#!/bin/bash

echo "🧹 Consolidating Zone News Services"
echo "===================================="
echo ""

# Create archive directory for duplicates
ARCHIVE_DIR="../archive-consolidated"
mkdir -p $ARCHIVE_DIR/{bots,apis,services,configs,html}

# Statistics
TOTAL_FILES=$(ls -1 ../*.js 2>/dev/null | wc -l)
echo "📊 Found $TOTAL_FILES JS files to analyze"

# Identify and categorize files
echo ""
echo "📦 Categorizing files..."

# Bot files
BOT_FILES=$(ls -1 ../*bot*.js ../*telegram*.js 2>/dev/null | wc -l)
echo "🤖 Bot files: $BOT_FILES"

# API files  
API_FILES=$(ls -1 ../*api*.js 2>/dev/null | wc -l)
echo "🔌 API files: $API_FILES"

# Service files
SERVICE_FILES=$(ls -1 ../*service*.js 2>/dev/null | wc -l)
echo "⚙️ Service files: $SERVICE_FILES"

# Move duplicates to archive
echo ""
echo "📁 Archiving duplicates..."

# Archive old bot versions
for file in ../enhanced-bot-*.js ../telegram-bot-*.js ../bot-*.js; do
    if [ -f "$file" ]; then
        mv "$file" "$ARCHIVE_DIR/bots/" 2>/dev/null
        echo "  Archived: $(basename $file)"
    fi
done

# Archive old API versions
for file in ../api-server-*.js ../api-*-service.js ../admin-api-*.js; do
    if [ -f "$file" ]; then
        mv "$file" "$ARCHIVE_DIR/apis/" 2>/dev/null
        echo "  Archived: $(basename $file)"
    fi
done

# Archive duplicate services
for file in ../*-service-*.js ../*-tracking-*.js ../*-dashboard-*.js; do
    if [ -f "$file" ]; then
        mv "$file" "$ARCHIVE_DIR/services/" 2>/dev/null
        echo "  Archived: $(basename $file)"
    fi
done

# Archive HTML files (keep only essential ones)
for file in ../*.html; do
    if [[ ! "$file" =~ (miniapp|admin|frontend-working|test) ]]; then
        if [ -f "$file" ]; then
            mv "$file" "$ARCHIVE_DIR/html/" 2>/dev/null
            echo "  Archived: $(basename $file)"
        fi
    fi
done

echo ""
echo "🎯 Keeping essential files in monorepo:"
echo "----------------------------------------"

# Core files to keep
KEEP_FILES=(
    "zone-news-monorepo/"
    "integrated-zone-bot.js"
    "api-news.js"
    "populate-zone-news.js"
    "ecosystem.config.js"
    "package.json"
    "frontend-working.html"
    "admin-simple.html"
    "test-api.html"
)

for file in "${KEEP_FILES[@]}"; do
    if [ -e "../$file" ]; then
        echo "✅ $file"
    fi
done

# Count remaining files
REMAINING=$(ls -1 ../*.js 2>/dev/null | wc -l)
echo ""
echo "📊 Results:"
echo "  Initial files: $TOTAL_FILES"
echo "  Archived: $((TOTAL_FILES - REMAINING))"
echo "  Remaining: $REMAINING"

# Create service map
echo ""
echo "📝 Creating service map..."
cat > service-map.json << 'EOF'
{
  "production": {
    "bot": "apps/bot/src/server.js",
    "api": "apps/api/src/server.js",
    "cms": "apps/cms",
    "miniapp": "apps/miniapp",
    "admin": "apps/admin"
  },
  "services": {
    "news": "services/news",
    "ai": "services/ai",
    "users": "services/users",
    "channels": "services/channels",
    "analytics": "services/analytics",
    "payments": "services/payments"
  },
  "archived": {
    "location": "archive-consolidated/",
    "categories": ["bots", "apis", "services", "configs", "html"]
  }
}
EOF

echo "✅ Service map created"

echo ""
echo "🚀 Next steps:"
echo "1. Review archived files in $ARCHIVE_DIR"
echo "2. Test remaining services"
echo "3. Update PM2 configs to use monorepo paths"
echo "4. Delete archive after verification"