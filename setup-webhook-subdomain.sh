#!/bin/bash
# Setup webhook.thezonenews.com subdomain on Cloudflare

echo "🌐 Setting up webhook.thezonenews.com subdomain..."

# Server configuration
SERVER_IP="67.219.107.230"
WEBHOOK_DOMAIN="webhook.thezonenews.com"
API_PORT="3001"

echo "📋 Cloudflare DNS Configuration Required:"
echo "=================================="
echo "Domain: $WEBHOOK_DOMAIN"
echo "Type: A Record"
echo "Name: webhook"
echo "Content: $SERVER_IP"
echo "Proxy status: ✅ Proxied (Orange Cloud)"
echo "TTL: Auto"
echo ""

echo "🔧 Manual Steps Required:"
echo "1. Log into Cloudflare Dashboard"
echo "2. Select thezonenews.com domain"
echo "3. Go to DNS > Records"
echo "4. Click 'Add record'"
echo "5. Configure as shown above"
echo ""

echo "🧪 Testing Commands (run after DNS setup):"
echo "curl -I https://webhook.thezonenews.com"
echo "curl -X POST https://webhook.thezonenews.com/api/webhook -d '{\"test\":\"data\"}'"
echo ""

# Test current server API
echo "🔍 Testing current server API gateway..."
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ API Gateway responding on port $API_PORT"
else
    echo "❌ API Gateway not responding on port $API_PORT"
fi

# Test webhook endpoint
echo "🔗 Testing webhook endpoint..."
if curl -s -X POST http://localhost:3001/api/webhook -H "Content-Type: application/json" -d '{"test":"data"}' | grep -q "OK"; then
    echo "✅ Webhook endpoint responding"
else
    echo "❌ Webhook endpoint not responding"
fi

echo ""
echo "🚀 Next Steps:"
echo "1. Add DNS record in Cloudflare"
echo "2. Wait 2-3 minutes for propagation"
echo "3. Test with: curl -I https://webhook.thezonenews.com"
echo "4. Run: pm2 restart zone-telegram-bot"
echo ""
echo "🔐 Webhook URL will be: https://webhook.thezonenews.com/api/webhook"