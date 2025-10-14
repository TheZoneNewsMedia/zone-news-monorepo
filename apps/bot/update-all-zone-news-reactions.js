require('dotenv').config();
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const ZONE_NEWS_CHANNEL = '@ZoneNewsAdl';

let db;
let client;

// Connect to database
async function connectDB() {
    try {
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db('zone_news_production');
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}

// Create inline reaction buttons with persistent storage
function createReactionKeyboard(messageKey, existingReactions = {}) {
    const reactions = {
        like: existingReactions.like || 0,
        love: existingReactions.love || 0, 
        fire: existingReactions.fire || 0,
        party: existingReactions.party || 0,
        happy: existingReactions.happy || 0,
        wow: existingReactions.wow || 0
    };

    return {
        inline_keyboard: [
            [
                { text: `👍 ${reactions.like}`, callback_data: `persist_like_${messageKey}` },
                { text: `❤️ ${reactions.love}`, callback_data: `persist_love_${messageKey}` },
                { text: `🔥 ${reactions.fire}`, callback_data: `persist_fire_${messageKey}` }
            ],
            [
                { text: `🎉 ${reactions.party}`, callback_data: `persist_party_${messageKey}` },
                { text: `😊 ${reactions.happy}`, callback_data: `persist_happy_${messageKey}` },
                { text: `😮 ${reactions.wow}`, callback_data: `persist_wow_${messageKey}` }
            ]
        ]
    };
}

// Get messages from database
async function getMessagesFromDatabase() {
    console.log('📊 Getting messages from database...');
    
    const messages = [];
    try {
        const articles = await db.collection('articles').find({
            $or: [
                { 'zone_news_data.channel': '@ZoneNewsAdl' },
                { 'zone_news_data.message_id': { $exists: true } },
                { source: { $regex: 'Zone.*News', $options: 'i' } }
            ]
        }).toArray();
        
        console.log(`📰 Found ${articles.length} articles in database`);
        
        for (const article of articles) {
            if (article.zone_news_data && article.zone_news_data.message_id) {
                messages.push({
                    messageId: article.zone_news_data.message_id,
                    articleId: article._id,
                    title: article.title?.substring(0, 50) || 'Unknown',
                    source: 'database'
                });
            }
        }
        
        console.log(`📋 Found ${messages.length} messages with message IDs`);
        
    } catch (error) {
        console.error('❌ Database query failed:', error.message);
    }
    
    return messages;
}

// Get additional known message IDs
function getKnownMessageIds() {
    // Known working message IDs from previous scripts and observations
    return [
        454, 455, 456, 457, 458, 459, 460, 461, 462, 463,
        449, 450, 451, 452, 453,
        440, 441, 442, 443, 444, 445, 446, 447, 448,
        430, 431, 432, 433, 434, 435, 436, 437, 438, 439
    ].map(messageId => ({
        messageId,
        source: 'known-list',
        title: `Message ${messageId}`
    }));
}

// Get all messages to update
async function getAllMessages() {
    console.log('🔍 Discovering all Zone News channel messages...\n');
    
    // Get from database
    const dbMessages = await getMessagesFromDatabase();
    
    // Get known message IDs
    const knownMessages = getKnownMessageIds();
    
    // Combine and remove duplicates
    const allMessages = [...dbMessages, ...knownMessages];
    const uniqueMessages = allMessages.filter((msg, index, self) => 
        index === self.findIndex(m => m.messageId === msg.messageId)
    );
    
    console.log(`📊 DISCOVERY COMPLETE:`);
    console.log(`   • Database messages: ${dbMessages.length}`);
    console.log(`   • Known messages: ${knownMessages.length}`);
    console.log(`   • Total unique: ${uniqueMessages.length}`);
    
    return uniqueMessages.sort((a, b) => b.messageId - a.messageId);
}

// Update a single message with reaction buttons
async function updateMessageWithReactions(messageData) {
    const { messageId } = messageData;
    const messageKey = `zone_${messageId}`;
    
    try {
        // Check if reactions already exist in database
        const existingReactions = await db.collection('zone_persistent_reactions').findOne({
            message_key: messageKey
        }) || {};
        
        // Create reaction keyboard
        const keyboard = createReactionKeyboard(messageKey, existingReactions.reactions);
        
        // Update message with inline keyboard
        await bot.telegram.editMessageReplyMarkup(
            ZONE_NEWS_CHANNEL,
            messageId,
            null,
            keyboard
        );
        
        // Initialize in database if not exists (use zone_persistent_reactions collection)
        await db.collection('zone_persistent_reactions').updateOne(
            { message_key: messageKey },
            {
                $set: {
                    message_key: messageKey,
                    message_id: messageId,
                    chat_id: ZONE_NEWS_CHANNEL,
                    reactions: existingReactions.reactions || {
                        like: 0, love: 0, fire: 0,
                        party: 0, happy: 0, wow: 0
                    },
                    user_reactions: {},
                    total_count: 0,
                    lastUpdated: new Date(),
                    source: messageData.source || 'update-script'
                }
            },
            { upsert: true }
        );
        
        return { success: true, messageId, messageKey };
        
    } catch (error) {
        return { 
            success: false, 
            messageId, 
            error: error.message,
            code: error.code
        };
    }
}

// Main update function
async function updateAllZoneNewsReactions() {
    console.log('🚀 UPDATING ALL ZONE NEWS POSTS WITH INLINE REACTIONS');
    console.log('====================================================\n');
    
    // Get all messages
    const messages = await getAllMessages();
    
    if (messages.length === 0) {
        console.log('❌ No messages found to update');
        return;
    }
    
    console.log(`🎯 Starting update process for ${messages.length} messages...\n`);
    
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const [index, messageData] of messages.entries()) {
        const progress = `[${index + 1}/${messages.length}]`;
        const title = messageData.title || `Message ${messageData.messageId}`;
        
        console.log(`${progress} Updating message ${messageData.messageId}: ${title}`);
        
        const result = await updateMessageWithReactions(messageData);
        
        if (result.success) {
            console.log(`   ✅ Updated with reactions: ${result.messageKey}`);
            updated++;
        } else {
            if (result.error.includes('message is not modified') || result.error.includes('message to edit not found')) {
                console.log(`   ⏩ Skipped: ${result.error}`);
                skipped++;
            } else {
                console.log(`   ❌ Failed: ${result.error}`);
                failed++;
            }
        }
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 300));
        
        // Progress update every 10 messages
        if ((index + 1) % 10 === 0) {
            console.log(`\n📊 Progress: ${updated} updated, ${failed} failed, ${skipped} skipped\n`);
        }
    }
    
    console.log('\n✅ UPDATE COMPLETE');
    console.log('==================');
    console.log(`📊 Results:`);
    console.log(`   • Total processed: ${messages.length}`);
    console.log(`   • Successfully updated: ${updated}`);
    console.log(`   • Skipped/Not found: ${skipped}`);
    console.log(`   • Failed: ${failed}`);
    console.log(`\n🎯 Zone News posts updated with inline reactions!`);
    console.log(`💾 Reaction data stored in: zone_persistent_reactions collection`);
    console.log(`🔘 Button format: persist_EMOTION_zone_MESSAGEID\n`);
    
    return {
        total: messages.length,
        updated,
        failed, 
        skipped
    };
}

// Main execution
async function main() {
    console.log('🚀 Zone News - Inline Reactions Update System\n');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Cannot start without database connection');
        process.exit(1);
    }
    
    try {
        const results = await updateAllZoneNewsReactions();
        
        console.log('✅ MISSION COMPLETE');
        console.log('===================');
        console.log('🎉 Zone News posts updated with inline reaction buttons!');
        console.log('📱 Users can react with: 👍 ❤️ 🔥 🎉 😊 😮');
        console.log('💾 All reactions are stored and persistent');
        console.log('🔄 Bot handles callback queries automatically\n');
        
    } catch (error) {
        console.error('❌ Fatal error during update:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log('🔐 Database connection closed');
        }
    }
    
    process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⚠️  Shutting down gracefully...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});