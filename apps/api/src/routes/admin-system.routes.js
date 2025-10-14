const express = require('express');
const router = express.Router();
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Get system metrics
router.get('/system/metrics', async (req, res) => {
    try {
        const cpuUsage = os.loadavg()[0] * 100 / os.cpus().length;
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        res.json({
            cpu: Math.round(cpuUsage),
            memory: {
                total: Math.round(totalMem / 1024 / 1024),
                used: Math.round(usedMem / 1024 / 1024),
                free: Math.round(freeMem / 1024 / 1024),
                percent: Math.round((usedMem / totalMem) * 100)
            },
            uptime: Math.round(os.uptime()),
            platform: os.platform(),
            hostname: os.hostname()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get system health
router.get('/system/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {},
            database: 'connected',
            redis: 'connected'
        };
        
        // Check MongoDB
        const { db } = req.app.locals;
        if (db) {
            await db.admin().ping();
            health.database = 'connected';
        }
        
        res.json(health);
    } catch (error) {
        res.status(500).json({ 
            status: 'unhealthy',
            error: error.message 
        });
    }
});

// Get PM2 processes
router.get('/pm2/list', async (req, res) => {
    try {
        const { stdout } = await execAsync('pm2 jlist');
        const processes = JSON.parse(stdout);
        
        const processInfo = processes.map(p => ({
            name: p.name,
            status: p.pm2_env.status,
            cpu: p.monit.cpu,
            memory: Math.round(p.monit.memory / 1024 / 1024),
            uptime: p.pm2_env.pm_uptime,
            restarts: p.pm2_env.restart_time,
            pid: p.pid
        }));
        
        res.json(processInfo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Restart PM2 process
router.post('/pm2/restart/:name', async (req, res) => {
    try {
        const { name } = req.params;
        await execAsync(`pm2 restart ${name}`);
        res.json({ success: true, message: `Process ${name} restarted` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get database stats
router.get('/database/stats', async (req, res) => {
    try {
        const { db } = req.app.locals;
        if (!db) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        
        const collections = await db.listCollections().toArray();
        const stats = {};
        
        for (const col of collections) {
            const count = await db.collection(col.name).countDocuments();
            const collStats = await db.collection(col.name).stats();
            
            stats[col.name] = {
                count,
                size: collStats.size,
                avgObjSize: collStats.avgObjSize,
                indexes: collStats.nindexes
            };
        }
        
        res.json({
            collections: stats,
            totalCollections: collections.length,
            database: db.databaseName
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get bot status
router.get('/bot/status', async (req, res) => {
    try {
        const { stdout } = await execAsync('pm2 show zone-telegram-bot --json 2>/dev/null || echo "[]"');
        const botInfo = JSON.parse(stdout);
        
        if (botInfo && botInfo.length > 0) {
            const bot = botInfo[0];
            res.json({
                status: bot.pm2_env?.status || 'unknown',
                uptime: bot.pm2_env?.pm_uptime || 0,
                restarts: bot.pm2_env?.restart_time || 0,
                memory: Math.round((bot.monit?.memory || 0) / 1024 / 1024),
                cpu: bot.monit?.cpu || 0
            });
        } else {
            res.json({
                status: 'offline',
                uptime: 0,
                restarts: 0,
                memory: 0,
                cpu: 0
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get bot stats
router.get('/bot/stats', async (req, res) => {
    try {
        const { db } = req.app.locals;
        if (!db) {
            return res.json({ users: 0, groups: 0, messages: 0 });
        }
        
        const users = await db.collection('users').countDocuments();
        const groups = await db.collection('groups').countDocuments();
        const articles = await db.collection('news_articles').countDocuments();
        
        res.json({
            users,
            groups,
            articles,
            totalInteractions: users + groups
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get articles with pagination
router.get('/articles', async (req, res) => {
    try {
        const { db } = req.app.locals;
        if (!db) {
            return res.json({ articles: [], total: 0 });
        }
        
        const { page = 1, limit = 20, category, search } = req.query;
        const skip = (page - 1) * limit;
        
        const query = {};
        if (category) query.category = category;
        if (search) query.$text = { $search: search };
        
        const articles = await db.collection('news_articles')
            .find(query)
            .sort({ published_date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .toArray();
            
        const total = await db.collection('news_articles').countDocuments(query);
        
        res.json({
            articles,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get error logs
router.get('/logs/errors', async (req, res) => {
    try {
        const { source = 'pm2', lines = 100 } = req.query;
        let command;
        
        switch(source) {
            case 'nginx':
                command = `tail -${lines} /var/log/nginx/error.log 2>/dev/null || echo "No nginx logs"`;
                break;
            case 'pm2':
                command = `pm2 logs --err --lines ${lines} --nostream 2>/dev/null || echo "No PM2 logs"`;
                break;
            case 'mongodb':
                command = `tail -${lines} /var/log/mongodb/mongod.log 2>/dev/null || echo "No MongoDB logs"`;
                break;
            default:
                command = `pm2 logs --err --lines ${lines} --nostream`;
        }
        
        const { stdout } = await execAsync(command);
        const logs = stdout.split('\n').map(line => ({
            message: line,
            level: line.includes('ERROR') ? 'error' : line.includes('WARN') ? 'warning' : 'info',
            timestamp: new Date().toISOString()
        }));
        
        res.json({ errors: logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;