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
        console.log('✅ Connected to MongoDB for change detection');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}

// Store original Zone News message content for comparison
async function storeOriginalContent(zoneMessageId, content, entities = []) {
    try {
        const snapshot = {
            zone_message_id: zoneMessageId,
            zone_channel_id: -1002796395391, // @ZoneNewsAdl
            original_content: content,
            original_entities: entities,
            content_hash: generateContentHash(content, entities),
            created_at: new Date(),
            last_checked: new Date(),
            change_count: 0
        };
        
        await db.collection('zone_news_snapshots').updateOne(
            { zone_message_id: zoneMessageId },
            { $set: snapshot },
            { upsert: true }
        );
        
        console.log(`📸 Stored snapshot for Zone News message ${zoneMessageId}`);
        return snapshot;
        
    } catch (error) {
        console.error(`❌ Error storing snapshot for ${zoneMessageId}:`, error);
        return null;
    }
}

// Generate content hash for change detection
function generateContentHash(content, entities = []) {
    const crypto = require('crypto');
    const combined = JSON.stringify({ content, entities });
    return crypto.createHash('md5').update(combined).digest('hex');
}

// Check for changes in a Zone News message
async function checkForChanges(zoneMessageId) {
    try {
        console.log(`🔍 Checking Zone News message ${zoneMessageId} for changes...`);
        
        // Get current content from Telegram
        const adminId = 7802629063; // Duke's ID
        const tempForward = await bot.telegram.forwardMessage(
            adminId,
            -1002796395391, // @ZoneNewsAdl
            zoneMessageId
        );
        
        const currentContent = tempForward.text || tempForward.caption || '';
        const currentEntities = tempForward.entities || tempForward.caption_entities || [];
        const currentHash = generateContentHash(currentContent, currentEntities);
        
        // Delete temp forward
        await bot.telegram.deleteMessage(adminId, tempForward.message_id);
        
        // Get stored snapshot
        const snapshot = await db.collection('zone_news_snapshots').findOne({
            zone_message_id: zoneMessageId
        });
        
        if (!snapshot) {
            console.log(`   📸 No snapshot found, creating first snapshot for ${zoneMessageId}`);
            await storeOriginalContent(zoneMessageId, currentContent, currentEntities);
            return { changed: false, firstSnapshot: true };
        }
        
        // Compare hashes
        if (currentHash !== snapshot.content_hash) {
            console.log(`   🔄 CHANGE DETECTED in Zone News message ${zoneMessageId}!`);
            
            // Log the change
            const changeLog = {
                zone_message_id: zoneMessageId,
                change_detected_at: new Date(),
                old_content: snapshot.original_content,
                new_content: currentContent,
                old_hash: snapshot.content_hash,
                new_hash: currentHash,
                change_type: 'content_edit',
                sync_required: true,
                synced: false
            };
            
            await db.collection('zone_news_changes').insertOne(changeLog);
            
            // Update snapshot
            await db.collection('zone_news_snapshots').updateOne(
                { zone_message_id: zoneMessageId },
                { 
                    $set: {
                        original_content: currentContent,
                        original_entities: currentEntities,
                        content_hash: currentHash,
                        last_checked: new Date()
                    },
                    $inc: { change_count: 1 }
                }
            );
            
            console.log(`   📝 Change logged and snapshot updated for ${zoneMessageId}`);
            return { 
                changed: true, 
                changeLog,
                oldContent: snapshot.original_content,
                newContent: currentContent 
            };
        } else {
            // Update last checked time
            await db.collection('zone_news_snapshots').updateOne(
                { zone_message_id: zoneMessageId },
                { $set: { last_checked: new Date() } }
            );
            
            console.log(`   ✅ No changes in Zone News message ${zoneMessageId}`);
            return { changed: false };
        }
        
    } catch (error) {
        console.error(`❌ Error checking for changes in ${zoneMessageId}:`, error);
        return { changed: false, error: error.message };
    }
}

// Auto-sync detected changes to TBC
async function autoSyncChangesToTBC(zoneMessageId) {
    try {
        console.log(`🔄 Auto-syncing changes for Zone News ${zoneMessageId} to TBC...`);
        
        // Check if this message is mapped to TBC
        const mapping = await db.collection('zone_tbc_sync_mapping').findOne({
            zone_message_id: zoneMessageId
        });
        
        if (!mapping) {
            console.log(`   ⚠️  No TBC mapping found for Zone News ${zoneMessageId}`);
            return { synced: false, reason: 'No mapping found' };
        }
        
        // Import the sync function
        const syncScript = require('./sync-zone-to-tbc');
        const result = await syncScript.syncZoneMessageToTBC(zoneMessageId);
        
        if (result.success) {
            // Mark change as synced
            await db.collection('zone_news_changes').updateMany(
                { 
                    zone_message_id: zoneMessageId,
                    synced: false 
                },
                { 
                    $set: { 
                        synced: true, 
                        synced_at: new Date(),
                        sync_result: result
                    } 
                }
            );
            
            console.log(`   ✅ Auto-synced Zone News ${zoneMessageId} to TBC ${mapping.tbc_message_id}`);
            return { synced: true, tbcMessageId: mapping.tbc_message_id };
        } else {
            console.log(`   ❌ Auto-sync failed for ${zoneMessageId}: ${result.error}`);
            return { synced: false, error: result.error };
        }
        
    } catch (error) {
        console.error(`❌ Auto-sync error for ${zoneMessageId}:`, error);
        return { synced: false, error: error.message };
    }
}

// Monitor multiple Zone News messages for changes
async function monitorZoneNewsChanges(messageIds, autoSync = true) {
    console.log('🕵️ ZONE NEWS CHANGE DETECTION STARTED');
    console.log('====================================');
    console.log(`📋 Monitoring messages: ${messageIds.join(', ')}`);
    console.log(`🔄 Auto-sync to TBC: ${autoSync ? 'ENABLED' : 'DISABLED'}`);
    console.log('');
    
    const results = [];
    
    for (const [index, messageId] of messageIds.entries()) {
        const progress = `[${index + 1}/${messageIds.length}]`;
        console.log(`${progress} Checking Zone News message ${messageId}`);
        
        const changeResult = await checkForChanges(messageId);
        
        if (changeResult.changed && autoSync) {
            console.log(`   🔄 Auto-syncing changes to TBC...`);
            const syncResult = await autoSyncChangesToTBC(messageId);
            changeResult.syncResult = syncResult;
        }
        
        results.push({
            messageId,
            ...changeResult
        });
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log('\\n📊 CHANGE DETECTION SUMMARY');
    console.log('============================');
    
    const changedMessages = results.filter(r => r.changed);
    const syncedMessages = results.filter(r => r.syncResult?.synced);
    
    console.log(`📝 Messages checked: ${results.length}`);
    console.log(`🔄 Changes detected: ${changedMessages.length}`);
    console.log(`✅ Successfully synced: ${syncedMessages.length}`);
    
    if (changedMessages.length > 0) {
        console.log('\\n📋 DETECTED CHANGES:');
        changedMessages.forEach(result => {
            console.log(`   • Zone ${result.messageId}: Content modified`);
            if (result.syncResult?.synced) {
                console.log(`     → Synced to TBC ${result.syncResult.tbcMessageId}`);
            } else if (result.syncResult?.error) {
                console.log(`     → Sync failed: ${result.syncResult.error}`);
            }
        });
    }
    
    return results;
}

// Get pending changes that need manual review
async function getPendingChanges() {
    try {
        const pendingChanges = await db.collection('zone_news_changes')
            .find({ synced: false })
            .sort({ change_detected_at: -1 })
            .toArray();
        
        console.log(`📋 Found ${pendingChanges.length} pending changes`);
        
        pendingChanges.forEach((change, index) => {
            console.log(`   ${index + 1}. Zone ${change.zone_message_id} - ${change.change_type}`);
            console.log(`      Detected: ${change.change_detected_at.toISOString()}`);
            console.log(`      Old: "${change.old_content.substring(0, 50)}..."`);
            console.log(`      New: "${change.new_content.substring(0, 50)}..."`);
        });
        
        return pendingChanges;
        
    } catch (error) {
        console.error('❌ Error getting pending changes:', error);
        return [];
    }
}

// Main execution
async function main() {
    console.log('🚀 Zone News Change Detection System\\n');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Cannot start without database connection');
        process.exit(1);
    }
    
    try {
        // Get command line arguments
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.log('❓ No message IDs provided. Checking recent TBC-mapped messages...');
            
            // Get all mapped Zone News messages
            const mappings = await db.collection('zone_tbc_sync_mapping')
                .find({ sync_enabled: true })
                .sort({ created_at: -1 })
                .toArray();
            
            const messageIds = mappings.map(m => m.zone_message_id);
            
            if (messageIds.length === 0) {
                console.log('❌ No mapped messages found');
                process.exit(1);
            }
            
            await monitorZoneNewsChanges(messageIds, true);
            
        } else if (args[0] === 'pending') {
            // Show pending changes
            await getPendingChanges();
            
        } else {
            // Monitor specific messages
            const messageIds = args.map(id => parseInt(id)).filter(id => !isNaN(id));
            
            if (messageIds.length === 0) {
                console.log('❌ No valid message IDs provided');
                console.log('Usage: node zone-news-change-detector.js [messageId1] [messageId2] ...');
                console.log('   or: node zone-news-change-detector.js pending');
                console.log('   or: node zone-news-change-detector.js (to check all mapped)');
                process.exit(1);
            }
            
            await monitorZoneNewsChanges(messageIds, true);
        }
        
    } catch (error) {
        console.error('❌ Fatal error during change detection:', error);
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
    console.log('\\n⚠️  Shutting down change detector...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

// Export functions for use in other scripts
module.exports = {
    checkForChanges,
    storeOriginalContent,
    autoSyncChangesToTBC,
    monitorZoneNewsChanges,
    getPendingChanges
};