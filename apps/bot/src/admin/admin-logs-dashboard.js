/**
 * Admin Logs Dashboard
 * Telegram bot interface for viewing logs and system health
 */

const { logger } = require('../services/logger-service');
const { circuitBreakerManager } = require('../services/circuit-breaker');

class AdminLogsDashboard {
    constructor(bot, db, cache, indexingService = null) {
        this.bot = bot;
        this.db = db;
        this.cache = cache;
        this.indexingService = indexingService;
        
        // Admin user IDs (from environment or config)
        this.adminIds = this.getAdminIds();
        
        // Register admin commands
        this.registerCommands();
        
        logger.info('Admin logs dashboard initialized');
    }
    
    getAdminIds() {
        const ids = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];
        // Always include owner
        ids.push(7802629063); // georgesimbe
        return [...new Set(ids)];
    }
    
    isAdmin(userId) {
        return this.adminIds.includes(userId);
    }
    
    registerCommands() {
        // Logs command
        this.bot.command('logs', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                return ctx.reply('🔒 Admin access required');
            }
            
            await this.showLogsMenu(ctx);
        });
        
        // Health command
        this.bot.command('health', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                return ctx.reply('🔒 Admin access required');
            }
            
            await this.showHealthDashboard(ctx);
        });
        
        // Stats command
        this.bot.command('stats', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                return ctx.reply('🔒 Admin access required');
            }
            
            await this.showSystemStats(ctx);
        });
        
        // Indexes command
        this.bot.command('indexes', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                return ctx.reply('🔒 Admin access required');
            }
            
            await this.showIndexStats(ctx);
        });
        
        // Register callback handlers
        this.registerCallbacks();
    }
    
    registerCallbacks() {
        // Logs callbacks
        this.bot.action(/^logs:(.+)$/, async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                return ctx.answerCbQuery('Admin access required');
            }
            
            const action = ctx.match[1];
            await this.handleLogsAction(ctx, action);
        });
        
        // Health callbacks
        this.bot.action(/^health:(.+)$/, async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                return ctx.answerCbQuery('Admin access required');
            }
            
            const action = ctx.match[1];
            await this.handleHealthAction(ctx, action);
        });
        
        // Stats callbacks
        this.bot.action(/^stats:(.+)$/, async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                return ctx.answerCbQuery('Admin access required');
            }
            
            const action = ctx.match[1];
            await this.handleStatsAction(ctx, action);
        });
    }
    
    /**
     * Show logs menu
     */
    async showLogsMenu(ctx) {
        const keyboard = [
            [
                { text: '📝 Recent Logs', callback_data: 'logs:recent' },
                { text: '❌ Errors Only', callback_data: 'logs:errors' }
            ],
            [
                { text: '⚠️ Warnings', callback_data: 'logs:warnings' },
                { text: '📊 Error Stats', callback_data: 'logs:stats' }
            ],
            [
                { text: '🔍 Search Logs', callback_data: 'logs:search' },
                { text: '📥 Export Logs', callback_data: 'logs:export' }
            ],
            [
                { text: '🗑️ Clear Logs', callback_data: 'logs:clear' },
                { text: '📂 Log Files', callback_data: 'logs:files' }
            ],
            [
                { text: '🔄 Refresh', callback_data: 'logs:menu' }
            ]
        ];
        
        const message = `📋 **Admin Logs Dashboard**\n\n` +
                       `Select an option to view logs:`;
        
        if (ctx.editMessageText) {
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }
    
    /**
     * Handle logs actions
     */
    async handleLogsAction(ctx, action) {
        await ctx.answerCbQuery();
        
        switch (action) {
            case 'menu':
                await this.showLogsMenu(ctx);
                break;
                
            case 'recent':
                await this.showRecentLogs(ctx);
                break;
                
            case 'errors':
                await this.showErrorLogs(ctx);
                break;
                
            case 'warnings':
                await this.showWarningLogs(ctx);
                break;
                
            case 'stats':
                await this.showErrorStats(ctx);
                break;
                
            case 'search':
                await this.promptSearchLogs(ctx);
                break;
                
            case 'export':
                await this.exportLogs(ctx);
                break;
                
            case 'clear':
                await this.confirmClearLogs(ctx);
                break;
                
            case 'clear:confirm':
                await this.clearLogs(ctx);
                break;
                
            case 'files':
                await this.showLogFiles(ctx);
                break;
        }
    }
    
    /**
     * Show recent logs
     */
    async showRecentLogs(ctx, level = null) {
        const logs = logger.getRecentLogs({ 
            level, 
            limit: 10 
        });
        
        if (logs.length === 0) {
            return ctx.editMessageText('No logs found', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back', callback_data: 'logs:menu' }
                    ]]
                }
            });
        }
        
        let message = `📝 **Recent ${level ? level.toUpperCase() : ''} Logs**\n\n`;
        
        logs.forEach((log, index) => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const icon = this.getLogIcon(log.level);
            
            message += `${icon} **[${time}]** ${log.level.toUpperCase()}\n`;
            message += `${log.message}\n`;
            
            if (log.userId) message += `User: ${log.userId}\n`;
            if (log.error) message += `Error: ${log.error}\n`;
            if (log.duration) message += `Duration: ${log.duration}\n`;
            
            message += '\n';
        });
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh', callback_data: `logs:${level || 'recent'}` },
                        { text: '🔙 Back', callback_data: 'logs:menu' }
                    ]
                ]
            }
        });
    }
    
    /**
     * Show error logs
     */
    async showErrorLogs(ctx) {
        await this.showRecentLogs(ctx, 'error');
    }
    
    /**
     * Show warning logs
     */
    async showWarningLogs(ctx) {
        await this.showRecentLogs(ctx, 'warn');
    }
    
    /**
     * Show error statistics
     */
    async showErrorStats(ctx) {
        const stats = logger.getErrorStats();
        
        let message = `📊 **Error Statistics**\n\n`;
        message += `Total Errors: ${stats.total}\n`;
        message += `Error Rate: ${stats.errorRate}/hour\n\n`;
        
        if (stats.topErrors.length > 0) {
            message += `**Top Error Types:**\n`;
            stats.topErrors.forEach(({ type, count }) => {
                message += `• ${type}: ${count}\n`;
            });
            message += '\n';
        }
        
        if (stats.critical.length > 0) {
            message += `**Recent Critical Errors:**\n`;
            stats.critical.slice(0, 5).forEach(error => {
                const time = new Date(error.timestamp).toLocaleTimeString();
                message += `• [${time}] ${error.message}\n`;
            });
        }
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔄 Refresh', callback_data: 'logs:stats' },
                    { text: '🔙 Back', callback_data: 'logs:menu' }
                ]]
            }
        });
    }
    
    /**
     * Show health dashboard
     */
    async showHealthDashboard(ctx) {
        // Get circuit breaker status
        const circuitStatus = circuitBreakerManager.getGlobalMetrics();
        
        // Get cache stats
        const cacheStats = this.cache ? this.cache.getStats() : null;
        
        // Get database status
        const dbStatus = await this.checkDatabaseHealth();
        
        let message = `🏥 **System Health Dashboard**\n\n`;
        
        // Circuit breakers
        message += `**Circuit Breakers:**\n`;
        message += `• Total: ${circuitStatus.totalBreakers}\n`;
        message += `• ✅ Closed: ${circuitStatus.closedBreakers}\n`;
        message += `• ⚠️ Half-Open: ${circuitStatus.halfOpenBreakers}\n`;
        message += `• ❌ Open: ${circuitStatus.openBreakers}\n\n`;
        
        // Cache
        if (cacheStats) {
            message += `**Cache Performance:**\n`;
            message += `• Hit Rate: ${cacheStats.hitRate}\n`;
            message += `• Hits: ${cacheStats.hits}\n`;
            message += `• Misses: ${cacheStats.misses}\n`;
            message += `• Connected: ${cacheStats.connected ? '✅' : '❌'}\n\n`;
        }
        
        // Database
        message += `**Database:**\n`;
        message += `• Status: ${dbStatus.connected ? '✅ Connected' : '❌ Disconnected'}\n`;
        if (dbStatus.latency) {
            message += `• Latency: ${dbStatus.latency}ms\n`;
        }
        
        const keyboard = [
            [
                { text: '🔌 Circuit Details', callback_data: 'health:circuits' },
                { text: '💾 Cache Details', callback_data: 'health:cache' }
            ],
            [
                { text: '🗄️ Database Details', callback_data: 'health:database' },
                { text: '📊 Metrics', callback_data: 'health:metrics' }
            ],
            [
                { text: '🔄 Refresh', callback_data: 'health:dashboard' },
                { text: '🔙 Main Menu', callback_data: 'logs:menu' }
            ]
        ];
        
        if (ctx.editMessageText) {
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }
    
    /**
     * Check database health
     */
    async checkDatabaseHealth() {
        try {
            const start = Date.now();
            await this.db.collection('health_check').findOne({});
            const latency = Date.now() - start;
            
            return {
                connected: true,
                latency
            };
        } catch (error) {
            return {
                connected: false,
                error: error.message
            };
        }
    }
    
    /**
     * Show system statistics
     */
    async showSystemStats(ctx) {
        // Get various statistics
        const userCount = await this.db.collection('users').countDocuments();
        const articleCount = await this.db.collection('news_articles').countDocuments();
        const reactionCount = await this.db.collection('zone_persistent_reactions').countDocuments();
        
        // Get today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayUsers = await this.db.collection('users').countDocuments({
            lastActive: { $gte: today }
        });
        
        const todayArticles = await this.db.collection('news_articles').countDocuments({
            published_date: { $gte: today }
        });
        
        let message = `📊 **System Statistics**\n\n`;
        
        message += `**Total Counts:**\n`;
        message += `• Users: ${userCount.toLocaleString()}\n`;
        message += `• Articles: ${articleCount.toLocaleString()}\n`;
        message += `• Reactions: ${reactionCount.toLocaleString()}\n\n`;
        
        message += `**Today's Activity:**\n`;
        message += `• Active Users: ${todayUsers}\n`;
        message += `• New Articles: ${todayArticles}\n\n`;
        
        message += `**System Info:**\n`;
        message += `• Uptime: ${this.getUptime()}\n`;
        message += `• Memory: ${this.getMemoryUsage()}\n`;
        message += `• Node Version: ${process.version}\n`;
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔄 Refresh', callback_data: 'stats:refresh' },
                    { text: '🏥 Health', callback_data: 'health:dashboard' }
                ]]
            }
        });
    }
    
    /**
     * Get log icon based on level
     */
    getLogIcon(level) {
        const icons = {
            error: '❌',
            warn: '⚠️',
            info: 'ℹ️',
            http: '🌐',
            verbose: '💬',
            debug: '🔧'
        };
        return icons[level] || '📝';
    }
    
    /**
     * Get system uptime
     */
    getUptime() {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
    
    /**
     * Get memory usage
     */
    getMemoryUsage() {
        const usage = process.memoryUsage();
        const rss = Math.round(usage.rss / 1024 / 1024);
        const heap = Math.round(usage.heapUsed / 1024 / 1024);
        return `${heap}MB / ${rss}MB`;
    }
    
    /**
     * Export logs
     */
    async exportLogs(ctx) {
        try {
            const filepath = await logger.exportLogs({ limit: 1000 });
            
            await ctx.editMessageText(
                `✅ Logs exported successfully\n\nFile: ${path.basename(filepath)}`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Back', callback_data: 'logs:menu' }
                        ]]
                    }
                }
            );
            
            // Could also send the file via Telegram
            // await ctx.replyWithDocument({ source: filepath });
            
        } catch (error) {
            await ctx.editMessageText(
                `❌ Failed to export logs: ${error.message}`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Back', callback_data: 'logs:menu' }
                        ]]
                    }
                }
            );
        }
    }
    
    /**
     * Clear logs confirmation
     */
    async confirmClearLogs(ctx) {
        await ctx.editMessageText(
            '⚠️ **Clear All Logs?**\n\n' +
            'This will clear all logs from memory.\n' +
            'Log files will not be affected.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Yes, Clear', callback_data: 'logs:clear:confirm' },
                        { text: '❌ Cancel', callback_data: 'logs:menu' }
                    ]]
                }
            }
        );
    }
    
    /**
     * Clear logs
     */
    async clearLogs(ctx) {
        logger.clearLogs();
        
        await ctx.editMessageText(
            '✅ **Logs Cleared**\n\nAll logs have been cleared from memory.',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back', callback_data: 'logs:menu' }
                    ]]
                }
            }
        );
    }
    
    /**
     * Show database index statistics
     */
    async showIndexStats(ctx) {
        if (!this.indexingService) {
            return ctx.reply('⚠️ Indexing service not available');
        }
        
        try {
            // Get index statistics
            const stats = await this.indexingService.getIndexStats();
            
            let message = `🗂️ **Database Index Statistics**\n\n`;
            message += `**Overall:**\n`;
            message += `• Total Indexes: ${stats.totalIndexes}\n`;
            message += `• Total Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB\n\n`;
            
            message += `**Per Collection:**\n`;
            
            // Sort collections by document count
            const sortedCollections = Object.entries(stats.collections)
                .sort((a, b) => b[1].documentCount - a[1].documentCount)
                .slice(0, 10); // Show top 10
            
            for (const [collection, collStats] of sortedCollections) {
                const sizeInMB = (collStats.totalIndexSize / 1024 / 1024).toFixed(2);
                message += `\n📁 **${collection}**\n`;
                message += `• Documents: ${collStats.documentCount.toLocaleString()}\n`;
                message += `• Indexes: ${collStats.indexCount}\n`;
                message += `• Index Size: ${sizeInMB} MB\n`;
                
                // Show first 3 indexes
                if (collStats.indexes.length > 0) {
                    message += `• Key Indexes:\n`;
                    collStats.indexes.slice(0, 3).forEach(idx => {
                        const keys = Object.keys(idx.keys).join(', ');
                        message += `  - ${keys}`;
                        if (idx.unique) message += ' (unique)';
                        if (idx.sparse) message += ' (sparse)';
                        message += '\n';
                    });
                }
            }
            
            const keyboard = [
                [
                    { text: '🔍 Analyze Usage', callback_data: 'indexes:analyze' },
                    { text: '🚀 Optimize', callback_data: 'indexes:optimize' }
                ],
                [
                    { text: '🔄 Refresh', callback_data: 'indexes:refresh' },
                    { text: '🔙 Back', callback_data: 'health:dashboard' }
                ]
            ];
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
            
        } catch (error) {
            logger.error('Failed to get index stats', { error: error.message });
            await ctx.reply('❌ Failed to retrieve index statistics');
        }
    }
    
    /**
     * Analyze index usage
     */
    async analyzeIndexUsage(ctx) {
        if (!this.indexingService) {
            return ctx.answerCbQuery('Indexing service not available');
        }
        
        try {
            await ctx.answerCbQuery('Analyzing index usage...');
            
            // Get slow query analysis
            const analysis = await this.indexingService.optimizeSlowQueries();
            
            let message = `🔍 **Index Usage Analysis**\n\n`;
            
            if (analysis.slowQueries.length > 0) {
                message += `**Slow Queries Detected:**\n`;
                analysis.slowQueries.slice(0, 5).forEach(query => {
                    message += `• ${query.collection} - ${query.duration}ms\n`;
                });
                message += '\n';
            }
            
            if (analysis.suggestions.length > 0) {
                message += `**Suggested Indexes:**\n`;
                analysis.suggestions.forEach(suggestion => {
                    const keys = Object.keys(suggestion.suggestedIndex).join(', ');
                    message += `• ${suggestion.collection}: ${keys}\n`;
                    message += `  Reason: ${suggestion.reason}\n`;
                });
            } else {
                message += `✅ No index optimizations needed`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 Back', callback_data: 'indexes:stats' }
                    ]]
                }
            });
            
        } catch (error) {
            logger.error('Failed to analyze index usage', { error: error.message });
            await ctx.answerCbQuery('Analysis failed');
        }
    }
}

module.exports = AdminLogsDashboard;