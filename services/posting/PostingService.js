/**
 * PostingService - Handles all posting operations
 * Single Responsibility: Post messages to channels and groups
 */

class PostingService {
    constructor(database) {
        this.bot = null;
        this.db = database;
        this.postQueue = [];
        this.isAutoPosting = false;
    }

    setBot(bot) {
        this.bot = bot;
    }

    async initialize() {
        // Set up auto-posting if configured
        if (process.env.AUTO_POST_ENABLED === 'true') {
            this.startAutoPosting();
        }
    }

    /**
     * Post article to channel
     */
    async postToChannel(channelId, article) {
        try {
            const message = this.formatArticle(article);
            const result = await this.bot.telegram.sendMessage(
                channelId,
                message,
                { 
                    parse_mode: 'HTML',
                    disable_web_page_preview: false
                }
            );
            
            // Mark as posted in database
            if (this.db) {
                await this.db.collection('news_articles').updateOne(
                    { _id: article._id },
                    { 
                        $set: { 
                            posted_to_channel: true,
                            posted_date: new Date(),
                            message_id: result.message_id
                        }
                    }
                );
            }
            
            return { success: true, messageId: result.message_id };
        } catch (error) {
            console.error(`Failed to post to ${channelId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Post to multiple channels
     */
    async postToMultipleChannels(channelIds, article) {
        const results = [];
        for (const channelId of channelIds) {
            const result = await this.postToChannel(channelId, article);
            results.push({ channelId, ...result });
        }
        return results;
    }

    /**
     * Format article for posting
     */
    formatArticle(article) {
        return `
📰 <b>${article.title}</b>

${article.content || article.excerpt}

${article.source ? `📍 Source: ${article.source}` : ''}
${article.category ? `🏷 ${article.category}` : ''}
${article.url ? `\n🔗 ${article.url}` : ''}
        `.trim();
    }

    /**
     * Start auto-posting
     */
    startAutoPosting() {
        if (this.isAutoPosting) return;
        
        this.isAutoPosting = true;
        const interval = parseInt(process.env.AUTO_POST_INTERVAL || '3600000'); // 1 hour default
        
        this.autoPostInterval = setInterval(async () => {
            await this.autoPost();
        }, interval);
        
        console.log('⏰ Auto-posting started');
    }

    /**
     * Stop auto-posting
     */
    stopAutoPosting() {
        if (this.autoPostInterval) {
            clearInterval(this.autoPostInterval);
            this.isAutoPosting = false;
            console.log('⏰ Auto-posting stopped');
        }
    }

    /**
     * Auto post next article
     */
    async autoPost() {
        if (!this.db) return;
        
        const article = await this.db.collection('news_articles')
            .findOne(
                { posted_to_channel: { $ne: true } },
                { sort: { published_date: -1 } }
            );
        
        if (article) {
            const channelId = process.env.PRIMARY_CHANNEL || '@ZoneNewsAdl';
            await this.postToChannel(channelId, article);
            console.log(`🤖 Auto-posted: ${article.title}`);
        }
    }
}

module.exports = PostingService;