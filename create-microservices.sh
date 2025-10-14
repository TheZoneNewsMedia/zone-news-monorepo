#!/bin/bash

# Create all remaining microservices with basic structure
echo "🚀 Creating Zone News Microservices Architecture..."

# Base directory
BASE_DIR="/Users/georgesimbe/telegramNewsBot/zone-news-monorepo"

# Create channels-service
echo "📺 Creating channels-service..."
mkdir -p "$BASE_DIR/apps/channels-service/src"
cat > "$BASE_DIR/apps/channels-service/package.json" << 'EOF'
{
  "name": "@zone/channels-service",
  "version": "1.0.0",
  "description": "Channel management microservice",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongodb": "^6.3.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  }
}
EOF

cat > "$BASE_DIR/apps/channels-service/src/index.js" << 'EOF'
const express = require('express');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.CHANNELS_SERVICE_PORT || 4004;

app.use(express.json());
app.use(require('cors')());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'channels-service' });
});

// Channel CRUD operations
app.get('/api/channels', async (req, res) => {
    res.json({ channels: [] });
});

app.post('/api/channels', async (req, res) => {
    res.json({ message: 'Channel created' });
});

app.listen(port, () => {
    console.log(`Channels Service running on port ${port}`);
});
EOF

# Create settings-service
echo "⚙️ Creating settings-service..."
mkdir -p "$BASE_DIR/apps/settings-service/src"
cat > "$BASE_DIR/apps/settings-service/package.json" << 'EOF'
{
  "name": "@zone/settings-service",
  "version": "1.0.0",
  "description": "Settings and feature flags microservice",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongodb": "^6.3.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  }
}
EOF

cat > "$BASE_DIR/apps/settings-service/src/index.js" << 'EOF'
const express = require('express');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.SETTINGS_SERVICE_PORT || 4005;

app.use(express.json());
app.use(require('cors')());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'settings-service' });
});

// Feature flags
app.get('/api/features', async (req, res) => {
    res.json({ 
        features: {
            newUI: true,
            aiSummaries: false,
            premiumTiers: true
        }
    });
});

app.listen(port, () => {
    console.log(`Settings Service running on port ${port}`);
});
EOF

# Create analytics-service  
echo "📊 Creating analytics-service..."
mkdir -p "$BASE_DIR/apps/analytics-service/src"
cat > "$BASE_DIR/apps/analytics-service/package.json" << 'EOF'
{
  "name": "@zone/analytics-service",
  "version": "1.0.0",
  "description": "Analytics and metrics microservice",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongodb": "^6.3.0",
    "prom-client": "^15.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  }
}
EOF

cat > "$BASE_DIR/apps/analytics-service/src/index.js" << 'EOF'
const express = require('express');
const client = require('prom-client');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.ANALYTICS_SERVICE_PORT || 4006;
const register = new client.Registry();

// Prometheus metrics
client.collectDefaultMetrics({ register });

app.use(express.json());
app.use(require('cors')());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'analytics-service' });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// Analytics API
app.post('/api/events', async (req, res) => {
    res.json({ message: 'Event tracked' });
});

app.listen(port, () => {
    console.log(`Analytics Service running on port ${port}`);
});
EOF

# Create subscription-service
echo "💳 Creating subscription-service..."
mkdir -p "$BASE_DIR/apps/subscription-service/src"
cat > "$BASE_DIR/apps/subscription-service/package.json" << 'EOF'
{
  "name": "@zone/subscription-service",
  "version": "1.0.0",
  "description": "Subscription and payment microservice",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongodb": "^6.3.0",
    "stripe": "^14.5.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  }
}
EOF

cat > "$BASE_DIR/apps/subscription-service/src/index.js" << 'EOF'
const express = require('express');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.SUBSCRIPTION_SERVICE_PORT || 4007;

app.use(express.json());
app.use(require('cors')());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'subscription-service' });
});

// Subscription endpoints
app.get('/api/subscriptions/:userId', async (req, res) => {
    res.json({ tier: 'free', active: true });
});

app.post('/api/subscriptions/checkout', async (req, res) => {
    res.json({ checkoutUrl: 'https://checkout.stripe.com/...' });
});

app.listen(port, () => {
    console.log(`Subscription Service running on port ${port}`);
});
EOF

echo "✅ All microservices created successfully!"