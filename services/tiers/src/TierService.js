/**
 * TierService - Centralized tier management and permissions
 * Single source of truth for tier limits and feature access
 */

class TierService {
    constructor() {
        // Define tier limits and features
        this.tiers = {
            free: {
                name: 'Free',
                maxChannels: 0,
                maxGroups: 0,
                maxPostsPerDay: 5,
                maxReactionsPerPost: 3,
                maxScheduledPosts: 0,
                features: {
                    basic_commands: true,
                    news_reading: true,
                    reactions: true,
                    url_summary: true,
                    ai_summary: false,
                    channel_posting: false,
                    group_management: false,
                    scheduling: false,
                    analytics: false,
                    tbc_access: false,
                    mtproto_access: false,
                    business_posting: false,
                    api_access: false,
                    custom_reactions: false,
                    bulk_posting: false,
                    advanced_analytics: false,
                    webhook_integration: false,
                    priority_support: false
                },
                upsellMessage: '🆙 Upgrade to Group Admin to manage channels and groups!'
            },
            
            group_admin: {
                name: 'Group Admin',
                maxChannels: 2,
                maxGroups: 3,
                maxPostsPerDay: 20,
                maxReactionsPerPost: 5,
                maxScheduledPosts: 5,
                features: {
                    basic_commands: true,
                    news_reading: true,
                    reactions: true,
                    url_summary: true,
                    ai_summary: true,
                    channel_posting: true,
                    group_management: true,
                    scheduling: true,
                    analytics: true,
                    tbc_access: false,
                    mtproto_access: false,
                    business_posting: false,
                    api_access: false,
                    custom_reactions: true,
                    bulk_posting: false,
                    advanced_analytics: false,
                    webhook_integration: false,
                    priority_support: false
                },
                upsellMessage: '🚀 Upgrade to Business for unlimited features and TBC access!'
            },
            
            business: {
                name: 'Business',
                maxChannels: 5,
                maxGroups: 10,
                maxPostsPerDay: 100,
                maxReactionsPerPost: 10,
                maxScheduledPosts: 20,
                features: {
                    basic_commands: true,
                    news_reading: true,
                    reactions: true,
                    url_summary: true,
                    ai_summary: true,
                    channel_posting: true,
                    group_management: true,
                    scheduling: true,
                    analytics: true,
                    tbc_access: true,
                    mtproto_access: true,
                    business_posting: true,
                    api_access: true,
                    custom_reactions: true,
                    bulk_posting: true,
                    advanced_analytics: true,
                    webhook_integration: false,
                    priority_support: true
                },
                upsellMessage: '💎 Upgrade to Enterprise for unlimited channels and webhook integration!'
            },
            
            enterprise: {
                name: 'Enterprise',
                maxChannels: 20,
                maxGroups: 50,
                maxPostsPerDay: 500,
                maxReactionsPerPost: -1, // unlimited
                maxScheduledPosts: 100,
                features: {
                    basic_commands: true,
                    news_reading: true,
                    reactions: true,
                    url_summary: true,
                    ai_summary: true,
                    channel_posting: true,
                    group_management: true,
                    scheduling: true,
                    analytics: true,
                    tbc_access: true,
                    mtproto_access: true,
                    business_posting: true,
                    api_access: true,
                    custom_reactions: true,
                    bulk_posting: true,
                    advanced_analytics: true,
                    webhook_integration: true,
                    priority_support: true
                },
                upsellMessage: '👑 You have Enterprise access with maximum features!'
            },
            
            admin: {
                name: 'Admin',
                maxChannels: -1, // unlimited
                maxGroups: -1, // unlimited
                maxPostsPerDay: -1, // unlimited
                maxReactionsPerPost: -1, // unlimited
                maxScheduledPosts: -1, // unlimited
                features: {
                    basic_commands: true,
                    news_reading: true,
                    reactions: true,
                    url_summary: true,
                    ai_summary: true,
                    channel_posting: true,
                    group_management: true,
                    scheduling: true,
                    analytics: true,
                    tbc_access: true,
                    mtproto_access: true,
                    business_posting: true,
                    api_access: true,
                    custom_reactions: true,
                    bulk_posting: true,
                    advanced_analytics: true,
                    webhook_integration: true,
                    priority_support: true,
                    // Admin-only features
                    admin_commands: true,
                    user_management: true,
                    system_config: true,
                    debug_mode: true,
                    bypass_limits: true
                },
                upsellMessage: '⚡ Admin access - all features unlocked!'
            }
        };
        
        // Command to required tier mapping
        this.commandTiers = {
            // Free tier commands
            '/start': 'free',
            '/help': 'free',
            '/news': 'free',
            '/latest': 'free',
            '/search': 'free',
            '/categories': 'free',
            '/summarize': 'free',
            
            // Group Admin+ commands
            '/post': 'group_admin',
            '/channels': 'group_admin',
            '/group': 'group_admin',
            '/schedule': 'group_admin',
            '/stats': 'group_admin',
            
            // Business+ commands
            '/tbc': 'business',
            '/mtproto': 'business',
            '/bulk': 'business',
            '/analytics': 'business',
            '/export': 'business',
            
            // Enterprise+ commands
            '/webhook': 'enterprise',
            '/api': 'enterprise',
            
            // Admin-only commands
            '/admin': 'admin',
            '/users': 'admin',
            '/system': 'admin',
            '/debug': 'admin',
            '/tbcscan': 'admin',
            '/mt': 'admin'
        };
    }
    
    /**
     * Get limits for a specific tier
     */
    getLimits(tier) {
        const tierData = this.tiers[tier] || this.tiers.free;
        return {
            maxChannels: tierData.maxChannels,
            maxGroups: tierData.maxGroups,
            maxPostsPerDay: tierData.maxPostsPerDay,
            maxReactionsPerPost: tierData.maxReactionsPerPost,
            maxScheduledPosts: tierData.maxScheduledPosts,
            features: tierData.features
        };
    }
    
    /**
     * Check if a tier has a specific feature
     */
    hasFeature(tier, feature) {
        const tierData = this.tiers[tier] || this.tiers.free;
        return tierData.features[feature] === true;
    }
    
    /**
     * Get all features for a tier
     */
    getFeatures(tier) {
        const tierData = this.tiers[tier] || this.tiers.free;
        return tierData.features;
    }
    
    /**
     * Check if a command is allowed for a tier
     */
    canUseCommand(tier, command) {
        const requiredTier = this.commandTiers[command];
        if (!requiredTier) return true; // Unknown commands are allowed
        
        const tierHierarchy = ['free', 'group_admin', 'business', 'enterprise', 'admin'];
        const userTierIndex = tierHierarchy.indexOf(tier);
        const requiredTierIndex = tierHierarchy.indexOf(requiredTier);
        
        return userTierIndex >= requiredTierIndex;
    }
    
    /**
     * Get the minimum tier required for a command
     */
    getRequiredTier(command) {
        return this.commandTiers[command] || 'free';
    }
    
    /**
     * Get upsell message for a tier
     */
    getUpsellMessage(currentTier, requiredFeature = null) {
        const tierData = this.tiers[currentTier] || this.tiers.free;
        
        // If a specific feature is requested, find the minimum tier that has it
        if (requiredFeature) {
            const tierHierarchy = ['free', 'group_admin', 'business', 'enterprise', 'admin'];
            const currentIndex = tierHierarchy.indexOf(currentTier);
            
            for (let i = currentIndex + 1; i < tierHierarchy.length; i++) {
                const nextTier = tierHierarchy[i];
                if (this.hasFeature(nextTier, requiredFeature)) {
                    return `🔓 This feature requires ${this.tiers[nextTier].name} tier or higher.\n` +
                           `📈 Upgrade now to unlock ${requiredFeature.replace(/_/g, ' ')}!`;
                }
            }
        }
        
        return tierData.upsellMessage;
    }
    
    /**
     * Get tier comparison for upgrade flow
     */
    getTierComparison(currentTier) {
        const tierHierarchy = ['free', 'group_admin', 'business', 'enterprise'];
        const currentIndex = tierHierarchy.indexOf(currentTier);
        
        if (currentIndex === -1 || currentIndex >= tierHierarchy.length - 1) {
            return null; // Already at highest tier or admin
        }
        
        const nextTier = tierHierarchy[currentIndex + 1];
        const current = this.tiers[currentTier];
        const next = this.tiers[nextTier];
        
        return {
            current: {
                name: current.name,
                limits: this.getLimits(currentTier),
                features: Object.keys(current.features).filter(f => current.features[f])
            },
            next: {
                name: next.name,
                limits: this.getLimits(nextTier),
                features: Object.keys(next.features).filter(f => next.features[f]),
                newFeatures: Object.keys(next.features).filter(f => 
                    next.features[f] && !current.features[f]
                )
            }
        };
    }
    
    /**
     * Check if user can perform action based on limits
     */
    checkLimit(tier, limitType, currentUsage) {
        const limits = this.getLimits(tier);
        const limit = limits[limitType];
        
        if (limit === -1) return { allowed: true }; // Unlimited
        if (limit === 0) return { 
            allowed: false, 
            message: `❌ ${limitType} not available in ${this.tiers[tier].name} tier` 
        };
        
        if (currentUsage >= limit) {
            return {
                allowed: false,
                message: `📊 You've reached your ${limitType} limit (${limit}) for ${this.tiers[tier].name} tier.\n` +
                        this.getUpsellMessage(tier)
            };
        }
        
        return { 
            allowed: true, 
            remaining: limit - currentUsage 
        };
    }
    
    /**
     * Format tier info for display
     */
    formatTierInfo(tier) {
        const tierData = this.tiers[tier] || this.tiers.free;
        const limits = this.getLimits(tier);
        
        let info = `📊 **${tierData.name} Tier**\n\n`;
        
        info += `**Limits:**\n`;
        info += `• Channels: ${limits.maxChannels === -1 ? 'Unlimited' : limits.maxChannels}\n`;
        info += `• Groups: ${limits.maxGroups === -1 ? 'Unlimited' : limits.maxGroups}\n`;
        info += `• Posts/Day: ${limits.maxPostsPerDay === -1 ? 'Unlimited' : limits.maxPostsPerDay}\n`;
        info += `• Scheduled Posts: ${limits.maxScheduledPosts === -1 ? 'Unlimited' : limits.maxScheduledPosts}\n\n`;
        
        info += `**Features:**\n`;
        const features = Object.keys(limits.features).filter(f => limits.features[f]);
        features.forEach(feature => {
            info += `✅ ${feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n`;
        });
        
        return info;
    }
    
    /**
     * Get all tiers info for /upgrade command
     */
    getAllTiersInfo() {
        const tierHierarchy = ['free', 'group_admin', 'business', 'enterprise'];
        let info = '🎯 **Available Subscription Tiers**\n\n';
        
        tierHierarchy.forEach(tier => {
            info += this.formatTierInfo(tier) + '\n' + '━'.repeat(30) + '\n\n';
        });
        
        info += '\n💡 Use /upgrade to change your subscription tier';
        
        return info;
    }
    
    /**
     * Validate tier change
     */
    canChangeTier(currentTier, newTier, isAdmin = false) {
        if (isAdmin) return { allowed: true };
        
        const tierHierarchy = ['free', 'group_admin', 'business', 'enterprise', 'admin'];
        const currentIndex = tierHierarchy.indexOf(currentTier);
        const newIndex = tierHierarchy.indexOf(newTier);
        
        if (newIndex === -1) {
            return { allowed: false, message: 'Invalid tier specified' };
        }
        
        if (newTier === 'admin') {
            return { allowed: false, message: 'Admin tier cannot be self-assigned' };
        }
        
        if (newIndex <= currentIndex) {
            return { allowed: false, message: 'Cannot downgrade tier without admin approval' };
        }
        
        return { allowed: true };
    }
}

// Singleton instance
let instance = null;

module.exports = {
    getTierService() {
        if (!instance) {
            instance = new TierService();
        }
        return instance;
    },
    TierService
};