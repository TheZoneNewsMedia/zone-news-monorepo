/**
 * Media Service - Handles media uploads and processing
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

class MediaService {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB max for Telegram
        this.supportedImageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        this.supportedVideoTypes = ['.mp4', '.mov', '.avi', '.mkv'];
        this.supportedDocTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    }
    
    /**
     * Handle media message from user
     */
    async handleMediaMessage(ctx) {
        try {
            const message = ctx.message;
            let mediaInfo = null;
            
            // Detect media type
            if (message.photo) {
                mediaInfo = await this.handlePhoto(ctx, message.photo);
            } else if (message.video) {
                mediaInfo = await this.handleVideo(ctx, message.video);
            } else if (message.document) {
                mediaInfo = await this.handleDocument(ctx, message.document);
            } else if (message.animation) {
                mediaInfo = await this.handleAnimation(ctx, message.animation);
            } else if (message.audio) {
                mediaInfo = await this.handleAudio(ctx, message.audio);
            }
            
            if (mediaInfo) {
                // Store media info in database
                await this.saveMediaInfo(ctx.from.id, mediaInfo);
                
                // Provide options for what to do with the media
                await this.showMediaOptions(ctx, mediaInfo);
            }
        } catch (error) {
            console.error('Error handling media:', error);
            await ctx.reply('❌ Failed to process media. Please try again.');
        }
    }
    
    /**
     * Handle photo upload
     */
    async handlePhoto(ctx, photos) {
        // Get highest resolution photo
        const photo = photos[photos.length - 1];
        
        // Get file info
        const file = await ctx.telegram.getFile(photo.file_id);
        
        return {
            type: 'photo',
            file_id: photo.file_id,
            file_unique_id: photo.file_unique_id,
            file_size: file.file_size,
            width: photo.width,
            height: photo.height,
            file_path: file.file_path,
            caption: ctx.message.caption || null
        };
    }
    
    /**
     * Handle video upload
     */
    async handleVideo(ctx, video) {
        // Check file size
        if (video.file_size > this.maxFileSize) {
            await ctx.reply('⚠️ Video file is too large. Maximum size is 50MB.');
            return null;
        }
        
        const file = await ctx.telegram.getFile(video.file_id);
        
        return {
            type: 'video',
            file_id: video.file_id,
            file_unique_id: video.file_unique_id,
            file_size: video.file_size,
            duration: video.duration,
            width: video.width,
            height: video.height,
            thumbnail: video.thumbnail,
            file_path: file.file_path,
            caption: ctx.message.caption || null
        };
    }
    
    /**
     * Handle document upload
     */
    async handleDocument(ctx, document) {
        const fileExt = path.extname(document.file_name || '').toLowerCase();
        
        // Check if it's a supported media file
        const isImage = this.supportedImageTypes.includes(fileExt);
        const isVideo = this.supportedVideoTypes.includes(fileExt);
        
        const file = await ctx.telegram.getFile(document.file_id);
        
        return {
            type: isImage ? 'photo' : isVideo ? 'video' : 'document',
            file_id: document.file_id,
            file_unique_id: document.file_unique_id,
            file_name: document.file_name,
            file_size: document.file_size,
            mime_type: document.mime_type,
            file_path: file.file_path,
            caption: ctx.message.caption || null
        };
    }
    
    /**
     * Handle animation (GIF)
     */
    async handleAnimation(ctx, animation) {
        const file = await ctx.telegram.getFile(animation.file_id);
        
        return {
            type: 'animation',
            file_id: animation.file_id,
            file_unique_id: animation.file_unique_id,
            file_size: animation.file_size,
            duration: animation.duration,
            width: animation.width,
            height: animation.height,
            file_path: file.file_path,
            caption: ctx.message.caption || null
        };
    }
    
    /**
     * Handle audio
     */
    async handleAudio(ctx, audio) {
        const file = await ctx.telegram.getFile(audio.file_id);
        
        return {
            type: 'audio',
            file_id: audio.file_id,
            file_unique_id: audio.file_unique_id,
            file_size: audio.file_size,
            duration: audio.duration,
            performer: audio.performer,
            title: audio.title,
            mime_type: audio.mime_type,
            file_path: file.file_path,
            caption: ctx.message.caption || null
        };
    }
    
    /**
     * Save media info to database
     */
    async saveMediaInfo(userId, mediaInfo) {
        await this.db.collection('user_media').insertOne({
            user_id: userId,
            ...mediaInfo,
            uploaded_at: new Date(),
            status: 'pending'
        });
    }
    
    /**
     * Show options for uploaded media
     */
    async showMediaOptions(ctx, mediaInfo) {
        const mediaType = mediaInfo.type.charAt(0).toUpperCase() + mediaInfo.type.slice(1);
        
        await ctx.reply(
            `✅ *${mediaType} Received*\n\n` +
            `📁 Size: ${this.formatFileSize(mediaInfo.file_size)}\n` +
            (mediaInfo.width ? `📐 Dimensions: ${mediaInfo.width}x${mediaInfo.height}\n` : '') +
            (mediaInfo.duration ? `⏱ Duration: ${this.formatDuration(mediaInfo.duration)}\n` : '') +
            '\nWhat would you like to do with this media?',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📰 Add to Article', callback_data: `media:article:${mediaInfo.file_id}` },
                            { text: '📤 Post Now', callback_data: `media:post:${mediaInfo.file_id}` }
                        ],
                        [
                            { text: '📅 Schedule Post', callback_data: `media:schedule:${mediaInfo.file_id}` },
                            { text: '💾 Save for Later', callback_data: `media:save:${mediaInfo.file_id}` }
                        ],
                        [
                            { text: '🗑️ Delete', callback_data: `media:delete:${mediaInfo.file_id}` }
                        ]
                    ]
                }
            }
        );
    }
    
    /**
     * Post media with article
     */
    async postMediaWithArticle(ctx, articleId, mediaFileId) {
        try {
            const article = await this.db.collection('news_articles')
                .findOne({ _id: new ObjectId(articleId) });
            
            const media = await this.db.collection('user_media')
                .findOne({ file_id: mediaFileId });
            
            if (!article || !media) {
                throw new Error('Article or media not found');
            }
            
            // Format message
            const message = this.formatArticleWithMedia(article, media);
            
            // Get destinations
            const destinations = await this.db.collection('destinations').find({}).toArray();
            
            for (const dest of destinations) {
                try {
                    // Send based on media type
                    let sentMessage;
                    const options = {
                        caption: message,
                        parse_mode: 'Markdown',
                        reply_markup: this.getArticleKeyboard(article)
                    };
                    
                    switch (media.type) {
                        case 'photo':
                            sentMessage = await ctx.telegram.sendPhoto(dest.id, media.file_id, options);
                            break;
                        case 'video':
                            sentMessage = await ctx.telegram.sendVideo(dest.id, media.file_id, options);
                            break;
                        case 'animation':
                            sentMessage = await ctx.telegram.sendAnimation(dest.id, media.file_id, options);
                            break;
                        case 'document':
                            sentMessage = await ctx.telegram.sendDocument(dest.id, media.file_id, options);
                            break;
                        default:
                            sentMessage = await ctx.telegram.sendMessage(dest.id, message, {
                                parse_mode: 'Markdown',
                                reply_markup: this.getArticleKeyboard(article)
                            });
                    }
                    
                    // Record post
                    await this.db.collection('posted_articles').insertOne({
                        article_id: article._id,
                        media_id: media._id,
                        destination: dest.id,
                        message_id: sentMessage.message_id,
                        posted_at: new Date(),
                        posted_by: ctx.from.id
                    });
                } catch (error) {
                    console.error(`Failed to post to ${dest.id}:`, error);
                }
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error posting media with article:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Handle media gallery for articles
     */
    async createMediaGallery(ctx, articleId, mediaIds) {
        try {
            const media = await this.db.collection('user_media')
                .find({ file_id: { $in: mediaIds } })
                .toArray();
            
            if (media.length === 0) {
                throw new Error('No media found');
            }
            
            // Create media group (album)
            const mediaGroup = media.map(m => {
                const baseMedia = {
                    media: m.file_id,
                    caption: m.caption || '',
                    parse_mode: 'Markdown'
                };
                
                switch (m.type) {
                    case 'photo':
                        return { ...baseMedia, type: 'photo' };
                    case 'video':
                        return { ...baseMedia, type: 'video' };
                    default:
                        return null;
                }
            }).filter(m => m !== null);
            
            if (mediaGroup.length > 0) {
                // Add article info to first media caption
                const article = await this.db.collection('news_articles')
                    .findOne({ _id: new ObjectId(articleId) });
                
                if (article) {
                    mediaGroup[0].caption = this.formatArticleWithMedia(article, null);
                }
                
                // Send media group to destinations
                const destinations = await this.db.collection('destinations').find({}).toArray();
                
                for (const dest of destinations) {
                    try {
                        await ctx.telegram.sendMediaGroup(dest.id, mediaGroup);
                    } catch (error) {
                        console.error(`Failed to send media group to ${dest.id}:`, error);
                    }
                }
            }
            
            return { success: true, count: mediaGroup.length };
        } catch (error) {
            console.error('Error creating media gallery:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Format article with media
     */
    formatArticleWithMedia(article, media) {
        const date = new Date(article.published_date).toLocaleDateString('en-AU');
        
        let message = `📰 *${article.title}*\n\n`;
        
        if (media && media.caption) {
            message += `${media.caption}\n\n`;
        }
        
        message += `${article.summary || article.content?.substring(0, 500)}...\n\n`;
        message += `📅 ${date} | 📂 ${article.category || 'General'}\n`;
        
        if (article.url) {
            message += `🔗 [Read More](${article.url})`;
        }
        
        return message;
    }
    
    /**
     * Get article keyboard with reactions
     */
    getArticleKeyboard(article) {
        const reactions = article.reactions || {};
        return {
            inline_keyboard: [
                [
                    { text: `👍 ${reactions.like || 0}`, callback_data: `react:like:${article._id}` },
                    { text: `❤️ ${reactions.love || 0}`, callback_data: `react:love:${article._id}` },
                    { text: `🔥 ${reactions.fire || 0}`, callback_data: `react:fire:${article._id}` }
                ],
                [
                    { text: '💬 Comment', callback_data: `comment:${article._id}` },
                    { text: '🔗 Share', callback_data: `share:${article._id}` }
                ]
            ]
        };
    }
    
    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    /**
     * Format duration
     */
    formatDuration(seconds) {
        if (!seconds) return 'Unknown';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * Download media from URL
     */
    async downloadMediaFromUrl(url, destination) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const file = fs.createWriteStream(destination);
            
            protocol.get(url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(destination);
                });
            }).on('error', (err) => {
                fs.unlink(destination, () => {});
                reject(err);
            });
        });
    }
}

module.exports = MediaService;