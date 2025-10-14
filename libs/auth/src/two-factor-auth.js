/**
 * Two-Factor Authentication (2FA) Module
 * Implements TOTP-based 2FA for enhanced security
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

class TwoFactorAuth {
    constructor(options = {}) {
        this.appName = options.appName || 'Zone News';
        this.issuer = options.issuer || 'thezonenews.com';
        this.window = options.window || 2; // Time window for TOTP
        this.backupCodeCount = options.backupCodeCount || 10;
        this.db = null;
    }

    async initialize() {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
        const client = await MongoClient.connect(mongoUri);
        this.db = client.db('zone_news_production');
    }

    /**
     * Generate 2FA secret for user
     */
    async generateSecret(userId, userEmail) {
        // Generate secret
        const secret = speakeasy.generateSecret({
            name: `${this.appName} (${userEmail})`,
            issuer: this.issuer,
            length: 32
        });

        // Generate backup codes
        const backupCodes = this.generateBackupCodes();

        // Store in database (encrypted)
        const encryptedSecret = this.encryptSecret(secret.base32);
        
        await this.db.collection('two_factor_auth').updateOne(
            { userId },
            {
                $set: {
                    secret: encryptedSecret,
                    backupCodes: backupCodes.map(code => this.hashBackupCode(code)),
                    enabled: false, // Not enabled until verified
                    createdAt: new Date(),
                    attempts: 0,
                    lastAttempt: null
                }
            },
            { upsert: true }
        );

        // Generate QR code
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

        return {
            secret: secret.base32,
            qrCode: qrCodeUrl,
            backupCodes,
            manualEntry: {
                appName: this.appName,
                account: userEmail,
                key: secret.base32
            }
        };
    }

    /**
     * Enable 2FA after verification
     */
    async enable2FA(userId, token) {
        const authDoc = await this.db.collection('two_factor_auth').findOne({ userId });
        
        if (!authDoc) {
            throw new Error('2FA not initialized for user');
        }

        if (authDoc.enabled) {
            throw new Error('2FA already enabled');
        }

        // Verify the token
        const decryptedSecret = this.decryptSecret(authDoc.secret);
        const isValid = this.verifyToken(decryptedSecret, token);

        if (!isValid) {
            throw new Error('Invalid verification token');
        }

        // Enable 2FA
        await this.db.collection('two_factor_auth').updateOne(
            { userId },
            {
                $set: {
                    enabled: true,
                    enabledAt: new Date(),
                    lastUsed: new Date()
                }
            }
        );

        // Update user record
        await this.db.collection('users').updateOne(
            { telegramId: parseInt(userId) },
            {
                $set: {
                    twoFactorEnabled: true,
                    twoFactorEnabledAt: new Date()
                }
            }
        );

        // Log security event
        await this.logSecurityEvent(userId, 'TWO_FACTOR_ENABLED', {
            method: 'totp',
            timestamp: new Date()
        });

        return { success: true, message: '2FA enabled successfully' };
    }

    /**
     * Verify 2FA token
     */
    async verify2FA(userId, token) {
        const authDoc = await this.db.collection('two_factor_auth').findOne({ userId });
        
        if (!authDoc || !authDoc.enabled) {
            return { valid: false, reason: '2FA not enabled' };
        }

        // Rate limiting
        if (authDoc.attempts >= 5 && authDoc.lastAttempt) {
            const timeSinceLastAttempt = Date.now() - authDoc.lastAttempt.getTime();
            if (timeSinceLastAttempt < 300000) { // 5 minutes
                return { 
                    valid: false, 
                    reason: 'Too many attempts. Try again later.',
                    retryAfter: 300000 - timeSinceLastAttempt
                };
            }
        }

        // Check if it's a backup code
        if (token.length === 10 && /^[A-Z0-9]+$/.test(token)) {
            return await this.verifyBackupCode(userId, token);
        }

        // Verify TOTP token
        const decryptedSecret = this.decryptSecret(authDoc.secret);
        const isValid = this.verifyToken(decryptedSecret, token);

        // Update attempts
        await this.db.collection('two_factor_auth').updateOne(
            { userId },
            {
                $set: {
                    attempts: isValid ? 0 : (authDoc.attempts || 0) + 1,
                    lastAttempt: new Date(),
                    lastUsed: isValid ? new Date() : authDoc.lastUsed
                }
            }
        );

        if (isValid) {
            await this.logSecurityEvent(userId, 'TWO_FACTOR_VERIFIED', {
                method: 'totp',
                timestamp: new Date()
            });
        } else {
            await this.logSecurityEvent(userId, 'TWO_FACTOR_FAILED', {
                method: 'totp',
                attempts: authDoc.attempts + 1,
                timestamp: new Date()
            });
        }

        return { 
            valid: isValid,
            reason: isValid ? 'Valid token' : 'Invalid token'
        };
    }

    /**
     * Verify backup code
     */
    async verifyBackupCode(userId, code) {
        const authDoc = await this.db.collection('two_factor_auth').findOne({ userId });
        
        if (!authDoc || !authDoc.backupCodes) {
            return { valid: false, reason: 'No backup codes available' };
        }

        const hashedCode = this.hashBackupCode(code);
        const codeIndex = authDoc.backupCodes.findIndex(c => c === hashedCode);

        if (codeIndex === -1) {
            await this.logSecurityEvent(userId, 'BACKUP_CODE_FAILED', {
                timestamp: new Date()
            });
            return { valid: false, reason: 'Invalid backup code' };
        }

        // Remove used backup code
        authDoc.backupCodes.splice(codeIndex, 1);
        
        await this.db.collection('two_factor_auth').updateOne(
            { userId },
            {
                $set: {
                    backupCodes: authDoc.backupCodes,
                    lastUsed: new Date()
                },
                $push: {
                    usedBackupCodes: {
                        code: hashedCode,
                        usedAt: new Date()
                    }
                }
            }
        );

        await this.logSecurityEvent(userId, 'BACKUP_CODE_USED', {
            remainingCodes: authDoc.backupCodes.length,
            timestamp: new Date()
        });

        // Notify user if running low on backup codes
        if (authDoc.backupCodes.length <= 2) {
            await this.notifyLowBackupCodes(userId, authDoc.backupCodes.length);
        }

        return { 
            valid: true,
            reason: 'Backup code verified',
            remainingCodes: authDoc.backupCodes.length
        };
    }

    /**
     * Disable 2FA
     */
    async disable2FA(userId, password) {
        // Verify password first (would integrate with auth service)
        // This is a placeholder - actual implementation would verify password
        
        await this.db.collection('two_factor_auth').updateOne(
            { userId },
            {
                $set: {
                    enabled: false,
                    disabledAt: new Date()
                }
            }
        );

        await this.db.collection('users').updateOne(
            { telegramId: parseInt(userId) },
            {
                $set: {
                    twoFactorEnabled: false
                },
                $unset: {
                    twoFactorEnabledAt: ""
                }
            }
        );

        await this.logSecurityEvent(userId, 'TWO_FACTOR_DISABLED', {
            timestamp: new Date()
        });

        return { success: true, message: '2FA disabled successfully' };
    }

    /**
     * Generate new backup codes
     */
    async regenerateBackupCodes(userId, currentToken) {
        // Verify current 2FA token first
        const verification = await this.verify2FA(userId, currentToken);
        
        if (!verification.valid) {
            throw new Error('Invalid 2FA token');
        }

        const backupCodes = this.generateBackupCodes();
        
        await this.db.collection('two_factor_auth').updateOne(
            { userId },
            {
                $set: {
                    backupCodes: backupCodes.map(code => this.hashBackupCode(code)),
                    backupCodesGeneratedAt: new Date()
                }
            }
        );

        await this.logSecurityEvent(userId, 'BACKUP_CODES_REGENERATED', {
            count: backupCodes.length,
            timestamp: new Date()
        });

        return backupCodes;
    }

    /**
     * Check if user has 2FA enabled
     */
    async isEnabled(userId) {
        const authDoc = await this.db.collection('two_factor_auth').findOne(
            { userId, enabled: true }
        );
        return !!authDoc;
    }

    /**
     * Get 2FA status for user
     */
    async getStatus(userId) {
        const authDoc = await this.db.collection('two_factor_auth').findOne({ userId });
        
        if (!authDoc) {
            return {
                enabled: false,
                configured: false
            };
        }

        return {
            enabled: authDoc.enabled,
            configured: true,
            enabledAt: authDoc.enabledAt,
            lastUsed: authDoc.lastUsed,
            backupCodesRemaining: authDoc.backupCodes?.length || 0,
            methods: ['totp'] // Could add SMS, email, etc.
        };
    }

    /**
     * Helper: Verify TOTP token
     */
    verifyToken(secret, token) {
        return speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token,
            window: this.window
        });
    }

    /**
     * Helper: Generate backup codes
     */
    generateBackupCodes() {
        const codes = [];
        for (let i = 0; i < this.backupCodeCount; i++) {
            const code = crypto.randomBytes(5).toString('hex').toUpperCase();
            codes.push(code);
        }
        return codes;
    }

    /**
     * Helper: Hash backup code
     */
    hashBackupCode(code) {
        return crypto
            .createHash('sha256')
            .update(code)
            .digest('hex');
    }

    /**
     * Helper: Encrypt secret
     */
    encryptSecret(secret) {
        if (!process.env.ENCRYPTION_KEY) {
            throw new Error('ENCRYPTION_KEY environment variable is required for production');
        }
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf-8');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.concat([key, Buffer.alloc(32)], 32), iv);
        
        let encrypted = cipher.update(secret, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Helper: Decrypt secret
     */
    decryptSecret(encryptedSecret) {
        if (!process.env.ENCRYPTION_KEY) {
            throw new Error('ENCRYPTION_KEY environment variable is required for production');
        }
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf-8');
        const parts = encryptedSecret.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.concat([key, Buffer.alloc(32)], 32), iv);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Helper: Log security event
     */
    async logSecurityEvent(userId, eventType, data) {
        await this.db.collection('security_events').insertOne({
            userId,
            eventType,
            data,
            ip: data.ip || null,
            userAgent: data.userAgent || null,
            timestamp: new Date()
        });
    }

    /**
     * Helper: Notify low backup codes
     */
    async notifyLowBackupCodes(userId, remaining) {
        // This would integrate with notification service
        console.log(`User ${userId} has only ${remaining} backup codes remaining`);
        
        // Queue notification
        if (global.notificationService) {
            await global.notificationService.send({
                type: 'push',
                recipients: [userId],
                data: {
                    title: 'Low Backup Codes',
                    body: `You have only ${remaining} backup codes remaining. Generate new ones for security.`,
                    url: '/settings/security'
                }
            });
        }
    }

    /**
     * Express middleware for 2FA
     */
    middleware() {
        return async (req, res, next) => {
            // Skip if no user or 2FA not required for route
            if (!req.userId || req.skip2FA) {
                return next();
            }

            // Check if user has 2FA enabled
            const is2FAEnabled = await this.isEnabled(req.userId);
            
            if (!is2FAEnabled) {
                return next();
            }

            // Check if 2FA token provided
            const token = req.headers['x-2fa-token'] || req.body.twoFactorToken;
            
            if (!token) {
                return res.status(403).json({
                    error: '2FA token required',
                    require2FA: true
                });
            }

            // Verify token
            const verification = await this.verify2FA(req.userId, token);
            
            if (!verification.valid) {
                return res.status(403).json({
                    error: verification.reason,
                    require2FA: true,
                    retryAfter: verification.retryAfter
                });
            }

            // Token valid, proceed
            req.twoFactorVerified = true;
            next();
        };
    }
}

// Singleton instance
let twoFactorInstance = null;

function getTwoFactorAuth(options) {
    if (!twoFactorInstance) {
        twoFactorInstance = new TwoFactorAuth(options);
    }
    return twoFactorInstance;
}

module.exports = {
    TwoFactorAuth,
    getTwoFactorAuth
};