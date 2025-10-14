/**
 * Post Manager - Comprehensive posting system with reactions, scheduling, and analytics
 */

const { ObjectId } = require('mongodb');
const EventEmitter = require('events');
const cron = require('node-cron');

class PostManager extends EventEmitter {
    constructor(bot, db) {
        super();
        this.bot = bot;
        this.db = db;
        this.scheduledJobs = new Map();
        this.postQueue = [];
        this.processing = false;
        
        // Initialize scheduler
        this.initializeScheduler();
    }
    
    /**
     * Initialize the scheduler for automated posting
     */
    initializeScheduler() {
        // Check for scheduled posts every minute
        cron.schedule('* * * * *', async () => {
            await this.processScheduledPosts();
        });
        
        // Process queue every 5 seconds
        setInterval(() => this.processPostQueue(), 5000);
    }
    
    /**
     * Post article to destination with reactions
     */
    async postArticle(articleId, destinationId, adminId) {
        try {
            const article = await this.db.collection('news_articles')
                .findOne({ _id: new ObjectId(articleId) });
            
            const destination = await this.db.collection('destinations')
                .findOne({ _id: new ObjectId(destinationId) });
            
            if (!article || !destination) {
                throw new Error('Article or destination not found');
            }
            
            // Pre-check permissions for groups
            if (destination.type === 'group' || destination.type === 'supergroup') {
                const perms = await this.checkGroupPermissions(destination.id);
                
                if (!perms.hasPermissions) {
                    // Try to provide helpful error message
                    if (perms.error?.includes('kicked')) {
                        // Mark destination as inactive
                        await this.db.collection('destinations').updateOne(
                            { _id: new ObjectId(destinationId) },
                            { $set: { active: false, error: 'Bot was kicked', last_error: new Date() } }
                        );
                        throw new Error('Bot was kicked from this group. Destination marked as inactive.');
                    }
                    
                    if (!perms.permissions?.canPost) {
                        throw new Error(
                            `Missing permissions in group "${destination.name || destination.id}":\n` +
                            `• Admin status: ${perms.permissions?.isAdmin ? '✅' : '❌'}\n` +
                            `• Can post: ${perms.permissions?.canPost ? '✅' : '❌'}\n` +
                            `• Status: ${perms.status}\n\n` +
                            `Please make the bot an admin with "Post messages" permission.`
                        );
                    }
                    
                    throw new Error(`Cannot post to group: ${perms.error || 'Unknown permission issue'}`);
                }
            }
            
            // Format message
            const message = this.formatArticleWithReactions(article);
            
            // Create inline keyboard with reactions
            const keyboard = this.createReactionKeyboard(article);
            
            // Send message with retry logic
            let sentMessage;
            let retries = 3;
            let lastError;
            
            while (retries > 0) {
                try {
                    sentMessage = await this.bot.telegram.sendMessage(
                        destination.id,
                        message,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: keyboard,
                            disable_web_page_preview: false
                        }
                    );
                    break; // Success!
                    
                } catch (error) {
                    lastError = error;
                    retries--;
                    
                    // Handle specific errors
                    if (error.response?.error_code === 429) {
                        // Rate limited - wait and retry
                        const retryAfter = error.response?.parameters?.retry_after || 5;
                        console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                        continue;
                    }
                    
                    // Handle permission errors
                    if (error.description?.includes('not enough rights')) {
                        throw new Error(
                            'Bot needs admin rights in the group to post.\n' +
                            'Please:\n' +
                            '1. Make the bot an admin\n' +
                            '2. Enable "Post messages" permission\n' +
                            '3. Try posting again'
                        );
                    }
                    
                    if (error.description?.includes('chat not found')) {
                        await this.db.collection('destinations').updateOne(
                            { _id: new ObjectId(destinationId) },
                            { $set: { active: false, error: 'Chat not found', last_error: new Date() } }
                        );
                        throw new Error('Chat not found. Bot may have been removed. Destination deactivated.');
                    }
                    
                    if (error.description?.includes('bot was kicked')) {
                        await this.db.collection('destinations').updateOne(
                            { _id: new ObjectId(destinationId) },
                            { $set: { active: false, error: 'Bot was kicked', last_error: new Date() } }
                        );
                        throw new Error('Bot was kicked from the group. Destination deactivated.');
                    }
                    
                    if (error.description?.includes('CHAT_WRITE_FORBIDDEN')) {
                        throw new Error(
                            'Bot cannot write to this chat.\n' +
                            'Possible reasons:\n' +
                            '• Bot is not a member\n' +
                            '• Chat has restricted who can post\n' +
                            '• Bot lacks necessary permissions'
                        );
                    }
                    
                    if (error.description?.includes('message is too long')) {
                        // Truncate and retry
                        const truncatedMessage = message.substring(0, 4000) + '...\n\n[Message truncated]';
                        sentMessage = await this.bot.telegram.sendMessage(
                            destination.id,
                            truncatedMessage,
                            {
                                parse_mode: 'Markdown',
                                reply_markup: keyboard,
                                disable_web_page_preview: false
                            }
                        );
                        break;
                    }
                    
                    // If no retries left, throw the error
                    if (retries === 0) {
                        throw error;
                    }
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            if (!sentMessage && lastError) {
                throw lastError;
            }
            
            // Store posted article info for editing later
            await this.db.collection('posted_articles').insertOne({
                article_id: new ObjectId(articleId),
                destination_id: new ObjectId(destinationId),
                destination_chat_id: destination.id,
                message_id: sentMessage.message_id,
                posted_by: adminId,
                posted_at: new Date(),
                can_edit_until: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
                reactions: {
                    like: 0,
                    love: 0,
                    fire: 0
                }
            });
            
            return {
                success: true,
                message_id: sentMessage.message_id,
                destination: destination.name || destination.id
            };
        } catch (error) {
            console.error('Post article error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Edit posted article
     */
    async editPostedArticle(postId, newText) {
        try {
            const post = await this.db.collection('posted_articles')
                .findOne({ _id: new ObjectId(postId) });
            
            if (!post) {
                throw new Error('Posted article not found');
            }
            
            // Check if still editable (48 hour limit)
            if (new Date() > new Date(post.can_edit_until)) {
                throw new Error('Cannot edit posts older than 48 hours');
            }
            
            // Get current reactions to preserve them
            const keyboard = await this.getUpdatedReactionKeyboard(post.article_id, post._id);
            
            // Edit the message
            await this.bot.telegram.editMessageText(
                post.destination_chat_id,
                post.message_id,
                null,
                newText,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    disable_web_page_preview: false
                }
            );
            
            // Update database
            await this.db.collection('posted_articles').updateOne(
                { _id: new ObjectId(postId) },
                { 
                    $set: { 
                        last_edited: new Date(),
                        edited_text: newText
                    }
                }
            );
            
            return { success: true };
        } catch (error) {
            console.error('Edit post error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Update reaction count - tracks globally across all groups/channels
     */
    async updateReaction(ctx, reactionType, articleId, postId) {
        try {
            const userId = ctx.from.id;
            const chatId = ctx.chat.id;
            const chatType = ctx.chat.type; // 'private', 'group', 'supergroup', 'channel'
            
            // Track reaction globally for this user
            const existingReaction = await this.db.collection('user_reactions').findOne({
                user_id: userId,
                post_id: postId,
                reaction: reactionType
            });
            
            // Also track in global reactions collection for analytics
            const globalReactionKey = `${userId}_${articleId}_${reactionType}`;
            const existingGlobalReaction = await this.db.collection('global_reactions').findOne({
                user_id: userId,
                article_id: new ObjectId(articleId),
                reaction_type: reactionType
            });
            
            let newCount;
            if (existingReaction) {
                // Remove reaction
                await this.db.collection('user_reactions').deleteOne({
                    user_id: userId,
                    post_id: postId,
                    reaction: reactionType
                });
                
                // Decrement count in posted article
                await this.db.collection('posted_articles').updateOne(
                    { _id: new ObjectId(postId) },
                    { $inc: { [`reactions.${reactionType}`]: -1 } }
                );
                
                // Update global reaction tracking
                await this.db.collection('global_reactions').deleteOne({
                    user_id: userId,
                    article_id: new ObjectId(articleId),
                    reaction_type: reactionType
                });
                
                // Update article's total reaction count
                await this.db.collection('news_articles').updateOne(
                    { _id: new ObjectId(articleId) },
                    { $inc: { [`total_reactions.${reactionType}`]: -1 } }
                );
                
                newCount = -1;
            } else {
                // Add reaction with full tracking info
                await this.db.collection('user_reactions').insertOne({
                    user_id: userId,
                    username: ctx.from.username || null,
                    post_id: postId,
                    article_id: new ObjectId(articleId),
                    reaction: reactionType,
                    chat_id: chatId,
                    chat_type: chatType,
                    chat_title: ctx.chat.title || null,
                    created_at: new Date()
                });
                
                // Add to global reactions (one reaction per user per article type)
                if (!existingGlobalReaction) {
                    await this.db.collection('global_reactions').insertOne({
                        user_id: userId,
                        username: ctx.from.username || null,
                        article_id: new ObjectId(articleId),
                        reaction_type: reactionType,
                        first_reacted_at: new Date(),
                        last_reacted_at: new Date(),
                        reaction_count: 1,
                        chats_reacted_in: [{
                            chat_id: chatId,
                            chat_type: chatType,
                            chat_title: ctx.chat.title || null,
                            reacted_at: new Date()
                        }]
                    });
                } else {
                    // Update existing global reaction
                    await this.db.collection('global_reactions').updateOne(
                        { 
                            user_id: userId,
                            article_id: new ObjectId(articleId),
                            reaction_type: reactionType
                        },
                        { 
                            $set: { last_reacted_at: new Date() },
                            $inc: { reaction_count: 1 },
                            $push: { 
                                chats_reacted_in: {
                                    chat_id: chatId,
                                    chat_type: chatType,
                                    chat_title: ctx.chat.title || null,
                                    reacted_at: new Date()
                                }
                            }
                        }
                    );
                }
                
                // Increment count in posted article
                await this.db.collection('posted_articles').updateOne(
                    { _id: new ObjectId(postId) },
                    { $inc: { [`reactions.${reactionType}`]: 1 } }
                );
                
                // Update article's total reaction count
                await this.db.collection('news_articles').updateOne(
                    { _id: new ObjectId(articleId) },
                    { 
                        $inc: { [`total_reactions.${reactionType}`]: 1 },
                        $set: { last_reaction_at: new Date() }
                    }
                );
                
                newCount = 1;
            }
            
            // Get updated post with reactions
            const post = await this.db.collection('posted_articles')
                .findOne({ _id: new ObjectId(postId) });
            
            // Update the message keyboard with new counts
            const keyboard = await this.getUpdatedReactionKeyboard(articleId, postId);
            
            try {
                await ctx.editMessageReplyMarkup(keyboard);
            } catch (error) {
                // Message not modified error is ok
                if (!error.description?.includes('message is not modified')) {
                    console.error('Failed to update keyboard:', error);
                }
            }
            
            // Show feedback
            if (existingReaction) {
                await ctx.answerCbQuery('Reaction removed');
            } else {
                const emoji = reactionType === 'like' ? '👍' : reactionType === 'love' ? '❤️' : '🔥';
                await ctx.answerCbQuery(`${emoji} Added!`);
            }
            
            return { success: true, newCount };
        } catch (error) {
            console.error('Update reaction error:', error);
            await ctx.answerCbQuery('Failed to update reaction', { show_alert: true });
            return { success: false };
        }
    }
    
    /**
     * Format article with reactions support
     */
    formatArticleWithReactions(article) {
        const date = new Date(article.published_date).toLocaleDateString('en-AU');
        
        return `📰 *${this.escapeMarkdown(article.title)}*\n\n` +
            `${this.escapeMarkdown(article.summary || article.content?.substring(0, 300))}...\n\n` +
            `📅 ${date} | 📂 ${article.category || 'General'}\n` +
            `🔗 [Read More](${article.url || 'https://thezonenews.com'})`;
    }
    
    /**
     * Create reaction keyboard
     */
    createReactionKeyboard(article) {
        return {
            inline_keyboard: [
                [
                    { text: '👍 0', callback_data: `react:like:${article._id}` },
                    { text: '❤️ 0', callback_data: `react:love:${article._id}` },
                    { text: '🔥 0', callback_data: `react:fire:${article._id}` }
                ],
                [
                    { text: '💬 Comment', callback_data: `comment:${article._id}` },
                    { text: '🔗 Share', callback_data: `share:${article._id}` }
                ]
            ]
        };
    }
    
    /**
     * Get updated reaction keyboard with current counts
     */
    async getUpdatedReactionKeyboard(articleId, postId) {
        const post = await this.db.collection('posted_articles')
            .findOne({ _id: new ObjectId(postId) });
        
        const reactions = post?.reactions || { like: 0, love: 0, fire: 0 };
        
        return {
            inline_keyboard: [
                [
                    { text: `👍 ${reactions.like}`, callback_data: `react:like:${articleId}:${postId}` },
                    { text: `❤️ ${reactions.love}`, callback_data: `react:love:${articleId}:${postId}` },
                    { text: `🔥 ${reactions.fire}`, callback_data: `react:fire:${articleId}:${postId}` }
                ],
                [
                    { text: '💬 Comment', callback_data: `comment:${articleId}` },
                    { text: '🔗 Share', callback_data: `share:${articleId}` }
                ]
            ]
        };
    }
    
    /**
     * Escape markdown
     */
    escapeMarkdown(text) {
        if (!text) return '';
        return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
    }
    
    /**
     * Check group permissions
     */
    async checkGroupPermissions(groupId) {
        try {
            const botMember = await this.bot.telegram.getChatMember(groupId, this.bot.botInfo.id);
            
            const permissions = {
                isAdmin: botMember.status === 'administrator',
                canPost: botMember.can_post_messages !== false,
                canEdit: botMember.can_edit_messages !== false,
                canDelete: botMember.can_delete_messages !== false,
                canPin: botMember.can_pin_messages !== false
            };
            
            return {
                hasPermissions: permissions.isAdmin || permissions.canPost,
                permissions,
                status: botMember.status
            };
        } catch (error) {
            return {
                hasPermissions: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get reaction analytics for an article
     */
    async getReactionAnalytics(articleId) {
        try {
            // Get total reactions from article
            const article = await this.db.collection('news_articles')
                .findOne({ _id: new ObjectId(articleId) });
                
            const totalReactions = article?.total_reactions || { like: 0, love: 0, fire: 0 };
            
            // Get all posts of this article
            const posts = await this.db.collection('posted_articles')
                .find({ article_id: new ObjectId(articleId) })
                .toArray();
            
            // Get unique users who reacted
            const uniqueUsers = await this.db.collection('global_reactions')
                .distinct('user_id', { article_id: new ObjectId(articleId) });
            
            // Get reaction distribution by chat type
            const reactionsByChat = await this.db.collection('user_reactions')
                .aggregate([
                    { $match: { article_id: new ObjectId(articleId) } },
                    { $group: {
                        _id: { chat_type: '$chat_type', reaction: '$reaction' },
                        count: { $sum: 1 }
                    }}
                ])
                .toArray();
            
            // Get top reacting users
            const topReactors = await this.db.collection('global_reactions')
                .aggregate([
                    { $match: { article_id: new ObjectId(articleId) } },
                    { $group: {
                        _id: '$user_id',
                        username: { $first: '$username' },
                        total_reactions: { $sum: '$reaction_count' }
                    }},
                    { $sort: { total_reactions: -1 } },
                    { $limit: 10 }
                ])
                .toArray();
            
            return {
                article_id: articleId,
                article_title: article?.title,
                total_reactions: totalReactions,
                unique_reactors: uniqueUsers.length,
                posts_count: posts.length,
                reaction_distribution: reactionsByChat,
                top_reactors: topReactors,
                last_reaction_at: article?.last_reaction_at
            };
        } catch (error) {
            console.error('Get reaction analytics error:', error);
            return null;
        }
    }
    
    /**
     * Get user reaction history
     */
    async getUserReactionHistory(userId, limit = 50) {
        try {
            const reactions = await this.db.collection('user_reactions')
                .find({ user_id: userId })
                .sort({ created_at: -1 })
                .limit(limit)
                .toArray();
            
            // Get article details for each reaction
            const articleIds = [...new Set(reactions.map(r => r.article_id.toString()))];
            const articles = await this.db.collection('news_articles')
                .find({ _id: { $in: articleIds.map(id => new ObjectId(id)) } })
                .toArray();
            
            const articleMap = {};
            articles.forEach(a => {
                articleMap[a._id.toString()] = a;
            });
            
            return reactions.map(r => ({
                ...r,
                article: articleMap[r.article_id.toString()]
            }));
        } catch (error) {
            console.error('Get user reaction history error:', error);
            return [];
        }
    }
    
    // ==================== Scheduling Features ====================
    
    /**
     * Schedule a post for future publication
     */
    async schedulePost(articleId, destinationId, scheduleTime, userId) {
        try {
            const scheduledPost = {
                _id: new ObjectId(),
                article_id: new ObjectId(articleId),
                destination_id: new ObjectId(destinationId),
                scheduled_time: new Date(scheduleTime),
                scheduled_by: userId,
                status: 'scheduled',
                created_at: new Date()
            };
            
            await this.db.collection('scheduled_posts').insertOne(scheduledPost);
            
            this.emit('post:scheduled', scheduledPost);
            return { success: true, postId: scheduledPost._id };
        } catch (error) {
            console.error('Schedule post error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Process scheduled posts
     */
    async processScheduledPosts() {
        try {
            const now = new Date();
            const scheduledPosts = await this.db.collection('scheduled_posts')
                .find({
                    status: 'scheduled',
                    scheduled_time: { $lte: now }
                })
                .toArray();
            
            for (const post of scheduledPosts) {
                // Add to queue for processing
                this.postQueue.push({
                    type: 'scheduled',
                    postId: post._id,
                    articleId: post.article_id,
                    destinationId: post.destination_id,
                    userId: post.scheduled_by
                });
                
                // Update status
                await this.db.collection('scheduled_posts').updateOne(
                    { _id: post._id },
                    { $set: { status: 'queued' } }
                );
            }
        } catch (error) {
            console.error('Process scheduled posts error:', error);
        }
    }
    
    /**
     * Cancel scheduled post
     */
    async cancelScheduledPost(postId, userId) {
        try {
            const result = await this.db.collection('scheduled_posts').updateOne(
                { _id: new ObjectId(postId), scheduled_by: userId, status: 'scheduled' },
                { $set: { status: 'cancelled', cancelled_at: new Date() } }
            );
            
            return { success: result.modifiedCount > 0 };
        } catch (error) {
            console.error('Cancel scheduled post error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ==================== Queue Management ====================
    
    /**
     * Add post to queue
     */
    async addToQueue(articleId, destinationId, userId, priority = 'normal') {
        const queueItem = {
            id: new ObjectId(),
            type: 'immediate',
            articleId: new ObjectId(articleId),
            destinationId: new ObjectId(destinationId),
            userId,
            priority,
            added_at: new Date(),
            attempts: 0
        };
        
        if (priority === 'high') {
            this.postQueue.unshift(queueItem);
        } else {
            this.postQueue.push(queueItem);
        }
        
        this.emit('queue:added', queueItem);
        return queueItem;
    }
    
    /**
     * Process post queue
     */
    async processPostQueue() {
        if (this.processing || this.postQueue.length === 0) return;
        
        this.processing = true;
        const item = this.postQueue.shift();
        
        try {
            const result = await this.postArticle(
                item.articleId,
                item.destinationId,
                item.userId
            );
            
            if (!result.success && item.attempts < 3) {
                item.attempts++;
                this.postQueue.push(item); // Retry
            } else if (!result.success) {
                this.emit('queue:failed', { item, error: result.error });
            }
            
            // Update scheduled post status if applicable
            if (item.type === 'scheduled' && item.postId) {
                await this.db.collection('scheduled_posts').updateOne(
                    { _id: item.postId },
                    { 
                        $set: { 
                            status: result.success ? 'posted' : 'failed',
                            posted_at: result.success ? new Date() : null,
                            error: result.error || null
                        }
                    }
                );
            }
        } catch (error) {
            console.error('Queue processing error:', error);
            if (item.attempts < 3) {
                item.attempts++;
                this.postQueue.push(item);
            }
        }
        
        this.processing = false;
    }
    
    // ==================== Template Management ====================
    
    /**
     * Create post template
     */
    async createTemplate(userId, templateData) {
        try {
            const template = {
                _id: new ObjectId(),
                user_id: userId,
                name: templateData.name,
                content: templateData.content,
                formatting: templateData.formatting || {},
                buttons: templateData.buttons || [],
                tags: templateData.tags || [],
                created_at: new Date(),
                usage_count: 0
            };
            
            await this.db.collection('post_templates').insertOne(template);
            return { success: true, template };
        } catch (error) {
            console.error('Create template error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Apply template to post
     */
    async applyTemplate(templateId, articleData) {
        try {
            const template = await this.db.collection('post_templates')
                .findOne({ _id: new ObjectId(templateId) });
            
            if (!template) {
                throw new Error('Template not found');
            }
            
            // Update usage count
            await this.db.collection('post_templates').updateOne(
                { _id: new ObjectId(templateId) },
                { $inc: { usage_count: 1 } }
            );
            
            // Merge template with article data
            const formattedContent = template.content
                .replace('{title}', articleData.title || '')
                .replace('{content}', articleData.content || '')
                .replace('{summary}', articleData.summary || '')
                .replace('{url}', articleData.url || '')
                .replace('{date}', new Date(articleData.published_date).toLocaleDateString('en-AU'));
            
            return {
                content: formattedContent,
                formatting: template.formatting,
                buttons: template.buttons
            };
        } catch (error) {
            console.error('Apply template error:', error);
            return null;
        }
    }
    
    // ==================== Bulk Operations ====================
    
    /**
     * Bulk post to multiple destinations
     */
    async bulkPost(articleId, destinationIds, userId) {
        const results = {
            success: [],
            failed: []
        };
        
        for (const destId of destinationIds) {
            const result = await this.addToQueue(articleId, destId, userId);
            if (result) {
                results.success.push(destId);
            } else {
                results.failed.push(destId);
            }
        }
        
        return results;
    }
    
    /**
     * Bulk schedule posts
     */
    async bulkSchedule(posts, userId) {
        const results = {
            success: [],
            failed: []
        };
        
        for (const post of posts) {
            const result = await this.schedulePost(
                post.articleId,
                post.destinationId,
                post.scheduleTime,
                userId
            );
            
            if (result.success) {
                results.success.push(result.postId);
            } else {
                results.failed.push({ ...post, error: result.error });
            }
        }
        
        return results;
    }
    
    // ==================== Statistics & Reporting ====================
    
    /**
     * Get posting statistics
     */
    async getPostingStats(userId, timeRange = 'week') {
        try {
            const now = new Date();
            let startDate;
            
            switch (timeRange) {
                case 'day':
                    startDate = new Date(now - 24 * 60 * 60 * 1000);
                    break;
                case 'week':
                    startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
            }
            
            // Get posted articles
            const posted = await this.db.collection('posted_articles')
                .find({
                    posted_by: userId,
                    posted_at: { $gte: startDate }
                })
                .toArray();
            
            // Get scheduled posts
            const scheduled = await this.db.collection('scheduled_posts')
                .find({
                    scheduled_by: userId,
                    status: 'scheduled'
                })
                .toArray();
            
            // Aggregate reactions
            const totalReactions = posted.reduce((sum, post) => {
                const reactions = post.reactions || {};
                return sum + (reactions.like || 0) + (reactions.love || 0) + (reactions.fire || 0);
            }, 0);
            
            // Get top performing posts
            const topPosts = posted
                .sort((a, b) => {
                    const aReactions = (a.reactions?.like || 0) + (a.reactions?.love || 0) + (a.reactions?.fire || 0);
                    const bReactions = (b.reactions?.like || 0) + (b.reactions?.love || 0) + (b.reactions?.fire || 0);
                    return bReactions - aReactions;
                })
                .slice(0, 5);
            
            return {
                period: timeRange,
                total_posted: posted.length,
                total_scheduled: scheduled.length,
                total_reactions: totalReactions,
                average_reactions: posted.length > 0 ? (totalReactions / posted.length).toFixed(2) : 0,
                top_posts: topPosts,
                posting_times: this.analyzePostingTimes(posted)
            };
        } catch (error) {
            console.error('Get posting stats error:', error);
            return null;
        }
    }
    
    /**
     * Analyze optimal posting times
     */
    analyzePostingTimes(posts) {
        const hourlyStats = {};
        
        posts.forEach(post => {
            const hour = new Date(post.posted_at).getHours();
            if (!hourlyStats[hour]) {
                hourlyStats[hour] = { count: 0, reactions: 0 };
            }
            hourlyStats[hour].count++;
            const reactions = (post.reactions?.like || 0) + (post.reactions?.love || 0) + (post.reactions?.fire || 0);
            hourlyStats[hour].reactions += reactions;
        });
        
        // Calculate average reactions per hour
        Object.keys(hourlyStats).forEach(hour => {
            hourlyStats[hour].average = hourlyStats[hour].reactions / hourlyStats[hour].count;
        });
        
        // Find best posting times
        const sortedHours = Object.entries(hourlyStats)
            .sort((a, b) => b[1].average - a[1].average)
            .slice(0, 3);
        
        return {
            best_hours: sortedHours.map(([hour, stats]) => ({
                hour: parseInt(hour),
                average_reactions: stats.average.toFixed(2)
            })),
            hourly_distribution: hourlyStats
        };
    }
    
    // ==================== Auto-posting Features ====================
    
    /**
     * Setup auto-posting for a channel
     */
    async setupAutoPosting(destinationId, config, userId) {
        try {
            const autoPost = {
                _id: new ObjectId(),
                destination_id: new ObjectId(destinationId),
                user_id: userId,
                enabled: true,
                config: {
                    frequency: config.frequency || 'daily', // hourly, daily, weekly
                    times: config.times || ['09:00', '18:00'],
                    categories: config.categories || [],
                    min_score: config.minScore || 0,
                    template_id: config.templateId || null
                },
                created_at: new Date(),
                last_posted: null
            };
            
            await this.db.collection('auto_posting').insertOne(autoPost);
            
            // Setup cron job
            this.setupAutoPostingJob(autoPost);
            
            return { success: true, autoPostId: autoPost._id };
        } catch (error) {
            console.error('Setup auto-posting error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Setup cron job for auto-posting
     */
    setupAutoPostingJob(autoPost) {
        const jobId = `auto_${autoPost._id}`;
        
        // Clear existing job if any
        if (this.scheduledJobs.has(jobId)) {
            this.scheduledJobs.get(jobId).stop();
        }
        
        // Create cron pattern based on frequency
        let cronPattern;
        switch (autoPost.config.frequency) {
            case 'hourly':
                cronPattern = '0 * * * *';
                break;
            case 'daily':
                const times = autoPost.config.times;
                times.forEach(time => {
                    const [hour, minute] = time.split(':');
                    const pattern = `${minute} ${hour} * * *`;
                    const job = cron.schedule(pattern, async () => {
                        await this.executeAutoPost(autoPost);
                    });
                    this.scheduledJobs.set(`${jobId}_${time}`, job);
                });
                return;
            case 'weekly':
                cronPattern = '0 9 * * MON';
                break;
            default:
                cronPattern = '0 9 * * *';
        }
        
        if (cronPattern) {
            const job = cron.schedule(cronPattern, async () => {
                await this.executeAutoPost(autoPost);
            });
            this.scheduledJobs.set(jobId, job);
        }
    }
    
    /**
     * Execute auto-post
     */
    async executeAutoPost(autoPost) {
        try {
            // Find suitable article
            const query = {
                published_date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            };
            
            if (autoPost.config.categories?.length > 0) {
                query.category = { $in: autoPost.config.categories };
            }
            
            const article = await this.db.collection('news_articles')
                .findOne(query, { sort: { published_date: -1 } });
            
            if (article) {
                await this.addToQueue(
                    article._id,
                    autoPost.destination_id,
                    autoPost.user_id,
                    'normal'
                );
                
                // Update last posted time
                await this.db.collection('auto_posting').updateOne(
                    { _id: autoPost._id },
                    { $set: { last_posted: new Date() } }
                );
            }
        } catch (error) {
            console.error('Execute auto-post error:', error);
        }
    }
}

module.exports = PostManager;