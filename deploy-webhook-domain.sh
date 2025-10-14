#!/bin/bash
# Complete webhook.thezonenews.com deployment script

set -e

echo "🚀 Deploying webhook.thezolenews.com..."

# Configuration
SERVER_IP="67.219.107.230"
WEBHOOK_DOMAIN="webhook.thezonenews.com"
API_PORT="3001"

# Check if running on server
if [[ $(hostname -I 2>/dev/null | grep -c "67.219.107.230") -gt 0 ]] || [[ "$1" == "--server" ]]; then
    echo "🖥️  Running on production server..."
    
    # Deploy nginx configuration
    if command -v nginx >/dev/null 2>&1; then
        echo "📝 Deploying nginx configuration..."
        sudo cp nginx-webhook.conf /etc/nginx/sites-available/webhook.thezonenews.com
        sudo ln -sf /etc/nginx/sites-available/webhook.thezonenews.com /etc/nginx/sites-enabled/
        
        # Test nginx config
        if sudo nginx -t; then
            sudo systemctl reload nginx
            echo "✅ Nginx configuration deployed and reloaded"
        else
            echo "❌ Nginx configuration test failed"
            exit 1
        fi
    else
        echo "⚠️  Nginx not found - using direct port access"
    fi
    
    # Ensure API gateway is running
    if pm2 list | grep -q "zone-api.*online"; then
        echo "✅ Zone API Gateway is running"
    else
        echo "🚀 Starting Zone API Gateway..."
        pm2 start apps/api/src/server-production.js --name zone-api
    fi
    
    # Configure firewall for webhook port
    if command -v ufw >/dev/null 2>&1; then
        sudo ufw allow 3001/tcp comment "Zone API Gateway - Webhooks"
        echo "🔒 Firewall configured for port 3001"
    fi
    
else
    echo "💻 Running on local machine..."
    
    # Display Cloudflare setup instructions
    echo ""
    echo "📋 CLOUDFLARE DNS SETUP REQUIRED:"
    echo "================================="
    echo "1. Go to Cloudflare Dashboard → thezonenews.com"
    echo "2. Navigate to DNS → Records"
    echo "3. Click 'Add record'"
    echo "4. Configure:"
    echo "   - Type: A"
    echo "   - Name: webhook"
    echo "   - Content: $SERVER_IP"
    echo "   - Proxy status: ✅ Proxied (Orange Cloud)"
    echo "   - TTL: Auto"
    echo ""
    
    # Upload nginx config to server
    echo "📤 Uploading nginx configuration to server..."
    scp -i /Users/georgesimbe/telegramNewsBot/terraform/zone_news_private_key nginx-webhook.conf root@$SERVER_IP:/tmp/
    
    # Upload this script to server
    echo "📤 Uploading deployment script to server..."
    scp -i /Users/georgesimbe/telegramNewsBot/terraform/zone_news_private_key deploy-webhook-domain.sh root@$SERVER_IP:/tmp/
    
    # Deploy on server
    echo "🚀 Deploying webhook configuration on server..."
    ssh -i /Users/georgesimbe/telegramNewsBot/terraform/zone_news_private_key root@$SERVER_IP "cd /tmp && chmod +x deploy-webhook-domain.sh && ./deploy-webhook-domain.sh --server"
fi

echo ""
echo "🧪 TESTING COMMANDS:"
echo "==================="
echo "# Test DNS resolution (wait 2-3 minutes after DNS setup):"
echo "nslookup webhook.thezolenews.com"
echo ""
echo "# Test HTTPS connectivity:"
echo "curl -I https://webhook.thezolenews.com/health"
echo ""
echo "# Test webhook endpoint:"
echo "curl -X POST https://webhook.thezolenews.com/api/webhook -H \"Content-Type: application/json\" -d '{\"test\":\"data\"}'"
echo ""
echo "# Restart bot after DNS propagation:"
echo "pm2 restart zone-telegram-bot"
echo ""

echo "✅ Webhook domain deployment complete!"
echo "🔗 Webhook URL: https://webhook.thezolenews.com/api/webhook"