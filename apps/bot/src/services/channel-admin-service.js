/**
 * Channel Admin Service
 * Allows channel/group owners to manage their own admin team
 * with permissions limited to their specific channels
 */

class ChannelAdminService {
    constructor(db) {
        this.db = db;
        
        // Channel-specific roles
        this.CHANNEL_ROLES = {
            channel_owner: {
                name: 'Channel Owner',
                permissions: ['post', 'manage_channel_admins', 'schedule', 'view_stats', 'remove_destination']
            },
            channel_moderator: {
                name: 'Channel Moderator', 
                permissions: ['post', 'schedule', 'view_stats']
            },
            channel_editor: {
                name: 'Channel Editor',
                permissions: ['post', 'view_stats']
            },
            channel_scheduler: {
                name: 'Scheduler',
                permissions: ['schedule', 'view_stats']
            },
            channel_analyst: {
                name: 'Analyst',
                permissions: ['view_stats']
            }
        };
        
        // Cache for performance
        this.channelAdminCache = new Map();
    }
    
    /**
     * Add a channel-specific admin
     */
    async addChannelAdmin(channelId, userId, username, role, addedBy) {
        const permissions = this.CHANNEL_ROLES[role]?.permissions || [];
        
        await this.db.collection('channel_admins').updateOne(
            { 
                channel_id: channelId,
                user_id: userId 
            },
            {
                $set: {
                    channel_id: channelId,
                    user_id: userId,
                    username: username,
                    role: role,
                    permissions: permissions,
                    added_by: addedBy,
                    added_at: new Date(),
                    active: true
                }
            },
            { upsert: true }
        );
        
        // Update cache
        const cacheKey = `${channelId}:${userId}`;
        this.channelAdminCache.set(cacheKey, {
            role: role,
            permissions: permissions
        });
        
        return true;
    }
    
    /**
     * Check if user is admin for specific channel
     */
    async isChannelAdmin(channelId, userId) {
        const cacheKey = `${channelId}:${userId}`;
        
        // Check cache
        if (this.channelAdminCache.has(cacheKey)) {
            return true;
        }
        
        // Check database
        const admin = await this.db.collection('channel_admins').findOne({
            channel_id: channelId,
            user_id: userId,
            active: true
        });
        
        if (admin) {
            this.channelAdminCache.set(cacheKey, {
                role: admin.role,
                permissions: admin.permissions
            });
            return true;
        }
        
        return false;
    }
    
    /**
     * Check if user has specific permission for channel
     */
    async hasChannelPermission(channelId, userId, permission) {
        const cacheKey = `${channelId}:${userId}`;
        const admin = this.channelAdminCache.get(cacheKey);
        
        if (!admin) {
            // Try to load from database
            const dbAdmin = await this.db.collection('channel_admins').findOne({
                channel_id: channelId,
                user_id: userId,
                active: true
            });
            
            if (!dbAdmin) return false;
            
            this.channelAdminCache.set(cacheKey, {
                role: dbAdmin.role,
                permissions: dbAdmin.permissions
            });
            
            return dbAdmin.permissions.includes(permission);
        }
        
        return admin.permissions.includes(permission);
    }
    
    /**
     * Get all channels a user is admin for
     */
    async getUserChannels(userId) {
        const channels = await this.db.collection('channel_admins')
            .find({ 
                user_id: userId, 
                active: true 
            })
            .toArray();
        
        return channels.map(ch => ({
            channel_id: ch.channel_id,
            role: ch.role,
            permissions: ch.permissions
        }));
    }
    
    /**
     * Get all admins for a channel
     */
    async getChannelAdmins(channelId) {
        return await this.db.collection('channel_admins')
            .find({ 
                channel_id: channelId, 
                active: true 
            })
            .toArray();
    }
    
    /**
     * Remove channel admin
     */
    async removeChannelAdmin(channelId, userId, removedBy) {
        await this.db.collection('channel_admins').updateOne(
            { 
                channel_id: channelId,
                user_id: userId 
            },
            { 
                $set: { 
                    active: false,
                    removed_at: new Date(),
                    removed_by: removedBy
                } 
            }
        );
        
        // Clear cache
        const cacheKey = `${channelId}:${userId}`;
        this.channelAdminCache.delete(cacheKey);
        
        return true;
    }
    
    /**
     * Set channel owner (usually the person who adds the channel)
     */
    async setChannelOwner(channelId, userId, username) {
        return await this.addChannelAdmin(
            channelId, 
            userId, 
            username, 
            'channel_owner', 
            userId
        );
    }
    
    /**
     * Get available roles for UI
     */
    getAvailableRoles() {
        return Object.entries(this.CHANNEL_ROLES).map(([key, value]) => ({
            id: key,
            name: value.name,
            permissions: value.permissions
        }));
    }
    
    /**
     * Create custom role for a channel
     */
    async createCustomRole(channelId, roleName, permissions, createdBy) {
        await this.db.collection('channel_custom_roles').insertOne({
            channel_id: channelId,
            role_name: roleName,
            permissions: permissions,
            created_by: createdBy,
            created_at: new Date(),
            active: true
        });
        
        return true;
    }
    
    /**
     * Get custom roles for a channel
     */
    async getCustomRoles(channelId) {
        return await this.db.collection('channel_custom_roles')
            .find({ 
                channel_id: channelId, 
                active: true 
            })
            .toArray();
    }
}

module.exports = ChannelAdminService;