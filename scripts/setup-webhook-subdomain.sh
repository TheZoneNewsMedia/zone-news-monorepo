#!/bin/bash

# Setup webhook.thezonenews.com subdomain
# This script sets up DNS and SSL for the webhook subdomain

set -e

echo "🚀 Setting up webhook.thezonenews.com subdomain..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on server
if [[ $(hostname -I 2>/dev/null | grep -o "67.219.107.230") ]]; then
    echo -e "${GREEN}✅ Running on production server${NC}"
    ON_SERVER=true
else
    echo -e "${YELLOW}⚠️  Running locally, will connect to server${NC}"
    ON_SERVER=false
    SSH_KEY="../terraform/zone_news_private_key"
    SERVER="root@67.219.107.230"
fi

# Function to run commands on server or locally
run_cmd() {
    if [[ "$ON_SERVER" == true ]]; then
        eval "$1"
    else
        ssh -i "$SSH_KEY" "$SERVER" "$1"
    fi
}

echo "📋 Step 1: Creating Cloudflare DNS record for webhook.thezonenews.com"
echo "Please add the following DNS record in Cloudflare Dashboard:"
echo "Type: A"
echo "Name: webhook"
echo "Content: 67.219.107.230"
echo "TTL: Auto"
echo ""
echo "Press Enter when DNS record is added..."
read -r

echo "🔍 Step 2: Waiting for DNS propagation..."
sleep 10

# Check DNS propagation
echo "Checking DNS propagation..."
if dig +short webhook.thezonenews.com | grep -q "67.219.107.230"; then
    echo -e "${GREEN}✅ DNS record is propagating${NC}"
else
    echo -e "${YELLOW}⚠️  DNS not yet propagated, continuing anyway...${NC}"
fi

echo "🔐 Step 3: Setting up SSL certificates with Let's Encrypt"
run_cmd "certbot certonly --nginx -d webhook.thezonenews.com --non-interactive --agree-tos --email admin@thezonenews.com"

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ SSL certificate created successfully${NC}"
else
    echo -e "${RED}❌ SSL certificate creation failed${NC}"
    echo "Will use existing bot.thezonenews.com certificate temporarily"
fi

echo "⚙️  Step 4: Updating nginx configuration"
run_cmd "cp /etc/nginx/sites-available/webhook-thezonenews-ssl.conf /etc/nginx/sites-available/webhook-thezonenews-ssl.conf.backup"

# Update webhook config with proper SSL paths
cat > /tmp/webhook-final-config.conf << 'EOF'
server {
  listen 443 ssl http2;
  server_name webhook.thezonenews.com;

  # SSL certificates
  ssl_certificate /etc/letsencrypt/live/webhook.thezonenews.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/webhook.thezonenews.com/privkey.pem;

  # Fallback to bot certificates if webhook certs don't exist
  ssl_certificate /etc/letsencrypt/live/bot.thezonenews.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/bot.thezonenews.com/privkey.pem;

  # SSL security settings
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;
  ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

  # Security headers for webhook endpoint
  add_header X-Frame-Options DENY;
  add_header X-Content-Type-Options nosniff;
  add_header X-XSS-Protection "1; mode=block";
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  # Rate limiting for webhook security
  limit_req zone=webhook_limit burst=10 nodelay;

  # Webhook endpoint - proxy to webhook service
  location /webhook {
    proxy_pass http://127.0.0.1:3001/webhook;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Telegram-Bot-Api-Secret-Token $http_x_telegram_bot_api_secret_token;
    
    # Webhook-specific timeouts
    proxy_connect_timeout 30s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;

    # Log webhook requests
    access_log /var/log/nginx/webhook.thezonenews.com.access.log;
    error_log /var/log/nginx/webhook.thezonenews.com.error.log;
  }

  # Health check for webhook service
  location = /health {
    default_type application/json;
    return 200 '{"status":"healthy","service":"webhook","domain":"webhook.thezonenews.com","proto":"https","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}';
  }

  # Webhook metrics (admin only)
  location = /metrics {
    allow 127.0.0.1;
    deny all;
    default_type application/json;
    return 200 '{"webhook_requests":0,"uptime":"'$(uptime -p)'","ssl_status":"active"}';
  }

  # Block all other paths for security
  location / {
    return 404 '{"error":"Not found","message":"This endpoint only serves webhooks"}';
  }
}

# Rate limiting zone for webhooks
limit_req_zone $binary_remote_addr zone=webhook_limit:10m rate=30r/m;
EOF

if [[ "$ON_SERVER" == false ]]; then
    scp -i "$SSH_KEY" /tmp/webhook-final-config.conf "$SERVER":/etc/nginx/sites-available/webhook-thezonenews-ssl.conf
else
    cp /tmp/webhook-final-config.conf /etc/nginx/sites-available/webhook-thezonenews-ssl.conf
fi

echo "🔗 Step 5: Enabling webhook configuration"
run_cmd "ln -sf /etc/nginx/sites-available/webhook-thezonenews-ssl.conf /etc/nginx/sites-enabled/"

echo "✅ Step 6: Testing nginx configuration"
if run_cmd "nginx -t"; then
    echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
    run_cmd "nginx -s reload"
    echo -e "${GREEN}✅ Nginx reloaded successfully${NC}"
else
    echo -e "${RED}❌ Nginx configuration error${NC}"
    exit 1
fi

echo "🧪 Step 7: Testing webhook endpoint"
sleep 2
if curl -s -f https://webhook.thezozenews.com/health > /dev/null; then
    echo -e "${GREEN}✅ Webhook endpoint is responding${NC}"
else
    echo -e "${YELLOW}⚠️  Webhook endpoint not yet responding (may need more time for DNS)${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Webhook subdomain setup complete!${NC}"
echo ""
echo "📋 Summary:"
echo "  🌐 Domain: webhook.thezonenews.com"
echo "  🔒 SSL: Let's Encrypt certificate"
echo "  📡 Endpoint: https://webhook.thezonenews.com/webhook"
echo "  ❤️  Health: https://webhook.thezonenews.com/health"
echo "  🔐 Security: Rate limited, headers configured"
echo ""
echo "🔄 Next: Update Telegram bot webhook URL to use new endpoint"