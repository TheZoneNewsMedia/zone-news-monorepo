/**
 * Feature Flag Service
 * Enables safe gradual rollout of new features and A/B testing
 */

class FeatureFlagService {
    constructor() {
        this.flags = new Map();
        this.userGroups = new Map();
        this.rolloutPercentages = new Map();
        
        // Initialize default flags from environment
        this.initializeFromEnvironment();
    }
    
    initializeFromEnvironment() {
        // Core feature flags
        this.setFlag('ENABLE_REACTION_SYSTEM', process.env.ENABLE_REACTION_SYSTEM === 'true');
        this.setFlag('ENABLE_COMMAND_LOGGING', process.env.ENABLE_COMMAND_LOGGING === 'true');
        this.setFlag('ENABLE_PERFORMANCE_MONITORING', process.env.ENABLE_PERFORMANCE_MONITORING === 'true');
        this.setFlag('ENABLE_TEST_COMMANDS', process.env.ENABLE_TEST_COMMANDS === 'true');
        this.setFlag('SIMULATE_USER_INTERACTIONS', process.env.SIMULATE_USER_INTERACTIONS === 'true');
        this.setFlag('ENABLE_COMMAND_VALIDATION', process.env.ENABLE_COMMAND_VALIDATION === 'true');
        
        // Gradual rollout flags (percentage-based)
        this.setRolloutPercentage('NEW_REACTION_SYSTEM', parseInt(process.env.NEW_REACTION_ROLLOUT) || 0);
        this.setRolloutPercentage('ENHANCED_COMMANDS', parseInt(process.env.ENHANCED_COMMANDS_ROLLOUT) || 0);
        this.setRolloutPercentage('IMPROVED_UX', parseInt(process.env.IMPROVED_UX_ROLLOUT) || 0);
        
        console.log('🎯 Feature flags initialized:', {
            reactionSystem: this.isEnabled('ENABLE_REACTION_SYSTEM'),
            commandLogging: this.isEnabled('ENABLE_COMMAND_LOGGING'),
            performanceMonitoring: this.isEnabled('ENABLE_PERFORMANCE_MONITORING')
        });
    }
    
    /**
     * Set a boolean feature flag
     */
    setFlag(flagName, enabled) {
        this.flags.set(flagName, Boolean(enabled));
        console.log(`🎯 Feature flag ${flagName}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
    
    /**
     * Check if a feature is enabled
     */
    isEnabled(flagName) {
        return this.flags.get(flagName) || false;
    }
    
    /**
     * Set rollout percentage for gradual feature deployment
     */
    setRolloutPercentage(flagName, percentage) {
        const validPercentage = Math.max(0, Math.min(100, percentage));
        this.rolloutPercentages.set(flagName, validPercentage);
        console.log(`🎯 Rollout flag ${flagName}: ${validPercentage}%`);
    }
    
    /**
     * Check if user is in rollout group for gradual feature
     */
    isUserInRollout(flagName, userId) {
        const percentage = this.rolloutPercentages.get(flagName) || 0;
        
        if (percentage === 0) return false;
        if (percentage === 100) return true;
        
        // Consistent hash-based assignment
        const userHash = this.hashUserId(userId);
        return (userHash % 100) < percentage;
    }
    
    /**
     * Add user to specific feature group
     */
    addUserToGroup(groupName, userId) {
        if (!this.userGroups.has(groupName)) {
            this.userGroups.set(groupName, new Set());
        }
        this.userGroups.get(groupName).add(userId);
        console.log(`👤 User ${userId} added to group: ${groupName}`);
    }
    
    /**
     * Check if user is in specific group
     */
    isUserInGroup(groupName, userId) {
        const group = this.userGroups.get(groupName);
        return group ? group.has(userId) : false;
    }
    
    /**
     * Get feature status for user
     */
    getFeatureStatus(flagName, userId = null) {
        // Check boolean flags first
        if (this.flags.has(flagName)) {
            return this.isEnabled(flagName);
        }
        
        // Check rollout flags
        if (userId && this.rolloutPercentages.has(flagName)) {
            return this.isUserInRollout(flagName, userId);
        }
        
        return false;
    }
    
    /**
     * Get all feature statuses for debugging
     */
    getAllFeatures() {
        const features = {};
        
        // Boolean flags
        for (const [flag, enabled] of this.flags.entries()) {
            features[flag] = { type: 'boolean', enabled };
        }
        
        // Rollout flags
        for (const [flag, percentage] of this.rolloutPercentages.entries()) {
            features[flag] = { type: 'rollout', percentage };
        }
        
        return features;
    }
    
    /**
     * Emergency disable feature
     */
    emergencyDisable(flagName) {
        this.setFlag(flagName, false);
        this.setRolloutPercentage(flagName, 0);
        console.log(`🚨 EMERGENCY: Feature ${flagName} disabled`);
    }
    
    /**
     * Hash user ID for consistent rollout assignment
     */
    hashUserId(userId) {
        let hash = 0;
        const str = userId.toString();
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    
    /**
     * Health check for feature flag service
     */
    healthCheck() {
        return {
            status: 'healthy',
            flagsCount: this.flags.size,
            rolloutFlagsCount: this.rolloutPercentages.size,
            userGroupsCount: this.userGroups.size,
            environment: process.env.NODE_ENV || 'unknown'
        };
    }
}

// Singleton instance
const featureFlags = new FeatureFlagService();

module.exports = featureFlags;