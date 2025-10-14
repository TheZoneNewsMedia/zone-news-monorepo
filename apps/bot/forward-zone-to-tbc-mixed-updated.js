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

// Simple forward (for first message)
async function forwardMessageToTBC(zoneMessageId) {
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
        
        const tbcMessageId = forwardedMessage.message_id;
        
        console.log(`   ✅ Forwarded: Zone ${zoneMessageId} → TBC ${tbcMessageId} (no buttons)`);
        
        return {
            success: true,
            zoneMessageId,
            tbcMessageId,
            method: 'forward'
        };
        
    } catch (error) {
        console.error(`   ❌ Failed to forward message ${zoneMessageId}:`, error.message);
        return {
            success: false,
            zoneMessageId,
            error: error.message,
            method: 'forward'
        };
    }
}

// Copy with inline buttons (for subsequent messages)
async function copyMessageToTBCWithButtons(zoneMessageId) {
    try {
        console.log(`📋 Copying Zone News message ${zoneMessageId} to TBC with buttons...`);
        
        // First, get the original message content by forwarding to admin
        const adminId = process.env.ADMIN_IDS?.split(',')[0];
        if (!adminId) {
            throw new Error('No admin ID configured');
        }
        
        // Forward to admin to get message content
        const tempForward = await bot.telegram.forwardMessage(
            adminId,
            ZONE_NEWS_CHANNEL,
            zoneMessageId
        );
        
        // Extract message content AND entities (for formatting)
        const messageText = tempForward.text || tempForward.caption || '';
        const messageEntities = tempForward.entities || tempForward.caption_entities || [];
        const hasPhoto = !!tempForward.photo;
        const hasVideo = !!tempForward.video;
        const hasDocument = !!tempForward.document;
        
        // Delete the temp forward immediately
        await bot.telegram.deleteMessage(adminId, tempForward.message_id);
        
        // Now send the message to TBC topic with inline buttons
        const messageKey = `tbc_copy_${zoneMessageId}`;
        const keyboard = createTBCReactionKeyboard(messageKey);
        
        let sentMessage;
        
        if (hasPhoto && tempForward.photo) {
            // Send photo with caption and buttons
            const photoId = tempForward.photo[tempForward.photo.length - 1].file_id;
            sentMessage = await bot.telegram.sendPhoto(
                TBC_GROUP,
                photoId,
                {
                    caption: messageText,
                    caption_entities: messageEntities,
                    reply_markup: keyboard,
                    message_thread_id: TBC_TOPIC_ID
                }
            );
        } else if (hasVideo && tempForward.video) {
            // Send video with caption and buttons
            sentMessage = await bot.telegram.sendVideo(
                TBC_GROUP,
                tempForward.video.file_id,
                {
                    caption: messageText,
                    caption_entities: messageEntities,
                    reply_markup: keyboard,
                    message_thread_id: TBC_TOPIC_ID
                }
            );
        } else if (hasDocument && tempForward.document) {
            // Send document with caption and buttons
            sentMessage = await bot.telegram.sendDocument(
                TBC_GROUP,
                tempForward.document.file_id,
                {
                    caption: messageText,
                    caption_entities: messageEntities,
                    reply_markup: keyboard,
                    message_thread_id: TBC_TOPIC_ID
                }
            );
        } else {
            // Send text message with buttons
            sentMessage = await bot.telegram.sendMessage(
                TBC_GROUP,
                messageText || 'Zone News Update',
                {
                    entities: messageEntities,
                    reply_markup: keyboard,
                    message_thread_id: TBC_TOPIC_ID
                }
            );
        }
        
        const tbcMessageId = sentMessage.message_id;
        const finalMessageKey = `tbc_${tbcMessageId}`;
        
        console.log(`   ✅ Copied: Zone ${zoneMessageId} → TBC ${tbcMessageId}`);
        console.log(`   ✅ Added reaction buttons to TBC message ${tbcMessageId}`);
        
        // Update the message key to use the actual TBC message ID
        await bot.telegram.editMessageReplyMarkup(
            TBC_GROUP,
            tbcMessageId,
            null,
            createTBCReactionKeyboard(finalMessageKey)
        );
        
        // Store in database for reaction tracking AND sync mapping
        await db.collection('zone_persistent_reactions').updateOne(
            { message_key: finalMessageKey },
            {
                $set: {
                    message_key: finalMessageKey,
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
                    source_channel_id: -1002796395391,
                    target_topic: TBC_TOPIC_ID,
                    created_at: new Date(),
                    source: 'forward-to-tbc-mixed',
                    sync_enabled: true,
                    last_synced: new Date()
                }
            },
            { upsert: true }
        );
        
        // Also store sync mapping for future edits
        await db.collection('zone_tbc_sync_mapping').updateOne(
            { zone_message_id: zoneMessageId },
            {
                $set: {
                    zone_message_id: zoneMessageId,
                    zone_channel_id: -1002796395391,
                    tbc_message_id: tbcMessageId,
                    tbc_group_id: TBC_GROUP,
                    tbc_topic_id: TBC_TOPIC_ID,
                    created_at: new Date(),
                    sync_enabled: true,
                    last_synced: new Date()
                }
            },
            { upsert: true }
        );
        
        console.log(`   ✅ Stored reaction tracking for ${finalMessageKey}`);
        
        return {
            success: true,
            zoneMessageId,
            tbcMessageId,
            messageKey: finalMessageKey,
            contentType: hasPhoto ? 'photo' : hasVideo ? 'video' : hasDocument ? 'document' : 'text',
            method: 'copy_with_buttons'
        };
        
    } catch (error) {
        console.error(`   ❌ Failed to copy message ${zoneMessageId}:`, error.message);
        return {
            success: false,
            zoneMessageId,
            error: error.message,
            method: 'copy_with_buttons'
        };
    }
}

// Main forwarding function (mixed mode)
async function forwardZoneNewsToTBC() {
    console.log('🚀 FORWARDING ZONE NEWS TO TBC - MIXED MODE');
    console.log('===========================================\n');
    
    // Messages 601-605 - forward 601, copy 602-605 with buttons
    const messagesToForward = [601, 602, 603, 604, 605];
    
    console.log(`📋 Messages to forward: ${messagesToForward.join(', ')}`);
    console.log(`📍 Source: ${ZONE_NEWS_CHANNEL}`);
    console.log(`📍 Target: ${TBC_GROUP} (topic ${TBC_TOPIC_ID})`);
    console.log(`🔘 Method: First = Forward, Rest = Copy with Inline Buttons\n`);
    
    let forwarded = 0;
    let failed = 0;
    const results = [];
    
    for (const [index, messageId] of messagesToForward.entries()) {
        const progress = `[${index + 1}/${messagesToForward.length}]`;
        const isFirst = index === 0;
        const method = isFirst ? 'FORWARD' : 'COPY WITH BUTTONS';
        
        console.log(`${progress} Processing Zone News message ${messageId} (${method})`);
        
        let result;
        if (isFirst) {
            // First message (601): Simple forward
            result = await forwardMessageToTBC(messageId);
        } else {
            // Subsequent messages (602-605): Copy with inline buttons
            result = await copyMessageToTBCWithButtons(messageId);
        }
        
        results.push(result);
        
        if (result.success) {
            forwarded++;
            const details = result.messageKey ? ` (${result.messageKey})` : '';
            const contentInfo = result.contentType ? ` [${result.contentType}]` : '';
            console.log(`   🎯 Success: ${result.method}${details}${contentInfo}\n`);
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
    console.log(`\n🎯 TBC messages ready!`);
    console.log(`📤 First message (${messagesToForward[0]}): Simple forward`);
    console.log(`📱 Other messages: Interactive with reactions (👍 ❤️ 🔥 🎉 😊 😮)`);
    console.log(`💾 Reaction data stored in: zone_persistent_reactions collection\n`);
    
    if (forwarded > 0) {
        console.log('📋 Successfully processed messages:');
        results.filter(r => r.success).forEach(r => {
            const details = r.messageKey ? ` → ${r.messageKey}` : '';
            console.log(`   • ${r.method}: Zone ${r.zoneMessageId} → TBC ${r.tbcMessageId}${details}`);
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
    console.log('🚀 Zone News → TBC Mixed Forwarding System\n');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Cannot start without database connection');
        process.exit(1);
    }
    
    try {
        const results = await forwardZoneNewsToTBC();
        
        if (results.forwarded > 0) {
            console.log('\n✅ MISSION ACCOMPLISHED');
            console.log('========================');
            console.log('🎉 Zone News messages forwarded to TBC!');
            console.log('📤 First message: Clean forward (no buttons)');
            console.log('📱 Other messages: Interactive reaction buttons');
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