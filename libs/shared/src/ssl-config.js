/**
 * Zone News Bot - SSL/HTTPS Configuration
 * Production-grade SSL setup and security headers
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

class SSLConfig {
    /**
     * Get SSL certificate configuration
     */
    static getSSLOptions() {
        const sslPath = process.env.SSL_CERT_PATH || '/etc/ssl/zone-news';
        
        try {
            // Try to load SSL certificates
            const options = {
                key: fs.readFileSync(path.join(sslPath, 'private.key')),
                cert: fs.readFileSync(path.join(sslPath, 'certificate.crt')),
                ca: fs.readFileSync(path.join(sslPath, 'ca_bundle.crt')),
                // Security options
                secureProtocol: 'TLSv1_2_method',
                ciphers: [
                    'ECDHE-RSA-AES128-GCM-SHA256',
                    'ECDHE-RSA-AES256-GCM-SHA384',
                    'ECDHE-RSA-AES128-SHA256',
                    'ECDHE-RSA-AES256-SHA384'
                ].join(':'),
                honorCipherOrder: true
            };

            console.log('✅ SSL certificates loaded successfully');
            return options;
        } catch (error) {
            console.warn('⚠️ SSL certificates not found, using HTTP mode');
            console.warn('For production, ensure SSL certificates are available at:', sslPath);
            return null;
        }
    }

    /**
     * Create HTTPS server with proper configuration
     */
    static createSecureServer(app, options = {}) {
        const sslOptions = this.getSSLOptions();
        
        if (!sslOptions) {
            // Fallback to HTTP in development
            const server = app.listen(options.port || 3000, options.host || '0.0.0.0', () => {
                console.log(`🌐 HTTP Server running on port ${options.port || 3000}`);
                console.warn('⚠️ Running in HTTP mode - HTTPS recommended for production');
            });
            return server;
        }

        // Create HTTPS server
        const server = https.createServer(sslOptions, app);
        
        server.listen(options.httpsPort || 443, options.host || '0.0.0.0', () => {
            console.log(`🔒 HTTPS Server running on port ${options.httpsPort || 443}`);
        });

        // Optional HTTP redirect server
        if (options.enableHttpRedirect !== false) {
            this.createHttpRedirectServer(options.httpPort || 80, options.httpsPort || 443);
        }

        return server;
    }

    /**
     * Create HTTP to HTTPS redirect server
     */
    static createHttpRedirectServer(httpPort = 80, httpsPort = 443) {
        const express = require('express');
        const redirectApp = express();

        redirectApp.use((req, res) => {
            const httpsUrl = `https://${req.headers.host.replace(/:\d+$/, '')}${httpsPort !== 443 ? `:${httpsPort}` : ''}${req.url}`;
            res.redirect(301, httpsUrl);
        });

        redirectApp.listen(httpPort, '0.0.0.0', () => {
            console.log(`🔄 HTTP redirect server running on port ${httpPort} -> HTTPS ${httpsPort}`);
        });
    }

    /**
     * Advanced security headers configuration
     */
    static getSecurityHeaders() {
        return {
            // Strict Transport Security
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            
            // Content Security Policy
            'Content-Security-Policy': [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' https://telegram.org https://t.me",
                "style-src 'self' 'unsafe-inline' https:",
                "img-src 'self' data: https:",
                "connect-src 'self' https://api.telegram.org wss:",
                "font-src 'self' https: data:",
                "object-src 'none'",
                "media-src 'self'",
                "frame-src 'none'",
                "base-uri 'self'",
                "form-action 'self'"
            ].join('; '),
            
            // Prevent clickjacking
            'X-Frame-Options': 'DENY',
            
            // Prevent MIME type sniffing
            'X-Content-Type-Options': 'nosniff',
            
            // XSS Protection
            'X-XSS-Protection': '1; mode=block',
            
            // Referrer Policy
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            
            // Permissions Policy
            'Permissions-Policy': [
                'geolocation=()',
                'microphone=()',
                'camera=()',
                'fullscreen=(self)',
                'payment=(self)'
            ].join(', '),
            
            // Server identification
            'Server': 'Zone-News-API',
            
            // Cache control for security-sensitive endpoints
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
        };
    }

    /**
     * Request size and parsing limits
     */
    static getRequestLimits() {
        return {
            // JSON body parser limits
            jsonLimit: '1mb',
            
            // URL encoded body limits
            urlencodedLimit: '1mb',
            
            // Raw body limits
            rawLimit: '10mb',
            
            // Text body limits
            textLimit: '1mb',
            
            // Parameter limit
            parameterLimit: 1000,
            
            // Nested object depth limit
            depthLimit: 10,
            
            // Array length limit
            arrayLimit: 100
        };
    }

    /**
     * Configure Express body parsing with security limits
     */
    static configureBodyParsing(app) {
        const express = require('express');
        const limits = this.getRequestLimits();

        // JSON parser with strict limits
        app.use('/webhook', express.json({
            limit: '1mb',  // Telegram webhooks should be small
            strict: true,
            verify: (req, res, buf) => {
                // Store raw body for signature verification
                req.rawBody = buf;
            }
        }));

        // JSON parser for API endpoints
        app.use('/api', express.json({
            limit: limits.jsonLimit,
            strict: true,
            reviver: (key, value) => {
                // Prevent prototype pollution
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    return undefined;
                }
                return value;
            }
        }));

        // URL-encoded parser
        app.use(express.urlencoded({
            limit: limits.urlencodedLimit,
            extended: false,
            parameterLimit: limits.parameterLimit
        }));

        // Raw body parser for specific endpoints
        app.use('/webhook/raw', express.raw({
            limit: limits.rawLimit,
            type: 'application/octet-stream'
        }));

        console.log('✅ Body parsing configured with security limits');
    }

    /**
     * Setup production-grade timeout configuration
     */
    static configureTimeouts(server, options = {}) {
        const {
            requestTimeout = 30000,      // 30 seconds
            keepAliveTimeout = 65000,    // 65 seconds
            headersTimeout = 66000       // 66 seconds
        } = options;

        // Request timeout
        server.setTimeout(requestTimeout, (socket) => {
            console.warn('⏰ Request timeout, closing socket');
            socket.destroy();
        });

        // Keep-alive timeout
        server.keepAliveTimeout = keepAliveTimeout;

        // Headers timeout (should be > keepAliveTimeout)
        server.headersTimeout = headersTimeout;

        console.log('⏱️ Server timeouts configured:', {
            requestTimeout,
            keepAliveTimeout,
            headersTimeout
        });
    }

    /**
     * Environment-specific SSL configuration
     */
    static getEnvironmentConfig() {
        const env = process.env.NODE_ENV || 'development';
        
        const configs = {
            development: {
                enableSSL: false,
                port: 3001,
                httpsPort: 3443,
                enableHttpRedirect: false,
                logLevel: 'verbose'
            },
            
            staging: {
                enableSSL: true,
                port: 3001,
                httpsPort: 443,
                enableHttpRedirect: true,
                logLevel: 'info'
            },
            
            production: {
                enableSSL: true,
                port: 80,
                httpsPort: 443,
                enableHttpRedirect: true,
                logLevel: 'warn'
            }
        };

        return configs[env] || configs.development;
    }

    /**
     * Validate SSL certificate
     */
    static validateSSLCertificate() {
        const sslOptions = this.getSSLOptions();
        
        if (!sslOptions) {
            return { valid: false, error: 'No SSL certificates found' };
        }

        try {
            // Basic certificate validation
            const cert = sslOptions.cert.toString();
            const key = sslOptions.key.toString();

            if (!cert.includes('BEGIN CERTIFICATE') || !key.includes('BEGIN PRIVATE KEY')) {
                return { valid: false, error: 'Invalid certificate format' };
            }

            // TODO: Add more comprehensive certificate validation
            // - Expiry date check
            // - Domain validation
            // - Chain validation

            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Generate self-signed certificate for development
     */
    static generateDevCertificate() {
        console.log('📝 To generate a self-signed certificate for development:');
        console.log('');
        console.log('mkdir -p /tmp/ssl');
        console.log('openssl req -x509 -newkey rsa:2048 -keyout /tmp/ssl/private.key -out /tmp/ssl/certificate.crt -days 365 -nodes -subj "/CN=localhost"');
        console.log('export SSL_CERT_PATH=/tmp/ssl');
        console.log('');
        console.log('Note: Self-signed certificates should only be used for development');
    }
}

module.exports = SSLConfig;