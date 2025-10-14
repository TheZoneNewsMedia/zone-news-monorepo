const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');

// Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

// Security check
if (!BOT_TOKEN) {
    console.error('❌ CRITICAL: Bot token not found in environment variables');
    console.error('Please set TELEGRAM_BOT_TOKEN or BOT_TOKEN in your .env file');
    process.exit(1);
}
const CHANNEL_ID = '@ZoneNewsAdl';
const MONGODB_URI = 'mongodb://localhost:27017/zone_news_production';
const ADMIN_IDS = [7802629063, 8123893898]; // Duke Exxotic and @TheZoneNews

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// MongoDB connection
let db;
MongoClient.connect(MONGODB_URI).then(client => {
    db = client.db('zone_news_production');
    console.log('✅ Connected to MongoDB');
}).catch(console.error);

// State management
const userStates = new Map();

// /post command - initiate posting wizard
bot.onText(/^\/post/, async (msg) => {
    const userId = msg.from.id;
    
    // Check if admin
    if (!ADMIN_IDS.includes(userId)) {
        return bot.sendMessage(msg.chat.id, '❌ This command is only for administrators.');
    }
    
    // Get most recent article from database
    const article = await db.collection('news_articles')
        .findOne(
            { 'zone_news_data.channel': '@ZoneNewsAdl' },
            { sort: { published_date: -1 } }
        );
    
    if (!article) {
        return bot.sendMessage(msg.chat.id, '❌ No articles found in database.');
    }
    
    // Format the article with proper link
    const messageId = article.zone_news_data?.message_id;
    const articleLink = messageId ? 
        `https://t.me/ZoneNewsAdl/${messageId}` : 
        article.url || 'https://thezonenews.com';
    
    const contentPreview = article.content ? 
        article.content.substring(0, 800) : 
        article.title;
    
    const postDate = new Date(article.published_date).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    const message = `📰 *${article.title}*

${contentPreview}...

📅 ${postDate}
📂 ${article.category || 'General News'}
👁 ${article.views || 0} views

#ZoneNews #Adelaide #Breaking`;
    
    // Store article for confirmation
    userStates.set(userId, {
        step: 'confirm_post',
        article: article,
        message: message,
        link: articleLink
    });
    
    // Send preview with inline keyboard
    await bot.sendMessage(msg.chat.id, 
        `📝 *Preview of Post:*\n\n${message}`, 
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Post to Channel', callback_data: 'post_confirm' },
                        { text: '❌ Cancel', callback_data: 'post_cancel' }
                    ],
                    [
                        { text: '📝 Edit Text', callback_data: 'post_edit' },
                        { text: '🔄 Next Article', callback_data: 'post_next' }
                    ]
                ]
            }
        }
    );
});

// /testpost command - send test to user only
bot.onText(/^\/testpost/, async (msg) => {
    const userId = msg.from.id;
    
    if (!ADMIN_IDS.includes(userId)) {
        return bot.sendMessage(msg.chat.id, '❌ Admin only command.');
    }
    
    // Get most recent article
    const article = await db.collection('news_articles')
        .findOne(
            { 'zone_news_data.channel': '@ZoneNewsAdl' },
            { sort: { published_date: -1 } }
        );
    
    if (!article) {
        return bot.sendMessage(msg.chat.id, '❌ No articles found.');
    }
    
    const messageId = article.zone_news_data?.message_id;
    const articleLink = messageId ? 
        `https://t.me/ZoneNewsAdl/${messageId}` : 
        article.url || 'https://thezonenews.com';
    
    const contentPreview = article.content ? 
        article.content.substring(0, 800) : 
        article.title;
    
    const postDate = new Date(article.published_date).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    const message = `📰 *${article.title}*

${contentPreview}...

📅 ${postDate}
📂 ${article.category || 'General News'}
👁 ${article.views || 0} views

#ZoneNews #Adelaide #Breaking`;
    
    // Send test with inline buttons
    await bot.sendMessage(msg.chat.id, message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📖 Read Full Article', url: articleLink },
                    { text: '🔗 Share', url: `https://t.me/share/url?url=${encodeURIComponent(articleLink)}&text=${encodeURIComponent(article.title)}` }
                ],
                [
                    { text: '👍', callback_data: 'like_test' },
                    { text: '❤️', callback_data: 'love_test' },
                    { text: '🔥', callback_data: 'fire_test' },
                    { text: '😂', callback_data: 'laugh_test' }
                ]
            ]
        }
    });
    
    await bot.sendMessage(msg.chat.id, '✅ Test post sent (only visible to you)');
});

// Handle callback queries
bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const data = query.data;
    const state = userStates.get(userId);
    
    if (data === 'post_confirm' && state) {
        // Post to channel with inline buttons
        const articleLink = state.link;
        
        try {
            const result = await bot.sendMessage(CHANNEL_ID, state.message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📖 Read Full Article', url: articleLink },
                            { text: '🔗 Share', url: `https://t.me/share/url?url=${encodeURIComponent(articleLink)}&text=${encodeURIComponent(state.article.title)}` }
                        ],
                        [
                            { text: '👍 0', callback_data: 'like_0' },
                            { text: '❤️ 0', callback_data: 'love_0' },
                            { text: '🔥 0', callback_data: 'fire_0' },
                            { text: '😂 0', callback_data: 'laugh_0' }
                        ]
                    ]
                }
            });
            
            await bot.answerCallbackQuery(query.id, { text: '✅ Posted successfully!' });
            await bot.sendMessage(query.message.chat.id, 
                `✅ Posted to @ZoneNewsAdl!\n🔗 View: https://t.me/ZoneNewsAdl/${result.message_id}`
            );
            
            // Clear state
            userStates.delete(userId);
            
        } catch (error) {
            await bot.answerCallbackQuery(query.id, { text: '❌ Failed to post' });
            console.error('Post error:', error);
        }
        
    } else if (data === 'post_cancel') {
        userStates.delete(userId);
        await bot.answerCallbackQuery(query.id, { text: 'Cancelled' });
        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
        
    } else if (data === 'post_next' && state) {
        // Get next article
        const nextArticle = await db.collection('news_articles')
            .findOne(
                { 
                    'zone_news_data.channel': '@ZoneNewsAdl',
                    published_date: { $lt: state.article.published_date }
                },
                { sort: { published_date: -1 } }
            );
        
        if (!nextArticle) {
            return bot.answerCallbackQuery(query.id, { text: 'No more articles' });
        }
        
        // Update state with new article
        const messageId = nextArticle.zone_news_data?.message_id;
        const articleLink = messageId ? 
            `https://t.me/ZoneNewsAdl/${messageId}` : 
            nextArticle.url || 'https://thezonenews.com';
        
        const contentPreview = nextArticle.content ? 
            nextArticle.content.substring(0, 800) : 
            nextArticle.title;
        
        const postDate = new Date(nextArticle.published_date).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        
        const message = `📰 *${nextArticle.title}*

${contentPreview}...

📅 ${postDate}
📂 ${nextArticle.category || 'General News'}
👁 ${nextArticle.views || 0} views

#ZoneNews #Adelaide #Breaking`;
        
        userStates.set(userId, {
            step: 'confirm_post',
            article: nextArticle,
            message: message,
            link: articleLink
        });
        
        // Update message
        await bot.editMessageText(
            `📝 *Preview of Post:*\n\n${message}`,
            {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Post to Channel', callback_data: 'post_confirm' },
                            { text: '❌ Cancel', callback_data: 'post_cancel' }
                        ],
                        [
                            { text: '📝 Edit Text', callback_data: 'post_edit' },
                            { text: '🔄 Next Article', callback_data: 'post_next' }
                        ]
                    ]
                }
            }
        );
        
        await bot.answerCallbackQuery(query.id, { text: 'Next article loaded' });
        
    } else if (data.startsWith('like_') || data.startsWith('love_') || data.startsWith('fire_') || data.startsWith('laugh_')) {
        // Handle test reactions
        await bot.answerCallbackQuery(query.id, { text: '✅ Reaction noted!' });
    }
});

// /start command
bot.onText(/^\/start/, (msg) => {
    const welcomeText = `🗞️ *Zone News Posting Bot*

Available commands:
/post - Post article to @ZoneNewsAdl channel
/testpost - Send test post (only to you)
/help - Show this help message

*Admin only* - Duke Exxotic & @TheZoneNews`;

    bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'Markdown' });
});

// /help command
bot.onText(/^\/help/, (msg) => {
    const helpText = `📚 *Posting Bot Commands*

/post - Opens posting wizard to select and post articles
/testpost - Sends a test post only to you
/start - Welcome message
/help - This help message

*Features:*
• Select articles from database
• Preview before posting
• Inline buttons for engagement
• Share functionality
• Reaction tracking`;

    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

console.log('🚀 Zone News Posting Bot started');
console.log('📡 Channel: @ZoneNewsAdl');
console.log('👥 Admins:', ADMIN_IDS);