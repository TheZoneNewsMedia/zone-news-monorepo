#!/usr/bin/env node

/**
 * Zone News WebSocket Service
 * Provides real-time updates for news, notifications, and live data
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');
const Redis = require('redis');
const cors = require('cors');

class WebSocketService {
    constructor() {
        this.app = express();
        this.port = process.env.WEBSOCKET_PORT || 3030;
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ 
            server: this.server,
            path: '/ws'
        });
        
        this.clients = new Map(); // userId -> Set of WebSocket connections
        this.rooms = new Map(); // roomName -> Set of userIds
        this.db = null;
        this.redis = null;
        this.pubClient = null;
        this.subClient = null;
    }

    async initialize() {
        await this.connectDatabase();
        await this.connectRedis();
        this.setupExpress();
        this.setupWebSocket();
        this.setupRedisSubscriptions();
        await this.startServer();
    }

    async connectDatabase() {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        const client = await MongoClient.connect(mongoUri);
        this.db = client.db('zone_news_production');
        console.log('✅ Connected to MongoDB');
    }

    async connectRedis() {
        const redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD
        };

        // Create pub/sub clients
        this.pubClient = Redis.createClient(redisConfig);
        this.subClient = Redis.createClient(redisConfig);
        
        await this.pubClient.connect();
        await this.subClient.connect();
        
        console.log('✅ Connected to Redis');
    }

    setupExpress() {
        this.app.use(cors());
        this.app.use(express.json());
        
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                connections: this.clients.size,
                rooms: this.rooms.size,
                uptime: process.uptime()
            });
        });

        // Broadcast endpoint (internal use)
        this.app.post('/broadcast', this.authenticateInternal.bind(this), (req, res) => {
            const { event, data, room, userId } = req.body;
            
            if (userId) {
                this.sendToUser(userId, event, data);
            } else if (room) {
                this.sendToRoom(room, event, data);
            } else {
                this.broadcast(event, data);
            }
            
            res.json({ success: true });
        });
    }

    setupWebSocket() {
        this.wss.on('connection', async (ws, req) => {
            console.log('New WebSocket connection attempt');
            
            // Extract token from query or headers
            const token = this.extractToken(req);
            
            if (!token) {
                ws.send(JSON.stringify({ event: 'error', data: 'Authentication required' }));
                ws.close(1008, 'Authentication required');
                return;
            }

            try {
                // Verify JWT token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.userId || decoded.id;
                
                // Setup client
                ws.userId = userId;
                ws.isAlive = true;
                ws.rooms = new Set();
                
                // Add to clients map
                if (!this.clients.has(userId)) {
                    this.clients.set(userId, new Set());
                }
                this.clients.get(userId).add(ws);
                
                // Send welcome message
                ws.send(JSON.stringify({
                    event: 'connected',
                    data: {
                        userId,
                        timestamp: new Date(),
                        server: 'zone-news-ws'
                    }
                }));
                
                // Load user preferences and auto-join rooms
                await this.autoJoinRooms(ws, userId);
                
                // Setup event handlers
                this.setupClientHandlers(ws, userId);
                
                console.log(`✅ User ${userId} connected`);
                
            } catch (error) {
                console.error('WebSocket auth error:', error);
                ws.send(JSON.stringify({ event: 'error', data: 'Invalid token' }));
                ws.close(1008, 'Invalid token');
            }
        });

        // Heartbeat to detect broken connections
        setInterval(() => {
            this.wss.clients.forEach(ws => {
                if (!ws.isAlive) {
                    this.removeClient(ws);
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    setupClientHandlers(ws, userId) {
        // Pong response for heartbeat
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // Handle incoming messages
        ws.on('message', async (message) => {
            try {
                const { event, data } = JSON.parse(message);
                await this.handleClientEvent(ws, userId, event, data);
            } catch (error) {
                console.error('Message parsing error:', error);
                ws.send(JSON.stringify({ 
                    event: 'error', 
                    data: 'Invalid message format' 
                }));
            }
        });

        // Handle disconnect
        ws.on('close', () => {
            this.removeClient(ws);
            console.log(`User ${userId} disconnected`);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for user ${userId}:`, error);
            this.removeClient(ws);
        });
    }

    async handleClientEvent(ws, userId, event, data) {
        switch (event) {
            case 'subscribe':
                await this.handleSubscribe(ws, userId, data);
                break;
                
            case 'unsubscribe':
                await this.handleUnsubscribe(ws, userId, data);
                break;
                
            case 'join_room':
                this.joinRoom(ws, userId, data.room);
                break;
                
            case 'leave_room':
                this.leaveRoom(ws, userId, data.room);
                break;
                
            case 'get_stats':
                await this.sendStats(ws, userId);
                break;
                
            case 'ping':
                ws.send(JSON.stringify({ event: 'pong', data: { timestamp: Date.now() } }));
                break;
                
            default:
                ws.send(JSON.stringify({ 
                    event: 'error', 
                    data: `Unknown event: ${event}` 
                }));
        }
    }

    async handleSubscribe(ws, userId, data) {
        const { type, filters = {} } = data;
        
        switch (type) {
            case 'news':
                // Subscribe to news updates
                await this.subscribeToNews(ws, userId, filters);
                break;
                
            case 'reactions':
                // Subscribe to reaction updates
                await this.subscribeToReactions(ws, userId, filters);
                break;
                
            case 'user':
                // Subscribe to user-specific updates
                await this.subscribeToUserUpdates(ws, userId);
                break;
                
            case 'analytics':
                // Subscribe to analytics (admin only)
                await this.subscribeToAnalytics(ws, userId);
                break;
        }
    }

    async subscribeToNews(ws, userId, filters) {
        const room = `news:${filters.category || 'all'}`;
        this.joinRoom(ws, userId, room);
        
        // Send initial data
        const latestNews = await this.db.collection('news_articles')
            .find(filters.category ? { category: filters.category } : {})
            .sort({ published_date: -1 })
            .limit(10)
            .toArray();
            
        ws.send(JSON.stringify({
            event: 'news_update',
            data: latestNews
        }));
    }

    setupRedisSubscriptions() {
        // Subscribe to Redis channels for real-time updates
        this.subClient.subscribe('news:new', (message) => {
            const data = JSON.parse(message);
            this.sendToRoom('news:all', 'new_article', data);
            
            // Send to category-specific rooms
            if (data.category) {
                this.sendToRoom(`news:${data.category}`, 'new_article', data);
            }
        });

        this.subClient.subscribe('news:update', (message) => {
            const data = JSON.parse(message);
            this.broadcast('article_updated', data);
        });

        this.subClient.subscribe('reactions:update', (message) => {
            const data = JSON.parse(message);
            this.sendToRoom(`article:${data.articleId}`, 'reaction_update', data);
        });

        this.subClient.subscribe('user:notification', (message) => {
            const data = JSON.parse(message);
            this.sendToUser(data.userId, 'notification', data.notification);
        });

        this.subClient.subscribe('system:broadcast', (message) => {
            const data = JSON.parse(message);
            this.broadcast('system_message', data);
        });
    }

    joinRoom(ws, userId, room) {
        ws.rooms.add(room);
        
        if (!this.rooms.has(room)) {
            this.rooms.set(room, new Set());
        }
        this.rooms.get(room).add(userId);
        
        ws.send(JSON.stringify({
            event: 'joined_room',
            data: { room }
        }));
    }

    leaveRoom(ws, userId, room) {
        ws.rooms.delete(room);
        
        if (this.rooms.has(room)) {
            this.rooms.get(room).delete(userId);
            if (this.rooms.get(room).size === 0) {
                this.rooms.delete(room);
            }
        }
        
        ws.send(JSON.stringify({
            event: 'left_room',
            data: { room }
        }));
    }

    sendToUser(userId, event, data) {
        const userConnections = this.clients.get(userId);
        if (userConnections) {
            const message = JSON.stringify({ event, data });
            userConnections.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(message);
                }
            });
        }
    }

    sendToRoom(room, event, data) {
        const roomUsers = this.rooms.get(room);
        if (roomUsers) {
            roomUsers.forEach(userId => {
                this.sendToUser(userId, event, data);
            });
        }
    }

    broadcast(event, data) {
        const message = JSON.stringify({ event, data });
        this.wss.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    removeClient(ws) {
        if (ws.userId) {
            const userConnections = this.clients.get(ws.userId);
            if (userConnections) {
                userConnections.delete(ws);
                if (userConnections.size === 0) {
                    this.clients.delete(ws.userId);
                }
            }
            
            // Remove from all rooms
            ws.rooms.forEach(room => {
                this.leaveRoom(ws, ws.userId, room);
            });
        }
    }

    extractToken(req) {
        // Check query params
        const url = new URL(req.url, `http://${req.headers.host}`);
        const queryToken = url.searchParams.get('token');
        if (queryToken) return queryToken;
        
        // Check authorization header
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        
        // Check cookie
        const cookies = req.headers.cookie;
        if (cookies) {
            const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('token='));
            if (tokenCookie) {
                return tokenCookie.split('=')[1];
            }
        }
        
        return null;
    }

    authenticateInternal(req, res, next) {
        const internalToken = req.headers['x-internal-token'];
        if (internalToken !== process.env.INTERNAL_TOKEN) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    }

    async autoJoinRooms(ws, userId) {
        // Auto-join user's personal room
        this.joinRoom(ws, userId, `user:${userId}`);
        
        // Get user preferences and auto-join relevant rooms
        const user = await this.db.collection('users').findOne({ telegramId: parseInt(userId) });
        if (user) {
            // Join tier-specific room
            this.joinRoom(ws, userId, `tier:${user.tier || 'free'}`);
            
            // Join preference-based rooms
            if (user.preferences?.categories) {
                user.preferences.categories.forEach(category => {
                    this.joinRoom(ws, userId, `news:${category}`);
                });
            }
        }
    }

    async sendStats(ws, userId) {
        const stats = {
            totalConnections: this.clients.size,
            totalRooms: this.rooms.size,
            userRooms: Array.from(ws.rooms),
            serverTime: new Date(),
            uptime: process.uptime()
        };
        
        ws.send(JSON.stringify({
            event: 'stats',
            data: stats
        }));
    }

    async startServer() {
        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`✅ WebSocket service running on port ${this.port}`);
            console.log('WebSocket URL: ws://localhost:' + this.port + '/ws');
        });
    }
}

// Start the service
const service = new WebSocketService();
service.initialize().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down WebSocket service...');
    
    // Close all connections
    service.wss.clients.forEach(ws => {
        ws.send(JSON.stringify({ 
            event: 'server_shutdown', 
            data: 'Server is shutting down' 
        }));
        ws.close(1000, 'Server shutdown');
    });
    
    service.server.close();
    process.exit(0);
});