/**
 * GroupService - Manages group operations
 * Single Responsibility: Handle group-specific functionality
 */

class GroupService {
    constructor(database) {
        this.bot = null;
        this.db = database;
        this.groups = new Map();
    }

    setBot(bot) {
        this.bot = bot;
        this.setupHandlers();
    }

    async initialize() {
        await this.loadGroups();
        console.log(`  👥 Group service initialized (${this.groups.size} groups)`);
    }

    /**
     * Load groups from database
     */
    async loadGroups() {
        if (!this.db) return;
        
        const groups = await this.db.collection('groups').find({}).toArray();
        groups.forEach(group => {
            this.groups.set(group.id, group);
        });
    }

    /**
     * Set up group event handlers
     */
    setupHandlers() {
        // Bot added to group
        this.bot.on('my_chat_member', async (ctx) => {
            console.log(`[GROUP] Chat member update:`, ctx.update.my_chat_member);
            await this.handleMyChatMemberUpdate(ctx);
        });

        // New member joined
        this.bot.on('new_chat_members', async (ctx) => {
            console.log(`[GROUP] New members joined:`, ctx.message.new_chat_members);
            await this.handleNewMembers(ctx);
        });

        // Member left
        this.bot.on('left_chat_member', async (ctx) => {
            console.log(`[GROUP] Member left:`, ctx.message.left_chat_member);
            await this.handleMemberLeft(ctx);
        });
    }

    /**
     * Handle bot's chat member status update
     */
    async handleMyChatMemberUpdate(ctx) {
        const update = ctx.update.my_chat_member;
        const chat = update.chat;
        const newStatus = update.new_chat_member.status;
        const oldStatus = update.old_chat_member.status;
        
        console.log(`[GROUP] Bot status changed in ${chat.title || chat.id}: ${oldStatus} -> ${newStatus}`);
        
        if (newStatus === 'administrator' || newStatus === 'member') {
            // Bot added to group
            await this.registerGroup(chat);
            await ctx.reply(`👋 Hello! I'm Zone News Bot. Use /help to see available commands.`);
        } else if (newStatus === 'kicked' || newStatus === 'left') {
            // Bot removed from group
            await this.unregisterGroup(chat.id);
        }
    }

    /**
     * Register a group
     */
    async registerGroup(chat) {
        const group = {
            id: chat.id,
            title: chat.title,
            type: chat.type,
            username: chat.username,
            addedDate: new Date(),
            active: true
        };
        
        this.groups.set(chat.id, group);
        
        if (this.db) {
            await this.db.collection('groups').updateOne(
                { id: chat.id },
                { $set: group },
                { upsert: true }
            );
        }
        
        console.log(`[GROUP] ✅ Registered group: ${chat.title} (${chat.id})`);
    }

    /**
     * Unregister a group
     */
    async unregisterGroup(chatId) {
        this.groups.delete(chatId);
        
        if (this.db) {
            await this.db.collection('groups').updateOne(
                { id: chatId },
                { $set: { active: false, removedDate: new Date() } }
            );
        }
        
        console.log(`[GROUP] ❌ Unregistered group: ${chatId}`);
    }

    /**
     * Handle new members
     */
    async handleNewMembers(ctx) {
        const newMembers = ctx.message.new_chat_members;
        const chat = ctx.chat;
        
        for (const member of newMembers) {
            if (member.id === ctx.botInfo.id) {
                // Bot was added
                console.log(`[GROUP] Bot added to ${chat.title}`);
            } else {
                // Regular member joined
                console.log(`[GROUP] New member ${member.first_name} joined ${chat.title}`);
            }
        }
    }

    /**
     * Handle member left
     */
    async handleMemberLeft(ctx) {
        const leftMember = ctx.message.left_chat_member;
        const chat = ctx.chat;
        
        if (leftMember.id === ctx.botInfo.id) {
            console.log(`[GROUP] Bot removed from ${chat.title}`);
            await this.unregisterGroup(chat.id);
        } else {
            console.log(`[GROUP] Member ${leftMember.first_name} left ${chat.title}`);
        }
    }

    /**
     * Get all active groups
     */
    getActiveGroups() {
        return Array.from(this.groups.values()).filter(g => g.active);
    }

    /**
     * Post to all groups
     */
    async postToAllGroups(message) {
        const groups = this.getActiveGroups();
        const results = [];
        
        console.log(`[GROUP] Posting to ${groups.length} groups...`);
        
        for (const group of groups) {
            try {
                await this.bot.telegram.sendMessage(group.id, message, { parse_mode: 'HTML' });
                results.push({ groupId: group.id, success: true });
                console.log(`[GROUP] ✅ Posted to ${group.title}`);
            } catch (error) {
                results.push({ groupId: group.id, success: false, error: error.message });
                console.log(`[GROUP] ❌ Failed to post to ${group.title}: ${error.message}`);
            }
        }
        
        return results;
    }
}

module.exports = GroupService;