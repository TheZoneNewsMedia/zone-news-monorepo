/**
 * Secure Admin Management System with Tiers
 * Provides role-based access control for bot commands
 */

const { Markup } = require('telegraf');

class AdminSystem {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        
        // Permission tiers
        this.TIERS = {
            OWNER: 'owner',           // Full access
            SUPER_ADMIN: 'super_admin', // Almost full access
            ADMIN: 'admin',           // Standard admin
            MODERATOR: 'moderator',   // Limited admin
            VIP: 'vip',              // Special user
            USER: 'user'             // Regular user
        };
        
        // Permission levels (higher = more access)
        this.LEVELS = {
            [this.TIERS.OWNER]: 100,
            [this.TIERS.SUPER_ADMIN]: 90,
            [this.TIERS.ADMIN]: 70,
            [this.TIERS.MODERATOR]: 50,
            [this.TIERS.VIP]: 30,
            [this.TIERS.USER]: 10
        };
        
        // Default hardcoded admins (fallback)
        this.defaultAdmins = {
            7802629063: { tier: this.TIERS.OWNER, username: '@dukexotic', name: 'Duke Exxotic' },
            8132879580: { tier: this.TIERS.SUPER_ADMIN, username: '@ZoneNewsBot', name: 'Zone News Bot' }
        };
        
        // Cache for admin list
        this.adminCache = null;
        this.cacheExpiry = null;
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        
        // Admin state management
        this.adminSessions = new Map();
        
        // Initialize database collection
        this.initializeDB();
    }
    
    async initializeDB() {
        try {
            const dbInstance = this.db.getDatabase ? this.db.getDatabase() : this.db;
            
            // Create admins collection if it doesn't exist
            const collections = await dbInstance.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);
            
            if (!collectionNames.includes('bot_admins')) {
                await dbInstance.createCollection('bot_admins');
                
                // Insert default admins
                for (const [userId, adminData] of Object.entries(this.defaultAdmins)) {
                    await dbInstance.collection('bot_admins').updateOne(
                        { user_id: parseInt(userId) },
                        {
                            $set: {
                                user_id: parseInt(userId),
                                tier: adminData.tier,
                                username: adminData.username,
                                name: adminData.name,
                                added_at: new Date(),
                                added_by: 'system',
                                active: true
                            }
                        },
                        { upsert: true }
                    );
                }
                
                console.log('✅ Admin system database initialized with default admins');
            }
            
            // Create indexes
            await dbInstance.collection('bot_admins').createIndex({ user_id: 1 }, { unique: true });
            await dbInstance.collection('bot_admins').createIndex({ tier: 1 });
            await dbInstance.collection('bot_admins').createIndex({ active: 1 });
            
        } catch (error) {
            console.error('Error initializing admin database:', error);
        }
    }
    
    /**
     * Check if user has required permission level
     */
    async hasPermission(userId, requiredTier = this.TIERS.ADMIN) {
        const userTier = await this.getUserTier(userId);
        const userLevel = this.LEVELS[userTier] || 0;
        const requiredLevel = this.LEVELS[requiredTier] || 100;
        
        return userLevel >= requiredLevel;
    }
    
    /**
     * Get user's tier
     */
    async getUserTier(userId) {
        try {
            // Check cache first
            if (this.adminCache && this.cacheExpiry > Date.now()) {
                const cachedAdmin = this.adminCache.find(a => a.user_id === userId);
                if (cachedAdmin) return cachedAdmin.tier;
            }
            
            // Check database
            const dbInstance = this.db.getDatabase ? this.db.getDatabase() : this.db;
            const admin = await dbInstance.collection('bot_admins').findOne({
                user_id: parseInt(userId),
                active: true
            });
            
            if (admin) {
                return admin.tier;
            }
            
            // Fallback to hardcoded admins
            if (this.defaultAdmins[userId]) {
                return this.defaultAdmins[userId].tier;
            }
            
            return this.TIERS.USER;
            
        } catch (error) {
            console.error('Error getting user tier:', error);
            // Fallback to hardcoded check
            return this.defaultAdmins[userId]?.tier || this.TIERS.USER;
        }
    }
    
    /**
     * Get all admins
     */
    async getAllAdmins() {
        try {
            // Check cache
            if (this.adminCache && this.cacheExpiry > Date.now()) {
                return this.adminCache;
            }
            
            // Get from database
            const dbInstance = this.db.getDatabase ? this.db.getDatabase() : this.db;
            const admins = await dbInstance.collection('bot_admins')
                .find({ active: true })
                .sort({ tier: -1, added_at: 1 })
                .toArray();
            
            // Update cache
            this.adminCache = admins;
            this.cacheExpiry = Date.now() + this.CACHE_TTL;
            
            return admins;
            
        } catch (error) {
            console.error('Error getting admins:', error);
            // Return hardcoded admins as fallback
            return Object.entries(this.defaultAdmins).map(([userId, data]) => ({
                user_id: parseInt(userId),
                ...data,
                active: true
            }));
        }
    }
    
    /**
     * Add or update admin
     */
    async setAdmin(userId, tier, addedBy, userData = {}) {
        try {
            const dbInstance = this.db.getDatabase ? this.db.getDatabase() : this.db;
            
            const adminData = {
                user_id: parseInt(userId),
                tier: tier,
                username: userData.username || null,
                name: userData.name || null,
                added_by: addedBy,
                updated_at: new Date(),
                active: true
            };
            
            const result = await dbInstance.collection('bot_admins').updateOne(
                { user_id: parseInt(userId) },
                {
                    $set: adminData,
                    $setOnInsert: { added_at: new Date() }
                },
                { upsert: true }
            );
            
            // Clear cache
            this.adminCache = null;
            
            return { success: true, userId, tier };
            
        } catch (error) {
            console.error('Error setting admin:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Remove admin
     */
    async removeAdmin(userId, removedBy) {
        try {
            // Prevent removing owner
            if (this.defaultAdmins[userId]?.tier === this.TIERS.OWNER) {
                return { success: false, error: 'Cannot remove owner' };
            }
            
            const dbInstance = this.db.getDatabase ? this.db.getDatabase() : this.db;
            
            const result = await dbInstance.collection('bot_admins').updateOne(
                { user_id: parseInt(userId) },
                {
                    $set: {
                        active: false,
                        removed_by: removedBy,
                        removed_at: new Date()
                    }
                }
            );
            
            // Clear cache
            this.adminCache = null;
            
            return { success: true, userId };
            
        } catch (error) {
            console.error('Error removing admin:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Check if user is admin (backward compatibility)
     */
    async isAdmin(userId) {
        return await this.hasPermission(userId, this.TIERS.ADMIN);
    }
    
    /**
     * Check if user is moderator or higher
     */
    async isModerator(userId) {
        return await this.hasPermission(userId, this.TIERS.MODERATOR);
    }
    
    /**
     * Check if user is owner
     */
    async isOwner(userId) {
        return await this.hasPermission(userId, this.TIERS.OWNER);
    }
    
    /**
     * Get tier display name
     */
    getTierDisplay(tier) {
        const displays = {
            [this.TIERS.OWNER]: '👑 Owner',
            [this.TIERS.SUPER_ADMIN]: '⭐ Super Admin',
            [this.TIERS.ADMIN]: '🛡️ Admin',
            [this.TIERS.MODERATOR]: '🔧 Moderator',
            [this.TIERS.VIP]: '💎 VIP',
            [this.TIERS.USER]: '👤 User'
        };
        return displays[tier] || '👤 User';
    }
    
    /**
     * Format admin list for display
     */
    async formatAdminList() {
        const admins = await this.getAllAdmins();
        
        let message = '👥 **Bot Admins:**\n\n';
        
        // Group by tier
        const tiers = {};
        for (const admin of admins) {
            if (!tiers[admin.tier]) {
                tiers[admin.tier] = [];
            }
            tiers[admin.tier].push(admin);
        }
        
        // Display by tier order
        const tierOrder = [
            this.TIERS.OWNER,
            this.TIERS.SUPER_ADMIN,
            this.TIERS.ADMIN,
            this.TIERS.MODERATOR,
            this.TIERS.VIP
        ];
        
        for (const tier of tierOrder) {
            if (tiers[tier] && tiers[tier].length > 0) {
                message += `${this.getTierDisplay(tier)}:\n`;
                for (const admin of tiers[tier]) {
                    message += `  • ${admin.name || admin.username || `User ${admin.user_id}`}\n`;
                }
                message += '\n';
            }
        }
        
        return message;
    }
    
    /**
     * Register admin handlers
     */
    registerHandlers() {
        // Admin command
        this.bot.command('admin', async (ctx) => {
            const userId = ctx.from.id;
            if (!await this.isAdmin(userId)) {
                return; // Silent fail for non-admins
            }
            return this.showAdminPanel(ctx);
        });
        
        // Admin tier management commands (owner only)
        this.bot.command('setadmin', async (ctx) => {
            const userId = ctx.from.id;
            if (!await this.isOwner(userId)) {
                return ctx.reply('❌ Owner access required');
            }
            
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length < 2) {
                return ctx.reply(
                    '📝 **Usage:** /setadmin <user_id> <tier>\n\n' +
                    'Available tiers:\n' +
                    '• owner\n• super_admin\n• admin\n• moderator\n• vip',
                    { parse_mode: 'Markdown' }
                );
            }
            
            const targetUserId = parseInt(args[0]);
            const tier = args[1].toLowerCase();
            
            if (!Object.values(this.TIERS).includes(tier)) {
                return ctx.reply('❌ Invalid tier. Use: owner, super_admin, admin, moderator, or vip');
            }
            
            const result = await this.setAdmin(targetUserId, tier, userId);
            if (result.success) {
                await ctx.reply(`✅ User ${targetUserId} set as ${this.getTierDisplay(tier)}`);
            } else {
                await ctx.reply(`❌ Failed: ${result.error}`);
            }
        });
        
        this.bot.command('removeadmin', async (ctx) => {
            const userId = ctx.from.id;
            if (!await this.isOwner(userId)) {
                return ctx.reply('❌ Owner access required');
            }
            
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length < 1) {
                return ctx.reply('📝 **Usage:** /removeadmin <user_id>', { parse_mode: 'Markdown' });
            }
            
            const targetUserId = parseInt(args[0]);
            const result = await this.removeAdmin(targetUserId, userId);
            
            if (result.success) {
                await ctx.reply(`✅ Admin access removed for user ${targetUserId}`);
            } else {
                await ctx.reply(`❌ Failed: ${result.error}`);
            }
        });
        
        this.bot.command('admins', async (ctx) => {
            const userId = ctx.from.id;
            if (!await this.isModerator(userId)) {
                return; // Silent fail for non-moderators
            }
            
            const message = await this.formatAdminList();
            await ctx.reply(message, { parse_mode: 'Markdown' });
        });
        
        // Admin callbacks
        this.bot.action(/^admin_/, async (ctx) => {
            const userId = ctx.from.id;
            if (!await this.isAdmin(userId)) {
                return ctx.answerCbQuery('❌ Access denied', { show_alert: true });
            }
            return this.handleAdminAction(ctx);
        });
    }
    
    /**
     * Show admin panel
     */
    async showAdminPanel(ctx) {
        const userId = ctx.from.id;
        const userTier = await this.getUserTier(userId);
        const stats = await this.getSystemStats();
        
        const message = 
            `👑 *Administrator Panel*\n` +
            `Your Role: ${this.getTierDisplay(userTier)}\n\n` +
            '*System Overview:*\n' +
            `• Total Users: ${stats.totalUsers}\n` +
            `• Active Users (7d): ${stats.activeUsers}\n` +
            `• Total Posts: ${stats.totalPosts}\n` +
            `• Channels: ${stats.totalChannels}\n` +
            `• Groups: ${stats.totalGroups}\n\n` +
            '*Quick Actions:*';
        
        const buttons = [];
        
        // Basic admin buttons (MODERATOR+)
        if (await this.isModerator(userId)) {
            buttons.push([
                Markup.button.callback('👥 User Management', 'admin_users'),
                Markup.button.callback('📊 Statistics', 'admin_stats')
            ]);
        }
        
        // Advanced admin buttons (ADMIN+)
        if (await this.isAdmin(userId)) {
            buttons.push([
                Markup.button.callback('📢 Broadcast', 'admin_broadcast'),
                Markup.button.callback('🔧 System', 'admin_system')
            ]);
            buttons.push([
                Markup.button.callback('📋 View Logs', 'admin_logs'),
                Markup.button.callback('💰 Revenue', 'admin_revenue')
            ]);
        }
        
        // Super admin buttons (SUPER_ADMIN+)
        if (await this.hasPermission(userId, this.TIERS.SUPER_ADMIN)) {
            buttons.push([
                Markup.button.callback('🎁 Grant Access', 'admin_grant'),
                Markup.button.callback('🚫 Ban User', 'admin_ban')
            ]);
        }
        
        // Always show refresh and close
        buttons.push([
            Markup.button.callback('🔄 Refresh', 'admin_panel'),
            Markup.button.callback('✖️ Close', 'close')
        ]);
        
        const keyboard = Markup.inlineKeyboard(buttons);
        
        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                ...keyboard
            });
            await ctx.answerCbQuery();
        } else {
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
    }
    
    /**
     * Handle admin actions
     */
    async handleAdminAction(ctx) {
        const action = ctx.callbackQuery.data.replace('admin_', '');
        
        switch (action) {
            case 'panel':
                return this.showAdminPanel(ctx);
                
            case 'users':
                return this.showUserManagement(ctx);
                
            case 'stats':
                return this.showStatistics(ctx);
                
            case 'broadcast':
                return this.startBroadcast(ctx);
                
            case 'system':
                return this.showSystemInfo(ctx);
                
            case 'logs':
                return this.showLogs(ctx);
                
            case 'revenue':
                return this.showRevenue(ctx);
                
            case 'grant':
                return this.startGrantAccess(ctx);
                
            case 'ban':
                return this.startBanUser(ctx);
                
            default:
                if (action.startsWith('confirm_')) {
                    return this.handleConfirmation(ctx, action);
                }
                return ctx.answerCbQuery('🚧 Feature coming soon');
        }
    }
    
    /**
     * Show user management
     */
    async showUserManagement(ctx) {
        const dbInstance = this.db.getDatabase ? this.db.getDatabase() : this.db;
        const users = await dbInstance.collection('users')
            .find({})
            .sort({ lastActive: -1 })
            .limit(10)
            .toArray();
        
        let message = '👥 *User Management*\n\n';
        message += '*Recent Active Users:*\n';
        
        users.forEach((user, index) => {
            const tier = user.tier || 'basic';
            const username = user.username ? `@${user.username}` : user.firstName || 'Unknown';
            message += `${index + 1}. ${username} (${tier})\n`;
        });
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('🔍 Search User', 'admin_search_user'),
                Markup.button.callback('📊 User Stats', 'admin_user_stats')
            ],
            [
                Markup.button.callback('🎁 Grant Premium', 'admin_grant_premium'),
                Markup.button.callback('🚫 Ban List', 'admin_ban_list')
            ],
            [
                Markup.button.callback('🔙 Back', 'admin_panel'),
                Markup.button.callback('✖️ Close', 'close')
            ]
        ]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...keyboard
        });
        await ctx.answerCbQuery();
    }
    
    /**
     * Show statistics
     */
    async showStatistics(ctx) {
        const now = new Date();
        const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        
        const [daily, weekly, monthly] = await Promise.all([
            this.getStatsForPeriod(dayAgo),
            this.getStatsForPeriod(weekAgo),
            this.getStatsForPeriod(new Date(now - 30 * 24 * 60 * 60 * 1000))
        ]);
        
        const message = 
            '📊 *System Statistics*\n\n' +
            '*Daily Stats:*\n' +
            `• New Users: ${daily.newUsers}\n` +
            `• Posts Created: ${daily.posts}\n` +
            `• Commands Used: ${daily.commands}\n\n` +
            '*Weekly Stats:*\n' +
            `• New Users: ${weekly.newUsers}\n` +
            `• Posts Created: ${weekly.posts}\n` +
            `• Commands Used: ${weekly.commands}\n\n` +
            '*Monthly Stats:*\n' +
            `• New Users: ${monthly.newUsers}\n` +
            `• Posts Created: ${monthly.posts}\n` +
            `• Commands Used: ${monthly.commands}`;
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📈 Growth', 'admin_growth'),
                Markup.button.callback('💰 Revenue', 'admin_revenue')
            ],
            [
                Markup.button.callback('🔄 Refresh', 'admin_stats'),
                Markup.button.callback('📥 Export', 'admin_export_stats')
            ],
            [
                Markup.button.callback('🔙 Back', 'admin_panel'),
                Markup.button.callback('✖️ Close', 'close')
            ]
        ]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...keyboard
        });
        await ctx.answerCbQuery();
    }
    
    /**
     * Get system stats
     */
    async getSystemStats() {
        const dbInstance = this.db.getDatabase ? this.db.getDatabase() : this.db;
        const [totalUsers, activeUsers, totalPosts, totalChannels, totalGroups] = await Promise.all([
            dbInstance.collection('users').countDocuments(),
            dbInstance.collection('users').countDocuments({
                lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }),
            dbInstance.collection('posts').countDocuments(),
            dbInstance.collection('destinations').countDocuments({ type: 'channel' }),
            dbInstance.collection('destinations').countDocuments({ type: { $in: ['group', 'supergroup'] } })
        ]);
        
        return {
            totalUsers,
            activeUsers,
            totalPosts,
            totalChannels,
            totalGroups
        };
    }
    
    /**
     * Get stats for a specific period
     */
    async getStatsForPeriod(since) {
        const dbInstance = this.db.getDatabase ? this.db.getDatabase() : this.db;
        const [newUsers, posts, commands] = await Promise.all([
            dbInstance.collection('users').countDocuments({
                createdAt: { $gte: since }
            }),
            dbInstance.collection('posts').countDocuments({
                created_at: { $gte: since }
            }),
            dbInstance.collection('command_logs').countDocuments({
                timestamp: { $gte: since }
            })
        ]);
        
        return { newUsers, posts, commands };
    }
}

module.exports = AdminSystem;