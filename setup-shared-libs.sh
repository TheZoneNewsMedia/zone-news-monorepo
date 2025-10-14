#!/bin/bash

# Setup shared libraries for all microservices
echo "📚 Setting up shared libraries..."

BASE_DIR="/Users/georgesimbe/telegramNewsBot/zone-news-monorepo"

# Create shared auth library
echo "🔐 Creating shared auth library..."
mkdir -p "$BASE_DIR/libs/auth"
cat > "$BASE_DIR/libs/auth/package.json" << 'EOF'
{
  "name": "@zone/auth-lib",
  "version": "1.0.0",
  "description": "Shared authentication library",
  "main": "index.js",
  "dependencies": {
    "jsonwebtoken": "^9.0.2",
    "axios": "^1.6.2"
  }
}
EOF

cat > "$BASE_DIR/libs/auth/index.js" << 'EOF'
const jwt = require('jsonwebtoken');
const axios = require('axios');

const JWT_SECRET = process.env.JWT_SECRET || 'zone-news-secret-key-2024';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';

// Middleware to validate JWT tokens
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const response = await axios.post(`${AUTH_SERVICE_URL}/api/token/validate`, { token });

        if (!response.data.valid) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = response.data.user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
    }
}

// Verify token locally (for internal services)
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = { authenticate, verifyToken };
EOF

# Create shared database library
echo "🗄️ Creating shared database library..."
mkdir -p "$BASE_DIR/libs/database"
cat > "$BASE_DIR/libs/database/package.json" << 'EOF'
{
  "name": "@zone/database-lib",
  "version": "1.0.0",
  "description": "Shared database connection library",
  "main": "index.js",
  "dependencies": {
    "mongodb": "^6.3.0"
  }
}
EOF

cat > "$BASE_DIR/libs/database/index.js" << 'EOF'
const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connect() {
    if (db) return db;
    
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
    client = await MongoClient.connect(uri, { useUnifiedTopology: true });
    db = client.db('zone_news_production');
    
    console.log('Connected to MongoDB');
    return db;
}

async function disconnect() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}

function getDb() {
    if (!db) throw new Error('Database not connected');
    return db;
}

module.exports = { connect, disconnect, getDb };
EOF

# Create shared logger library
echo "📝 Creating shared logger library..."
mkdir -p "$BASE_DIR/libs/logger"
cat > "$BASE_DIR/libs/logger/package.json" << 'EOF'
{
  "name": "@zone/logger-lib",
  "version": "1.0.0",
  "description": "Shared logging library",
  "main": "index.js"
}
EOF

cat > "$BASE_DIR/libs/logger/index.js" << 'EOF'
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

class Logger {
    constructor(service) {
        this.service = service;
    }

    format(level, message, data) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.service}] [${level}]`;
        return data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
    }

    info(message, data) {
        console.log(colors.cyan + this.format('INFO', message, data) + colors.reset);
    }

    error(message, error) {
        const errorData = error instanceof Error ? { message: error.message, stack: error.stack } : error;
        console.error(colors.red + this.format('ERROR', message, errorData) + colors.reset);
    }

    warn(message, data) {
        console.log(colors.yellow + this.format('WARN', message, data) + colors.reset);
    }

    success(message, data) {
        console.log(colors.green + this.format('SUCCESS', message, data) + colors.reset);
    }
}

module.exports = { Logger };
EOF

# Create shared queue library
echo "📨 Creating shared queue library..."
mkdir -p "$BASE_DIR/libs/queue"
cat > "$BASE_DIR/libs/queue/package.json" << 'EOF'
{
  "name": "@zone/queue-lib",
  "version": "1.0.0",
  "description": "Shared job queue library",
  "main": "index.js",
  "dependencies": {
    "bull": "^4.11.5"
  }
}
EOF

cat > "$BASE_DIR/libs/queue/index.js" << 'EOF'
const Bull = require('bull');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const queues = {};

function createQueue(name) {
    if (!queues[name]) {
        queues[name] = new Bull(name, REDIS_URL);
        console.log(`Queue created: ${name}`);
    }
    return queues[name];
}

function getQueue(name) {
    if (!queues[name]) {
        throw new Error(`Queue ${name} not found`);
    }
    return queues[name];
}

async function closeAllQueues() {
    for (const queue of Object.values(queues)) {
        await queue.close();
    }
}

module.exports = { createQueue, getQueue, closeAllQueues };
EOF

echo "✅ Shared libraries created successfully!"