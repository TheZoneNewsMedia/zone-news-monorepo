/**
 * Channel & Group Management System
 * Handles adding bot to channels/groups and managing them
 */

const { Markup } = require('telegraf');

class ChannelGroupManager {
    constructor(bot, db, tierManager) {
        this.bot = bot;
        this.db = db;
        this.tierManager = tierManager || null;
        this.pendingAdditions = new Map();
    }
    
    /**
     * Register handlers
     */
    registerHandlers() {
        // When bot is added to a channel/group
        this.bot.on('my_chat_member', (ctx) => this.handleMyChatMember(ctx));
        
        // Channel posts
        this.bot.on('channel_post', (ctx) => this.handleChannelPost(ctx));
        
        // Commands
        this.bot.command('mychannels', (ctx) => this.listMyChannels(ctx));
        this.bot.command('mygroups', (ctx) => this.listMyGroups(ctx));
        this.bot.command('addchannel', (ctx) => this.addChannelInstructions(ctx));
        this.bot.command('addgroup', (ctx) => this.addGroupInstructions(ctx));
        this.bot.command('removechannel', (ctx) => this.removeChannel(ctx));
        this.bot.command('removegroup', (ctx) => this.removeGroup(ctx));
        
        // Callbacks
        this.bot.action(/^channel_/, (ctx) => this.handleChannelCallback(ctx));
        this.bot.action(/^group_/, (ctx) => this.handleGroupCallback(ctx));
    }
    
    /**
     * Handle bot being added/removed from chat
     */
    async handleMyChatMember(ctx) {
        try {
            const update = ctx.update.my_chat_member;
            const chat = update.chat;
            const newStatus = update.new_chat_member.status;
            const oldStatus = update.old_chat_member.status;
            const addedBy = update.from;
            
            console.log(`Bot status changed in ${chat.title}: ${oldStatus} -> ${newStatus}`);
            
            // Bot was added as admin
            if (newStatus === 'administrator' && oldStatus !== 'administrator') {
                await this.handleBotAdded(chat, addedBy);
            }
            
            // Bot was removed or demoted
            if ((newStatus === 'left' || newStatus === 'kicked' || newStatus === 'member') && 
                oldStatus === 'administrator') {
                await this.handleBotRemoved(chat, addedBy);
            }
            
        } catch (error) {
            console.error('Error handling chat member update:', error);
        }
    }
    
    /**
     * Handle bot being added to chat
     */
    async handleBotAdded(chat, addedBy) {
        const chatType = chat.type === 'channel' ? 'channel' : 'group';
        
        // Check tier limits if tier manager is available
        if (this.tierManager) {
            const featureToCheck = chatType === 'channel' ? 'add_channel' : 'add_group';
            const hasAccess = await this.tierManager.hasFeature(addedBy.id, featureToCheck);
            
            if (!hasAccess) {
                // Get user's tier and limits
                const tierName = await this.tierManager.getUserTier(addedBy.id);
                const tier = this.tierManager.tiers[tierName];
                const usage = await this.tierManager.getUserUsage(addedBy.id);
                
                // Send limit reached message
                const limitType = chatType === 'channel' ? 'channels' : 'groups';
                const currentCount = chatType === 'channel' ? usage.channels : usage.groups;
                const maxAllowed = tier.limits[limitType];
                
                try {
                    await this.bot.telegram.sendMessage(addedBy.id, 
                        `⚠️ *Limit Reached*\n\n` +
                        `You've reached your ${tierName} tier limit of ${maxAllowed} ${limitType}.\n` +
                        `Current ${limitType}: ${currentCount}/${maxAllowed}\n\n` +
                        `To add more ${limitType}, please:\n` +
                        `• Remove unused ${limitType} (/my${limitType})\n` +
                        `• Upgrade your plan (/upgrade)\n\n` +
                        `The bot will leave ${chat.title} automatically.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (e) {
                    console.error('Could not notify user about limit:', e);
                }
                
                // Leave the chat
                try {
                    await this.bot.telegram.leaveChat(chat.id);
                } catch (e) {
                    console.error('Could not leave chat:', e);
                }
                return;
            }
        }
        
        // Check permissions
        const botMember = await this.bot.telegram.getChatMember(chat.id, this.bot.botInfo.id);
        const canPost = botMember.can_post_messages !== false;
        const canDelete = botMember.can_delete_messages === true;
        const canEdit = botMember.can_edit_messages === true;
        
        // Save to database
        await this.db.collection('destinations').updateOne(
            { telegramId: chat.id },
            {
                $set: {
                    telegramId: chat.id,
                    type: chatType,
                    title: chat.title,
                    username: chat.username,
                    addedBy: addedBy.id,
                    addedByName: addedBy.first_name,
                    addedAt: new Date(),
                    active: true,
                    permissions: {
                        canPost,
                        canDelete,
                        canEdit
                    }
                }
            },
            { upsert: true }
        );
        
        // Track user's destinations
        await this.db.collection('user_destinations').updateOne(
            { userId: addedBy.id, destinationId: chat.id },
            {
                $set: {
                    userId: addedBy.id,
                    destinationId: chat.id,
                    type: chatType,
                    role: 'owner',
                    addedAt: new Date()
                }
            },
            { upsert: true }
        );
        
        // Notify the user who added the bot
        const message = 
            `✅ *Bot Added Successfully!*\n\n` +
            `📢 ${chatType === 'channel' ? 'Channel' : 'Group'}: ${chat.title}\n` +
            `👤 Added by: ${addedBy.first_name}\n\n` +
            `*Permissions:*\n` +
            `• Post messages: ${canPost ? '✅' : '❌'}\n` +
            `• Delete messages: ${canDelete ? '✅' : '❌'}\n` +
            `• Edit messages: ${canEdit ? '✅' : '❌'}\n\n` +
            `You can now post content to this ${chatType} using:\n` +
            `• /post - Create and post content\n` +
            `• /schedule - Schedule posts\n` +
            `• /broadcast - Send to multiple destinations`;
        
        try {
            await this.bot.telegram.sendMessage(addedBy.id, message, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error('Could not notify user:', error);
        }
    }
    
    /**
     * Handle bot being removed from chat
     */
    async handleBotRemoved(chat, removedBy) {
        // Mark as inactive in database
        await this.db.collection('destinations').updateOne(
            { telegramId: chat.id },
            {
                $set: {
                    active: false,
                    removedAt: new Date(),
                    removedBy: removedBy.id
                }
            }
        );
        
        // Notify the user
        try {
            await this.bot.telegram.sendMessage(removedBy.id,
                `ℹ️ Bot was removed from ${chat.title}`
            );
        } catch (error) {
            console.error('Could not notify user:', error);
        }
    }
    
    /**
     * Handle channel posts (for verification)
     */
    async handleChannelPost(ctx) {
        const channelId = ctx.chat.id;
        const messageId = ctx.message.message_id;
        
        // Check if this is a verification post
        const pending = this.pendingAdditions.get(channelId);
        if (pending) {
            // Channel verified!
            await this.completeChannelAddition(ctx, pending.userId);
            this.pendingAdditions.delete(channelId);
        }
    }
    
    /**
     * List user's channels
     */
    async listMyChannels(ctx) {
        const userId = ctx.from.id;
        
        const channels = await this.db.collection('destinations').find({
            addedBy: userId,
            type: 'channel',
            active: true
        }).toArray();
        
        if (channels.length === 0) {
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Channel', 'channel_add')],
                [Markup.button.callback('❓ How to Add', 'channel_help')]
            ]);
            
            return ctx.reply(
                '📢 *Your Channels*\n\n' +
                'You haven\'t added any channels yet.\n\n' +
                'Add a channel to start posting content!',
                { parse_mode: 'Markdown', ...keyboard }
            );
        }
        
        let message = '📢 *Your Channels*\n\n';
        
        const buttons = [];
        channels.forEach((channel, i) => {
            message += `${i + 1}. *${channel.title}*\n`;
            if (channel.username) {
                message += `   @${channel.username}\n`;
            }
            message += `   Added: ${new Date(channel.addedAt).toLocaleDateString()}\n\n`;
            
            buttons.push([
                Markup.button.callback(
                    `📝 ${channel.title}`,
                    `channel_manage_${channel.telegramId}`
                )
            ]);
        });
        
        buttons.push([
            Markup.button.callback('➕ Add Channel', 'channel_add'),
            Markup.button.callback('🔄 Refresh', 'channel_refresh')
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    }
    
    /**
     * List user's groups
     */
    async listMyGroups(ctx) {
        const userId = ctx.from.id;
        
        const groups = await this.db.collection('destinations').find({
            addedBy: userId,
            type: { $in: ['group', 'supergroup'] },
            active: true
        }).toArray();
        
        if (groups.length === 0) {
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Group', 'group_add')],
                [Markup.button.callback('❓ How to Add', 'group_help')]
            ]);
            
            return ctx.reply(
                '👥 *Your Groups*\n\n' +
                'You haven\'t added any groups yet.\n\n' +
                'Add a group to start posting content!',
                { parse_mode: 'Markdown', ...keyboard }
            );
        }
        
        let message = '👥 *Your Groups*\n\n';
        
        const buttons = [];
        groups.forEach((group, i) => {
            message += `${i + 1}. *${group.title}*\n`;
            message += `   Type: ${group.type}\n`;
            message += `   Added: ${new Date(group.addedAt).toLocaleDateString()}\n\n`;
            
            buttons.push([
                Markup.button.callback(
                    `⚙️ ${group.title}`,
                    `group_manage_${group.telegramId}`
                )
            ]);
        });
        
        buttons.push([
            Markup.button.callback('➕ Add Group', 'group_add'),
            Markup.button.callback('🔄 Refresh', 'group_refresh')
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    }
    
    /**
     * Instructions for adding channel
     */
    async addChannelInstructions(ctx) {
        const botUsername = this.bot.botInfo.username;
        
        const message = 
            '📢 *Add Channel*\n\n' +
            '*Method 1: Direct Link (Recommended)*\n' +
            `1. Click this link: [Add to Channel](https://t.me/${botUsername}?startchannel&admin=post_messages+edit_messages+delete_messages)\n` +
            `2. Select your channel\n` +
            `3. Confirm admin permissions\n\n` +
            '*Method 2: Manual*\n' +
            `1. Go to your channel\n` +
            `2. Channel Info → Administrators\n` +
            `3. Add Administrator\n` +
            `4. Search for @${botUsername}\n` +
            `5. Enable these permissions:\n` +
            `   • Post messages ✅\n` +
            `   • Edit messages ✅\n` +
            `   • Delete messages ✅\n\n` +
            `*Important:* The bot needs admin rights to post content!`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.url(
                '➕ Add to Channel',
                `https://t.me/${botUsername}?startchannel&admin=post_messages+edit_messages+delete_messages`
            )],
            [Markup.button.callback('📢 My Channels', 'channel_list')],
            [Markup.button.callback('❓ Help', 'channel_help')]
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
    
    /**
     * Instructions for adding group
     */
    async addGroupInstructions(ctx) {
        const botUsername = this.bot.botInfo.username;
        
        const message = 
            '👥 *Add Group*\n\n' +
            '*Method 1: Direct Link (Recommended)*\n' +
            `1. Click this link: [Add to Group](https://t.me/${botUsername}?startgroup)\n` +
            `2. Select your group\n` +
            `3. The bot will be added automatically\n\n` +
            '*Method 2: Manual*\n' +
            `1. Go to your group\n` +
            `2. Group Info → Add Members\n` +
            `3. Search for @${botUsername}\n` +
            `4. Add the bot\n` +
            `5. Promote to admin with permissions:\n` +
            `   • Post messages ✅\n` +
            `   • Delete messages ✅\n` +
            `   • Pin messages ✅\n\n` +
            `*Note:* Admin rights allow better content management!`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.url(
                '➕ Add to Group',
                `https://t.me/${botUsername}?startgroup`
            )],
            [Markup.button.callback('👥 My Groups', 'group_list')],
            [Markup.button.callback('❓ Help', 'group_help')]
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
    
    /**
     * Remove channel
     */
    async removeChannel(ctx) {
        const userId = ctx.from.id;
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        
        if (!text) {
            return ctx.reply(
                '❌ *Remove Channel*\n\n' +
                'Usage: `/removechannel CHANNEL_ID`\n\n' +
                'Get channel ID from /mychannels',
                { parse_mode: 'Markdown' }
            );
        }
        
        const result = await this.db.collection('destinations').updateOne(
            {
                telegramId: parseInt(text),
                addedBy: userId,
                type: 'channel'
            },
            {
                $set: {
                    active: false,
                    removedAt: new Date()
                }
            }
        );
        
        if (result.modifiedCount > 0) {
            await ctx.reply('✅ Channel removed successfully');
        } else {
            await ctx.reply('❌ Channel not found or you don\'t have permission');
        }
    }
    
    /**
     * Remove group
     */
    async removeGroup(ctx) {
        const userId = ctx.from.id;
        const text = ctx.message.text.split(' ').slice(1).join(' ');
        
        if (!text) {
            return ctx.reply(
                '❌ *Remove Group*\n\n' +
                'Usage: `/removegroup GROUP_ID`\n\n' +
                'Get group ID from /mygroups',
                { parse_mode: 'Markdown' }
            );
        }
        
        const result = await this.db.collection('destinations').updateOne(
            {
                telegramId: parseInt(text),
                addedBy: userId,
                type: { $in: ['group', 'supergroup'] }
            },
            {
                $set: {
                    active: false,
                    removedAt: new Date()
                }
            }
        );
        
        if (result.modifiedCount > 0) {
            await ctx.reply('✅ Group removed successfully');
        } else {
            await ctx.reply('❌ Group not found or you don\'t have permission');
        }
    }
    
    /**
     * Handle channel callbacks
     */
    async handleChannelCallback(ctx) {
        const action = ctx.callbackQuery.data.replace('channel_', '');
        
        if (action === 'add') {
            await this.addChannelInstructions(ctx);
        } else if (action === 'list' || action === 'refresh') {
            await this.listMyChannels(ctx);
        } else if (action === 'help') {
            await ctx.answerCbQuery();
            await ctx.reply(
                '❓ *Channel Help*\n\n' +
                '*What are channels?*\n' +
                'Channels are broadcast lists where only admins can post.\n\n' +
                '*Why add your channel?*\n' +
                '• Post news and updates\n' +
                '• Schedule content\n' +
                '• Track engagement\n' +
                '• Manage multiple channels\n\n' +
                '*Requirements:*\n' +
                '• You must be channel admin\n' +
                '• Bot needs posting permissions\n\n' +
                'Questions? Contact @TheZoneNews',
                { parse_mode: 'Markdown' }
            );
        } else if (action.startsWith('manage_')) {
            const channelId = action.replace('manage_', '');
            await this.manageChannel(ctx, channelId);
        }
        
        await ctx.answerCbQuery();
    }
    
    /**
     * Handle group callbacks
     */
    async handleGroupCallback(ctx) {
        const action = ctx.callbackQuery.data.replace('group_', '');
        
        if (action === 'add') {
            await this.addGroupInstructions(ctx);
        } else if (action === 'list' || action === 'refresh') {
            await this.listMyGroups(ctx);
        } else if (action === 'help') {
            await ctx.answerCbQuery();
            await ctx.reply(
                '❓ *Group Help*\n\n' +
                '*What are groups?*\n' +
                'Groups are chat rooms where members can interact.\n\n' +
                '*Why add your group?*\n' +
                '• Share news with members\n' +
                '• Automate announcements\n' +
                '• Moderate content\n' +
                '• Track engagement\n\n' +
                '*Requirements:*\n' +
                '• You must be group admin\n' +
                '• Bot needs admin permissions for best experience\n\n' +
                'Questions? Contact @TheZoneNews',
                { parse_mode: 'Markdown' }
            );
        } else if (action.startsWith('manage_')) {
            const groupId = action.replace('manage_', '');
            await this.manageGroup(ctx, groupId);
        }
        
        await ctx.answerCbQuery();
    }
    
    /**
     * Manage specific channel
     */
    async manageChannel(ctx, channelId) {
        const channel = await this.db.collection('destinations').findOne({
            telegramId: parseInt(channelId),
            type: 'channel'
        });
        
        if (!channel) {
            return ctx.reply('❌ Channel not found');
        }
        
        const stats = await this.getDestinationStats(channelId);
        
        const message = 
            `📢 *Channel Management*\n\n` +
            `*Name:* ${channel.title}\n` +
            `${channel.username ? `*Username:* @${channel.username}\n` : ''}` +
            `*Added:* ${new Date(channel.addedAt).toLocaleDateString()}\n\n` +
            `*Statistics:*\n` +
            `• Total posts: ${stats.totalPosts}\n` +
            `• This week: ${stats.postsThisWeek}\n` +
            `• Scheduled: ${stats.scheduled}\n\n` +
            `*Quick Actions:*`;
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📝 Post Now', `post_to_${channelId}`),
                Markup.button.callback('⏰ Schedule', `schedule_to_${channelId}`)
            ],
            [
                Markup.button.callback('📊 Analytics', `analytics_${channelId}`),
                Markup.button.callback('⚙️ Settings', `settings_${channelId}`)
            ],
            [
                Markup.button.callback('🗑 Remove', `remove_channel_${channelId}`),
                Markup.button.callback('🔙 Back', 'channel_list')
            ]
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
    
    /**
     * Manage specific group
     */
    async manageGroup(ctx, groupId) {
        const group = await this.db.collection('destinations').findOne({
            telegramId: parseInt(groupId),
            type: { $in: ['group', 'supergroup'] }
        });
        
        if (!group) {
            return ctx.reply('❌ Group not found');
        }
        
        const stats = await this.getDestinationStats(groupId);
        
        const message = 
            `👥 *Group Management*\n\n` +
            `*Name:* ${group.title}\n` +
            `*Type:* ${group.type}\n` +
            `*Added:* ${new Date(group.addedAt).toLocaleDateString()}\n\n` +
            `*Statistics:*\n` +
            `• Total posts: ${stats.totalPosts}\n` +
            `• This week: ${stats.postsThisWeek}\n` +
            `• Active members: ${stats.activeMembers || 'N/A'}\n\n` +
            `*Quick Actions:*`;
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('📝 Post Now', `post_to_${groupId}`),
                Markup.button.callback('📢 Announce', `announce_to_${groupId}`)
            ],
            [
                Markup.button.callback('📊 Analytics', `analytics_${groupId}`),
                Markup.button.callback('⚙️ Settings', `settings_${groupId}`)
            ],
            [
                Markup.button.callback('🗑 Remove', `remove_group_${groupId}`),
                Markup.button.callback('🔙 Back', 'group_list')
            ]
        ]);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...keyboard
        });
    }
    
    /**
     * Get destination statistics
     */
    async getDestinationStats(destinationId) {
        const now = new Date();
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        
        const [totalPosts, postsThisWeek, scheduled] = await Promise.all([
            this.db.collection('posts').countDocuments({
                destinationId: parseInt(destinationId)
            }),
            this.db.collection('posts').countDocuments({
                destinationId: parseInt(destinationId),
                createdAt: { $gte: weekAgo }
            }),
            this.db.collection('scheduled_posts').countDocuments({
                destinationId: parseInt(destinationId),
                status: 'pending'
            })
        ]);
        
        return {
            totalPosts,
            postsThisWeek,
            scheduled
        };
    }
}

module.exports = ChannelGroupManager;