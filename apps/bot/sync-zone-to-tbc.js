require('dotenv').config();
const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';

let db;
let client;

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

// Sync a single message from Zone News to TBC
async function syncZoneMessageToTBC(zoneMessageId) {
    try {
        console.log(`🔄 Syncing Zone News message ${zoneMessageId} to TBC...`);
        
        // Get sync mapping
        const mapping = await db.collection('zone_tbc_sync_mapping').findOne({
            zone_message_id: zoneMessageId
        });
        
        if (!mapping) {
            console.log(`❌ No sync mapping found for Zone message ${zoneMessageId}`);
            return { success: false, error: 'No mapping found' };
        }
        
        if (!mapping.sync_enabled) {
            console.log(`⏭️ Sync disabled for Zone message ${zoneMessageId}`);
            return { success: false, error: 'Sync disabled' };
        }
        
        // Get current Zone News message content
        const adminId = 7802629063; // Duke's ID
        const tempForward = await bot.telegram.forwardMessage(
            adminId,
            mapping.zone_channel_id,
            zoneMessageId
        );
        
        const currentText = tempForward.text || tempForward.caption || '';
        const currentEntities = tempForward.entities || tempForward.caption_entities || [];
        
        // Delete temp forward
        await bot.telegram.deleteMessage(adminId, tempForward.message_id);
        
        console.log(`   📝 Updating TBC message ${mapping.tbc_message_id}...`);
        
        // Get current reaction counts to preserve them
        const messageKey = `tbc_${mapping.tbc_message_id}`;
        const reactionDoc = await db.collection('zone_persistent_reactions').findOne({
            message_key: messageKey
        });
        
        const currentReactions = reactionDoc ? reactionDoc.reactions : {};
        const reactionKeyboard = createTBCReactionKeyboard(messageKey, currentReactions);
        
        // Update TBC message with current Zone News content AND reaction buttons
        await bot.telegram.editMessageText(
            mapping.tbc_group_id,
            mapping.tbc_message_id,
            null,
            currentText,
            {
                entities: currentEntities,
                message_thread_id: mapping.tbc_topic_id,
                reply_markup: reactionKeyboard
            }
        );
        
        // Update sync timestamp
        await db.collection('zone_tbc_sync_mapping').updateOne(
            { zone_message_id: zoneMessageId },
            { $set: { last_synced: new Date() } }
        );
        
        console.log(`   ✅ Synced Zone ${zoneMessageId} → TBC ${mapping.tbc_message_id}`);
        
        return {
            success: true,
            zoneMessageId,
            tbcMessageId: mapping.tbc_message_id,
            synced_at: new Date()
        };
        
    } catch (error) {
        console.error(`   ❌ Failed to sync message ${zoneMessageId}:`, error.message);
        return {
            success: false,
            zoneMessageId,
            error: error.message
        };
    }
}

// Sync multiple messages
async function syncMultipleMessages(messageIds) {
    console.log('🔄 SYNCING ZONE NEWS CHANGES TO TBC');
    console.log('===================================\n');
    
    const results = [];
    let synced = 0;
    let failed = 0;
    
    for (const [index, messageId] of messageIds.entries()) {
        const progress = `[${index + 1}/${messageIds.length}]`;
        console.log(`${progress} Syncing Zone News message ${messageId}`);
        
        const result = await syncZoneMessageToTBC(messageId);
        results.push(result);
        
        if (result.success) {
            synced++;
        } else {
            failed++;
            console.log(`   💥 Failed: ${result.error}`);
        }
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log('\n✅ SYNC COMPLETE');
    console.log('================');
    console.log(`📊 Results:`);
    console.log(`   • Total processed: ${messageIds.length}`);
    console.log(`   • Successfully synced: ${synced}`);
    console.log(`   • Failed: ${failed}`);
    
    return { total: messageIds.length, synced, failed, results };
}

// Sync all mapped messages
async function syncAllMappedMessages() {
    try {
        console.log('🔍 Finding all mapped messages...');
        
        const mappings = await db.collection('zone_tbc_sync_mapping')
            .find({ sync_enabled: true })
            .toArray();
        
        if (mappings.length === 0) {
            console.log('❌ No mapped messages found');
            return;
        }
        
        const messageIds = mappings.map(m => m.zone_message_id);
        console.log(`📋 Found ${messageIds.length} mapped messages: ${messageIds.join(', ')}`);
        
        return await syncMultipleMessages(messageIds);
        
    } catch (error) {
        console.error('❌ Error finding mapped messages:', error);
        return { total: 0, synced: 0, failed: 0, results: [] };
    }
}

// Main execution
async function main() {
    console.log('🚀 Zone News → TBC Sync Service\n');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Cannot start without database connection');
        process.exit(1);
    }
    
    try {
        // Get command line arguments
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            // Sync all mapped messages
            console.log('🔄 Syncing all mapped messages...');
            const results = await syncAllMappedMessages();
            
            if (results.synced > 0) {
                console.log('\n✅ SYNC COMPLETED');
                console.log('=================');
                console.log('🎉 Zone News changes synced to TBC!');
                console.log('📝 All formatting and content updated');
                console.log('🔄 Reaction buttons preserved');
            }
        } else {
            // Sync specific messages
            const messageIds = args.map(id => parseInt(id)).filter(id => !isNaN(id));
            
            if (messageIds.length === 0) {
                console.log('❌ No valid message IDs provided');
                console.log('Usage: node sync-zone-to-tbc.js [messageId1] [messageId2] ...');
                console.log('   or: node sync-zone-to-tbc.js (to sync all)');
                process.exit(1);
            }
            
            console.log(`🎯 Syncing specific messages: ${messageIds.join(', ')}`);
            const results = await syncMultipleMessages(messageIds);
            
            if (results.synced > 0) {
                console.log('\n✅ SYNC COMPLETED');
                console.log('=================');
                console.log('🎉 Specified messages synced to TBC!');
            }
        }
        
    } catch (error) {
        console.error('❌ Fatal error during sync:', error);
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