/**
 * Native View Forward Service
 * Integrates with existing monorepo bot to add native view count forwarding
 * From ZoneNewsAdelaideA to @ZONENEWSGROUP
 */

const axios = require('axios');
const { ObjectId } = require('mongodb');

class NativeViewForwardService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.mtprotoUrl = process.env.MTPROTO_SIDECAR_URL || 'http://localhost:3006';
        this.forwardMappings = new Map();
        this.viewSyncInterval = null;
        this.config = {
            sourceChannel: '@ZoneNewsAdelaideA',
            destGroup: '@ZONENEWSGROUP',
            syncIntervalMinutes: 15,
            enableReactions: true
        };
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Native View Forward Service');
            
            // Create database collections if not exist
            await this.setupCollections();
            
            // Start periodic view sync
            this.startPeriodicSync();
            
            // Load existing mappings
            await this.loadExistingMappings();
            
            console.log('✅ Native View Forward Service initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Native View Forward Service:', error);
            return false;
        }
    }

    async setupCollections() {
        // Ensure collections exist with proper indexes
        const collections = await this.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        if (!collectionNames.includes('forward_mappings')) {
            await this.db.createCollection('forward_mappings');
        }
        
        if (!collectionNames.includes('view_count_history')) {
            await this.db.createCollection('view_count_history');
        }
        
        // Create indexes
        await this.db.collection('forward_mappings').createIndexes([
            { key: { source_channel_id: 1, source_message_id: 1 }, unique: true },
            { key: { destination_chat_id: 1, destination_message_id: 1 } },
            { key: { last_sync_time: 1 } }
        ]);
        
        await this.db.collection('view_count_history').createIndexes([
            { key: { mapping_id: 1, sync_timestamp: -1 } }
        ]);
    }

    async loadExistingMappings() {
        const mappings = await this.db.collection('forward_mappings')
            .find({ source_channel_id: this.config.sourceChannel })
            .toArray();
        
        mappings.forEach(mapping => {
            const key = `${mapping.source_message_id}`;
            this.forwardMappings.set(key, mapping);
        });
        
        console.log(`📚 Loaded ${mappings.length} existing forward mappings`);
    }

    /**
     * Process a forwarded message with native view count
     */
    async processForwardedMessage(message) {
        try {
            // Check if message is from our source channel
            if (!this.isFromSourceChannel(message)) {
                return null;
            }
            
            const sourceMessageId = message.forward_from_message_id;
            const destMessageId = message.message_id;
            const destChatId = message.chat.id;
            
            // Get native view count
            const viewCount = await this.getNativeViewCount(
                this.config.sourceChannel,
                sourceMessageId
            );
            
            // Create forward mapping
            const mapping = await this.createForwardMapping({
                sourceChannelId: this.config.sourceChannel,
                sourceMessageId,
                destChatId: destChatId.toString(),
                destMessageId,
                initialViews: viewCount
            });
            
            // Add view count to message if not already present
            if (viewCount > 0) {
                await this.addViewCountToMessage(destChatId, destMessageId, viewCount);
            }
            
            // Add reactions if enabled
            if (this.config.enableReactions) {
                await this.addReactionsToMessage(destChatId, destMessageId);
            }
            
            console.log(`✅ Processed forward: ${sourceMessageId} → ${destMessageId} (${viewCount} views)`);
            
            return {
                success: true,
                viewCount,
                mappingId: mapping._id
            };
        } catch (error) {
            console.error('❌ Error processing forwarded message:', error);
            return null;
        }
    }

    /**
     * Check if message is from source channel
     */
    isFromSourceChannel(message) {
        if (!message.forward_from_chat) return false;
        
        const channelUsername = message.forward_from_chat.username;
        const channelTitle = message.forward_from_chat.title;
        
        return channelUsername === 'ZoneNewsAdelaideA' || 
               channelTitle?.includes('Zone News Adelaide');
    }

    /**
     * Get native view count from MTProto sidecar
     */
    async getNativeViewCount(channelId, messageId) {
        try {
            const response = await axios.get(
                `${this.mtprotoUrl}/v1/mtproto/message-views/${channelId}/${messageId}`,
                { timeout: 5000 }
            );
            return response.data.viewCount || 0;
        } catch (error) {
            console.warn(`⚠️ Could not fetch native view count: ${error.message}`);
            return 0;
        }
    }

    /**
     * Create forward mapping in database
     */
    async createForwardMapping(params) {
        const mapping = {
            source_channel_id: params.sourceChannelId,
            source_message_id: parseInt(params.sourceMessageId),
            destination_chat_id: params.destChatId,
            destination_message_id: parseInt(params.destMessageId),
            original_views: params.initialViews,
            last_synced_views: params.initialViews,
            last_sync_time: new Date(),
            created_at: new Date()
        };
        
        const result = await this.db.collection('forward_mappings').insertOne(mapping);
        mapping._id = result.insertedId;
        
        // Cache the mapping
        this.forwardMappings.set(params.sourceMessageId.toString(), mapping);
        
        // Record initial view count
        await this.recordViewHistory(result.insertedId, params.initialViews);
        
        return mapping;
    }

    /**
     * Record view count history
     */
    async recordViewHistory(mappingId, viewCount) {
        await this.db.collection('view_count_history').insertOne({
            mapping_id: mappingId,
            view_count: viewCount,
            sync_timestamp: new Date()
        });
    }

    /**
     * Add view count display to message
     */
    async addViewCountToMessage(chatId, messageId, viewCount) {
        try {
            // Format view count
            const viewDisplay = this.formatViewCount(viewCount);
            
            // Try to edit message to add view count
            const keyboard = {
                inline_keyboard: [[
                    { text: `👁 ${viewDisplay} views`, callback_data: `views_${messageId}` }
                ]]
            };
            
            await this.bot.editMessageReplyMarkup(keyboard, {
                chat_id: chatId,
                message_id: messageId
            });
        } catch (error) {
            // If can't edit, send a reply
            if (error.response?.error_code === 400) {
                await this.bot.sendMessage(chatId,
                    `👁 Views: ${this.formatViewCount(viewCount)}`,
                    { reply_to_message_id: messageId }
                );
            }
        }
    }

    /**
     * Add reaction buttons to message
     */
    async addReactionsToMessage(chatId, messageId) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '👍', callback_data: `react_like_${messageId}` },
                        { text: '❤️', callback_data: `react_love_${messageId}` },
                        { text: '🔥', callback_data: `react_fire_${messageId}` }
                    ],
                    [
                        { text: '👁 Views', callback_data: `sync_views_${messageId}` }
                    ]
                ]
            };
            
            // Send as reply with reactions
            await this.bot.sendMessage(chatId,
                '👇 React to this post:',
                {
                    reply_to_message_id: messageId,
                    reply_markup: keyboard
                }
            );
        } catch (error) {
            console.error('❌ Error adding reactions:', error);
        }
    }

    /**
     * Sync view counts for all mappings
     */
    async syncAllViewCounts() {
        console.log('🔄 Starting view count sync...');
        let updated = 0;
        
        for (const [key, mapping] of this.forwardMappings) {
            try {
                // Get current view count
                const currentViews = await this.getNativeViewCount(
                    mapping.source_channel_id,
                    mapping.source_message_id
                );
                
                // Update if changed
                if (currentViews > mapping.last_synced_views) {
                    await this.updateViewCount(mapping, currentViews);
                    updated++;
                }
            } catch (error) {
                console.error(`❌ Error syncing mapping ${key}:`, error);
            }
        }
        
        console.log(`✅ View sync complete: ${updated} posts updated`);
        return updated;
    }

    /**
     * Update view count for a mapping
     */
    async updateViewCount(mapping, newViews) {
        // Update database
        await this.db.collection('forward_mappings').updateOne(
            { _id: mapping._id },
            {
                $set: {
                    last_synced_views: newViews,
                    last_sync_time: new Date()
                }
            }
        );
        
        // Update cache
        mapping.last_synced_views = newViews;
        mapping.last_sync_time = new Date();
        
        // Record history
        await this.recordViewHistory(mapping._id, newViews);
        
        // Update message display
        await this.addViewCountToMessage(
            mapping.destination_chat_id,
            mapping.destination_message_id,
            newViews
        );
    }

    /**
     * Format view count for display
     */
    formatViewCount(count) {
        if (count >= 1000000) {
            return `${(count / 1000000).toFixed(1)}M`;
        } else if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toLocaleString();
    }

    /**
     * Start periodic view count sync
     */
    startPeriodicSync() {
        if (this.viewSyncInterval) {
            clearInterval(this.viewSyncInterval);
        }
        
        this.viewSyncInterval = setInterval(async () => {
            await this.syncAllViewCounts();
        }, this.config.syncIntervalMinutes * 60 * 1000);
        
        console.log(`📅 Scheduled view sync every ${this.config.syncIntervalMinutes} minutes`);
    }

    /**
     * Stop periodic sync
     */
    stopPeriodicSync() {
        if (this.viewSyncInterval) {
            clearInterval(this.viewSyncInterval);
            this.viewSyncInterval = null;
        }
    }

    /**
     * Get service statistics
     */
    async getStatistics() {
        const mappingCount = this.forwardMappings.size;
        const totalViews = Array.from(this.forwardMappings.values())
            .reduce((sum, m) => sum + m.last_synced_views, 0);
        
        return {
            activeMappings: mappingCount,
            totalViewsTracked: totalViews,
            averageViews: mappingCount > 0 ? Math.round(totalViews / mappingCount) : 0,
            sourceChannel: this.config.sourceChannel,
            destGroup: this.config.destGroup,
            syncInterval: this.config.syncIntervalMinutes
        };
    }

    /**
     * Handle callback queries for reactions and view sync
     */
    async handleCallbackQuery(query) {
        const data = query.data;
        
        // Handle view sync request
        if (data.startsWith('sync_views_')) {
            const messageId = data.replace('sync_views_', '');
            
            // Find mapping for this message
            const mapping = Array.from(this.forwardMappings.values())
                .find(m => m.destination_message_id === parseInt(messageId));
            
            if (mapping) {
                const currentViews = await this.getNativeViewCount(
                    mapping.source_channel_id,
                    mapping.source_message_id
                );
                
                await this.updateViewCount(mapping, currentViews);
                
                await this.bot.answerCallbackQuery(query.id, {
                    text: `Updated: ${this.formatViewCount(currentViews)} views`,
                    show_alert: false
                });
            }
        }
        
        // Handle reactions (integrate with existing reaction system)
        if (data.startsWith('react_')) {
            // Let the existing reaction handler process this
            return false;
        }
        
        return true;
    }
}

module.exports = NativeViewForwardService;