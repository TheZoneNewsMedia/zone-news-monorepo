#!/bin/bash

echo "🔐 Setting up HTTPS with Let's Encrypt"
echo "======================================"
echo ""

SERVER_IP="67.219.107.230"
SSH_KEY="~/telegramNewsBot/terraform/zone_news_private_key"
DOMAIN="thezonenews.com"

echo "📦 Installing Certbot on server..."

ssh -i $SSH_KEY root@$SERVER_IP << 'EOF'
# Update package list
apt-get update

# Install Certbot and Nginx plugin
apt-get install -y certbot python3-certbot-nginx

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apt-get install -y nginx
fi

# Create Nginx configuration for the domain
cat > /etc/nginx/sites-available/zone-news << 'NGINX'
server {
    listen 80;
    server_name thezonenews.com www.thezonenews.com;

    # Mini App
    location / {
        root /var/www/html;
        try_files $uri $uri/ /miniapp.html;
    }

    # Admin Dashboard
    location /admin {
        root /var/www/html;
        try_files $uri $uri/ /admin.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Strapi CMS
    location /cms {
        proxy_pass http://localhost:1337;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Telegram Webhook
    location /webhook {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# Enable the site
ln -sf /etc/nginx/sites-available/zone-news /etc/nginx/sites-enabled/

# Test Nginx configuration
nginx -t

# Reload Nginx
systemctl reload nginx

echo "✅ Nginx configured!"
echo ""
echo "📝 Next steps for SSL:"
echo "1. Ensure DNS points to 67.219.107.230"
echo "2. Run: certbot --nginx -d thezonenews.com -d www.thezonenews.com"
echo "3. Select option to redirect HTTP to HTTPS"
echo ""
echo "Current services:"
echo "• Mini App: http://67.219.107.230/"
echo "• Admin: http://67.219.107.230/admin"
echo "• API: http://67.219.107.230/api"
echo "• CMS: http://67.219.107.230/cms (when Strapi is running)"
EOF

echo ""
echo "✅ HTTPS setup script complete!"
echo ""
echo "⚠️ Manual steps required:"
echo "1. Verify DNS A records point to 67.219.107.230"
echo "2. SSH into server and run:"
echo "   certbot --nginx -d thezonenews.com -d www.thezonenews.com"
echo "3. Set up auto-renewal with cron"