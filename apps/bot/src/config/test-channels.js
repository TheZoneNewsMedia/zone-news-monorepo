/**
 * Test Channel Configuration
 * Ensures we never post to production channels during development/testing
 */

const TEST_CHANNELS = {
    // Test channels for development
    TEST_NEWS_CHANNEL: '@TestZoneNews',
    TEST_GROUP_CHAT: '@TestZoneGroup',
    TEST_TBC_CHAT: -1001234567890, // Replace with actual test chat ID
    
    // Development admin IDs (not production admins)
    DEV_ADMIN_IDS: ['123456789'], // Replace with your dev user ID
    
    // Test topics for TBC (use test topic IDs)
    TEST_TBC_TOPICS: {
        123: 'Test Topic 1',
        124: 'Test Topic 2'
    }
};

const PRODUCTION_CHANNELS = {
    // Production channels (NEVER post to these during testing)
    PROD_NEWS_CHANNEL: '@ZoneNewsAdl',
    PROD_GROUP_CHAT: '@ZONENEWSGROUP', 
    PROD_TBC_CHAT: -1002393922251,
    
    // Production admin IDs
    PROD_ADMIN_IDS: ['7802629063', '8123893898'],
    
    // Production TBC topics
    PROD_TBC_TOPICS: {
        40149: 'Adelaide Business & Crypto 💼',
        40147: 'Community Events & Lifestyle 🎉'
    }
};

/**
 * Get appropriate channel configuration based on environment
 */
function getChannelConfig() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';
    
    if (isTest || process.env.FORCE_TEST_CHANNELS === 'true') {
        console.log('🧪 Using TEST CHANNELS - Safe for development');
        return {
            newsChannel: TEST_CHANNELS.TEST_NEWS_CHANNEL,
            groupChat: TEST_CHANNELS.TEST_GROUP_CHAT,
            tbcChat: TEST_CHANNELS.TEST_TBC_CHAT,
            adminIds: TEST_CHANNELS.DEV_ADMIN_IDS,
            tbcTopics: TEST_CHANNELS.TEST_TBC_TOPICS,
            environment: 'TEST'
        };
    }
    
    if (isProduction) {
        console.log('🚀 Using PRODUCTION CHANNELS - Live deployment');
        return {
            newsChannel: PRODUCTION_CHANNELS.PROD_NEWS_CHANNEL,
            groupChat: PRODUCTION_CHANNELS.PROD_GROUP_CHAT,
            tbcChat: PRODUCTION_CHANNELS.PROD_TBC_CHAT,
            adminIds: PRODUCTION_CHANNELS.PROD_ADMIN_IDS,
            tbcTopics: PRODUCTION_CHANNELS.PROD_TBC_TOPICS,
            environment: 'PRODUCTION'
        };
    }
    
    // Development environment - default to test channels for safety
    console.log('🔧 Development mode - Using TEST CHANNELS for safety');
    return {
        newsChannel: TEST_CHANNELS.TEST_NEWS_CHANNEL,
        groupChat: TEST_CHANNELS.TEST_GROUP_CHAT,
        tbcChat: TEST_CHANNELS.TEST_TBC_CHAT,
        adminIds: TEST_CHANNELS.DEV_ADMIN_IDS,
        tbcTopics: TEST_CHANNELS.TEST_TBC_TOPICS,
        environment: 'DEVELOPMENT'
    };
}

/**
 * Safety check to prevent accidental production posts
 */
function validateChannelSafety(channelId, messageContent) {
    const config = getChannelConfig();
    
    // Prevent posting to production channels unless in production
    const productionChannels = [
        PRODUCTION_CHANNELS.PROD_NEWS_CHANNEL,
        PRODUCTION_CHANNELS.PROD_GROUP_CHAT,
        PRODUCTION_CHANNELS.PROD_TBC_CHAT
    ];
    
    const isProductionChannel = productionChannels.includes(channelId);
    const isProductionEnv = process.env.NODE_ENV === 'production';
    
    if (isProductionChannel && !isProductionEnv) {
        throw new Error(
            `🚨 SAFETY CHECK FAILED: Attempted to post to production channel ${channelId} ` +
            `in ${process.env.NODE_ENV || 'development'} environment. ` +
            `Set NODE_ENV=production to post to production channels.`
        );
    }
    
    // Log all posts for audit trail
    console.log(`📝 POST AUDIT: [${config.environment}] Channel: ${channelId}, Message: "${messageContent?.substring(0, 50)}..."`);
    
    return true;
}

/**
 * Get test-safe admin IDs
 */
function getAdminIds() {
    const config = getChannelConfig();
    return config.adminIds;
}

/**
 * Check if user is admin in current environment
 */
function isAdmin(userId) {
    const adminIds = getAdminIds();
    return adminIds.includes(userId.toString());
}

/**
 * Get environment-appropriate TBC topics
 */
function getTBCTopics() {
    const config = getChannelConfig();
    return config.tbcTopics;
}

/**
 * Create warning message for non-production environments
 */
function getEnvironmentWarning() {
    const config = getChannelConfig();
    
    if (config.environment !== 'PRODUCTION') {
        return `⚠️ **${config.environment} ENVIRONMENT** ⚠️\n` +
               `This bot is running in ${config.environment.toLowerCase()} mode.\n` +
               `Posts will go to test channels only.\n\n`;
    }
    
    return '';
}

module.exports = {
    getChannelConfig,
    validateChannelSafety,
    getAdminIds,
    isAdmin,
    getTBCTopics,
    getEnvironmentWarning,
    TEST_CHANNELS,
    PRODUCTION_CHANNELS
};