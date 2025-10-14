require('dotenv').config();
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';

// Configuration
const SOURCE_CHANNEL = '@ZoneNewsAdelaideA';  // Source channel
const DEST_CHANNEL = '@ZoneNewsAdl';          // Destination Zone News channel

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

// Create persistent reaction keyboard for Zone News
function createZoneNewsReactionKeyboard(messageKey, reactions = {}) {
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

// Store reaction data in database
async function storeReactionData(messageKey, messageId, sourceMessageId) {
    try {
        await db.collection('zone_persistent_reactions').updateOne(
            { message_key: messageKey },
            {
                $set: {
                    message_key: messageKey,
                    message_id: messageId,
                    chat_id: DEST_CHANNEL,
                    reactions: {
                        like: 0, love: 0, fire: 0,
                        party: 0, happy: 0, wow: 0
                    },
                    user_reactions: {},
                    total_count: 0,
                    source_message_id: sourceMessageId,
                    source_channel: SOURCE_CHANNEL,
                    created_at: new Date(),
                    source: 'zone-news-posting'
                }
            },
            { upsert: true }
        );
        
        console.log(`   ✅ Stored reaction tracking for ${messageKey}`);
    } catch (error) {
        console.error(`   ❌ Failed to store reaction data for ${messageKey}:`, error.message);
    }
}

// Forward a message (for first message)
async function forwardMessage(sourceMessageId) {
    try {
        console.log(`   📤 Forwarding message ${sourceMessageId} to ${DEST_CHANNEL}...`);
        
        const forwardedMessage = await bot.telegram.forwardMessage(
            DEST_CHANNEL,
            SOURCE_CHANNEL,
            sourceMessageId
        );
        
        const destMessageId = forwardedMessage.message_id;
        console.log(`   ✅ Forwarded: ${SOURCE_CHANNEL}/${sourceMessageId} → ${DEST_CHANNEL}/${destMessageId}`);
        
        return {
            success: true,
            sourceMessageId,
            destMessageId,
            method: 'forward'
        };
        
    } catch (error) {
        console.error(`   ❌ Failed to forward message ${sourceMessageId}:`, error.message);
        return {
            success: false,
            sourceMessageId,
            error: error.message,
            method: 'forward'
        };
    }
}

// Copy a message with inline buttons (for subsequent messages)
async function copyMessageWithButtons(sourceMessageId) {
    try {
        console.log(`   📋 Copying message ${sourceMessageId} with inline buttons...`);
        
        // First forward to admin to get content, then copy to destination
        const adminId = process.env.ADMIN_IDS?.split(',')[0];
        if (!adminId) {
            throw new Error('No admin ID configured for content extraction');
        }
        
        // Forward to admin temporarily to extract content
        const tempForward = await bot.telegram.forwardMessage(
            adminId,
            SOURCE_CHANNEL,
            sourceMessageId
        );
        
        // Extract content
        const messageText = tempForward.text || tempForward.caption || '';
        const hasPhoto = !!tempForward.photo;
        const hasVideo = !!tempForward.video;
        const hasDocument = !!tempForward.document;
        
        // Delete temp forward
        await bot.telegram.deleteMessage(adminId, tempForward.message_id);
        
        // Create reaction keyboard
        const messageKey = `zone_${sourceMessageId}_copy`;
        const keyboard = createZoneNewsReactionKeyboard(messageKey);
        
        let sentMessage;
        
        // Send to destination with appropriate content type
        if (hasPhoto && tempForward.photo) {
            const photoId = tempForward.photo[tempForward.photo.length - 1].file_id;
            sentMessage = await bot.telegram.sendPhoto(
                DEST_CHANNEL,
                photoId,
                {
                    caption: messageText,
                    reply_markup: keyboard,
                    parse_mode: 'HTML'
                }
            );
        } else if (hasVideo && tempForward.video) {
            sentMessage = await bot.telegram.sendVideo(
                DEST_CHANNEL,
                tempForward.video.file_id,
                {
                    caption: messageText,
                    reply_markup: keyboard,
                    parse_mode: 'HTML'
                }
            );
        } else if (hasDocument && tempForward.document) {
            sentMessage = await bot.telegram.sendDocument(
                DEST_CHANNEL,
                tempForward.document.file_id,
                {
                    caption: messageText,
                    reply_markup: keyboard,
                    parse_mode: 'HTML'
                }
            );
        } else {
            sentMessage = await bot.telegram.sendMessage(
                DEST_CHANNEL,
                messageText || 'Zone News Update',
                {
                    reply_markup: keyboard,
                    parse_mode: 'HTML'
                }
            );
        }
        
        const destMessageId = sentMessage.message_id;
        
        // Update keyboard with actual message ID
        const finalMessageKey = `zone_${destMessageId}`;
        const finalKeyboard = createZoneNewsReactionKeyboard(finalMessageKey);
        
        await bot.telegram.editMessageReplyMarkup(
            DEST_CHANNEL,
            destMessageId,
            null,
            finalKeyboard
        );
        
        // Store reaction data
        await storeReactionData(finalMessageKey, destMessageId, sourceMessageId);
        
        console.log(`   ✅ Copied: ${SOURCE_CHANNEL}/${sourceMessageId} → ${DEST_CHANNEL}/${destMessageId} (${finalMessageKey})`);
        console.log(`   ✅ Added inline reaction buttons`);
        
        return {
            success: true,
            sourceMessageId,
            destMessageId,
            messageKey: finalMessageKey,
            method: 'copy_with_buttons',
            contentType: hasPhoto ? 'photo' : hasVideo ? 'video' : hasDocument ? 'document' : 'text'
        };
        
    } catch (error) {
        console.error(`   ❌ Failed to copy message ${sourceMessageId}:`, error.message);
        return {
            success: false,
            sourceMessageId,
            error: error.message,
            method: 'copy_with_buttons'
        };
    }
}

// Main posting function
async function postToZoneNews() {
    console.log('🚀 POSTING TO ZONE NEWS - MIXED MODE');
    console.log('====================================\n');
    
    // Get messages to post (you can modify this array)
    const messageIds = [139, 140, 141, 142];  // Update these as needed
    
    console.log('📋 Configuration:');
    console.log(`   Source: ${SOURCE_CHANNEL}`);
    console.log(`   Destination: ${DEST_CHANNEL}`);
    console.log(`   Messages: ${messageIds.join(', ')}`);
    console.log(`   Method: First = Forward, Rest = Copy with Inline Buttons`);
    console.log(`   Reactions: Persistent with database tracking\n`);
    
    const results = [];
    let successCount = 0;
    
    for (const [index, messageId] of messageIds.entries()) {
        const progress = `[${index + 1}/${messageIds.length}]`;
        const isFirst = index === 0;
        const method = isFirst ? 'FORWARD' : 'COPY WITH BUTTONS';
        
        console.log(`${progress} Processing message ${messageId} (${method})`);
        
        let result;
        if (isFirst) {
            // First message: Forward only
            result = await forwardMessage(messageId);
        } else {
            // Subsequent messages: Copy with inline buttons
            result = await copyMessageWithButtons(messageId);
        }
        
        results.push(result);
        
        if (result.success) {
            successCount++;
            const details = result.messageKey ? ` (${result.messageKey})` : '';
            const contentInfo = result.contentType ? ` [${result.contentType}]` : '';
            console.log(`   🎯 Success: ${result.method}${details}${contentInfo}\n`);
        } else {
            console.log(`   💥 Failed: ${result.error}\n`);
        }
        
        // Rate limiting between posts
        await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log('✅ POSTING COMPLETE');
    console.log('===================');
    console.log(`📊 Results:`);
    console.log(`   • Total processed: ${messageIds.length}`);
    console.log(`   • Successfully posted: ${successCount}`);
    console.log(`   • Failed: ${messageIds.length - successCount}`);
    console.log(`\n🎯 Zone News posts ready!`);
    console.log(`📱 First message: Simple forward`);
    console.log(`📱 Other messages: Interactive with reactions (👍 ❤️ 🔥 🎉 😊 😮)`);
    console.log(`💾 All reactions tracked in database`);
    console.log(`🔄 Bot handles all callback queries automatically\n`);
    
    if (successCount > 0) {
        console.log('📋 Successfully posted messages:');
        results.filter(r => r.success).forEach(r => {
            const details = r.messageKey ? ` → ${r.messageKey}` : '';
            console.log(`   • ${r.method}: ${r.sourceMessageId} → ${r.destMessageId}${details}`);
        });
    }
    
    return results;
}

// Main execution
async function main() {
    console.log('🚀 Zone News Mixed Posting System\n');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Cannot start without database connection');
        process.exit(1);
    }
    
    try {
        const results = await postToZoneNews();
        
        const successCount = results.filter(r => r.success).length;
        
        if (successCount === results.length) {
            console.log('\n✅ MISSION ACCOMPLISHED');
            console.log('========================');
            console.log('🎉 All messages posted to Zone News successfully!');
            console.log('📤 First message: Clean forward (no buttons)');
            console.log('📱 Other messages: Interactive reactions enabled');
            console.log('🔄 Bot handles all interactions automatically');
            console.log('💾 All reactions are tracked and persistent');
        } else {
            console.log(`\n⚠️  PARTIAL SUCCESS: ${successCount}/${results.length} messages posted`);
            const failed = results.filter(r => !r.success);
            console.log('❌ Failed messages:');
            failed.forEach(f => console.log(`   • Message ${f.sourceMessageId}: ${f.error}`));
        }
        
    } catch (error) {
        console.error('❌ Fatal error during posting:', error);
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