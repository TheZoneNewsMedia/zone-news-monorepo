#!/bin/bash

# Deploy microservices to production server
echo "🚀 Deploying Zone News Microservices to Production..."

SERVER="root@67.219.107.230"
REMOTE_DIR="/root/zone-news-monorepo"
LOCAL_DIR="/Users/georgesimbe/telegramNewsBot/zone-news-monorepo"

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf microservices-deploy.tar.gz \
    apps/auth-service \
    apps/user-service \
    apps/workflow-service \
    apps/channels-service \
    apps/settings-service \
    apps/analytics-service \
    apps/subscription-service \
    libs/ \
    ecosystem.config.js \
    package.json

# Upload to server
echo "📤 Uploading to server..."
scp -i terraform/zone_news_private_key microservices-deploy.tar.gz $SERVER:/tmp/

# Deploy on server
echo "🔧 Deploying on server..."
ssh -i terraform/zone_news_private_key $SERVER << 'ENDSSH'
    # Create directory if not exists
    mkdir -p /root/zone-news-monorepo
    cd /root/zone-news-monorepo
    
    # Backup existing if any
    if [ -d "apps" ]; then
        echo "Backing up existing services..."
        tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz apps/ libs/ 2>/dev/null || true
    fi
    
    # Extract new deployment
    echo "Extracting new deployment..."
    tar -xzf /tmp/microservices-deploy.tar.gz
    
    # Install dependencies for each service
    echo "Installing dependencies..."
    for service in auth-service user-service workflow-service channels-service settings-service analytics-service subscription-service; do
        if [ -d "apps/$service" ]; then
            echo "Installing deps for $service..."
            cd apps/$service
            npm install --production
            cd ../..
        fi
    done
    
    # Install shared libs
    for lib in auth database logger queue; do
        if [ -d "libs/$lib" ]; then
            echo "Installing deps for lib $lib..."
            cd libs/$lib
            npm install --production
            cd ../..
        fi
    done
    
    # Create logs directory
    mkdir -p logs
    
    # Update Nginx configuration
    echo "Updating Nginx configuration..."
    cp nginx-microservices.conf /etc/nginx/sites-available/zone-microservices
    ln -sf /etc/nginx/sites-available/zone-microservices /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    
    # Start services with PM2
    echo "Starting microservices with PM2..."
    pm2 delete all 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup
    
    # Show status
    echo "✅ Deployment complete!"
    pm2 list
    
    # Test health endpoints
    echo "Testing services..."
    sleep 5
    curl -s http://localhost:4001/health | jq '.'
    curl -s http://localhost:4002/health | jq '.'
    curl -s http://localhost:4003/health | jq '.'
    
    echo "🎉 All services deployed successfully!"
ENDSSH

# Cleanup
rm microservices-deploy.tar.gz

echo "✅ Deployment complete! Services are running on 67.219.107.230"
echo ""
echo "Service endpoints:"
echo "  Auth Service: http://67.219.107.230/services/auth"
echo "  User Service: http://67.219.107.230/services/user"
echo "  Workflow Service: http://67.219.107.230/services/workflow"
echo "  Analytics: http://67.219.107.230/services/analytics"
echo "  API Gateway: http://67.219.107.230/api"
echo ""
echo "To view logs on server:"
echo "  ssh -i terraform/zone_news_private_key root@67.219.107.230 'pm2 logs'"