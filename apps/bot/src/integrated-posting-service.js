/**
 * Zone News Integrated Posting Service
 * Combines all features: state timeout, multi-admin, scheduling, discovery
 */

const AdminService = require('./services/admin-service');
const ChannelAdminService = require('./services/channel-admin-service');
const StateService = require('./services/state-service');
const ScheduleService = require('./services/schedule-service');
const DiscoveryService = require('./services/discovery-service');

class IntegratedPostingService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        
        // Initialize all services
        this.adminService = new AdminService(db);
        this.channelAdminService = new ChannelAdminService(db);
        this.stateService = new StateService(bot);
        this.scheduleService = new ScheduleService(bot, db);
        this.discoveryService = new DiscoveryService(bot, db);
        
        // Start background services
        this.stateService.startCleanup();
        
        // Setup all handlers
        this.setupHandlers();
    }

    setupHandlers() {
        // ============= POSTING COMMANDS =============
        
        this.bot.command('post', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check global admin or channel admin
            const isGlobalAdmin = await this.adminService.isAdmin(userId);
            const userChannels = await this.channelAdminService.getUserChannels(userId);
            
            if (!isGlobalAdmin && userChannels.length === 0) {
                return ctx.reply(
                    '🔒 *Admin Access Required*\n\n' +
                    'You need admin permissions to post.\n\n' +
                    '💎 Contact @TheZoneNews for global admin\n' +
                    '📢 Or ask your channel owner for access',
                    { parse_mode: 'Markdown' }
                );
            }
            
            // Get available destinations
            let destinations = [];
            
            // Global admins see all their destinations
            if (isGlobalAdmin) {
                destinations = await this.getUserDestinations(userId);
            }
            
            // Channel admins see only their authorized channels
            for (const channel of userChannels) {
                if (channel.permissions.includes('post')) {
                    const dest = await this.getDestinationInfo(channel.channel_id);
                    if (dest) destinations.push(dest);
                }
            }
            
            if (destinations.length === 0) {
                return ctx.reply(
                    '⚠️ *No destinations available*\n\n' +
                    'Add destinations first:\n' +
                    '• /addchannel @channel\n' +
                    '• /addgroup (in group)\n' +
                    '• /discover (auto-find)\n\n' +
                    '💡 Quick Setup: /setup',
                    { parse_mode: 'Markdown' }
                );
            }
            
            // Create destination selector with schedule option
            const keyboard = {
                inline_keyboard: [
                    ...destinations.map(dest => [{
                        text: `${this.getDestinationIcon(dest.type)} ${dest.name}`,
                        callback_data: `select_dest:${dest.id}:${dest.topic_id || 0}`
                    }]),
                    [
                        { text: '⏰ Schedule Post', callback_data: 'schedule_post' },
                        { text: '➕ Add Destination', callback_data: 'add_destination' }
                    ],
                    [{ text: '❌ Cancel', callback_data: 'cancel_post' }]
                ]
            };
            
            await ctx.reply(
                '📝 *Select Destination:*\n\n' +
                '📢 Channel | 👥 Group | 💬 Topic',
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        });

        // ============= ADMIN MANAGEMENT =============
        
        this.bot.command('addadmin', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check if user can add admins
            if (!await this.adminService.isAdmin(userId) || 
                !this.adminService.hasPermission(userId, 'manage_admins')) {
                return ctx.reply('❌ You need owner permissions to add global admins');
            }
            
            const text = ctx.message.text;
            const parts = text.split(' ');
            
            if (parts.length < 3) {
                return ctx.reply(
                    '👥 *Add Global Admin*\n\n' +
                    'Usage: /addadmin [user_id] [@username] [role]\n\n' +
                    '*Roles:*\n' +
                    '• `owner` - Full control (only one)\n' +
                    '• `moderator` - Manage all destinations\n' +
                    '• `editor` - Post to all destinations\n' +
                    '• `viewer` - View stats only\n\n' +
                    'Example: /addadmin 123456789 @JohnDoe moderator',
                    { parse_mode: 'Markdown' }
                );
            }
            
            const newAdminId = parseInt(parts[1]);
            const username = parts[2];
            const role = parts[3] || 'editor';
            
            try {
                await this.adminService.addAdmin(newAdminId, username, role, userId);
                await ctx.reply(`✅ Global admin added: ${username} as ${role}`);
            } catch (error) {
                await ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('addchanneladmin', async (ctx) => {
            const userId = ctx.from.id;
            const text = ctx.message.text;
            const parts = text.split(' ');
            
            if (parts.length < 4) {
                return ctx.reply(
                    '👥 *Add Channel Admin*\n\n' +
                    'Usage: /addchanneladmin [@channel] [user_id] [@username] [role]\n\n' +
                    '*Channel Roles:*\n' +
                    '• `channel_owner` - Full channel control\n' +
                    '• `channel_moderator` - Post & schedule\n' +
                    '• `channel_editor` - Post only\n' +
                    '• `channel_scheduler` - Schedule only\n' +
                    '• `channel_analyst` - View stats only\n\n' +
                    'Example: /addchanneladmin @ZoneNewsAdl 123456789 @JohnDoe channel_editor',
                    { parse_mode: 'Markdown' }
                );
            }
            
            const channelId = parts[1];
            const newAdminId = parseInt(parts[2]);
            const username = parts[3];
            const role = parts[4] || 'channel_editor';
            
            // Check if user is channel owner or global admin
            const isGlobalAdmin = await this.adminService.isAdmin(userId);
            const isChannelOwner = await this.channelAdminService.hasChannelPermission(
                channelId, userId, 'manage_channel_admins'
            );
            
            if (!isGlobalAdmin && !isChannelOwner) {
                return ctx.reply('❌ You need to be channel owner or global admin');
            }
            
            try {
                await this.channelAdminService.addChannelAdmin(
                    channelId, newAdminId, username, role, userId
                );
                await ctx.reply(
                    `✅ Channel admin added\n\n` +
                    `📢 Channel: ${channelId}\n` +
                    `👤 User: ${username}\n` +
                    `🎭 Role: ${role}`
                );
            } catch (error) {
                await ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        this.bot.command('mydestinations', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check if user has any destinations
            const isGlobalAdmin = await this.adminService.isAdmin(userId);
            if (!isGlobalAdmin) {
                return ctx.reply('❌ You need admin permissions to manage destinations');
            }
            
            const destinations = await this.getUserDestinations(userId);
            
            if (destinations.length === 0) {
                return ctx.reply(
                    '📭 *No Destinations Yet*\n\n' +
                    'Add destinations with:\n' +
                    '• /addchannel @channel\n' +
                    '• /addgroup (in group)\n' +
                    '• /addtopic (in forum)\n' +
                    '• /discover (auto-find)',
                    { parse_mode: 'Markdown' }
                );
            }
            
            let response = '📍 *Your Destinations*\n\n';
            
            destinations.forEach((dest, index) => {
                const icon = this.getDestinationIcon(dest.type);
                response += `${index + 1}. ${icon} *${dest.name}*\n`;
                response += `   ID: \`${dest.id}\`\n`;
                if (dest.type === 'topic' && dest.topic_id) {
                    response += `   Topic: ${dest.topic_id}\n`;
                }
                response += '\n';
            });
            
            response += '_Use /removedestination to remove any_';
            
            await ctx.reply(response, { parse_mode: 'Markdown' });
        });

        this.bot.command('myadmins', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check permissions
            const isGlobalAdmin = await this.adminService.isAdmin(userId);
            const userChannels = await this.channelAdminService.getUserChannels(userId);
            
            if (!isGlobalAdmin && userChannels.length === 0) {
                return ctx.reply('❌ You do not have any admin permissions');
            }
            
            let response = '👥 *Your Admin Status*\n\n';
            
            // Show global admin status
            if (isGlobalAdmin) {
                const allAdmins = await this.adminService.getAllAdmins();
                const userAdmin = allAdmins.find(a => a.telegram_id === userId);
                response += `🌍 *Global Admin*\n`;
                response += `Role: ${userAdmin.role}\n`;
                response += `Permissions: ${userAdmin.permissions.join(', ')}\n\n`;
            }
            
            // Show channel admin status
            if (userChannels.length > 0) {
                response += `📢 *Channel Admin*\n`;
                for (const channel of userChannels) {
                    response += `\n${channel.channel_id}\n`;
                    response += `  Role: ${channel.role}\n`;
                    response += `  Permissions: ${channel.permissions.join(', ')}\n`;
                }
            }
            
            await ctx.reply(response, { parse_mode: 'Markdown' });
        });

        this.bot.command('listadmins', async (ctx) => {
            const userId = ctx.from.id;
            
            // Only owners can list all admins
            if (!await this.adminService.isAdmin(userId)) {
                return ctx.reply('❌ You need owner permissions to list all admins');
            }
            
            const allAdmins = await this.adminService.getAllAdmins();
            
            if (allAdmins.length === 0) {
                return ctx.reply('No admins configured');
            }
            
            let response = '👥 *All Global Admins*\n\n';
            
            allAdmins.forEach((admin, index) => {
                response += `${index + 1}. *${admin.username || 'Unknown'}*\n`;
                response += `   ID: \`${admin.telegram_id}\`\n`;
                response += `   Role: ${admin.role}\n`;
                response += `   Active: ${admin.active ? '✅' : '❌'}\n\n`;
            });
            
            await ctx.reply(response, { parse_mode: 'Markdown' });
        });

        this.bot.command('removeadmin', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check owner permissions
            if (!await this.adminService.isAdmin(userId) || 
                !this.adminService.hasPermission(userId, 'manage_admins')) {
                return ctx.reply('❌ You need owner permissions to remove admins');
            }
            
            const text = ctx.message.text;
            const parts = text.split(' ');
            
            if (parts.length < 2) {
                return ctx.reply(
                    '❌ *Remove Admin*\n\n' +
                    'Usage: /removeadmin [user_id]\n\n' +
                    'Example: /removeadmin 123456789',
                    { parse_mode: 'Markdown' }
                );
            }
            
            const adminToRemove = parseInt(parts[1]);
            
            if (adminToRemove === userId) {
                return ctx.reply('❌ You cannot remove yourself');
            }
            
            try {
                await this.db.collection('bot_admins').updateOne(
                    { telegram_id: adminToRemove },
                    { $set: { active: false } }
                );
                
                // Clear cache
                this.adminService.adminCache.delete(adminToRemove);
                
                await ctx.reply(`✅ Admin removed: ${adminToRemove}`);
            } catch (error) {
                await ctx.reply(`❌ Error: ${error.message}`);
            }
        });

        // ============= SETUP WIZARD =============
        
        this.bot.command('setup', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check admin status
            if (!await this.adminService.isAdmin(userId)) {
                return ctx.reply('❌ Admin access required for setup');
            }
            
            // Start setup wizard
            this.stateService.set(userId, {
                action: 'setup_wizard',
                step: 'welcome'
            });
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📢 Add Channels', callback_data: 'setup_channels' }],
                    [{ text: '👥 Add Admins', callback_data: 'setup_admins' }],
                    [{ text: '⏰ Configure Schedules', callback_data: 'setup_schedules' }],
                    [{ text: '🔍 Discover Channels', callback_data: 'setup_discover' }],
                    [{ text: '❌ Exit Setup', callback_data: 'setup_exit' }]
                ]
            };
            
            await ctx.reply(
                '🚀 *Zone News Bot Setup Wizard*\n\n' +
                'Welcome! Let us configure your bot.\n\n' +
                'What would you like to set up?',
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        });
        
        // ============= DESTINATION MANAGEMENT =============
        
        this.bot.command('addchannel', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check if user can add channels
            const isGlobalAdmin = await this.adminService.isAdmin(userId);
            if (!isGlobalAdmin) {
                return ctx.reply('❌ Only global admins can add channels');
            }
            
            const text = ctx.message.text;
            const parts = text.split(' ');
            
            // Interactive flow if no parameters
            if (parts.length === 1) {
                this.stateService.set(userId, { 
                    action: 'adding_channel', 
                    step: 'waiting_channel' 
                });
                
                return ctx.reply(
                    '📢 *Add Channel - Step 1*\n\n' +
                    'Please provide the channel username:\n\n' +
                    'Example: @ZoneNewsAdl\n\n' +
                    'Or type /cancel to stop',
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '❌ Cancel', callback_data: 'cancel_add' }]
                            ]
                        }
                    }
                );
            }
            
            const channelId = parts[1];
            
            if (!channelId.startsWith('@')) {
                return ctx.reply('❌ Channel must start with @');
            }
            
            // If only channel provided, ask for name
            if (parts.length === 2) {
                this.stateService.set(userId, { 
                    action: 'adding_channel', 
                    step: 'waiting_name',
                    channelId: channelId 
                });
                
                return ctx.reply(
                    `📢 *Add Channel - Step 2*\n\n` +
                    `Channel: ${channelId}\n\n` +
                    `What display name for this channel?\n\n` +
                    `Or press Skip to use default`,
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⏭️ Skip (use default)', callback_data: 'skip_name' }],
                                [{ text: '❌ Cancel', callback_data: 'cancel_add' }]
                            ]
                        }
                    }
                );
            }
            
            // Full command with name
            const channelName = parts.slice(2).join(' ').replace(/"/g, '');
            
            // Add channel and set user as channel owner
            await this.saveDestination(userId, {
                id: channelId,
                name: channelName || channelId.replace('@', ''),
                type: 'channel'
            });
            
            // Set user as channel owner
            await this.channelAdminService.setChannelOwner(
                channelId, 
                userId, 
                ctx.from.username ? `@${ctx.from.username}` : 'User'
            );
            
            await ctx.reply(
                `✅ Channel added: ${channelName || channelId}\n` +
                `You are now the channel owner with full permissions`
            );
        });

        this.bot.command('addgroup', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check if user can add groups
            const isGlobalAdmin = await this.adminService.isAdmin(userId);
            if (!isGlobalAdmin) {
                return ctx.reply('❌ Only global admins can add groups');
            }
            
            // Must be used in a group
            if (ctx.chat.type === 'private') {
                return ctx.reply(
                    '❌ This command must be used in a group\n\n' +
                    'Add me to your group as admin, then use /addgroup there'
                );
            }
            
            const groupId = ctx.chat.id;
            const groupName = ctx.chat.title || 'Unknown Group';
            const groupType = ctx.chat.type; // group, supergroup
            
            // Save group as destination
            await this.saveDestination(userId, {
                id: groupId.toString(),
                name: groupName,
                type: 'group',
                username: ctx.chat.username || null
            });
            
            await ctx.reply(
                `✅ Group added: ${groupName}\n` +
                `Type: ${groupType}\n` +
                `ID: ${groupId}\n\n` +
                `You can now post to this group with /post`
            );
        });

        this.bot.command('addtopic', async (ctx) => {
            const userId = ctx.from.id;
            
            // Check if user can add topics
            const isGlobalAdmin = await this.adminService.isAdmin(userId);
            if (!isGlobalAdmin) {
                return ctx.reply('❌ Only global admins can add topics');
            }
            
            // Check if this is a forum topic
            if (!ctx.message.is_topic_message) {
                return ctx.reply(
                    '❌ This command must be used in a forum topic\n\n' +
                    'Go to a forum topic and use /addtopic there'
                );
            }
            
            const groupId = ctx.chat.id;
            const topicId = ctx.message.message_thread_id;
            const groupName = ctx.chat.title || 'Unknown Forum';
            
            // Save topic as destination
            await this.saveDestination(userId, {
                id: `${groupId}:${topicId}`,
                name: `${groupName} (Topic ${topicId})`,
                type: 'topic',
                group_id: groupId,
                topic_id: topicId
            });
            
            await ctx.reply(
                `✅ Forum topic added!\n` +
                `Forum: ${groupName}\n` +
                `Topic ID: ${topicId}\n\n` +
                `You can now post to this topic with /post`
            );
        });

        this.bot.command('removedestination', async (ctx) => {
            const userId = ctx.from.id;
            
            // Get destinations user can manage
            const destinations = await this.getManageableDestinations(userId);
            
            if (destinations.length === 0) {
                return ctx.reply('No destinations to remove');
            }
            
            const keyboard = {
                inline_keyboard: [
                    ...destinations.map(dest => [{
                        text: `🗑️ ${this.getDestinationIcon(dest.type)} ${dest.name}`,
                        callback_data: `remove_dest:${dest.id}:${dest.topic_id || 0}`
                    }]),
                    [{ text: '❌ Cancel', callback_data: 'cancel_remove' }]
                ]
            };
            
            await ctx.reply(
                '🗑️ *Select Destination to Remove:*\n\n' +
                '⚠️ This action cannot be undone!',
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        });

        // ============= DISCOVERY =============
        
        this.bot.command('discover', async (ctx) => {
            const userId = ctx.from.id;
            
            if (!await this.adminService.isAdmin(userId)) {
                return ctx.reply('❌ Admin only command');
            }
            
            await ctx.reply(
                '🔍 *Discovering Channels & Groups*\n\n' +
                'Scanning for places where bot is admin...',
                { parse_mode: 'Markdown' }
            );
            
            const discovered = await this.discoveryService.discoverDestinations(userId);
            
            if (discovered.length === 0) {
                return ctx.reply(
                    '❌ No channels/groups found\n\n' +
                    'Make sure to:\n' +
                    '1. Add bot as admin to your channels\n' +
                    '2. Use /addchannel to add manually'
                );
            }
            
            const keyboard = {
                inline_keyboard: [
                    ...discovered.map(dest => [{
                        text: `➕ Add ${dest.title}`,
                        callback_data: `auto_add:${dest.id}:${dest.title}`
                    }]),
                    [{ text: '✅ Add All', callback_data: 'add_all_discovered' }],
                    [{ text: '❌ Cancel', callback_data: 'cancel_discover' }]
                ]
            };
            
            await ctx.reply(
                `✅ *Found ${discovered.length} Destinations:*\n\n` +
                discovered.map(d => `${this.getDestinationIcon(d.type)} ${d.title}`).join('\n') +
                '\n\nSelect to add:',
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
            
            // Store in state for callback handling
            this.stateService.set(userId, {
                action: 'discovering',
                destinations: discovered
            });
        });

        // ============= SCHEDULING =============
        
        this.bot.command('schedule', async (ctx) => {
            const userId = ctx.from.id;
            const text = ctx.message.text;
            const parts = text.split(' ');
            
            // Check permissions
            const canSchedule = await this.checkSchedulePermission(userId);
            if (!canSchedule) {
                return ctx.reply('❌ You need schedule permissions');
            }
            
            if (parts.length < 3) {
                return ctx.reply(
                    '⏰ *Schedule Post*\n\n' +
                    'Usage: /schedule [time] [destination]\n\n' +
                    '*Time Formats:*\n' +
                    '• `14:30` - Today at 2:30 PM\n' +
                    '• `tomorrow 09:00` - Tomorrow at 9 AM\n' +
                    '• `daily 10:00` - Every day at 10 AM\n' +
                    '• `mon 15:00` - Every Monday at 3 PM\n\n' +
                    'Example: /schedule daily 09:00 @ZoneNewsAdl',
                    { parse_mode: 'Markdown' }
                );
            }
            
            const timeStr = parts[1];
            if (parts[1] === 'tomorrow' || parts[1] === 'daily') {
                timeStr = `${parts[1]} ${parts[2]}`;
                parts.splice(1, 2, timeStr);
            }
            
            const destination = parts.slice(2).join(' ');
            const schedule = this.scheduleService.parseSchedule(timeStr);
            
            if (!schedule) {
                return ctx.reply('❌ Invalid time format');
            }
            
            // Check if user can post to this destination
            const canPost = await this.checkDestinationPermission(userId, destination);
            if (!canPost) {
                return ctx.reply('❌ You don\'t have permission for this destination');
            }
            
            const scheduleId = await this.scheduleService.createSchedule(
                userId, 
                destination, 
                schedule
            );
            
            await ctx.reply(
                `⏰ *Post Scheduled!*\n\n` +
                `📍 Destination: ${destination}\n` +
                `🕐 Time: ${schedule.display}\n` +
                `🔄 Type: ${schedule.type}\n` +
                `🆔 ID: ${scheduleId}\n\n` +
                `Use /myschedules to view all`,
                { parse_mode: 'Markdown' }
            );
        });

        this.bot.command('myschedules', async (ctx) => {
            const userId = ctx.from.id;
            
            const schedules = await this.scheduleService.getUserSchedules(userId);
            
            if (schedules.length === 0) {
                return ctx.reply('No active schedules');
            }
            
            const list = schedules.map((s, i) => {
                const dest = s.destination.length > 20 ? 
                    s.destination.substring(0, 20) + '...' : s.destination;
                return `${i + 1}. 📍 ${dest}\n    🕐 ${s.schedule.display}`;
            }).join('\n\n');
            
            const keyboard = {
                inline_keyboard: schedules.map(s => [{
                    text: `🗑️ Cancel ${s.schedule_id.substring(4, 10)}`,
                    callback_data: `cancel_schedule:${s.schedule_id}`
                }])
            };
            
            await ctx.reply(
                `⏰ *Your Scheduled Posts:*\n\n${list}`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        });

        // ============= TEXT HANDLER FOR INTERACTIVE FLOWS =============
        
        this.bot.on('text', async (ctx) => {
            const userId = ctx.from.id;
            const state = this.stateService.get(userId);
            
            if (!state) return;
            
            const text = ctx.message.text;
            
            // Handle /cancel
            if (text === '/cancel') {
                this.stateService.clear(userId);
                return ctx.reply('❌ Cancelled');
            }
            
            // Handle channel adding flow
            if (state.action === 'adding_channel') {
                if (state.step === 'waiting_channel') {
                    if (!text.startsWith('@')) {
                        return ctx.reply('❌ Channel must start with @');
                    }
                    
                    this.stateService.set(userId, {
                        ...state,
                        channelId: text,
                        step: 'waiting_name'
                    });
                    
                    await ctx.reply(
                        `📢 Channel: ${text}\n\n` +
                        `What display name?\n\n` +
                        `Or use /skip for default`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '⏭️ Skip', callback_data: 'skip_name' }],
                                    [{ text: '❌ Cancel', callback_data: 'cancel_add' }]
                                ]
                            }
                        }
                    );
                } else if (state.step === 'waiting_name') {
                    const channelName = text === '/skip' ? 
                        state.channelId.replace('@', '') : text;
                    
                    await this.saveDestination(userId, {
                        id: state.channelId,
                        name: channelName,
                        type: 'channel'
                    });
                    
                    // Set as channel owner
                    await this.channelAdminService.setChannelOwner(
                        state.channelId, 
                        userId, 
                        ctx.from.username ? `@${ctx.from.username}` : 'User'
                    );
                    
                    await ctx.reply(`✅ Channel added: ${channelName}`);
                    this.stateService.clear(userId);
                }
            }
        });

        // ============= CALLBACK HANDLERS =============
        
        this.bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            const userId = ctx.from.id;
            
            // Handle setup wizard callbacks
            if (data.startsWith('setup_')) {
                await this.handleSetupCallback(ctx, data);
            }
            // Handle various callbacks
            else if (data.startsWith('remove_dest:')) {
                await this.handleRemoveDestination(ctx, data);
            } else if (data.startsWith('cancel_schedule:')) {
                await this.handleCancelSchedule(ctx, data);
            } else if (data.startsWith('auto_add:')) {
                await this.handleAutoAdd(ctx, data);
            } else if (data === 'add_all_discovered') {
                await this.handleAddAllDiscovered(ctx);
            } else if (data === 'skip_name') {
                await this.handleSkipName(ctx);
            } else if (data === 'cancel_add') {
                await this.handleCancelAdd(ctx);
            }
            
            await ctx.answerCbQuery();
        });
    }

    // ============= HELPER METHODS =============
    
    async checkSchedulePermission(userId) {
        // Check global admin
        if (await this.adminService.isAdmin(userId)) {
            return this.adminService.hasPermission(userId, 'schedule');
        }
        
        // Check channel admin
        const channels = await this.channelAdminService.getUserChannels(userId);
        return channels.some(ch => ch.permissions.includes('schedule'));
    }
    
    async checkDestinationPermission(userId, destination) {
        // Global admins can post anywhere
        if (await this.adminService.isAdmin(userId)) {
            return true;
        }
        
        // Channel admins can only post to their channels
        return await this.channelAdminService.isChannelAdmin(destination, userId);
    }
    
    async getManageableDestinations(userId) {
        const destinations = [];
        
        // Global admins can manage all their destinations
        if (await this.adminService.isAdmin(userId)) {
            const userDests = await this.getUserDestinations(userId);
            destinations.push(...userDests);
        }
        
        // Channel owners can remove their channels
        const ownedChannels = await this.db.collection('channel_admins')
            .find({ 
                user_id: userId, 
                role: 'channel_owner', 
                active: true 
            })
            .toArray();
        
        for (const channel of ownedChannels) {
            const dest = await this.getDestinationInfo(channel.channel_id);
            if (dest && !destinations.find(d => d.id === dest.id)) {
                destinations.push(dest);
            }
        }
        
        return destinations;
    }
    
    async getUserDestinations(userId) {
        const user = await this.db.collection('admin_destinations')
            .findOne({ telegram_id: userId });
        return user?.destinations || [];
    }
    
    async getDestinationInfo(destId) {
        // Try to get from admin_destinations
        const dest = await this.db.collection('admin_destinations')
            .findOne({ 'destinations.id': destId });
        
        if (dest) {
            return dest.destinations.find(d => d.id === destId);
        }
        
        // Create basic info if not found
        return {
            id: destId,
            name: destId.replace('@', ''),
            type: destId.startsWith('@') ? 'channel' : 'group'
        };
    }
    
    async saveDestination(userId, destination) {
        await this.db.collection('admin_destinations').updateOne(
            { telegram_id: userId },
            { 
                $addToSet: { 
                    destinations: {
                        ...destination,
                        added_at: new Date()
                    }
                }
            },
            { upsert: true }
        );
    }
    
    getDestinationIcon(type) {
        switch(type) {
            case 'channel': return '📢';
            case 'group': return '👥';
            case 'topic': return '💬';
            default: return '📍';
        }
    }
    
    // Callback handlers
    async handleRemoveDestination(ctx, data) {
        const userId = ctx.from.id;
        const parts = data.split(':');
        const destId = parts[1];
        
        // Check permission
        const canRemove = await this.checkDestinationPermission(userId, destId);
        if (!canRemove) {
            return ctx.answerCbQuery('❌ No permission');
        }
        
        await this.db.collection('admin_destinations').updateOne(
            { telegram_id: userId },
            { $pull: { destinations: { id: destId } } }
        );
        
        await ctx.editMessageText('✅ Destination removed');
    }
    
    async handleCancelSchedule(ctx, data) {
        const scheduleId = data.split(':')[1];
        await this.scheduleService.cancelSchedule(scheduleId);
        await ctx.editMessageText('✅ Schedule cancelled');
    }
    
    async handleAutoAdd(ctx, data) {
        const userId = ctx.from.id;
        const parts = data.split(':');
        const destId = parts[1];
        const destName = parts.slice(2).join(':');
        
        await this.saveDestination(userId, {
            id: destId,
            name: destName,
            type: destId.startsWith('@') ? 'channel' : 'group'
        });
        
        await ctx.answerCbQuery(`Added ${destName}`);
    }
    
    async handleAddAllDiscovered(ctx) {
        const userId = ctx.from.id;
        const state = this.stateService.get(userId);
        
        if (state && state.action === 'discovering') {
            for (const dest of state.destinations) {
                await this.saveDestination(userId, {
                    id: dest.id,
                    name: dest.title,
                    type: dest.type
                });
            }
            
            await ctx.editMessageText(`✅ Added ${state.destinations.length} destinations`);
            this.stateService.clear(userId);
        }
    }
    
    async handleSkipName(ctx) {
        const userId = ctx.from.id;
        const state = this.stateService.get(userId);
        
        if (state && state.action === 'adding_channel') {
            const channelName = state.channelId.replace('@', '');
            
            await this.saveDestination(userId, {
                id: state.channelId,
                name: channelName,
                type: 'channel'
            });
            
            await ctx.editMessageText(`✅ Channel added: ${channelName}`);
            this.stateService.clear(userId);
        }
    }
    
    async handleCancelAdd(ctx) {
        const userId = ctx.from.id;
        this.stateService.clear(userId);
        await ctx.editMessageText('❌ Cancelled');
    }
    
    async handleSetupCallback(ctx, data) {
        const userId = ctx.from.id;
        
        switch(data) {
            case 'setup_channels':
                await ctx.editMessageText(
                    '📢 *Add Channels*\n\n' +
                    'To add a channel:\n' +
                    '1. Add the bot as admin to your channel\n' +
                    '2. Use /addchannel @channelname\n\n' +
                    'Or use /discover to auto-find channels',
                    { parse_mode: 'Markdown' }
                );
                break;
                
            case 'setup_admins':
                await ctx.editMessageText(
                    '👥 *Add Admins*\n\n' +
                    'To add an admin:\n' +
                    '/addadmin [user_id] [@username] [role]\n\n' +
                    'Roles: owner, moderator, editor, viewer\n\n' +
                    'Example: /addadmin 123456789 @JohnDoe editor',
                    { parse_mode: 'Markdown' }
                );
                break;
                
            case 'setup_schedules':
                await ctx.editMessageText(
                    '⏰ *Configure Schedules*\n\n' +
                    '/schedule [time] [destination]\n\n' +
                    'Examples:\n' +
                    '• /schedule daily 09:00 @channel\n' +
                    '• /schedule tomorrow 14:30 @channel\n' +
                    '• /schedule mon 15:00 @channel\n\n' +
                    'View schedules: /myschedules',
                    { parse_mode: 'Markdown' }
                );
                break;
                
            case 'setup_discover':
                await ctx.editMessageText(
                    '🔍 *Discovering channels...*',
                    { parse_mode: 'Markdown' }
                );
                // Trigger discovery
                const discovered = await this.discoveryService.discoverDestinations(userId);
                if (discovered.length > 0) {
                    await ctx.editMessageText(
                        `✅ Found ${discovered.length} channels/groups!\n\n` +
                        'Use /discover to add them',
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    await ctx.editMessageText(
                        '❌ No channels found\n\n' +
                        'Make sure the bot is admin in your channels',
                        { parse_mode: 'Markdown' }
                    );
                }
                break;
                
            case 'setup_exit':
                this.stateService.clear(userId);
                await ctx.editMessageText(
                    '✅ *Setup Complete!*\n\n' +
                    'You can now use:\n' +
                    '• /post - Create posts\n' +
                    '• /mydestinations - View destinations\n' +
                    '• /myadmins - View permissions\n' +
                    '• /help - See all commands',
                    { parse_mode: 'Markdown' }
                );
                break;
        }
    }
}

module.exports = IntegratedPostingService;
