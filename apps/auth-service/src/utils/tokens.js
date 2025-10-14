const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
    throw new Error('JWT secrets must be set in environment variables');
}
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '30d';

/**
 * Generate access and refresh tokens
 */
function generateTokens(user) {
    const payload = {
        userId: user._id,
        email: user.email,
        username: user.username,
        tier: user.tier
    };

    // Generate access token (short-lived)
    const accessToken = jwt.sign(
        payload,
        JWT_SECRET,
        { 
            expiresIn: ACCESS_TOKEN_EXPIRY,
            issuer: 'zone-news-auth',
            audience: 'zone-news-api'
        }
    );

    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
        { userId: user._id },
        JWT_REFRESH_SECRET,
        { 
            expiresIn: REFRESH_TOKEN_EXPIRY,
            issuer: 'zone-news-auth'
        }
    );

    return {
        accessToken,
        refreshToken
    };
}

/**
 * Generate only refresh token
 */
function generateRefreshToken(userId) {
    return jwt.sign(
        { userId },
        JWT_REFRESH_SECRET,
        { 
            expiresIn: REFRESH_TOKEN_EXPIRY,
            issuer: 'zone-news-auth'
        }
    );
}

/**
 * Verify access token
 */
function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET, {
        issuer: 'zone-news-auth',
        audience: 'zone-news-api'
    });
}

/**
 * Verify refresh token
 */
function verifyRefreshToken(token) {
    return jwt.verify(token, JWT_REFRESH_SECRET, {
        issuer: 'zone-news-auth'
    });
}

/**
 * Decode token without verification (for debugging)
 */
function decodeToken(token) {
    return jwt.decode(token);
}

module.exports = {
    generateTokens,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    decodeToken
};