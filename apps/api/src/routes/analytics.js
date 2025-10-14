/**
 * Analytics Service Proxy Routes
 * Forwards all analytics requests to the Analytics microservice
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4006';

// Helper: Forward request to analytics service
async function proxyToAnalyticsService(req, res, path, method = 'GET', data = null) {
    try {
        const url = `${ANALYTICS_SERVICE_URL}${path}`;

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
        console.error(`Analytics Service error (${method} ${path}):`, error.message);

        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else if (error.code === 'ECONNREFUSED') {
            res.status(503).json({
                success: false,
                error: 'Analytics service unavailable',
                message: 'The analytics microservice is not responding'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to communicate with analytics service',
                message: error.message
            });
        }
    }
}

// POST /api/analytics/track - Track single event
router.post('/analytics/track', async (req, res) => {
    await proxyToAnalyticsService(req, res, '/api/analytics/track', 'POST');
});

// POST /api/analytics/batch - Track multiple events
router.post('/analytics/batch', async (req, res) => {
    await proxyToAnalyticsService(req, res, '/api/analytics/batch', 'POST');
});

// GET /api/analytics/article/:articleId - Get article analytics
router.get('/analytics/article/:articleId', async (req, res) => {
    await proxyToAnalyticsService(req, res, `/api/analytics/article/${req.params.articleId}`, 'GET');
});

// GET /api/analytics/channel/:channelId - Get channel analytics
router.get('/analytics/channel/:channelId', async (req, res) => {
    await proxyToAnalyticsService(req, res, `/api/analytics/channel/${req.params.channelId}`, 'GET');
});

// GET /api/analytics/summary - Get aggregated summary
router.get('/analytics/summary', async (req, res) => {
    await proxyToAnalyticsService(req, res, '/api/analytics/summary', 'GET');
});

// GET /api/analytics/trending - Get trending content
router.get('/analytics/trending', async (req, res) => {
    await proxyToAnalyticsService(req, res, '/api/analytics/trending', 'GET');
});

// POST /api/analytics/aggregate - Trigger daily aggregation
router.post('/analytics/aggregate', async (req, res) => {
    await proxyToAnalyticsService(req, res, '/api/analytics/aggregate', 'POST');
});

// Legacy GET /api/analytics - Basic analytics (for backward compatibility)
router.get('/analytics', async (req, res) => {
    try {
        // Try to get summary from analytics service
        const summaryResponse = await axios.get(`${ANALYTICS_SERVICE_URL}/api/analytics/summary`, {
            timeout: 3000
        });

        const summary = summaryResponse.data.summary || {};

        res.json({
            totalPosts: summary.totalArticles || 0,
            totalReactions: summary.totalReactions || 0,
            totalViews: summary.totalViews || 0,
            activeUsers: summary.uniqueUsers || 0,
            comments: 0 // Not tracked yet
        });
    } catch (error) {
        // Fallback to stub data if service unavailable
        res.json({
            totalPosts: 0,
            totalReactions: 0,
            totalViews: 0,
            activeUsers: 0,
            comments: 0
        });
    }
});

module.exports = router;
