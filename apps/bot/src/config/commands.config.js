/**
 * Command Documentation and Configuration
 * Centralized command definitions with help text and usage
 */

const { EMOJI_CONFIG } = require('./emoji.config');

const COMMANDS = {
    // Content Commands
    newarticle: {
        command: 'newarticle',
        description: 'Create a new article',
        usage: '/newarticle',
        emoji: EMOJI_CONFIG.features.post,
        category: 'content',
        interactive: true,
        buttons: [
            { text: '📝 New Article', callback_data: 'cmd_newarticle' },
            { text: '📄 View Drafts', callback_data: 'cmd_drafts' }
        ]
    },
    
    drafts: {
        command: 'drafts',
        description: 'View and manage your saved drafts',
        usage: '/drafts',
        emoji: EMOJI_CONFIG.features.draft,
        category: 'content',
        interactive: true
    },
    
    post: {
        command: 'post',
        description: 'Post content to channels',
        usage: '/post',
        emoji: EMOJI_CONFIG.features.post,
        category: 'content',
        adminOnly: true,
        interactive: true,
        buttons: [
            { text: '📢 Post to Zone News', callback_data: 'post_zone_news' },
            { text: '🌙 Post to TBC', callback_data: 'post_tbc' },
            { text: '📅 Schedule Post', callback_data: 'schedule_post' }
        ]
    },
    
    // Search Commands
    search: {
        command: 'search',
        description: 'Quick search for articles',
        usage: '/search [keywords]',
        example: '/search breaking news',
        emoji: EMOJI_CONFIG.features.search,
        category: 'search',
        interactive: true,
        buttons: [
            { text: '🔍 Quick Search', callback_data: 'cmd_search' },
            { text: '🔬 Advanced Search', callback_data: 'advanced_search' },
            { text: '📈 Trending', callback_data: 'cmd_trending' }
        ]
    },
    
    find: {
        command: 'find',
        description: 'Advanced search with filters',
        usage: '/find',
        emoji: '🔬',
        category: 'search',
        interactive: true
    },
    
    trending: {
        command: 'trending',
        description: 'View trending articles',
        usage: '/trending',
        emoji: EMOJI_CONFIG.features.trending,
        category: 'search',
        interactive: true
    },
    
    // Zone Sync Commands
    synczone: {
        command: 'synczone',
        description: 'Auto-sync new Zone News messages',
        usage: '/synczone',
        emoji: '🔄',
        category: 'sync',
        adminOnly: true
    },
    
    forwardzone: {
        command: 'forwardzone',
        description: 'Manually forward Zone News messages',
        usage: '/forwardzone [message_ids]',
        example: '/forwardzone 606-609',
        emoji: '📤',
        category: 'sync',
        adminOnly: true
    },
    
    checkzone: {
        command: 'checkzone',
        description: 'Check for new Zone News content',
        usage: '/checkzone',
        emoji: '👁️',
        category: 'sync',
        adminOnly: true
    },
    
    // General Commands
    start: {
        command: 'start',
        description: 'Show main menu',
        usage: '/start',
        emoji: EMOJI_CONFIG.menu.home,
        category: 'general',
        interactive: true,
        mainMenu: true
    },
    
    help: {
        command: 'help',
        description: 'Show help and available commands',
        usage: '/help',
        emoji: EMOJI_CONFIG.features.help,
        category: 'general',
        interactive: true
    }
};

// Get commands by category
const getCommandsByCategory = (category) => {
    return Object.values(COMMANDS).filter(cmd => cmd.category === category);
};

// Generate help text for all commands
const generateHelpText = () => {
    const categories = {
        content: '📝 Content Management',
        search: '🔍 Search & Discovery',
        sync: '📡 Zone News Sync',
        general: 'ℹ️ General'
    };
    
    let helpText = '📚 **Available Commands**\n\n';
    
    for (const [cat, title] of Object.entries(categories)) {
        helpText += `**${title}**\n`;
        const commands = getCommandsByCategory(cat);
        
        for (const cmd of commands) {
            helpText += `${cmd.emoji} /${cmd.command}`;
            if (cmd.adminOnly) helpText += ' 👮';
            helpText += ` - ${cmd.description}\n`;
            if (cmd.example) {
                helpText += `   Example: \`${cmd.example}\`\n`;
            }
        }
        helpText += '\n';
    }
    
    helpText += '👮 = Admin only command\n';
    helpText += '💡 Tip: Click any button below to explore features!';
    
    return helpText;
};

// Generate interactive help menu
const getHelpMenu = () => {
    return {
        text: generateHelpText(),
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📝 Create Article', callback_data: 'cmd_newarticle' },
                    { text: '🔍 Search', callback_data: 'cmd_search' }
                ],
                [
                    { text: '📈 Trending', callback_data: 'cmd_trending' },
                    { text: '📄 My Drafts', callback_data: 'cmd_drafts' }
                ],
                [
                    { text: '⚙️ Settings', callback_data: 'settings_menu' },
                    { text: '📊 Analytics', callback_data: 'user_analytics' }
                ],
                [
                    { text: '🏠 Main Menu', callback_data: 'back_to_start' }
                ]
            ]
        }
    };
};

module.exports = {
    COMMANDS,
    getCommandsByCategory,
    generateHelpText,
    getHelpMenu
};