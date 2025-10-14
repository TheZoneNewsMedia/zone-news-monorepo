/**
 * UserRepository - Data access layer for user operations
 * Includes tier management and permission helpers
 */

const User = require('../models/User');
const { getTierService } = require('../tiers/TierService');

class UserRepository {
    constructor() {
        this.tierService = getTierService();
    }
    
    /**
     * Find or create user by Telegram ID
     */
    async findOrCreateUser(telegramData) {
        const { id, username, first_name, last_name } = telegramData;
        
        let user = await User.findByTelegramId(id.toString());
        
        if (!user) {
            user = new User({
                telegramId: id.toString(),
                username,
                firstName: first_name,
                lastName: last_name,
                role: 'user',
                subscription: {
                    tier: 'free',
                    status: 'active',
                    startDate: new Date()
                }
            });
            
            await user.save();
            console.log(`Created new user: ${user.fullName} (${id})`);
        } else {
            // Update user info if changed
            let updated = false;
            
            if (username && user.username !== username) {
                user.username = username;
                updated = true;
            }
            if (first_name && user.firstName !== first_name) {
                user.firstName = first_name;
                updated = true;
            }
            if (last_name && user.lastName !== last_name) {
                user.lastName = last_name;
                updated = true;
            }
            
            if (updated) {
                await user.save();
            }
        }
        
        // Update last active
        user.updateLastActive();
        
        return user;
    }
    
    /**
     * Get user by Telegram ID
     */
    async getUser(telegramId) {
        return User.findByTelegramId(telegramId.toString());
    }
    
    /**
     * Check if user can use a command
     */
    async canUseCommand(telegramId, command) {
        const user = await this.getUser(telegramId);
        if (!user) return { allowed: false, message: 'User not found' };
        
        // Banned users can't use any commands
        if (user.isBanned) {
            return { 
                allowed: false, 
                message: `⛔ Your account is banned${user.banReason ? `: ${user.banReason}` : ''}` 
            };
        }
        
        // Inactive subscription blocks tier-gated commands
        if (user.subscription.status !== 'active' && command !== '/start' && command !== '/help') {
            return {
                allowed: false,
                message: '❌ Your subscription is inactive. Please contact support.'
            };
        }
        
        // Check tier requirements
        const canUse = this.tierService.canUseCommand(user.subscription.tier, command);
        
        if (!canUse) {
            const requiredTier = this.tierService.getRequiredTier(command);
            return {
                allowed: false,
                message: `🔒 ${command} requires ${requiredTier} tier or higher.\n` +
                        this.tierService.getUpsellMessage(user.subscription.tier)
            };
        }
        
        return { allowed: true, user };
    }
    
    /**
     * Check if user has a specific feature
     */
    async hasFeature(telegramId, feature) {
        const user = await this.getUser(telegramId);
        if (!user) return false;
        
        return this.tierService.hasFeature(user.subscription.tier, feature);
    }
    
    /**
     * Check channel limit for user
     */
    async canAddChannel(telegramId) {
        const user = await this.getUser(telegramId);
        if (!user) return { allowed: false, message: 'User not found' };
        
        const remaining = user.getRemainingChannelSlots();
        
        if (remaining <= 0) {
            return {
                allowed: false,
                message: `📊 Channel limit reached (${user.channelPermissions.maxChannels}).\n` +
                        this.tierService.getUpsellMessage(user.subscription.tier, 'channel_posting')
            };
        }
        
        return { allowed: true, remaining };
    }
    
    /**
     * Check group management limit
     */
    async canManageGroup(telegramId) {
        const user = await this.getUser(telegramId);
        if (!user) return { allowed: false, message: 'User not found' };
        
        if (!user.canManageGroups()) {
            return {
                allowed: false,
                message: this.tierService.getUpsellMessage(user.subscription.tier, 'group_management')
            };
        }
        
        const limits = this.tierService.getLimits(user.subscription.tier);
        const currentGroups = user.managedGroups.length;
        
        if (limits.maxGroups !== -1 && currentGroups >= limits.maxGroups) {
            return {
                allowed: false,
                message: `📊 Group limit reached (${limits.maxGroups}).\n` +
                        this.tierService.getUpsellMessage(user.subscription.tier)
            };
        }
        
        return { allowed: true, remaining: limits.maxGroups - currentGroups };
    }
    
    /**
     * Check daily post limit
     */
    async canPostToday(telegramId) {
        const user = await this.getUser(telegramId);
        if (!user) return { allowed: false, message: 'User not found' };
        
        const limits = this.tierService.getLimits(user.subscription.tier);
        const todayPosts = user.statistics.monthlyUsage.posts || 0; // Should track daily
        
        const check = this.tierService.checkLimit(
            user.subscription.tier,
            'maxPostsPerDay',
            todayPosts
        );
        
        return check;
    }
    
    /**
     * Update user subscription tier
     */
    async updateUserTier(telegramId, newTier, adminId = null) {
        const user = await this.getUser(telegramId);
        if (!user) throw new Error('User not found');
        
        const isAdmin = adminId && await this.isAdmin(adminId);
        const canChange = this.tierService.canChangeTier(
            user.subscription.tier,
            newTier,
            isAdmin
        );
        
        if (!canChange.allowed) {
            throw new Error(canChange.message);
        }
        
        await user.updateSubscription(newTier);
        
        // Log tier change
        console.log(`User ${user.fullName} (${telegramId}) tier changed from ${user.subscription.tier} to ${newTier}${adminId ? ` by admin ${adminId}` : ''}`);
        
        return user;
    }
    
    /**
     * Check if user is admin
     */
    async isAdmin(telegramId) {
        const user = await this.getUser(telegramId);
        if (!user) return false;
        
        return user.isAdmin();
    }
    
    /**
     * Add channel to user
     */
    async addUserChannel(telegramId, channelData) {
        const user = await this.getUser(telegramId);
        if (!user) throw new Error('User not found');
        
        const canAdd = await this.canAddChannel(telegramId);
        if (!canAdd.allowed) {
            throw new Error(canAdd.message);
        }
        
        await user.addChannel(channelData);
        return user;
    }
    
    /**
     * Remove channel from user
     */
    async removeUserChannel(telegramId, channelId) {
        const user = await this.getUser(telegramId);
        if (!user) throw new Error('User not found');
        
        await user.removeChannel(channelId);
        return user;
    }
    
    /**
     * Add managed group
     */
    async addManagedGroup(telegramId, groupData) {
        const user = await this.getUser(telegramId);
        if (!user) throw new Error('User not found');
        
        const canManage = await this.canManageGroup(telegramId);
        if (!canManage.allowed) {
            throw new Error(canManage.message);
        }
        
        user.managedGroups.push({
            groupId: groupData.groupId,
            groupTitle: groupData.groupTitle,
            groupUsername: groupData.groupUsername,
            addedAt: new Date(),
            categories: groupData.categories || [],
            postingEnabled: true,
            settings: groupData.settings || {}
        });
        
        await user.save();
        return user;
    }
    
    /**
     * Update user preferences
     */
    async updatePreferences(telegramId, preferences) {
        const user = await this.getUser(telegramId);
        if (!user) throw new Error('User not found');
        
        await user.updatePreferences(preferences);
        return user;
    }
    
    /**
     * Track command usage
     */
    async trackCommand(telegramId, command) {
        const user = await this.getUser(telegramId);
        if (!user) return;
        
        await user.incrementCommandUsage(command);
    }
    
    /**
     * Track reaction
     */
    async trackReaction(telegramId, articleId, reaction) {
        const user = await this.getUser(telegramId);
        if (!user) return;
        
        await user.addReaction(articleId, reaction);
    }
    
    /**
     * Add last post destination
     */
    async addPostDestination(telegramId, destination) {
        const user = await this.getUser(telegramId);
        if (!user) return;
        
        await user.addLastPostDestination(destination);
    }
    
    /**
     * Get user statistics
     */
    async getUserStats(telegramId) {
        const user = await this.getUser(telegramId);
        if (!user) return null;
        
        const tierLimits = this.tierService.getLimits(user.subscription.tier);
        
        return {
            user: {
                id: user.telegramId,
                name: user.fullName,
                username: user.username,
                role: user.role,
                tier: user.subscription.tier,
                status: user.subscription.status,
                createdAt: user.createdAt,
                lastActive: user.statistics.lastActive
            },
            limits: tierLimits,
            usage: {
                channels: {
                    used: user.channelPermissions.ownedChannels.filter(c => c.isActive).length,
                    limit: tierLimits.maxChannels
                },
                groups: {
                    used: user.managedGroups.length,
                    limit: tierLimits.maxGroups
                },
                postsToday: user.statistics.monthlyUsage.posts || 0,
                totalMessages: user.statistics.totalMessages,
                totalReactions: user.statistics.totalReactions,
                commandUsage: Object.fromEntries(user.statistics.commandUsage || new Map())
            },
            features: this.tierService.getFeatures(user.subscription.tier)
        };
    }
    
    /**
     * Get all admins
     */
    async getAdmins() {
        return User.findAdmins();
    }
    
    /**
     * Get active users
     */
    async getActiveUsers(days = 30) {
        return User.findActiveUsers(days);
    }
    
    /**
     * Get tier statistics
     */
    async getTierStats() {
        return User.getUserStats();
    }
    
    /**
     * Ban/unban user
     */
    async setUserBan(telegramId, banned = true, reason = null) {
        const user = await this.getUser(telegramId);
        if (!user) throw new Error('User not found');
        
        user.isBanned = banned;
        user.banReason = reason;
        
        await user.save();
        
        console.log(`User ${user.fullName} (${telegramId}) ${banned ? 'banned' : 'unbanned'}${reason ? `: ${reason}` : ''}`);
        
        return user;
    }
    
    /**
     * Search users
     */
    async searchUsers(query, options = {}) {
        const { 
            limit = 20, 
            skip = 0,
            tier = null,
            role = null,
            active = null
        } = options;
        
        const filter = {};
        
        if (query) {
            filter.$or = [
                { username: { $regex: query, $options: 'i' } },
                { firstName: { $regex: query, $options: 'i' } },
                { lastName: { $regex: query, $options: 'i' } },
                { telegramId: query }
            ];
        }
        
        if (tier) {
            filter['subscription.tier'] = tier;
        }
        
        if (role) {
            filter.role = role;
        }
        
        if (active !== null) {
            filter.isActive = active;
            filter.isBanned = false;
        }
        
        const users = await User.find(filter)
            .sort({ 'statistics.lastActive': -1 })
            .skip(skip)
            .limit(limit);
            
        const total = await User.countDocuments(filter);
        
        return {
            users,
            total,
            hasMore: skip + users.length < total
        };
    }
    
    /**
     * Cleanup inactive users (maintenance)
     */
    async cleanupInactiveUsers(daysInactive = 90) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysInactive);
        
        const result = await User.updateMany(
            {
                'statistics.lastActive': { $lt: cutoff },
                'subscription.tier': 'free',
                isActive: true
            },
            {
                $set: { 
                    isActive: false,
                    'subscription.status': 'inactive'
                }
            }
        );
        
        console.log(`Marked ${result.modifiedCount} inactive free users as inactive`);
        
        return result.modifiedCount;
    }
}

// Singleton instance
let instance = null;

module.exports = {
    getUserRepository() {
        if (!instance) {
            instance = new UserRepository();
        }
        return instance;
    },
    UserRepository
};