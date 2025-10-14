/**
 * Bot Status Routes
 * Provides health and status endpoints for the Telegram bot
 */

const express = require('express');
const router = express.Router();

// Bot status endpoint
router.get('/bot/status', async (req, res) => {
    try {
        // Check if bot service is running on port 3002
        const axios = require('axios');
        
        try {
            const botHealth = await axios.get('http://localhost:3002/health', {
                timeout: 2000
            });
            
            res.json({
                status: 'online',
                service: 'zone-telegram-bot',
                health: botHealth.data,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            // Bot service not responding
            res.json({
                status: 'offline',
                service: 'zone-telegram-bot',
                error: 'Bot service not responding',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Bot stats endpoint
router.get('/bot/stats', async (req, res) => {
    try {
        // Return basic stats for now
        res.json({
            totalUsers: 0,
            activeUsers: 0,
            messagesProcessed: 0,
            commandsExecuted: 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch bot stats',
            message: error.message
        });
    }
});

// Bot commands endpoint
router.get('/bot/commands', async (req, res) => {
    try {
        const commands = [
            'start', 'help', 'news', 'trending', 
            'digest', 'settings', 'subscription', 
            'upgrade', 'post', 'channels', 
            'groups', 'reactions'
        ];
        
        res.json({ 
            success: true, 
            commands,
            count: commands.length 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            commands: [],
            error: error.message 
        });
    }
});

module.exports = router;