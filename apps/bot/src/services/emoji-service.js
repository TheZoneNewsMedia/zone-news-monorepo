/**
 * Custom Emoji Service for Zone News Bot
 * Handles custom emoji parsing and rendering in messages
 */

class CustomEmojiService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        
        // Cache for custom emoji documents
        this.emojiCache = new Map();
        this.emojiKeywords = new Map();
        
        // Configuration
        this.config = {
            maxCustomEmojis: 100, // Maximum custom emojis per message
            cacheExpiry: 3600000, // 1 hour cache
            supportedLanguages: ['en', 'ru', 'es', 'fr', 'de']
        };
    }

    async initialize() {
        try {
            console.log('🎨 Initializing Custom Emoji Service');
            
            // Setup database collections
            await this.setupCollections();
            
            // Load emoji keywords for supported languages
            await this.loadEmojiKeywords();
            
            console.log('✅ Custom Emoji Service initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Custom Emoji Service:', error);
            return false;
        }
    }

    async setupCollections() {
        const collections = await this.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        if (!collectionNames.includes('custom_emojis')) {
            await this.db.createCollection('custom_emojis');
        }
        
        if (!collectionNames.includes('emoji_keywords')) {
            await this.db.createCollection('emoji_keywords');
        }
        
        // Create indexes
        await this.db.collection('custom_emojis').createIndexes([
            { key: { document_id: 1 }, unique: true },
            { key: { alt: 1 } },
            { key: { cached_at: 1 } }
        ]);
        
        await this.db.collection('emoji_keywords').createIndexes([
            { key: { lang_code: 1, keyword: 1 } },
            { key: { emoticons: 1 } }
        ]);
    }

    /**
     * Parse message text for custom emojis
     */
    parseCustomEmojis(text) {
        const customEmojis = [];
        const emojiRegex = /:([\w_]+):/g;
        let match;
        
        while ((match = emojiRegex.exec(text)) !== null) {
            customEmojis.push({
                offset: match.index,
                length: match[0].length,
                emoji_name: match[1]
            });
        }
        
        return customEmojis;
    }

    /**
     * Format text with custom emoji entities
     */
    async formatWithCustomEmojis(text, customEmojiMap = {}) {
        const entities = [];
        
        // Parse custom emoji placeholders like :emoji_name:
        const emojiPattern = /:([a-zA-Z0-9_]+):/g;
        let processedText = text;
        let offset = 0;
        
        const matches = [...text.matchAll(emojiPattern)];
        
        for (const match of matches) {
            const emojiName = match[1];
            const documentId = customEmojiMap[emojiName];
            
            if (documentId) {
                // Replace :emoji_name: with a regular emoji placeholder
                const replacement = '😀'; // Use as placeholder
                const startIndex = match.index - offset;
                
                processedText = processedText.substring(0, startIndex) + 
                               replacement + 
                               processedText.substring(startIndex + match[0].length);
                
                // Add custom emoji entity
                entities.push({
                    type: 'custom_emoji',
                    offset: startIndex,
                    length: replacement.length,
                    custom_emoji_id: documentId
                });
                
                // Update offset for next replacements
                offset += match[0].length - replacement.length;
            }
        }
        
        return {
            text: processedText,
            entities
        };
    }

    /**
     * Create message with custom emojis for articles
     */
    async createArticleWithEmojis(article, customEmojis = {}) {
        const { title, content, category, source, link } = article;
        
        // Format title with custom emojis if present
        let formattedTitle = title;
        let titleEntities = [];
        
        if (title.includes(':')) {
            const titleFormatted = await this.formatWithCustomEmojis(title, customEmojis);
            formattedTitle = titleFormatted.text;
            titleEntities = titleFormatted.entities;
        }
        
        // Format content with custom emojis
        let formattedContent = content;
        let contentEntities = [];
        
        if (content.includes(':')) {
            const contentFormatted = await this.formatWithCustomEmojis(content, customEmojis);
            formattedContent = contentFormatted.text;
            contentEntities = contentFormatted.entities.map(e => ({
                ...e,
                offset: e.offset + formattedTitle.length + 2 // Account for title and newlines
            }));
        }
        
        // Build complete message
        let messageText = `<b>${formattedTitle}</b>\n\n`;
        messageText += `${formattedContent}\n\n`;
        
        // Add premium emoji indicators for categories
        const categoryEmojis = {
            'Technology': '💻',
            'International': '🌍',
            'Social Issues': '👥',
            'Economy': '💰',
            'Sports': '⚽',
            'Entertainment': '🎬',
            'Health': '🏥',
            'Science': '🔬'
        };
        
        const categoryEmoji = categoryEmojis[category] || '📰';
        messageText += `${categoryEmoji} <b>Category:</b> ${category}\n`;
        messageText += `📝 <b>Source:</b> ${source}\n`;
        
        if (link) {
            messageText += `🔗 <b>Link:</b> <a href="${link}">Read more</a>`;
        }
        
        // Combine all entities
        const allEntities = [
            ...titleEntities,
            ...contentEntities,
            { type: 'bold', offset: 0, length: formattedTitle.length },
            { type: 'bold', offset: messageText.indexOf('Category:') - 1, length: 9 },
            { type: 'bold', offset: messageText.indexOf('Source:') - 1, length: 7 }
        ];
        
        if (link) {
            allEntities.push({
                type: 'bold',
                offset: messageText.indexOf('Link:') - 1,
                length: 5
            });
        }
        
        return {
            text: messageText,
            entities: allEntities,
            parse_mode: 'HTML'
        };
    }

    /**
     * Load emoji keywords for searching
     */
    async loadEmojiKeywords() {
        try {
            // Check if we have cached keywords
            const cachedKeywords = await this.db.collection('emoji_keywords')
                .find({ updated_at: { $gte: new Date(Date.now() - 86400000) } }) // 24 hours
                .toArray();
            
            if (cachedKeywords.length > 0) {
                cachedKeywords.forEach(kw => {
                    this.emojiKeywords.set(`${kw.lang_code}:${kw.keyword}`, kw.emoticons);
                });
                console.log(`📚 Loaded ${cachedKeywords.length} cached emoji keywords`);
            }
            
            return true;
        } catch (error) {
            console.error('Error loading emoji keywords:', error);
            return false;
        }
    }

    /**
     * Search emojis by keyword
     */
    searchEmojisByKeyword(keyword, langCode = 'en') {
        const key = `${langCode}:${keyword.toLowerCase()}`;
        return this.emojiKeywords.get(key) || [];
    }

    /**
     * Get custom emoji sticker document
     */
    async getCustomEmojiDocument(documentId) {
        // Check cache first
        const cached = this.emojiCache.get(documentId);
        if (cached && cached.expiry > Date.now()) {
            return cached.document;
        }
        
        try {
            // In production, this would call Telegram's API
            // For now, return a placeholder
            const document = {
                id: documentId,
                type: 'custom_emoji',
                alt: '😀',
                animated: false,
                premium: true
            };
            
            // Cache the document
            this.emojiCache.set(documentId, {
                document,
                expiry: Date.now() + this.config.cacheExpiry
            });
            
            return document;
        } catch (error) {
            console.error(`Error fetching custom emoji ${documentId}:`, error);
            return null;
        }
    }

    /**
     * Validate custom emoji usage
     */
    validateCustomEmojis(entities) {
        const customEmojiCount = entities.filter(e => e.type === 'custom_emoji').length;
        
        if (customEmojiCount > this.config.maxCustomEmojis) {
            throw new Error(`Too many custom emojis. Maximum allowed: ${this.config.maxCustomEmojis}`);
        }
        
        return true;
    }

    /**
     * Create reaction keyboard with custom emojis
     */
    createCustomEmojiReactions(messageId, customReactions = {}) {
        // Default reactions with potential custom emoji IDs
        const reactions = [
            { emoji: '👍', custom_id: customReactions['thumbs_up'] },
            { emoji: '❤️', custom_id: customReactions['heart'] },
            { emoji: '🔥', custom_id: customReactions['fire'] },
            { emoji: '🎉', custom_id: customReactions['party'] },
            { emoji: '🤔', custom_id: customReactions['thinking'] },
            { emoji: '😢', custom_id: customReactions['sad'] }
        ];
        
        const buttons = reactions.map(r => {
            const display = r.custom_id ? `custom:${r.custom_id}` : r.emoji;
            return {
                text: display,
                callback_data: `react:${messageId}:${r.emoji}:${r.custom_id || 'standard'}`
            };
        });
        
        // Split into rows
        const rows = [];
        for (let i = 0; i < buttons.length; i += 3) {
            rows.push(buttons.slice(i, i + 3));
        }
        
        return { inline_keyboard: rows };
    }

    /**
     * Process article with premium emojis
     */
    async processArticleWithPremiumEmojis(article) {
        // Define premium emoji mappings for special content
        const premiumEmojis = {
            'breaking': '5000569394542078246', // Breaking news custom emoji
            'exclusive': '5000569394542078247', // Exclusive custom emoji
            'trending': '5000569394542078248', // Trending custom emoji
            'verified': '5000569394542078249', // Verified custom emoji
            'premium': '5000569394542078250'  // Premium content custom emoji
        };
        
        // Check for keywords that trigger premium emojis
        let enhancedTitle = article.title;
        let enhancedContent = article.content;
        
        // Add breaking news emoji if urgent
        if (article.urgent || article.title.toLowerCase().includes('breaking')) {
            enhancedTitle = `:breaking: ${enhancedTitle}`;
        }
        
        // Add exclusive emoji for exclusive content
        if (article.exclusive || article.source.toLowerCase().includes('exclusive')) {
            enhancedTitle = `${enhancedTitle} :exclusive:`;
        }
        
        // Add verified emoji for verified sources
        const verifiedSources = ['ABC News', 'The Guardian', 'Reuters', 'BBC'];
        if (verifiedSources.includes(article.source)) {
            enhancedContent = `${enhancedContent}\n\n:verified: Verified Source`;
        }
        
        // Create formatted message with custom emojis
        const formatted = await this.createArticleWithEmojis(
            { ...article, title: enhancedTitle, content: enhancedContent },
            premiumEmojis
        );
        
        return formatted;
    }

    /**
     * Get emoji statistics
     */
    async getEmojiStatistics() {
        const totalCustomEmojis = this.emojiCache.size;
        const totalKeywords = this.emojiKeywords.size;
        
        const recentUsage = await this.db.collection('custom_emojis')
            .find({ used_at: { $gte: new Date(Date.now() - 86400000) } })
            .count();
        
        return {
            cachedEmojis: totalCustomEmojis,
            keywords: totalKeywords,
            recentUsage,
            supportedLanguages: this.config.supportedLanguages
        };
    }
}

module.exports = CustomEmojiService;