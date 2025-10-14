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
