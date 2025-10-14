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

// Delete recent forwards from TBC
async function deleteRecentForwards() {
    console.log('🗑️  DELETING RECENT FORWARDS IN TBC');
    console.log('===================================\n');
    
    // The forwarded messages we need to delete
    const forwardedMessages = [57808, 57809, 57810, 57811, 57812];
    
    let deleted = 0;
    let failed = 0;
    
    for (const messageId of forwardedMessages) {
        try {
            await bot.telegram.deleteMessage(TBC_GROUP, messageId);
            console.log(`   ✅ Deleted TBC message ${messageId}`);
            deleted++;
        } catch (error) {
            console.log(`   ❌ Failed to delete TBC message ${messageId}: ${error.message}`);
            failed++;
        }
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`\n📊 Deletion results: ${deleted} deleted, ${failed} failed\n`);
    return { deleted, failed };
}

// Copy a message from Zone News to TBC with content and buttons
async function copyMessageToTBC(zoneMessageId) {
    try {
        console.log(`📋 Copying Zone News message ${zoneMessageId} to TBC...`);
        
        // First, get the original message content by forwarding to admin, then copying content
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
        
        // Extract message content
        const messageText = tempForward.text || tempForward.caption || '';
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
                    reply_markup: keyboard,
                    message_thread_id: TBC_TOPIC_ID,
                    parse_mode: 'HTML'
                }
            );
        } else if (hasVideo && tempForward.video) {
            // Send video with caption and buttons
            sentMessage = await bot.telegram.sendVideo(
                TBC_GROUP,
                tempForward.video.file_id,
                {
                    caption: messageText,
                    reply_markup: keyboard,
                    message_thread_id: TBC_TOPIC_ID,
                    parse_mode: 'HTML'
                }
            );
        } else if (hasDocument && tempForward.document) {
            // Send document with caption and buttons
            sentMessage = await bot.telegram.sendDocument(
                TBC_GROUP,
                tempForward.document.file_id,
                {
                    caption: messageText,
                    reply_markup: keyboard,
                    message_thread_id: TBC_TOPIC_ID,
                    parse_mode: 'HTML'
                }
            );
        } else {
            // Send text message with buttons
            sentMessage = await bot.telegram.sendMessage(
                TBC_GROUP,
                messageText || 'Zone News Update',
                {
                    reply_markup: keyboard,
                    message_thread_id: TBC_TOPIC_ID,
                    parse_mode: 'HTML'
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
        
        // Store in database for reaction tracking
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
                    target_topic: TBC_TOPIC_ID,
                    created_at: new Date(),
                    source: 'copy-to-tbc'
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
            contentType: hasPhoto ? 'photo' : hasVideo ? 'video' : hasDocument ? 'document' : 'text'
        };
        
    } catch (error) {
        console.error(`   ❌ Failed to copy message ${zoneMessageId}:`, error.message);
        return {
            success: false,
            zoneMessageId,
            error: error.message
        };
    }
}

// Main copying function
async function copyRecentMessages() {
    console.log('📋 COPYING ZONE NEWS TO TBC WITH INLINE BUTTONS');
    console.log('===============================================\n');
    
    // The 5 recent messages from Zone News (468-472)
    const messagesToCopy = [468, 469, 470, 471, 472];
    
    console.log(`📋 Messages to copy: ${messagesToCopy.join(', ')}`);
    console.log(`📍 Source: ${ZONE_NEWS_CHANNEL}`);
    console.log(`📍 Target: ${TBC_GROUP} (topic ${TBC_TOPIC_ID})`);
    console.log(`🔘 With inline reaction buttons\n`);
    
    let copied = 0;
    let failed = 0;
    const results = [];
    
    for (const [index, messageId] of messagesToCopy.entries()) {
        const progress = `[${index + 1}/${messagesToCopy.length}]`;
        console.log(`${progress} Processing Zone News message ${messageId}`);
        
        const result = await copyMessageToTBC(messageId);
        results.push(result);
        
        if (result.success) {
            copied++;
            console.log(`   🎯 Success: ${result.messageKey} (${result.contentType}) ready for reactions\n`);
        } else {
            failed++;
            console.log(`   💥 Failed: ${result.error}\n`);
        }
        
        // Rate limiting between copies
        await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log('✅ COPYING COMPLETE');
    console.log('===================');
    console.log(`📊 Results:`);
    console.log(`   • Total processed: ${messagesToCopy.length}`);
    console.log(`   • Successfully copied: ${copied}`);
    console.log(`   • Failed: ${failed}`);
    console.log(`\n🎯 TBC messages now have inline reactions!`);
    console.log(`📱 Users can react with: 👍 ❤️ 🔥 🎉 😊 😮`);
    console.log(`💾 Reaction data stored in: zone_persistent_reactions collection\n`);
    
    if (copied > 0) {
        console.log('📋 Successfully copied messages:');
        results.filter(r => r.success).forEach(r => {
            console.log(`   • Zone ${r.zoneMessageId} → TBC ${r.tbcMessageId} (${r.messageKey})`);
        });
    }
    
    return {
        total: messagesToCopy.length,
        copied,
        failed,
        results
    };
}

// Main execution
async function main() {
    console.log('🚀 Zone News → TBC Copy with Reactions\n');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Cannot start without database connection');
        process.exit(1);
    }
    
    try {
        // Step 1: Delete recent forwards
        console.log('🗑️  STEP 1: Delete recent forwards');
        const deleteResults = await deleteRecentForwards();
        
        // Step 2: Copy messages with inline buttons
        console.log('📋 STEP 2: Copy messages with inline buttons');
        const copyResults = await copyRecentMessages();
        
        if (copyResults.copied > 0) {
            console.log('\n✅ MISSION ACCOMPLISHED');
            console.log('========================');
            console.log('🎉 Zone News messages copied to TBC!');
            console.log('📱 All copied messages have interactive reaction buttons');
            console.log('🔄 Bot handles all reaction callbacks automatically');
            console.log('💾 All reactions are tracked and persistent');
            console.log(`🗑️  Deleted ${deleteResults.deleted} old forwards`);
        } else {
            console.log('\n⚠️  NO MESSAGES COPIED');
            console.log('Check if the messages exist and bot has permissions');
        }
        
    } catch (error) {
        console.error('❌ Fatal error during operation:', error);
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