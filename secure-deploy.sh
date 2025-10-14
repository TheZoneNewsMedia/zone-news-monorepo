#!/bin/bash

# Secure deployment script with validation and security checks
set -e

SERVER="root@67.219.107.230"
KEY_PATH="terraform/zone_news_private_key"
REMOTE_DIR="/root/zone-news-monorepo"

echo "🔐 Zone News Secure Microservices Deployment"
echo "==========================================="

# Step 1: Security checks
echo "🔍 Running security checks..."

# Check for hardcoded secrets
echo "Checking for hardcoded secrets..."
if grep -r "AAF[a-zA-Z0-9_-]*" apps/ --include="*.js" 2>/dev/null | grep -v ".env" | grep -v "example"; then
    echo "❌ Found potential hardcoded tokens! Please remove them."
    exit 1
fi

# Check for console.log in production code
echo "Checking for console.log statements..."
CONSOLE_COUNT=$(grep -r "console\.log" apps/*/src --include="*.js" | wc -l)
echo "Found $CONSOLE_COUNT console.log statements (will be replaced with logger)"

# Step 2: Lint checks
echo "🧹 Running lint checks..."
for service in auth-service user-service workflow-service channels-service settings-service analytics-service subscription-service; do
    if [ -d "apps/$service" ]; then
        echo "Checking $service..."
        # Basic syntax check
        find "apps/$service" -name "*.js" -exec node -c {} \; 2>/dev/null || {
            echo "❌ Syntax error in $service"
            exit 1
        }
    fi
done

# Step 3: Create environment file
echo "📝 Creating production environment file..."
if [ ! -f ".env.production" ]; then
    cp .env.production.template .env.production
    echo "⚠️  Please edit .env.production with actual values before deploying!"
    exit 1
fi

# Step 4: Deploy services one by one
echo "📦 Deploying services to production..."

# Deploy auth-service
echo "1️⃣ Deploying auth-service..."
rsync -avz --exclude='node_modules' --exclude='*.log' -e "ssh -i $KEY_PATH" \
    apps/auth-service/ $SERVER:$REMOTE_DIR/apps/auth-service/

ssh -i $KEY_PATH $SERVER << 'EOF'
    cd /root/zone-news-monorepo/apps/auth-service
    npm install --production
    echo "✅ auth-service deployed"
EOF

# Deploy user-service
echo "2️⃣ Deploying user-service..."
rsync -avz --exclude='node_modules' --exclude='*.log' -e "ssh -i $KEY_PATH" \
    apps/user-service/ $SERVER:$REMOTE_DIR/apps/user-service/

ssh -i $KEY_PATH $SERVER << 'EOF'
    cd /root/zone-news-monorepo/apps/user-service
    npm install --production
    echo "✅ user-service deployed"
EOF

# Deploy workflow-service
echo "3️⃣ Deploying workflow-service..."
rsync -avz --exclude='node_modules' --exclude='*.log' -e "ssh -i $KEY_PATH" \
    apps/workflow-service/ $SERVER:$REMOTE_DIR/apps/workflow-service/

ssh -i $KEY_PATH $SERVER << 'EOF'
    cd /root/zone-news-monorepo/apps/workflow-service
    npm install --production
    echo "✅ workflow-service deployed"
EOF

# Deploy other services
echo "4️⃣ Deploying remaining services..."
for service in channels-service settings-service analytics-service subscription-service; do
    rsync -avz --exclude='node_modules' --exclude='*.log' -e "ssh -i $KEY_PATH" \
        apps/$service/ $SERVER:$REMOTE_DIR/apps/$service/
    
    ssh -i $KEY_PATH $SERVER "cd $REMOTE_DIR/apps/$service && npm install --production"
    echo "✅ $service deployed"
done

# Deploy shared libraries
echo "📚 Deploying shared libraries..."
rsync -avz --exclude='node_modules' -e "ssh -i $KEY_PATH" \
    libs/ $SERVER:$REMOTE_DIR/libs/

# Deploy environment and PM2 config
echo "⚙️ Deploying configuration..."
scp -i $KEY_PATH .env.production $SERVER:$REMOTE_DIR/.env
scp -i $KEY_PATH ecosystem.config.js $SERVER:$REMOTE_DIR/

# Step 5: Start services on server
echo "🚀 Starting services..."
ssh -i $KEY_PATH $SERVER << 'EOF'
    cd /root/zone-news-monorepo
    
    # Source environment variables
    set -a
    source .env
    set +a
    
    # Install dependencies for libs
    for lib in auth database logger queue; do
        if [ -d "libs/$lib" ]; then
            cd libs/$lib
            npm install --production 2>/dev/null || true
            cd ../..
        fi
    done
    
    # Reload PM2 with new config
    pm2 reload ecosystem.config.js --update-env
    
    # Wait for services to start
    sleep 5
    
    # Check health
    echo "🏥 Health checks:"
    for port in 4001 4002 4003 4004 4005 4006 4007; do
        curl -s http://localhost:$port/health | jq '.' || echo "Service on port $port not ready yet"
    done
    
    pm2 save
    echo "✅ All services started"
EOF

echo "🎉 Deployment complete!"
echo ""
echo "📊 To view logs:"
echo "  ssh -i $KEY_PATH $SERVER 'pm2 logs'"
echo ""
echo "🔍 To check status:"
echo "  ssh -i $KEY_PATH $SERVER 'pm2 list'"