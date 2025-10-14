/**
 * Subscription Service Proxy Routes
 * Forwards all subscription requests to the Subscription microservice (Telegram Stars)
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

const SUBSCRIPTION_SERVICE_URL = process.env.SUBSCRIPTION_SERVICE_URL || 'http://localhost:4007';

// Helper: Forward request to subscription service
async function proxyToSubscriptionService(req, res, path, method = 'GET', data = null) {
    try {
        const url = `${SUBSCRIPTION_SERVICE_URL}${path}`;

        const config = {
            method,
            url,
            headers: {
                'Content-Type': 'application/json',
                ...req.headers
            },
            timeout: 5000
        };

        if (data) {
            config.data = data;
        } else if (req.body && Object.keys(req.body).length > 0) {
            config.data = req.body;
        }

        if (req.query && Object.keys(req.query).length > 0) {
            config.params = req.query;
        }

        const response = await axios(config);
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error(`Subscription Service error (${method} ${path}):`, error.message);

        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else if (error.code === 'ECONNREFUSED') {
            res.status(503).json({
                success: false,
                error: 'Subscription service unavailable',
                message: 'The subscription microservice is not responding'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to communicate with subscription service',
                message: error.message
            });
        }
    }
}

// GET /api/subscriptions/plans - Get available plans
router.get('/subscriptions/plans', async (req, res) => {
    await proxyToSubscriptionService(req, res, '/api/subscriptions/plans', 'GET');
});

// GET /api/subscriptions/:userId - Get user subscription status
router.get('/subscriptions/:userId', async (req, res) => {
    await proxyToSubscriptionService(req, res, `/api/subscriptions/${req.params.userId}`, 'GET');
});

// GET /api/subscriptions/check/:userId - Check user premium access
router.get('/subscriptions/check/:userId', async (req, res) => {
    await proxyToSubscriptionService(req, res, `/api/subscriptions/check/${req.params.userId}`, 'GET');
});

// POST /api/subscriptions/create - Create subscription invoice (Telegram Stars)
router.post('/subscriptions/create', async (req, res) => {
    await proxyToSubscriptionService(req, res, '/api/subscriptions/create', 'POST');
});

// POST /api/subscriptions/webhook - Handle Telegram Stars payment webhooks
router.post('/subscriptions/webhook', async (req, res) => {
    await proxyToSubscriptionService(req, res, '/api/subscriptions/webhook', 'POST');
});

// POST /api/subscriptions/cancel - Cancel subscription
router.post('/subscriptions/cancel', async (req, res) => {
    await proxyToSubscriptionService(req, res, '/api/subscriptions/cancel', 'POST');
});

// POST /api/subscriptions/refund - Request refund (admin only)
router.post('/subscriptions/refund', async (req, res) => {
    await proxyToSubscriptionService(req, res, '/api/subscriptions/refund', 'POST');
});

// GET /api/subscriptions/stats - Get subscription statistics (admin only)
router.get('/subscriptions/stats', async (req, res) => {
    await proxyToSubscriptionService(req, res, '/api/subscriptions/stats', 'GET');
});

// Legacy routes for backward compatibility
// GET /api/user/subscription
router.get('/user/subscription', async (req, res) => {
    const telegram_id = String(req.query.telegram_id || '');

    if (!telegram_id) {
        return res.status(400).json({ error: 'telegram_id required' });
    }

    try {
        // Forward to new subscription service
        const response = await axios.get(`${SUBSCRIPTION_SERVICE_URL}/api/subscriptions/${telegram_id}`, {
            timeout: 3000
        });

        const subscription = response.data.subscription || {};

        // Map to legacy format
        res.json({
            success: true,
            subscription: {
                active: subscription.status === 'active',
                tier: subscription.plan || 'free',
                expires_at: subscription.endDate || null,
                features: Object.keys(subscription.features || {}).filter(f => subscription.features[f])
            }
        });
    } catch (error) {
        // Fallback to basic free tier
        res.json({
            success: true,
            subscription: {
                active: true,
                tier: 'free',
                expires_at: null,
                features: ['basic_news']
            }
        });
    }
});

// POST /api/user/subscription/upgrade
router.post('/user/subscription/upgrade', async (req, res) => {
    const { telegram_id, tier } = req.body || {};

    if (!telegram_id || !tier) {
        return res.status(400).json({ error: 'telegram_id and tier required' });
    }

    // Map legacy tier names to new plan IDs
    const tierMap = {
        'free': 'basic',
        'basic': 'premium',
        'pro': 'professional',
        'premium': 'premium',
        'professional': 'professional'
    };

    const plan = tierMap[tier.toLowerCase()] || 'basic';

    if (plan === 'basic') {
        // Free tier, just return success
        return res.json({ success: true, tier: 'basic' });
    }

    try {
        // Create invoice for upgrade
        const invoiceResponse = await axios.post(
            `${SUBSCRIPTION_SERVICE_URL}/api/subscriptions/create`,
            {
                userId: telegram_id,
                plan: plan
            },
            { timeout: 5000 }
        );

        res.json({
            success: true,
            invoiceLink: invoiceResponse.data.invoiceLink,
            plan: invoiceResponse.data.plan,
            stars: invoiceResponse.data.stars,
            message: 'Complete payment via Telegram Stars to activate subscription'
        });
    } catch (error) {
        console.error('Upgrade failed:', error.message);
        res.status(500).json({ error: 'Upgrade failed' });
    }
});

module.exports = router;
