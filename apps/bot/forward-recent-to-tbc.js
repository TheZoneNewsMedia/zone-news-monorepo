require('dotenv').config();
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';

// Channel configuration
const ZONE_NEWS_CHANNEL = '@ZoneNewsAdl';
const TBC_GROUP = -1002665614394;  // TBC group ID
const TBC_TOPIC_ID = 40149;

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

// Create inline reaction buttons for TBC messages
function createTBCReactionKeyboard(messageKey, existingReactions = {}) {
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

// Forward a single message with inline buttons
async function forwardMessageWithButtons(zoneMessageId) {
    try {
        console.log(`📤 Forwarding Zone News message ${zoneMessageId} to TBC...`);
        
        // Forward the message to TBC topic
        const forwardedMessage = await bot.telegram.forwardMessage(
            TBC_GROUP,
            ZONE_NEWS_CHANNEL,
            zoneMessageId,
            {
                message_thread_id: TBC_TOPIC_ID
            }
        );
        
        if (!forwardedMessage) {
            throw new Error('Failed to forward message');
        }
        
        const tbcMessageId = forwardedMessage.message_id;
        const messageKey = `tbc_${tbcMessageId}`;
        
        console.log(`   ✅ Forwarded: Zone ${zoneMessageId} → TBC ${tbcMessageId}`);
        
        // Add inline reaction buttons
        const keyboard = createTBCReactionKeyboard(messageKey);
        
        await bot.telegram.editMessageReplyMarkup(
            TBC_GROUP,
            tbcMessageId,
            null,
            keyboard
        );
        
        console.log(`   ✅ Added reaction buttons to TBC message ${tbcMessageId}`);
        
        // Store in database for reaction tracking
        await db.collection('zone_persistent_reactions').updateOne(
            { message_key: messageKey },
            {
                $set: {
                    message_key: messageKey,
                    message_id: tbcMessageId,
                    chat_id: TBC_GROUP,
                    reactions: {
                        like: 0, love: 0, fire: 0,
                        party: 0, happy: 0, wow: 0
                    },
                    user_reactions: {},
                    total_count: 0,
                    source_message_id: zoneMessageId,
                    source_channel: ZONE_NEWS_CHANNEL,
                    target_topic: TBC_TOPIC_ID,
                    created_at: new Date(),
                    source: 'forward-to-tbc'
                }
            },
            { upsert: true }
        );
        
        console.log(`   ✅ Stored reaction tracking for ${messageKey}`);
        
        return {
            success: true,
            zoneMessageId,
            tbcMessageId,
            messageKey
        };
        
    } catch (error) {
        console.error(`   ❌ Failed to forward message ${zoneMessageId}:`, error.message);
        return {
            success: false,
            zoneMessageId,
            error: error.message
        };
    }
}

// Main forwarding function
async function forwardRecentMessages() {
    console.log('🚀 FORWARDING RECENT ZONE NEWS TO TBC WITH REACTIONS');
    console.log('===================================================\n');
    
    // The 5 recent messages from Zone News (468-472)
    const messagesToForward = [468, 469, 470, 471, 472];
    
    console.log(`📋 Messages to forward: ${messagesToForward.join(', ')}`);
    console.log(`📍 Source: ${ZONE_NEWS_CHANNEL}`);
    console.log(`📍 Target: ${TBC_GROUP} (topic ${TBC_TOPIC_ID})`);
    console.log(`🔘 With inline reaction buttons\n`);
    
    let forwarded = 0;
    let failed = 0;
    const results = [];
    
    for (const [index, messageId] of messagesToForward.entries()) {
        const progress = `[${index + 1}/${messagesToForward.length}]`;
        console.log(`${progress} Processing Zone News message ${messageId}`);
        
        const result = await forwardMessageWithButtons(messageId);
        results.push(result);
        
        if (result.success) {
            forwarded++;
            console.log(`   🎯 Success: ${result.messageKey} ready for reactions\n`);
        } else {
            failed++;
            console.log(`   💥 Failed: ${result.error}\n`);
        }
        
        // Rate limiting between forwards
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log('✅ FORWARDING COMPLETE');
    console.log('======================');
    console.log(`📊 Results:`);
    console.log(`   • Total processed: ${messagesToForward.length}`);
    console.log(`   • Successfully forwarded: ${forwarded}`);
    console.log(`   • Failed: ${failed}`);
    console.log(`\n🎯 TBC messages now have inline reactions!`);
    console.log(`📱 Users can react with: 👍 ❤️ 🔥 🎉 😊 😮`);
    console.log(`💾 Reaction data stored in: zone_persistent_reactions collection\n`);
    
    if (forwarded > 0) {
        console.log('📋 Successfully forwarded messages:');
        results.filter(r => r.success).forEach(r => {
            console.log(`   • Zone ${r.zoneMessageId} → TBC ${r.tbcMessageId} (${r.messageKey})`);
        });
    }
    
    return {
        total: messagesToForward.length,
        forwarded,
        failed,
        results
    };
}

// Main execution
async function main() {
    console.log('🚀 Zone News → TBC Forwarding with Reactions\n');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Cannot start without database connection');
        process.exit(1);
    }
    
    try {
        const results = await forwardRecentMessages();
        
        if (results.forwarded > 0) {
            console.log('\n✅ MISSION ACCOMPLISHED');
            console.log('========================');
            console.log('🎉 Recent Zone News messages forwarded to TBC!');
            console.log('📱 All forwarded messages have interactive reaction buttons');
            console.log('🔄 Bot handles all reaction callbacks automatically');
            console.log('💾 All reactions are tracked and persistent');
        } else {
            console.log('\n⚠️  NO MESSAGES FORWARDED');
            console.log('Check if the messages exist and bot has permissions');
        }
        
    } catch (error) {
        console.error('❌ Fatal error during forwarding:', error);
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