require('dotenv').config();
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';

let db;
let client;

// Connect to database
async function connectDB() {
    try {
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db('zone_news_production');
        console.log('✅ Connected to MongoDB for reaction handling');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}

// Update reaction keyboard with current counts
function createUpdatedReactionKeyboard(messageKey, reactions) {
    return {
        inline_keyboard: [
            [
                { text: `👍 ${reactions.like || 0}`, callback_data: `persist_like_${messageKey}` },
                { text: `❤️ ${reactions.love || 0}`, callback_data: `persist_love_${messageKey}` },
                { text: `🔥 ${reactions.fire || 0}`, callback_data: `persist_fire_${messageKey}` }
            ],
            [
                { text: `🎉 ${reactions.party || 0}`, callback_data: `persist_party_${messageKey}` },
                { text: `😊 ${reactions.happy || 0}`, callback_data: `persist_happy_${messageKey}` },
                { text: `😮 ${reactions.wow || 0}`, callback_data: `persist_wow_${messageKey}` }
            ]
        ]
    };
}

// Handle reaction button clicks
async function handleReactionCallback(ctx) {
    try {
        const callbackData = ctx.callbackQuery.data;
        const userId = ctx.callbackQuery.from.id;
        const messageId = ctx.callbackQuery.message.message_id;
        const chatId = ctx.callbackQuery.message.chat.id;
        
        console.log(`🔄 Processing reaction: ${callbackData} from user ${userId}`);
        
        // Parse callback data: persist_{reaction}_{messageKey}
        const parts = callbackData.split('_');
        if (parts.length < 3 || parts[0] !== 'persist') {
            return await ctx.answerCbQuery('Invalid reaction format');
        }
        
        const reactionType = parts[1]; // like, love, fire, etc.
        const messageKey = parts.slice(2).join('_'); // tbc_57999, etc.
        
        console.log(`   📊 Reaction: ${reactionType}, Message: ${messageKey}`);
        
        // Get current reaction data
        let reactionDoc = await db.collection('zone_persistent_reactions').findOne({
            message_key: messageKey
        });
        
        if (!reactionDoc) {
            console.log(`   ❌ No reaction document found for ${messageKey}`);
            return await ctx.answerCbQuery('Reaction data not found');
        }
        
        // Initialize reaction counts and user tracking
        if (!reactionDoc.reactions) reactionDoc.reactions = {};
        if (!reactionDoc.user_reactions) reactionDoc.user_reactions = {};
        
        // Initialize this reaction type if not exists
        if (!reactionDoc.reactions[reactionType]) reactionDoc.reactions[reactionType] = 0;
        if (!reactionDoc.user_reactions[reactionType]) reactionDoc.user_reactions[reactionType] = [];
        
        // Check if user already reacted with this emoji
        const userReacted = reactionDoc.user_reactions[reactionType].includes(userId);
        let actionText = '';
        
        if (userReacted) {
            // Remove reaction
            reactionDoc.reactions[reactionType] = Math.max(0, reactionDoc.reactions[reactionType] - 1);
            reactionDoc.user_reactions[reactionType] = reactionDoc.user_reactions[reactionType].filter(id => id !== userId);
            actionText = `Removed ${getEmojiForReaction(reactionType)}`;
            console.log(`   ➖ User ${userId} removed ${reactionType} reaction`);
        } else {
            // Add reaction
            reactionDoc.reactions[reactionType]++;
            reactionDoc.user_reactions[reactionType].push(userId);
            actionText = `Added ${getEmojiForReaction(reactionType)}`;
            console.log(`   ➕ User ${userId} added ${reactionType} reaction`);
        }
        
        // Calculate total count
        reactionDoc.total_count = Object.values(reactionDoc.reactions).reduce((sum, count) => sum + count, 0);
        reactionDoc.last_updated = new Date();
        
        // Save to database
        await db.collection('zone_persistent_reactions').replaceOne(
            { message_key: messageKey },
            reactionDoc
        );
        
        // Update message keyboard with new counts
        const updatedKeyboard = createUpdatedReactionKeyboard(messageKey, reactionDoc.reactions);
        
        try {
            await ctx.editMessageReplyMarkup(updatedKeyboard);
            console.log(`   ✅ Updated keyboard for ${messageKey}`);
        } catch (editError) {
            console.log(`   ⚠️  Could not update keyboard: ${editError.message}`);
        }
        
        // Answer the callback query
        await ctx.answerCbQuery(actionText);
        
        console.log(`   📈 Total reactions for ${messageKey}: ${reactionDoc.total_count}`);
        
    } catch (error) {
        console.error('❌ Error handling reaction:', error);
        await ctx.answerCbQuery('Error processing reaction').catch(() => {});
    }
}

// Get emoji for reaction type
function getEmojiForReaction(reactionType) {
    const emojiMap = {
        like: '👍',
        love: '❤️',
        fire: '🔥',
        party: '🎉',
        happy: '😊',
        wow: '😮'
    };
    return emojiMap[reactionType] || '👍';
}

// Test reaction system
async function testReactionSystem() {
    console.log('🧪 Testing reaction system...');
    
    try {
        // Get all reaction documents
        const reactionDocs = await db.collection('zone_persistent_reactions')
            .find({ source: 'forward-to-tbc-mixed' })
            .sort({ created_at: -1 })
            .limit(5)
            .toArray();
        
        console.log(`📊 Found ${reactionDocs.length} reaction-enabled messages:`);
        
        reactionDocs.forEach((doc, index) => {
            const totalReactions = Object.values(doc.reactions || {}).reduce((sum, count) => sum + count, 0);
            console.log(`   ${index + 1}. ${doc.message_key} - ${totalReactions} total reactions`);
            console.log(`      👍 ${doc.reactions?.like || 0} | ❤️ ${doc.reactions?.love || 0} | 🔥 ${doc.reactions?.fire || 0}`);
            console.log(`      🎉 ${doc.reactions?.party || 0} | 😊 ${doc.reactions?.happy || 0} | 😮 ${doc.reactions?.wow || 0}`);
        });
        
        return reactionDocs.length;
        
    } catch (error) {
        console.error('❌ Error testing reaction system:', error);
        return 0;
    }
}

// Start reaction service
async function startReactionService() {
    console.log('🚀 Starting TBC Reaction Handler Service...');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Cannot start without database connection');
        process.exit(1);
    }
    
    // Test the reaction system
    const reactionCount = await testReactionSystem();
    
    if (reactionCount === 0) {
        console.log('⚠️  No reaction-enabled messages found');
        console.log('Run the TBC forwarder first to create messages with reactions');
        process.exit(1);
    }
    
    // Set up callback query handler for all persistent reactions
    bot.on('callback_query', async (ctx) => {
        const callbackData = ctx.callbackQuery?.data;
        
        if (callbackData && callbackData.startsWith('persist_')) {
            await handleReactionCallback(ctx);
        }
    });
    
    console.log('✅ Reaction handlers registered');
    console.log('🎯 Listening for reaction button clicks...');
    console.log('📱 Users can now react to TBC messages with: 👍 ❤️ 🔥 🎉 😊 😮');
    
    // Start the bot
    await bot.launch();
    
    // Graceful stop
    process.once('SIGINT', () => {
        console.log('\n⚠️  Stopping reaction service...');
        bot.stop('SIGINT');
        if (client) client.close();
    });
    
    process.once('SIGTERM', () => {
        console.log('\n⚠️  Stopping reaction service...');
        bot.stop('SIGTERM');
        if (client) client.close();
    });
    
    console.log('🔄 TBC Reaction Service is running...');
}

// Main execution
if (require.main === module) {
    startReactionService().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    handleReactionCallback,
    testReactionSystem,
    createUpdatedReactionKeyboard
};