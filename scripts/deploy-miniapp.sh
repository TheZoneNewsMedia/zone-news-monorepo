#!/bin/bash

# Deploy Mini App Script
echo "🚀 Deploying Zone News Mini App..."

# Configuration
SERVER_IP="67.219.107.230"
SSH_KEY="terraform/zone_news_private_key"
REMOTE_DIR="/var/www/html/telegram-mini-app"

# Step 1: Create simple static HTML mini app
echo "Building Mini App..."
cd /Users/georgesimbe/telegramNewsBot/zone-news-monorepo/apps/miniapp
mkdir -p dist

# Create index.html
cat > dist/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zone News Adelaide</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--tg-theme-bg-color, #fff);
            color: var(--tg-theme-text-color, #000);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .container { padding: 20px; max-width: 480px; margin: 0 auto; }
        .news-item {
            background: var(--tg-theme-secondary-bg-color, #f5f5f5);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
        }
        .news-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
        .news-meta { font-size: 14px; color: #666; margin-bottom: 10px; }
        .loading { text-align: center; padding: 40px; color: #999; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📰 Zone News Adelaide</h1>
        <p>Your local news, instantly</p>
    </div>
    <div class="container">
        <div id="news-container">
            <div class="loading">Loading news...</div>
        </div>
    </div>
    <script>
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        async function loadNews() {
            try {
                const response = await fetch('http://67.219.107.230:3011/api/news');
                const data = await response.json();
                const container = document.getElementById('news-container');
                
                if (data.articles && data.articles.length > 0) {
                    container.innerHTML = data.articles.map(article => 
                        '<div class="news-item">' +
                        '<div class="news-title">' + article.title + '</div>' +
                        '<div class="news-meta">📅 ' + new Date(article.published_date).toLocaleDateString('en-AU') + 
                        ' | 📂 ' + (article.category || 'General') + '</div>' +
                        '<div>' + (article.summary || article.content?.substring(0, 200) || '') + '...</div>' +
                        '</div>'
                    ).join('');
                } else {
                    container.innerHTML = '<div class="loading">No news available</div>';
                }
            } catch (error) {
                document.getElementById('news-container').innerHTML = 
                    '<div class="loading">Failed to load news</div>';
            }
        }
        
        loadNews();
        setInterval(loadNews, 300000); // Refresh every 5 minutes
    </script>
</body>
</html>
EOF

echo "✅ Mini App built"

# Step 2: Deploy to server
cd /Users/georgesimbe/telegramNewsBot
ssh -o StrictHostKeyChecking=no -i $SSH_KEY root@$SERVER_IP "mkdir -p $REMOTE_DIR"
scp -o StrictHostKeyChecking=no -i $SSH_KEY zone-news-monorepo/apps/miniapp/dist/index.html root@$SERVER_IP:$REMOTE_DIR/
ssh -o StrictHostKeyChecking=no -i $SSH_KEY root@$SERVER_IP "chown -R www-data:www-data $REMOTE_DIR"

echo "🎉 Mini App deployed to http://$SERVER_IP/telegram-mini-app"
