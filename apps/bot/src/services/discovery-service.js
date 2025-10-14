/**
 * Discovery Service
 * Automatically discovers channels and groups where bot is admin
 */

class DiscoveryService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
    }
    
    /**
     * Discover channels and groups where bot is admin
     */
    async discoverDestinations(userId) {
        const discovered = [];
        
        try {
            // Get bot's recent updates to find groups
            const updates = await this.bot.telegram.getUpdates();
            const chatIds = new Set();
            
            // Extract unique chat IDs
            for (const update of updates) {
                if (update.message?.chat) {
                    chatIds.add(update.message.chat.id);
                } else if (update.my_chat_member?.chat) {
                    chatIds.add(update.my_chat_member.chat.id);
                }
            }
            
            // Check each chat
            for (const chatId of chatIds) {
                try {
                    const chat = await this.bot.telegram.getChat(chatId);
                    
                    // Skip private chats
                    if (chat.type === 'private') continue;
                    
                    // Check if bot is admin
                    const member = await this.bot.telegram.getChatMember(chatId, this.bot.botInfo.id);
                    
                    if (member.status === 'administrator' || member.status === 'creator') {
                        discovered.push({
                            id: chat.username ? `@${chat.username}` : chatId.toString(),
                            title: chat.title,
                            type: chat.type === 'channel' ? 'channel' : 'group',
                            description: chat.description || '',
                            member_count: await this.getMemberCount(chatId)
                        });
                    }
                } catch (err) {
                    // Chat not accessible or bot not member
                }
            }
            
            // Also check known channels from database
            const knownChannels = await this.db.collection('known_channels')
                .find({ bot_is_admin: true })
                .toArray();
            
            for (const known of knownChannels) {
                try {
                    const chat = await this.bot.telegram.getChat(known.channel_id);
                    const member = await this.bot.telegram.getChatMember(known.channel_id, this.bot.botInfo.id);
                    
                    if (member.status === 'administrator' || member.status === 'creator') {
                        discovered.push({
                            id: known.channel_id,
                            title: chat.title,
                            type: 'channel',
                            description: chat.description || '',
                            member_count: await this.getMemberCount(known.channel_id)
                        });
                    }
                } catch (err) {
                    // Update known channels if bot no longer admin
                    await this.db.collection('known_channels').updateOne(
                        { channel_id: known.channel_id },
                        { $set: { bot_is_admin: false } }
                    );
                }
            }
            
            // Store discovery results
            if (discovered.length > 0) {
                await this.db.collection('discovery_sessions').insertOne({
                    user_id: userId,
                    discovered: discovered,
                    discovered_at: new Date()
                });
            }
            
            return discovered;
            
        } catch (error) {
            console.error('Discovery error:', error);
            return discovered;
        }
    }
    
    /**
     * Try to discover specific channel
     */
    async discoverChannel(channelUsername) {
        try {
            const chat = await this.bot.telegram.getChat(channelUsername);
            
            if (chat.type !== 'channel' && chat.type !== 'supergroup') {
                return null;
            }
            
            // Check if bot is admin
            const member = await this.bot.telegram.getChatMember(channelUsername, this.bot.botInfo.id);
            
            if (member.status === 'administrator' || member.status === 'creator') {
                return {
                    id: channelUsername,
                    title: chat.title,
                    type: chat.type === 'channel' ? 'channel' : 'group',
                    description: chat.description || '',
                    is_admin: true
                };
            }
            
            return {
                id: channelUsername,
                title: chat.title,
                type: chat.type === 'channel' ? 'channel' : 'group',
                description: chat.description || '',
                is_admin: false
            };
            
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Scan for forum topics in a group
     */
    async discoverTopics(groupId) {
        const topics = [];
        
        try {
            const chat = await this.bot.telegram.getChat(groupId);
            
            // Check if it's a forum
            if (!chat.is_forum) {
                return topics;
            }
            
            // Get forum topics (this requires specific API method)
            // For now, we'll check recent messages for thread IDs
            const updates = await this.bot.telegram.getUpdates();
            const threadIds = new Set();
            
            for (const update of updates) {
                if (update.message?.chat?.id === groupId && update.message.message_thread_id) {
                    threadIds.add(update.message.message_thread_id);
                }
            }
            
            for (const threadId of threadIds) {
                topics.push({
                    group_id: groupId,
                    group_name: chat.title,
                    topic_id: threadId,
                    display_name: `${chat.title} - Topic ${threadId}`
                });
            }
            
            return topics;
            
        } catch (error) {
            console.error('Topic discovery error:', error);
            return topics;
        }
    }
    
    /**
     * Get member count for a chat
     */
    async getMemberCount(chatId) {
        try {
            const count = await this.bot.telegram.getChatMemberCount(chatId);
            return count;
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Suggest channels based on patterns
     */
    async suggestChannels(basePattern) {
        const suggestions = [];
        const patterns = [
            basePattern,
            `${basePattern}News`,
            `${basePattern}Updates`,
            `${basePattern}Channel`,
            `${basePattern}Official`,
            `${basePattern}Adl`,
            `${basePattern}Adelaide`
        ];
        
        for (const pattern of patterns) {
            const channel = await this.discoverChannel(`@${pattern}`);
            if (channel) {
                suggestions.push(channel);
            }
        }
        
        return suggestions;
    }
    
    /**
     * Store discovered channel for future reference
     */
    async storeKnownChannel(channelId, isAdmin = false) {
        await this.db.collection('known_channels').updateOne(
            { channel_id: channelId },
            {
                $set: {
                    channel_id: channelId,
                    bot_is_admin: isAdmin,
                    last_checked: new Date()
                }
            },
            { upsert: true }
        );
    }
}

module.exports = DiscoveryService;