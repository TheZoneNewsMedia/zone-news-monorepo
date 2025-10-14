/**
 * Auth Health Routes
 * Provides health check for authentication service
 */

const express = require('express');
const router = express.Router();

// Auth health endpoint
router.get('/auth/health', async (req, res) => {
    try {
        // Check if auth service is running on port 3005
        const axios = require('axios');
        
        try {
            const authHealth = await axios.get('http://localhost:3005/health', {
                timeout: 2000
            });
            
            res.json({
                status: 'healthy',
                service: 'auth-service',
                response: authHealth.data,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            // Auth service might not be on separate port, check if integrated
            const db = req.app.locals.db;
            
            if (db) {
                // Check if we can query users collection
                try {
                    const count = await db.collection('users').countDocuments();
                    res.json({
                        status: 'healthy',
                        service: 'auth-service',
                        mode: 'integrated',
                        userCount: count,
                        timestamp: new Date().toISOString()
                    });
                } catch (dbError) {
                    res.json({
                        status: 'degraded',
                        service: 'auth-service',
                        mode: 'integrated',
                        error: 'Database query failed',
                        timestamp: new Date().toISOString()
                    });
                }
            } else {
                res.json({
                    status: 'offline',
                    service: 'auth-service',
                    error: 'Service not available',
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (error) {
        res.status(500).json({
            status: 'error',
            service: 'auth-service',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Auth verify endpoint
router.post('/auth/verify', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({
                valid: false,
                error: 'Token required'
            });
        }
        
        // Basic JWT verification
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET || 'zone-news-secret-2024';
        
        try {
            const decoded = jwt.verify(token, secret);
            res.json({
                valid: true,
                user: {
                    id: decoded.id,
                    telegram_id: decoded.telegram_id,
                    role: decoded.role || 'user'
                }
            });
        } catch (jwtError) {
            res.json({
                valid: false,
                error: 'Invalid or expired token'
            });
        }
    } catch (error) {
        res.status(500).json({
            valid: false,
            error: error.message
        });
    }
});

module.exports = router;