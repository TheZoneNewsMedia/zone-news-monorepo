#!/usr/bin/env node

/**
 * Article Processor Service
 * Transforms raw telegram posts into formatted news articles
 * Part of Zone News Monorepo
 */

const { MongoClient } = require('mongodb');
const cron = require('node-cron');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zone_news_production';
const PROCESS_INTERVAL = process.env.PROCESS_INTERVAL || '*/5 * * * *'; // Every 5 minutes

class ArticleProcessorService {
    constructor() {
        this.client = null;
        this.db = null;
        this.isProcessing = false;
        this.stats = {
            processed: 0,
            skipped: 0,
            errors: 0,
            lastRun: null
        };
    }

    async initialize() {
        try {
            this.client = new MongoClient(MONGODB_URI);
            await this.client.connect();
            this.db = this.client.db('zone_news_production');
            console.log('✅ Article Processor Service initialized');
            console.log(`📊 Connected to database: ${this.db.databaseName}`);
            
            // Check current status
            await this.checkStatus();
            
            // Start continuous processing
            if (process.env.MODE === 'continuous') {
                this.startContinuousProcessing();
            }
            
            return true;
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            throw error;
        }
    }

    async checkStatus() {
        const collections = [
            'telegram_zone_news',
            'tbc_posts',
            'raw_channel_posts',
            'news_articles'
        ];

        console.log('\n📊 Current Database Status:');
        for (const collection of collections) {
            const count = await this.db.collection(collection).countDocuments();
            console.log(`   ${collection}: ${count} documents`);
        }
    }

    extractTitle(text) {
        if (!text) return 'Untitled';
        
        // Extract first line or first 100 chars as title
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
            let title = lines[0].trim();
            
            // Remove emojis from title for cleaner display
            title = title.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
            
            return title.length > 100 ? title.substring(0, 97) + '...' : title;
        }
        
        return text.substring(0, 100);
    }

    extractContent(text) {
        if (!text) return '';
        
        // Clean up content
        let content = text
            .replace(/Source:.*$/gm, '')
            .replace(/Link:.*$/gm, '')
            .replace(/https?:\/\/\S+/g, '') // Remove URLs for cleaner text
            .trim();
        
        // Preserve line breaks for readability
        content = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n\n');
        
        return content;
    }

    determineCategory(text, channel) {
        // Topic 9 for TBC channel
        if (channel === '@TheBlokeChain' || channel === '@TBC') {
            return 'Technology'; // Topic 9 = Tech/Crypto
        }

        const categoryKeywords = {
            'Technology': ['robot', 'ai', 'tech', 'software', 'cyber', 'digital', 'computer', 'blockchain', 'crypto'],
            'Sports': ['football', 'cricket', 'rugby', 'soccer', 'sport', 'game', 'match', 'team', 'afl', 'adelaide united'],
            'Business': ['business', 'economy', 'market', 'trade', 'finance', 'company', 'stock', 'investment'],
            'Politics': ['election', 'government', 'parliament', 'minister', 'policy', 'political', 'labor', 'liberal'],
            'Entertainment': ['movie', 'music', 'concert', 'festival', 'art', 'theatre', 'celebrity', 'fringe'],
            'Health': ['health', 'medical', 'hospital', 'doctor', 'disease', 'treatment', 'covid', 'vaccine'],
            'Education': ['school', 'university', 'education', 'student', 'teacher', 'learning', 'adelaide uni'],
            'Local News': ['adelaide', 'local', 'community', 'council', 'suburb', 'sa', 'south australia'],
            'Crime': ['police', 'crime', 'court', 'arrest', 'charged', 'incident', 'investigation'],
            'Weather': ['weather', 'temperature', 'rain', 'storm', 'forecast', 'bureau', 'climate']
        };

        const lowerText = text.toLowerCase();
        
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            const matchCount = keywords.filter(keyword => lowerText.includes(keyword)).length;
            if (matchCount >= 2) {
                return category;
            }
        }
        
        // Single keyword match
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(keyword => lowerText.includes(keyword))) {
                return category;
            }
        }
        
        return 'General';
    }

    extractTags(text) {
        const tags = new Set();
        
        // Extract hashtags
        const hashtags = text.match(/#\w+/g);
        if (hashtags) {
            hashtags.forEach(tag => tags.add(tag.substring(1).toLowerCase()));
        }
        
        // Add location tags
        if (text.toLowerCase().includes('adelaide')) tags.add('adelaide');
        if (text.toLowerCase().includes('south australia')) tags.add('southaustralia');
        
        // Add topic tags based on content
        const topicKeywords = {
            'breaking': 'breaking',
            'update': 'update',
            'alert': 'alert',
            'exclusive': 'exclusive',
            'live': 'live',
            'urgent': 'urgent'
        };
        
        for (const [keyword, tag] of Object.entries(topicKeywords)) {
            if (text.toLowerCase().includes(keyword)) {
                tags.add(tag);
            }
        }
        
        return Array.from(tags).slice(0, 10); // Limit to 10 tags
    }

    extractImageUrl(text, media) {
        // If media exists, use appropriate stock image based on category
        if (media) {
            const category = this.determineCategory(text, '');
            const stockImages = {
                'Technology': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
                'Sports': 'https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=800',
                'Business': 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
                'Politics': 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800',
                'Entertainment': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
                'Health': 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800',
                'Education': 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800',
                'Local News': 'https://images.unsplash.com/photo-1577017040065-650ee4d43339?w=800', // Adelaide
                'Crime': 'https://images.unsplash.com/photo-1589994965851-a8f479c573a9?w=800',
                'Weather': 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=800',
                'General': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800'
            };
            
            return stockImages[category] || stockImages['General'];
        }
        
        return null;
    }

    async checkDuplicate(messageId, channel) {
        const existing = await this.db.collection('news_articles').findOne({
            'telegram_data.message_id': messageId,
            'telegram_data.channel': channel
        });
        
        return existing !== null;
    }

    async processArticle(telegramPost, source = 'telegram_zone_news') {
        try {
            const { 
                text, 
                message_id, 
                date, 
                views, 
                forwards, 
                replies,
                channel, 
                media,
                reactions,
                edited,
                posted_to_tbc,
                tbc_message_id
            } = telegramPost;
            
            // Skip if no text content
            if (!text || text.trim().length < 50) {
                this.stats.skipped++;
                return null;
            }
            
            // Check for duplicates
            if (await this.checkDuplicate(message_id, channel)) {
                this.stats.skipped++;
                return null;
            }
            
            // Transform to news_articles format
            const article = {
                title: this.extractTitle(text),
                content: this.extractContent(text),
                author: this.getAuthorName(channel),
                source: 'Zone News',
                category: this.determineCategory(text, channel),
                location: 'Adelaide, SA',
                views: views || 0,
                likes: this.calculateLikes(reactions),
                shares: forwards || 0,
                comments: replies || 0,
                published_date: date || new Date(),
                url: `https://t.me/${channel.replace('@', '')}/${message_id}`,
                image_url: this.extractImageUrl(text, media),
                is_trending: views > 100 || forwards > 10,
                engagement_score: 0,
                tags: this.extractTags(text),
                telegram_data: {
                    message_id,
                    channel,
                    reactions: reactions || {},
                    forwards: forwards || 0,
                    edited: edited || false,
                    source_collection: source
                },
                cross_posting: {
                    posted_to_tbc: posted_to_tbc || false,
                    tbc_message_id: tbc_message_id || null
                },
                metadata: {
                    processed_at: new Date(),
                    processor_version: '2.0.0',
                    auto_categorized: true
                },
                status: 'published'
            };
            
            // Calculate engagement score
            const totalEngagement = (views || 0) + (forwards || 0) * 2 + (replies || 0) * 1.5;
            article.engagement_score = Math.min(totalEngagement / 1000, 1);
            
            // Insert into news_articles
            await this.db.collection('news_articles').insertOne(article);
            this.stats.processed++;
            
            console.log(`✅ Processed: ${article.title.substring(0, 50)}...`);
            
            return article;
        } catch (error) {
            console.error(`❌ Error processing article ${telegramPost.message_id}:`, error.message);
            this.stats.errors++;
            return null;
        }
    }

    getAuthorName(channel) {
        const channelAuthors = {
            '@ZoneNewsAdl': 'Zone News Adelaide',
            '@TheBlokeChain': 'The Bloke Chain',
            '@TBC': 'TBC News',
            '@ZoneNews': 'Zone News'
        };
        
        return channelAuthors[channel] || 'Zone News';
    }

    calculateLikes(reactions) {
        if (!reactions || typeof reactions !== 'object') return 0;
        
        // Sum all positive reactions
        const positiveEmojis = ['👍', '❤️', '🔥', '👏', '😍', '🎉', '💯'];
        let likes = 0;
        
        for (const [emoji, count] of Object.entries(reactions)) {
            if (positiveEmojis.includes(emoji)) {
                likes += count;
            }
        }
        
        return likes;
    }

    async processAllSources() {
        console.log('\n🔄 Processing articles from all sources...');
        
        const sources = [
            { collection: 'telegram_zone_news', name: 'Zone News Channel' },
            { collection: 'tbc_posts', name: 'TBC Channel' },
            { collection: 'raw_channel_posts', name: 'Raw Channel Posts' }
        ];
        
        for (const source of sources) {
            console.log(`\n📁 Processing ${source.name}...`);
            
            const cursor = this.db.collection(source.collection).find({});
            const total = await this.db.collection(source.collection).countDocuments();
            
            console.log(`   Found ${total} posts to process`);
            
            let count = 0;
            while (await cursor.hasNext()) {
                const post = await cursor.next();
                count++;
                
                if (count % 25 === 0) {
                    console.log(`   Progress: ${count}/${total} (${Math.round(count/total*100)}%)`);
                }
                
                await this.processArticle(post, source.collection);
            }
        }
        
        this.stats.lastRun = new Date();
        await this.saveStats();
    }

    async saveStats() {
        await this.db.collection('processor_stats').replaceOne(
            { service: 'article-processor' },
            {
                service: 'article-processor',
                stats: this.stats,
                updated_at: new Date()
            },
            { upsert: true }
        );
    }

    startContinuousProcessing() {
        console.log(`\n🔄 Starting continuous processing (${PROCESS_INTERVAL})`);
        
        cron.schedule(PROCESS_INTERVAL, async () => {
            if (this.isProcessing) {
                console.log('⏭️ Skipping run - previous processing still active');
                return;
            }
            
            this.isProcessing = true;
            console.log(`\n⏰ Processing run started at ${new Date().toISOString()}`);
            
            try {
                await this.processAllSources();
                console.log('✅ Processing run completed');
            } catch (error) {
                console.error('❌ Processing run failed:', error);
            } finally {
                this.isProcessing = false;
            }
        });
    }

    async getStatistics() {
        const stats = {
            news_articles: await this.db.collection('news_articles').countDocuments(),
            telegram_zone_news: await this.db.collection('telegram_zone_news').countDocuments(),
            tbc_posts: await this.db.collection('tbc_posts').countDocuments(),
            raw_channel_posts: await this.db.collection('raw_channel_posts').countDocuments(),
            processor_stats: this.stats
        };
        
        return stats;
    }

    async cleanup() {
        if (this.client) {
            await this.client.close();
            console.log('👋 Service shutdown complete');
        }
    }
}

async function main() {
    const processor = new ArticleProcessorService();
    
    try {
        await processor.initialize();
        
        // Process once
        await processor.processAllSources();
        
        // Show final statistics
        const stats = await processor.getStatistics();
        console.log('\n📊 Final Statistics:');
        console.log(JSON.stringify(stats, null, 2));
        
        // If in daemon mode, keep running
        if (process.env.MODE === 'continuous') {
            console.log('\n🚀 Service running in continuous mode');
            console.log('Press Ctrl+C to stop');
            
            // Keep process alive
            process.on('SIGINT', async () => {
                console.log('\n⏹️ Stopping service...');
                await processor.cleanup();
                process.exit(0);
            });
        } else {
            await processor.cleanup();
        }
    } catch (error) {
        console.error('Fatal error:', error);
        await processor.cleanup();
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = ArticleProcessorService;