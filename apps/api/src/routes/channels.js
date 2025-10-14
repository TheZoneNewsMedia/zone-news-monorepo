/**
 * Channels Service Proxy Routes
 * Forwards all channel-related requests to the Channels microservice
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

const CHANNELS_SERVICE_URL = process.env.CHANNELS_SERVICE_URL || 'http://localhost:4004';

// Helper: Forward request to channels service
async function proxyToChannelsService(req, res, path, method = 'GET', data = null) {
    try {
        const url = `${CHANNELS_SERVICE_URL}${path}`;

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
        console.error(`Channels Service error (${method} ${path}):`, error.message);

        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else if (error.code === 'ECONNREFUSED') {
            res.status(503).json({
                success: false,
                error: 'Channels service unavailable',
                message: 'The channels microservice is not responding'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to communicate with channels service',
                message: error.message
            });
        }
    }
}

// GET /api/channels - Get all channels
router.get('/channels', async (req, res) => {
    await proxyToChannelsService(req, res, '/api/channels', 'GET');
});

// GET /api/channels/:id - Get single channel
router.get('/channels/:id', async (req, res) => {
    await proxyToChannelsService(req, res, `/api/channels/${req.params.id}`, 'GET');
});

// POST /api/channels - Create new channel
router.post('/channels', async (req, res) => {
    await proxyToChannelsService(req, res, '/api/channels', 'POST');
});

// PUT /api/channels/:id - Update channel
router.put('/channels/:id', async (req, res) => {
    await proxyToChannelsService(req, res, `/api/channels/${req.params.id}`, 'PUT');
});

// DELETE /api/channels/:id - Delete channel
router.delete('/channels/:id', async (req, res) => {
    await proxyToChannelsService(req, res, `/api/channels/${req.params.id}`, 'DELETE');
});

// GET /api/channels/:id/stats - Get channel statistics
router.get('/channels/:id/stats', async (req, res) => {
    await proxyToChannelsService(req, res, `/api/channels/${req.params.id}/stats`, 'GET');
});

// POST /api/channels/:id/sync - Sync channel statistics
router.post('/channels/:id/sync', async (req, res) => {
    await proxyToChannelsService(req, res, `/api/channels/${req.params.id}/sync`, 'POST');
});

// Legacy routes for backward compatibility (from old implementation)
router.post('/channels/register', async (req, res) => {
    // Map old format to new format
    const { chatId, alias } = req.body || {};
    const channelData = {
        channelId: chatId,
        channelName: alias || chatId,
        channelType: 'news',
        isPrimary: false
    };

    await proxyToChannelsService(req, res, '/api/channels', 'POST', channelData);
});

router.get('/groups', async (req, res) => {
    // Forward to channels service with type filter
    req.query.type = 'group';
    await proxyToChannelsService(req, res, '/api/channels', 'GET');
});

router.post('/groups/register', async (req, res) => {
    const { chatId, alias, threadId } = req.body || {};
    const channelData = {
        channelId: chatId,
        channelName: alias || chatId,
        channelType: 'group',
        config: {
            threadId: threadId || undefined
        }
    };

    await proxyToChannelsService(req, res, '/api/channels', 'POST', channelData);
});

router.delete('/groups/:chatId', async (req, res) => {
    await proxyToChannelsService(req, res, `/api/channels/${req.params.chatId}`, 'DELETE');
});

module.exports = router;
