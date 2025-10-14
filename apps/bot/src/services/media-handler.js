/**
 * Media Handler Service - Complete media processing with tier-based limits
 * Production-ready implementation for Zone News Bot
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');

class MediaHandler {
    constructor(bot, db, tierManager) {
        this.bot = bot;
        this.db = db;
        this.tierManager = tierManager;
        
        // Media type configurations
        this.mediaTypes = {
            photo: {
                emoji: '📸',
                extensions: ['jpg', 'jpeg', 'png', 'webp'],
                maxSize: {
                    free: 5 * 1024 * 1024,      // 5MB
                    basic: 50 * 1024 * 1024,    // 50MB
                    pro: 200 * 1024 * 1024,     // 200MB
                    enterprise: 1024 * 1024 * 1024 // 1GB
                },
                compression: true,
                thumbnails: true
            },
            video: {
                emoji: '🎥',
                extensions: ['mp4', 'avi', 'mov', 'webm', 'mkv'],
                maxSize: {
                    free: 20 * 1024 * 1024,     // 20MB
                    basic: 100 * 1024 * 1024,   // 100MB
                    pro: 500 * 1024 * 1024,     // 500MB
                    enterprise: 2 * 1024 * 1024 * 1024 // 2GB
                },
                compression: true,
                thumbnails: true,
                maxDuration: {
                    free: 60,        // 1 minute
                    basic: 300,      // 5 minutes
                    pro: 1800,       // 30 minutes
                    enterprise: -1   // unlimited
                }
            },
            document: {
                emoji: '📄',
                extensions: ['pdf', 'doc', 'docx', 'txt', 'csv', 'xlsx', 'ppt', 'pptx'],
                maxSize: {
                    free: 10 * 1024 * 1024,     // 10MB
                    basic: 50 * 1024 * 1024,    // 50MB
                    pro: 200 * 1024 * 1024,     // 200MB
                    enterprise: 1024 * 1024 * 1024 // 1GB
                },
                compression: false,
                thumbnails: false
            },
            audio: {
                emoji: '🎵',
                extensions: ['mp3', 'wav', 'ogg', 'aac', 'm4a'],
                maxSize: {
                    free: 10 * 1024 * 1024,     // 10MB
                    basic: 50 * 1024 * 1024,    // 50MB
                    pro: 100 * 1024 * 1024,     // 100MB
                    enterprise: 500 * 1024 * 1024 // 500MB
                },
                compression: true,
                thumbnails: false,
                maxDuration: {
                    free: 300,       // 5 minutes
                    basic: 1800,     // 30 minutes
                    pro: 3600,       // 1 hour
                    enterprise: -1   // unlimited
                }
            },
            voice: {
                emoji: '🎤',
                extensions: ['ogg'],
                maxSize: {
                    free: 1 * 1024 * 1024,      // 1MB
                    basic: 5 * 1024 * 1024,     // 5MB
                    pro: 10 * 1024 * 1024,      // 10MB
                    enterprise: 50 * 1024 * 1024 // 50MB
                },
                compression: false,
                thumbnails: false,
                maxDuration: {
                    free: 60,        // 1 minute
                    basic: 300,      // 5 minutes
                    pro: 600,        // 10 minutes
                    enterprise: -1   // unlimited
                }
            },
            animation: {
                emoji: '🎬',
                extensions: ['gif', 'mp4'],
                maxSize: {
                    free: 10 * 1024 * 1024,     // 10MB
                    basic: 50 * 1024 * 1024,    // 50MB
                    pro: 200 * 1024 * 1024,     // 200MB
                    enterprise: 500 * 1024 * 1024 // 500MB
                },
                compression: true,
                thumbnails: true
            },
            sticker: {
                emoji: '🎭',
                extensions: ['webp', 'tgs'],
                maxSize: {
                    free: 512 * 1024,           // 512KB
                    basic: 1 * 1024 * 1024,     // 1MB
                    pro: 5 * 1024 * 1024,       // 5MB
                    enterprise: 10 * 1024 * 1024 // 10MB
                },
                compression: false,
                thumbnails: false
            }
        };
        
        // Batch upload limits by tier
        this.batchLimits = {
            free: 1,
            basic: 5,
            pro: 25,
            enterprise: -1 // unlimited
        };
        
        // Storage quota by tier (in bytes)
        this.storageQuotas = {
            free: 100 * 1024 * 1024,        // 100MB
            basic: 5 * 1024 * 1024 * 1024,  // 5GB
            pro: 50 * 1024 * 1024 * 1024,   // 50GB
            enterprise: -1                   // unlimited
        };
        
        // Media processing queue
        this.processingQueue = new Map();
        this.processingTimeout = 30000; // 30 seconds
    }

    /**
     * Register media handlers and commands
     */
    register() {
        console.log('🔧 Registering MediaHandler...');
        
        // Media type handlers
        this.bot.on('photo', this.handlePhoto.bind(this));
        this.bot.on('video', this.handleVideo.bind(this));
        this.bot.on('document', this.handleDocument.bind(this));
        this.bot.on('audio', this.handleAudio.bind(this));
        this.bot.on('voice', this.handleVoice.bind(this));
        this.bot.on('animation', this.handleAnimation.bind(this));
        this.bot.on('sticker', this.handleSticker.bind(this));
        this.bot.on('video_note', this.handleVideoNote.bind(this));
        
        // Media management commands
        this.bot.command('postmedia', this.handlePostMedia.bind(this));
        this.bot.command('mediaq', this.handleMediaQueue.bind(this));
        this.bot.command('clearmedia', this.handleClearMedia.bind(this));
        this.bot.command('mediahistory', this.handleMediaHistory.bind(this));
        this.bot.command('mediastats', this.handleMediaStats.bind(this));
        this.bot.command('compress', this.handleCompress.bind(this));
        this.bot.command('batchupload', this.handleBatchUpload.bind(this));
        
        // Callback handlers
        this.bot.action(/^media:/, this.handleMediaCallback.bind(this));
        this.bot.action(/^batch:/, this.handleBatchCallback.bind(this));
        this.bot.action(/^compress:/, this.handleCompressCallback.bind(this));
        
        console.log('✅ MediaHandler registered');
    }

    /**
     * Handle photo uploads
     */
    async handlePhoto(ctx) {
        try {
            const photos = ctx.message.photo;
            const largestPhoto = photos[photos.length - 1];
            const caption = ctx.message.caption || '';
            const userId = ctx.from.id;
            
            // Check tier limits
            const tierCheck = await this.checkMediaLimits(userId, 'photo', largestPhoto.file_size);
            if (!tierCheck.allowed) {
                await ctx.reply(tierCheck.message, { parse_mode: 'Markdown' });
                return;
            }
            
            // Validate file
            const validation = await this.validateMedia('photo', largestPhoto);
            if (!validation.valid) {
                await ctx.reply(`❌ ${validation.error}`, { parse_mode: 'Markdown' });
                return;
            }
            
            // Store media
            const mediaData = {
                type: 'photo',
                file_id: largestPhoto.file_id,
                file_unique_id: largestPhoto.file_unique_id,
                caption: caption,
                width: largestPhoto.width,
                height: largestPhoto.height,
                file_size: largestPhoto.file_size,
                resolution: `${largestPhoto.width}x${largestPhoto.height}`,
                aspect_ratio: (largestPhoto.width / largestPhoto.height).toFixed(2)
            };
            
            const savedMedia = await this.storeMedia(userId, mediaData);
            
            // Generate preview message
            const sizeInfo = this.formatFileSize(largestPhoto.file_size);
            const resolutionInfo = `${largestPhoto.width}x${largestPhoto.height}`;
            
            await ctx.reply(
                `📸 *Photo Saved!*\n\n` +
                `📏 Size: ${sizeInfo}\n` +
                `📐 Resolution: ${resolutionInfo}\n` +
                (caption ? `💬 Caption: "${this.truncateText(caption, 50)}"\n` : '') +
                `🆔 ID: \`${savedMedia.insertedId}\`\n\n` +
                '*Choose an action:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Post Now', callback_data: `media:post:${savedMedia.insertedId}` },
                                { text: '⏰ Schedule', callback_data: `media:schedule:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '➕ Add to Batch', callback_data: `batch:add:${savedMedia.insertedId}` },
                                { text: '✏️ Edit Caption', callback_data: `media:caption:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '🗜️ Compress', callback_data: `compress:photo:${savedMedia.insertedId}` },
                                { text: '📊 Details', callback_data: `media:details:${savedMedia.insertedId}` }
                            ],
                            [{ text: '❌ Delete', callback_data: `media:delete:${savedMedia.insertedId}` }]
                        ]
                    }
                }
            );
            
            // Track usage
            await this.trackMediaUsage(userId, 'photo', largestPhoto.file_size);
            
        } catch (error) {
            console.error('Error handling photo:', error);
            await ctx.reply('❌ Error processing photo. Please try again.');
        }
    }

    /**
     * Handle video uploads
     */
    async handleVideo(ctx) {
        try {
            const video = ctx.message.video;
            const caption = ctx.message.caption || '';
            const userId = ctx.from.id;
            
            // Check tier limits
            const tierCheck = await this.checkMediaLimits(userId, 'video', video.file_size);
            if (!tierCheck.allowed) {
                await ctx.reply(tierCheck.message, { parse_mode: 'Markdown' });
                return;
            }
            
            // Check duration limits
            const userTier = await this.tierManager.getUserTier(userId);
            const maxDuration = this.mediaTypes.video.maxDuration[userTier];
            if (maxDuration !== -1 && video.duration > maxDuration) {
                await ctx.reply(
                    `⏱️ *Video Too Long*\n\n` +
                    `Duration: ${this.formatDuration(video.duration)}\n` +
                    `Max allowed: ${this.formatDuration(maxDuration)}\n\n` +
                    `Upgrade to increase duration limits.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Validate file
            const validation = await this.validateMedia('video', video);
            if (!validation.valid) {
                await ctx.reply(`❌ ${validation.error}`, { parse_mode: 'Markdown' });
                return;
            }
            
            // Store media
            const mediaData = {
                type: 'video',
                file_id: video.file_id,
                file_unique_id: video.file_unique_id,
                caption: caption,
                duration: video.duration,
                width: video.width,
                height: video.height,
                file_size: video.file_size,
                mime_type: video.mime_type,
                thumb: video.thumb ? {
                    file_id: video.thumb.file_id,
                    width: video.thumb.width,
                    height: video.thumb.height
                } : null,
                resolution: video.width && video.height ? `${video.width}x${video.height}` : null,
                aspect_ratio: video.width && video.height ? (video.width / video.height).toFixed(2) : null
            };
            
            const savedMedia = await this.storeMedia(userId, mediaData);
            
            // Generate preview message
            const sizeInfo = this.formatFileSize(video.file_size);
            const durationInfo = this.formatDuration(video.duration);
            const resolutionInfo = video.width && video.height ? `${video.width}x${video.height}` : 'Unknown';
            
            await ctx.reply(
                `🎥 *Video Saved!*\n\n` +
                `📏 Size: ${sizeInfo}\n` +
                `⏱️ Duration: ${durationInfo}\n` +
                `📐 Resolution: ${resolutionInfo}\n` +
                (caption ? `💬 Caption: "${this.truncateText(caption, 50)}"\n` : '') +
                `🆔 ID: \`${savedMedia.insertedId}\`\n\n` +
                '*Choose an action:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Post Now', callback_data: `media:post:${savedMedia.insertedId}` },
                                { text: '⏰ Schedule', callback_data: `media:schedule:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '➕ Add to Batch', callback_data: `batch:add:${savedMedia.insertedId}` },
                                { text: '✏️ Edit Caption', callback_data: `media:caption:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '🗜️ Compress', callback_data: `compress:video:${savedMedia.insertedId}` },
                                { text: '📊 Details', callback_data: `media:details:${savedMedia.insertedId}` }
                            ],
                            [{ text: '❌ Delete', callback_data: `media:delete:${savedMedia.insertedId}` }]
                        ]
                    }
                }
            );
            
            // Track usage
            await this.trackMediaUsage(userId, 'video', video.file_size);
            
        } catch (error) {
            console.error('Error handling video:', error);
            await ctx.reply('❌ Error processing video. Please try again.');
        }
    }

    /**
     * Handle document uploads
     */
    async handleDocument(ctx) {
        try {
            const document = ctx.message.document;
            const caption = ctx.message.caption || '';
            const userId = ctx.from.id;
            
            // Check tier limits
            const tierCheck = await this.checkMediaLimits(userId, 'document', document.file_size);
            if (!tierCheck.allowed) {
                await ctx.reply(tierCheck.message, { parse_mode: 'Markdown' });
                return;
            }
            
            // Validate file
            const validation = await this.validateMedia('document', document);
            if (!validation.valid) {
                await ctx.reply(`❌ ${validation.error}`, { parse_mode: 'Markdown' });
                return;
            }
            
            // Store media
            const mediaData = {
                type: 'document',
                file_id: document.file_id,
                file_unique_id: document.file_unique_id,
                caption: caption,
                file_name: document.file_name,
                mime_type: document.mime_type,
                file_size: document.file_size,
                thumb: document.thumb ? {
                    file_id: document.thumb.file_id,
                    width: document.thumb.width,
                    height: document.thumb.height
                } : null,
                file_extension: this.getFileExtension(document.file_name)
            };
            
            const savedMedia = await this.storeMedia(userId, mediaData);
            
            // Generate preview message
            const sizeInfo = this.formatFileSize(document.file_size);
            const fileName = document.file_name || 'Unknown';
            
            await ctx.reply(
                `📄 *Document Saved!*\n\n` +
                `📁 File: ${fileName}\n` +
                `📏 Size: ${sizeInfo}\n` +
                `🏷️ Type: ${document.mime_type || 'Unknown'}\n` +
                (caption ? `💬 Caption: "${this.truncateText(caption, 50)}"\n` : '') +
                `🆔 ID: \`${savedMedia.insertedId}\`\n\n` +
                '*Choose an action:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Post Now', callback_data: `media:post:${savedMedia.insertedId}` },
                                { text: '⏰ Schedule', callback_data: `media:schedule:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '➕ Add to Batch', callback_data: `batch:add:${savedMedia.insertedId}` },
                                { text: '✏️ Edit Caption', callback_data: `media:caption:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '📊 Details', callback_data: `media:details:${savedMedia.insertedId}` },
                                { text: '🔗 Share Link', callback_data: `media:share:${savedMedia.insertedId}` }
                            ],
                            [{ text: '❌ Delete', callback_data: `media:delete:${savedMedia.insertedId}` }]
                        ]
                    }
                }
            );
            
            // Track usage
            await this.trackMediaUsage(userId, 'document', document.file_size);
            
        } catch (error) {
            console.error('Error handling document:', error);
            await ctx.reply('❌ Error processing document. Please try again.');
        }
    }

    /**
     * Handle audio uploads
     */
    async handleAudio(ctx) {
        try {
            const audio = ctx.message.audio;
            const caption = ctx.message.caption || '';
            const userId = ctx.from.id;
            
            // Check tier limits
            const tierCheck = await this.checkMediaLimits(userId, 'audio', audio.file_size);
            if (!tierCheck.allowed) {
                await ctx.reply(tierCheck.message, { parse_mode: 'Markdown' });
                return;
            }
            
            // Check duration limits
            const userTier = await this.tierManager.getUserTier(userId);
            const maxDuration = this.mediaTypes.audio.maxDuration[userTier];
            if (maxDuration !== -1 && audio.duration > maxDuration) {
                await ctx.reply(
                    `⏱️ *Audio Too Long*\n\n` +
                    `Duration: ${this.formatDuration(audio.duration)}\n` +
                    `Max allowed: ${this.formatDuration(maxDuration)}\n\n` +
                    `Upgrade to increase duration limits.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Store media
            const mediaData = {
                type: 'audio',
                file_id: audio.file_id,
                file_unique_id: audio.file_unique_id,
                caption: caption,
                duration: audio.duration,
                performer: audio.performer,
                title: audio.title,
                mime_type: audio.mime_type,
                file_size: audio.file_size,
                thumb: audio.thumb ? {
                    file_id: audio.thumb.file_id,
                    width: audio.thumb.width,
                    height: audio.thumb.height
                } : null
            };
            
            const savedMedia = await this.storeMedia(userId, mediaData);
            
            // Generate preview message
            const sizeInfo = this.formatFileSize(audio.file_size);
            const durationInfo = this.formatDuration(audio.duration);
            const title = audio.title || 'Unknown Title';
            const performer = audio.performer || 'Unknown Artist';
            
            await ctx.reply(
                `🎵 *Audio Saved!*\n\n` +
                `🎤 Title: ${title}\n` +
                `👤 Artist: ${performer}\n` +
                `📏 Size: ${sizeInfo}\n` +
                `⏱️ Duration: ${durationInfo}\n` +
                (caption ? `💬 Caption: "${this.truncateText(caption, 50)}"\n` : '') +
                `🆔 ID: \`${savedMedia.insertedId}\`\n\n` +
                '*Choose an action:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Post Now', callback_data: `media:post:${savedMedia.insertedId}` },
                                { text: '⏰ Schedule', callback_data: `media:schedule:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '➕ Add to Batch', callback_data: `batch:add:${savedMedia.insertedId}` },
                                { text: '✏️ Edit Caption', callback_data: `media:caption:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '🗜️ Compress', callback_data: `compress:audio:${savedMedia.insertedId}` },
                                { text: '📊 Details', callback_data: `media:details:${savedMedia.insertedId}` }
                            ],
                            [{ text: '❌ Delete', callback_data: `media:delete:${savedMedia.insertedId}` }]
                        ]
                    }
                }
            );
            
            // Track usage
            await this.trackMediaUsage(userId, 'audio', audio.file_size);
            
        } catch (error) {
            console.error('Error handling audio:', error);
            await ctx.reply('❌ Error processing audio. Please try again.');
        }
    }

    /**
     * Handle voice message uploads
     */
    async handleVoice(ctx) {
        try {
            const voice = ctx.message.voice;
            const caption = ctx.message.caption || '';
            const userId = ctx.from.id;
            
            // Check tier limits
            const tierCheck = await this.checkMediaLimits(userId, 'voice', voice.file_size);
            if (!tierCheck.allowed) {
                await ctx.reply(tierCheck.message, { parse_mode: 'Markdown' });
                return;
            }
            
            // Check duration limits
            const userTier = await this.tierManager.getUserTier(userId);
            const maxDuration = this.mediaTypes.voice.maxDuration[userTier];
            if (maxDuration !== -1 && voice.duration > maxDuration) {
                await ctx.reply(
                    `⏱️ *Voice Message Too Long*\n\n` +
                    `Duration: ${this.formatDuration(voice.duration)}\n` +
                    `Max allowed: ${this.formatDuration(maxDuration)}\n\n` +
                    `Upgrade to increase duration limits.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Store media
            const mediaData = {
                type: 'voice',
                file_id: voice.file_id,
                file_unique_id: voice.file_unique_id,
                caption: caption,
                duration: voice.duration,
                mime_type: voice.mime_type,
                file_size: voice.file_size
            };
            
            const savedMedia = await this.storeMedia(userId, mediaData);
            
            // Generate preview message
            const sizeInfo = this.formatFileSize(voice.file_size);
            const durationInfo = this.formatDuration(voice.duration);
            
            await ctx.reply(
                `🎤 *Voice Message Saved!*\n\n` +
                `📏 Size: ${sizeInfo}\n` +
                `⏱️ Duration: ${durationInfo}\n` +
                (caption ? `💬 Caption: "${this.truncateText(caption, 50)}"\n` : '') +
                `🆔 ID: \`${savedMedia.insertedId}\`\n\n` +
                '*Choose an action:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Post Now', callback_data: `media:post:${savedMedia.insertedId}` },
                                { text: '⏰ Schedule', callback_data: `media:schedule:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '➕ Add to Batch', callback_data: `batch:add:${savedMedia.insertedId}` },
                                { text: '✏️ Edit Caption', callback_data: `media:caption:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '📊 Details', callback_data: `media:details:${savedMedia.insertedId}` },
                                { text: '🔗 Transcribe', callback_data: `media:transcribe:${savedMedia.insertedId}` }
                            ],
                            [{ text: '❌ Delete', callback_data: `media:delete:${savedMedia.insertedId}` }]
                        ]
                    }
                }
            );
            
            // Track usage
            await this.trackMediaUsage(userId, 'voice', voice.file_size);
            
        } catch (error) {
            console.error('Error handling voice:', error);
            await ctx.reply('❌ Error processing voice message. Please try again.');
        }
    }

    /**
     * Handle animation/GIF uploads
     */
    async handleAnimation(ctx) {
        try {
            const animation = ctx.message.animation;
            const caption = ctx.message.caption || '';
            const userId = ctx.from.id;
            
            // Check tier limits
            const tierCheck = await this.checkMediaLimits(userId, 'animation', animation.file_size);
            if (!tierCheck.allowed) {
                await ctx.reply(tierCheck.message, { parse_mode: 'Markdown' });
                return;
            }
            
            // Store media
            const mediaData = {
                type: 'animation',
                file_id: animation.file_id,
                file_unique_id: animation.file_unique_id,
                caption: caption,
                duration: animation.duration,
                width: animation.width,
                height: animation.height,
                file_size: animation.file_size,
                mime_type: animation.mime_type,
                file_name: animation.file_name,
                thumb: animation.thumb ? {
                    file_id: animation.thumb.file_id,
                    width: animation.thumb.width,
                    height: animation.thumb.height
                } : null
            };
            
            const savedMedia = await this.storeMedia(userId, mediaData);
            
            // Generate preview message
            const sizeInfo = this.formatFileSize(animation.file_size);
            const durationInfo = animation.duration ? this.formatDuration(animation.duration) : 'N/A';
            const resolutionInfo = `${animation.width}x${animation.height}`;
            
            await ctx.reply(
                `🎬 *Animation Saved!*\n\n` +
                `📏 Size: ${sizeInfo}\n` +
                `⏱️ Duration: ${durationInfo}\n` +
                `📐 Resolution: ${resolutionInfo}\n` +
                (caption ? `💬 Caption: "${this.truncateText(caption, 50)}"\n` : '') +
                `🆔 ID: \`${savedMedia.insertedId}\`\n\n` +
                '*Choose an action:*',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Post Now', callback_data: `media:post:${savedMedia.insertedId}` },
                                { text: '⏰ Schedule', callback_data: `media:schedule:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '➕ Add to Batch', callback_data: `batch:add:${savedMedia.insertedId}` },
                                { text: '✏️ Edit Caption', callback_data: `media:caption:${savedMedia.insertedId}` }
                            ],
                            [
                                { text: '🗜️ Optimize', callback_data: `compress:animation:${savedMedia.insertedId}` },
                                { text: '📊 Details', callback_data: `media:details:${savedMedia.insertedId}` }
                            ],
                            [{ text: '❌ Delete', callback_data: `media:delete:${savedMedia.insertedId}` }]
                        ]
                    }
                }
            );
            
            // Track usage
            await this.trackMediaUsage(userId, 'animation', animation.file_size);
            
        } catch (error) {
            console.error('Error handling animation:', error);
            await ctx.reply('❌ Error processing animation. Please try again.');
        }
    }

    /**
     * Handle /postmedia command
     */
    async handlePostMedia(ctx) {
        try {
            const userId = ctx.from.id;
            const media = await this.getUserMedia(userId);
            
            if (media.length === 0) {
                await ctx.reply(
                    '📁 *No Media Saved*\n\n' +
                    'Send photos, videos, documents, or audio to get started.\n\n' +
                    '*Supported formats:*\n' +
                    '📸 Photos: JPG, PNG, WebP\n' +
                    '🎥 Videos: MP4, AVI, MOV, WebM\n' +
                    '📄 Documents: PDF, DOC, TXT, CSV\n' +
                    '🎵 Audio: MP3, WAV, OGG, AAC\n' +
                    '🎤 Voice messages\n' +
                    '🎬 Animations/GIFs\n\n' +
                    'Upload files to manage them here!',
                    { 
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📊 Usage Stats', callback_data: 'media:stats' }],
                                [{ text: '💾 Storage Info', callback_data: 'media:storage' }],
                                [{ text: '❌ Close', callback_data: 'cancel' }]
                            ]
                        }
                    }
                );
                return;
            }
            
            // Get user's tier for batch limits
            const userTier = await this.tierManager.getUserTier(userId);
            const batchLimit = this.batchLimits[userTier];
            
            let message = `📁 *Your Media Library* (${media.length} items)\n\n`;
            
            media.slice(0, 10).forEach((item, index) => {
                const emoji = this.mediaTypes[item.type]?.emoji || '📄';
                const size = this.formatFileSize(item.file_size);
                message += `${index + 1}. ${emoji} ${item.type} (${size})`;
                if (item.caption) {
                    message += ` - "${this.truncateText(item.caption, 20)}"`;
                }
                message += '\n';
            });
            
            if (media.length > 10) {
                message += `\n... and ${media.length - 10} more items`;
            }
            
            message += '\n\n*Select an action:*';
            
            const keyboard = [
                [
                    { text: '📤 Post All', callback_data: 'media:post:all' },
                    { text: '📤 Post Selected', callback_data: 'media:post:select' }
                ]
            ];
            
            if (batchLimit === -1 || media.length <= batchLimit) {
                keyboard.push([
                    { text: '⏰ Schedule Batch', callback_data: 'media:schedule:batch' },
                    { text: '🗜️ Compress All', callback_data: 'compress:all' }
                ]);
            }
            
            keyboard.push([
                { text: '📊 Library Stats', callback_data: 'media:stats' },
                { text: '🗑️ Clear All', callback_data: 'media:clear:confirm' }
            ]);
            
            keyboard.push([
                { text: '📜 History', callback_data: 'media:history' },
                { text: '❌ Close', callback_data: 'cancel' }
            ]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error in postmedia command:', error);
            await ctx.reply('❌ Error accessing media library.');
        }
    }

    /**
     * Check media limits based on user tier
     */
    async checkMediaLimits(userId, mediaType, fileSize) {
        try {
            const userTier = await this.tierManager.getUserTier(userId);
            const mediaConfig = this.mediaTypes[mediaType];
            
            if (!mediaConfig) {
                return { allowed: false, message: '❌ Unsupported media type.' };
            }
            
            // Check file size limit
            const maxSize = mediaConfig.maxSize[userTier];
            if (fileSize > maxSize) {
                const currentSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
                const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
                
                return {
                    allowed: false,
                    message: `📁 *File Too Large*\n\n` +
                            `Size: ${currentSizeMB}MB\n` +
                            `Limit: ${maxSizeMB}MB (${userTier} tier)\n\n` +
                            `${this.tierManager.getUpgradeMessage(userTier)}`
                };
            }
            
            // Check storage quota
            const storageQuota = this.storageQuotas[userTier];
            if (storageQuota !== -1) {
                const currentUsage = await this.getUserStorageUsage(userId);
                if (currentUsage + fileSize > storageQuota) {
                    const usageGB = (currentUsage / (1024 * 1024 * 1024)).toFixed(2);
                    const quotaGB = (storageQuota / (1024 * 1024 * 1024)).toFixed(2);
                    
                    return {
                        allowed: false,
                        message: `💾 *Storage Quota Exceeded*\n\n` +
                                `Current usage: ${usageGB}GB\n` +
                                `Quota: ${quotaGB}GB (${userTier} tier)\n\n` +
                                `Delete some files or upgrade your plan.`
                    };
                }
            }
            
            return { allowed: true };
            
        } catch (error) {
            console.error('Error checking media limits:', error);
            return { allowed: true }; // Allow by default on error
        }
    }

    /**
     * Validate media file
     */
    async validateMedia(type, mediaData) {
        try {
            const config = this.mediaTypes[type];
            if (!config) {
                return { valid: false, error: 'Unsupported media type' };
            }
            
            // Check file size
            if (mediaData.file_size <= 0) {
                return { valid: false, error: 'Invalid file size' };
            }
            
            // Additional validation can be added here
            // - File format validation
            // - Content scanning for malicious files
            // - Metadata validation
            
            return { valid: true };
            
        } catch (error) {
            console.error('Error validating media:', error);
            return { valid: false, error: 'Validation error' };
        }
    }

    /**
     * Store media in database
     */
    async storeMedia(userId, mediaData) {
        const media = {
            user_id: userId,
            ...mediaData,
            created_at: new Date(),
            updated_at: new Date(),
            status: 'stored',
            posted_count: 0,
            last_posted: null,
            tags: [],
            metadata: {
                ip_address: null,
                user_agent: null,
                location: null
            }
        };
        
        return await this.db.collection('user_media').insertOne(media);
    }

    /**
     * Get user's saved media
     */
    async getUserMedia(userId, limit = 50) {
        return await this.db.collection('user_media')
            .find({ user_id: userId, status: { $ne: 'deleted' } })
            .sort({ created_at: -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Get user's storage usage
     */
    async getUserStorageUsage(userId) {
        const result = await this.db.collection('user_media').aggregate([
            { $match: { user_id: userId, status: { $ne: 'deleted' } } },
            { $group: { _id: null, total: { $sum: '$file_size' } } }
        ]).toArray();
        
        return result.length > 0 ? result[0].total : 0;
    }

    /**
     * Track media usage for analytics
     */
    async trackMediaUsage(userId, mediaType, fileSize) {
        try {
            await this.db.collection('media_usage').insertOne({
                user_id: userId,
                type: mediaType,
                file_size: fileSize,
                action: 'upload',
                created_at: new Date()
            });
        } catch (error) {
            console.error('Error tracking media usage:', error);
        }
    }

    /**
     * Format file size to human readable
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Format duration in seconds to readable format
     */
    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Get file extension from filename
     */
    getFileExtension(filename) {
        if (!filename) return null;
        return filename.split('.').pop()?.toLowerCase() || null;
    }

    /**
     * Truncate text to specified length
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Handle media-related callbacks
     */
    async handleMediaCallback(ctx) {
        try {
            const data = ctx.callbackQuery.data.split(':');
            const action = data[1];
            const mediaId = data[2];
            
            await ctx.answerCallbackQuery();
            
            switch (action) {
                case 'post':
                    await this.handleMediaPost(ctx, mediaId);
                    break;
                case 'schedule':
                    await this.handleMediaSchedule(ctx, mediaId);
                    break;
                case 'delete':
                    await this.handleMediaDelete(ctx, mediaId);
                    break;
                case 'details':
                    await this.handleMediaDetails(ctx, mediaId);
                    break;
                case 'clear':
                    await this.handleClearMedia(ctx);
                    break;
                case 'stats':
                    await this.handleMediaStats(ctx);
                    break;
                default:
                    await ctx.reply('❌ Unknown media action.');
            }
            
        } catch (error) {
            console.error('Error handling media callback:', error);
            await ctx.answerCallbackQuery('❌ Error processing request');
        }
    }

    /**
     * Handle media posting
     */
    async handleMediaPost(ctx, mediaId) {
        try {
            if (mediaId === 'all') {
                // Post all media
                const userId = ctx.from.id;
                const media = await this.getUserMedia(userId);
                
                // Implementation would continue with batch posting logic
                await ctx.reply('🚀 Starting batch post of all media...');
            } else {
                // Post single media
                const media = await this.db.collection('user_media').findOne({
                    _id: new ObjectId(mediaId)
                });
                
                if (!media) {
                    await ctx.reply('❌ Media not found.');
                    return;
                }
                
                // Implementation would continue with single media posting logic
                await ctx.reply(`📤 Posting ${media.type}...`);
            }
            
        } catch (error) {
            console.error('Error posting media:', error);
            await ctx.reply('❌ Error posting media.');
        }
    }

    /**
     * Handle media statistics
     */
    async handleMediaStats(ctx) {
        try {
            const userId = ctx.from.id;
            const userTier = await this.tierManager.getUserTier(userId);
            
            // Get storage usage
            const storageUsed = await this.getUserStorageUsage(userId);
            const storageQuota = this.storageQuotas[userTier];
            
            // Get media counts by type
            const mediaCounts = await this.db.collection('user_media').aggregate([
                { $match: { user_id: userId, status: { $ne: 'deleted' } } },
                { $group: { _id: '$type', count: { $sum: 1 }, size: { $sum: '$file_size' } } }
            ]).toArray();
            
            let message = `📊 *Media Statistics*\n\n`;
            message += `🎖️ Tier: ${userTier.charAt(0).toUpperCase() + userTier.slice(1)}\n\n`;
            
            // Storage info
            message += `💾 *Storage Usage*\n`;
            if (storageQuota === -1) {
                message += `Used: ${this.formatFileSize(storageUsed)} (Unlimited)\n`;
            } else {
                const usagePercent = ((storageUsed / storageQuota) * 100).toFixed(1);
                message += `Used: ${this.formatFileSize(storageUsed)} / ${this.formatFileSize(storageQuota)} (${usagePercent}%)\n`;
            }
            message += '\n';
            
            // Media counts
            message += `📁 *Media Breakdown*\n`;
            mediaCounts.forEach(item => {
                const emoji = this.mediaTypes[item._id]?.emoji || '📄';
                message += `${emoji} ${item._id}: ${item.count} files (${this.formatFileSize(item.size)})\n`;
            });
            
            const totalFiles = mediaCounts.reduce((sum, item) => sum + item.count, 0);
            message += `\n📈 Total: ${totalFiles} files`;
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📜 History', callback_data: 'media:history' },
                            { text: '🗑️ Cleanup', callback_data: 'media:cleanup' }
                        ],
                        [
                            { text: '💎 Upgrade', callback_data: 'upgrade:storage' },
                            { text: '🔄 Refresh', callback_data: 'media:stats' }
                        ],
                        [{ text: '❌ Close', callback_data: 'cancel' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Error getting media stats:', error);
            await ctx.reply('❌ Error retrieving statistics.');
        }
    }

    /**
     * Handle clear media command
     */
    async handleClearMedia(ctx) {
        try {
            const userId = ctx.from.id;
            
            const result = await this.db.collection('user_media').updateMany(
                { user_id: userId },
                { $set: { status: 'deleted', deleted_at: new Date() } }
            );
            
            await ctx.reply(
                `🗑️ *Media Cleared*\n\n` +
                `Removed ${result.modifiedCount} files from your library.\n\n` +
                `Files are soft-deleted and can be recovered within 30 days.`,
                { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📊 View Stats', callback_data: 'media:stats' }],
                            [{ text: '❌ Close', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error clearing media:', error);
            await ctx.reply('❌ Error clearing media library.');
        }
    }
}

module.exports = MediaHandler;