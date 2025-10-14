const crypto = require('crypto');

/**
 * Verify Telegram WebApp init data
 * @param {string} initData - The init data string from Telegram WebApp
 * @param {string} botToken - Your bot token
 * @returns {Object|false} - Parsed user data if valid, false otherwise
 */
function verifyTelegramWebAppData(initData, botToken) {
    try {
        // Parse URL params
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        
        // Create data check string
        const dataCheckArr = [];
        for (const [key, value] of params.entries()) {
            dataCheckArr.push(`${key}=${value}`);
        }
        dataCheckArr.sort();
        const dataCheckString = dataCheckArr.join('\n');
        
        // Create secret key
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();
        
        // Calculate hash
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        // Verify hash
        if (calculatedHash !== hash) {
            console.error('Telegram auth failed: hash mismatch');
            return false;
        }
        
        // Check auth date (not older than 1 day)
        const authDate = parseInt(params.get('auth_date'));
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 86400) {
            console.error('Telegram auth failed: data too old');
            return false;
        }
        
        // Parse user data
        const userData = params.get('user');
        if (userData) {
            return JSON.parse(userData);
        }
        
        return false;
    } catch (error) {
        console.error('Error verifying Telegram data:', error);
        return false;
    }
}

/**
 * Generate a hash for Telegram login widget verification
 * @param {Object} authData - Auth data from Telegram
 * @param {string} botToken - Your bot token
 * @returns {string} - Calculated hash
 */
function generateTelegramHash(authData, botToken) {
    const { hash, ...data } = authData;
    
    // Create data check string
    const dataCheckArr = Object.keys(data)
        .sort()
        .map(key => `${key}=${data[key]}`);
    const dataCheckString = dataCheckArr.join('\n');
    
    // Create secret key
    const secretKey = crypto
        .createHash('sha256')
        .update(botToken)
        .digest();
    
    // Calculate hash
    return crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
}

/**
 * Extract and validate Telegram user from request
 * @param {Object} req - Express request object
 * @param {string} botToken - Your bot token
 * @returns {Object|null} - User object or null if invalid
 */
function extractTelegramUser(req, botToken) {
    // Check for init data in body
    if (req.body?.initData) {
        const user = verifyTelegramWebAppData(req.body.initData, botToken);
        if (user) return user;
    }
    
    // Check for init data in headers
    const initData = req.headers['x-telegram-init-data'];
    if (initData) {
        const user = verifyTelegramWebAppData(initData, botToken);
        if (user) return user;
    }
    
    // Check for user data in auth header (for testing)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('TelegramUser ')) {
        try {
            const userData = JSON.parse(Buffer.from(authHeader.slice(13), 'base64').toString());
            // In production, always verify this data
            if (process.env.NODE_ENV === 'development') {
                return userData;
            }
        } catch (e) {
            console.error('Failed to parse TelegramUser header:', e);
        }
    }
    
    return null;
}

/**
 * Express middleware for Telegram authentication
 * @param {string} botToken - Your bot token
 * @returns {Function} - Express middleware
 */
function telegramAuthMiddleware(botToken) {
    return (req, res, next) => {
        const user = extractTelegramUser(req, botToken);
        
        if (!user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or missing Telegram authentication'
            });
        }
        
        // Attach user to request
        req.telegramUser = user;
        req.userId = user.id;
        next();
    };
}

module.exports = {
    verifyTelegramWebAppData,
    generateTelegramHash,
    extractTelegramUser,
    telegramAuthMiddleware
};