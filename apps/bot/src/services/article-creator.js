/**
 * ArticleCreator Service - Handle user-generated article creation
 */

const { ObjectId } = require('mongodb');
const { Markup } = require('telegraf');

class ArticleCreator {
    constructor(db) {
        this.db = db;
        this.userSessions = new Map();
    }

    /**
     * Start article creation process
     */
    async startArticleCreation(ctx) {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name || 'Unknown';

        // Initialize user session
        this.userSessions.set(userId, {
            step: 'title',
            mode: 'create',
            article: {
                author: username,
                author_id: userId,
                created_at: new Date(),
                status: 'draft'
            }
        });

        await ctx.reply(
            '📝 **Create New Article**\n\n' +
            'Let\'s create your article step by step.\n\n' +
            '🏷️ **Step 1: Title**\n' +
            'Please enter a compelling title for your article:',
            { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'cancel_article')]
                ])
            }
        );
    }

    /**
     * Start editing an existing article
     */
    async startArticleEditing(ctx, articleId) {
        try {
            const userId = ctx.from.id;
            
            // Find the article
            const article = await this.db.collection('news_articles')
                .findOne({ 
                    _id: new ObjectId(articleId),
                    author_id: userId,
                    status: 'draft' 
                });

            if (!article) {
                return ctx.reply('❌ Draft article not found or you don\'t have permission to edit it.');
            }

            // Initialize edit session
            this.userSessions.set(userId, {
                mode: 'edit',
                articleId: articleId,
                step: 'preview',
                article: { ...article }
            });

            await this.showEditMenu(ctx, article);
        } catch (error) {
            console.error('Start editing error:', error);
            ctx.reply('❌ Error loading article for editing.');
        }
    }

    /**
     * Show edit menu for existing article
     */
    async showEditMenu(ctx, article) {
        const preview = this.generateArticlePreview(article);
        
        const keyboard = [
            [
                Markup.button.callback('✏️ Edit Title', 'edit_title'),
                Markup.button.callback('📝 Edit Content', 'edit_content')
            ],
            [
                Markup.button.callback('🏷️ Edit Category', 'edit_category'),
                Markup.button.callback('📋 Edit Summary', 'edit_summary')
            ],
            [
                Markup.button.callback('🚀 Publish Now', 'publish_now'),
                Markup.button.callback('💾 Save Changes', 'save_draft')
            ],
            [
                Markup.button.callback('🗑️ Delete Draft', 'delete_draft'),
                Markup.button.callback('❌ Cancel', 'cancel_article')
            ]
        ];

        if (ctx.callbackQuery) {
            await ctx.editMessageText(preview, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            });
        } else {
            await ctx.reply(preview, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            });
        }
    }

    /**
     * Generate article preview text
     */
    generateArticlePreview(article) {
        let preview = `📋 **Article Preview**\n\n`;
        preview += `📰 **Title:** ${article.title}\n`;
        preview += `🏷️ **Category:** ${article.category}\n`;
        preview += `👤 **Author:** ${article.author}\n`;
        preview += `📅 **Created:** ${new Date(article.created_at).toLocaleDateString()}\n\n`;
        preview += `📝 **Summary:**\n${article.summary}\n\n`;
        preview += `📄 **Content Preview:**\n${article.content.substring(0, 200)}${article.content.length > 200 ? '...' : ''}\n\n`;
        preview += `📊 **Stats:** ${article.content.length} characters, ${article.content.split(' ').length} words`;
        return preview;
    }

    /**
     * Handle user input during article creation
     */
    async handleInput(ctx) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);
        
        if (!session) {
            return ctx.reply('❌ No active article session. Use /newarticle to start.');
        }

        const text = ctx.message.text.trim();

        switch (session.step) {
            case 'title':
            case 'edit_title':
                return this.handleTitleInput(ctx, session, text);
            case 'content':
            case 'edit_content':
                return this.handleContentInput(ctx, session, text);
            case 'category':
            case 'edit_category':
                return this.handleCategoryInput(ctx, session, text);
            case 'summary':
            case 'edit_summary':
                return this.handleSummaryInput(ctx, session, text);
            default:
                return ctx.reply('❌ Unknown step. Please try /newarticle again.');
        }
    }

    /**
     * Handle edit mode transitions
     */
    async handleEditAction(ctx, action) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);
        
        if (!session || session.mode !== 'edit') {
            return ctx.answerCbQuery('No active editing session.');
        }

        switch (action) {
            case 'edit_title':
                session.step = 'edit_title';
                await ctx.editMessageText(
                    '✏️ **Edit Title**\n\n' +
                    `Current title: "${session.article.title}"\n\n` +
                    'Enter the new title:',
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Menu', 'back_to_edit_menu')],
                            [Markup.button.callback('❌ Cancel', 'cancel_article')]
                        ])
                    }
                );
                break;

            case 'edit_content':
                session.step = 'edit_content';
                await ctx.editMessageText(
                    '📝 **Edit Content**\n\n' +
                    `Current content preview: "${session.article.content.substring(0, 200)}..."\n\n` +
                    'Enter the new content:',
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Menu', 'back_to_edit_menu')],
                            [Markup.button.callback('❌ Cancel', 'cancel_article')]
                        ])
                    }
                );
                break;

            case 'edit_category':
                session.step = 'edit_category';
                await this.showCategorySelection(ctx, true);
                break;

            case 'edit_summary':
                session.step = 'edit_summary';
                await ctx.editMessageText(
                    '📋 **Edit Summary**\n\n' +
                    `Current summary: "${session.article.summary}"\n\n` +
                    'Enter the new summary:',
                    { 
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 Back to Menu', 'back_to_edit_menu')],
                            [Markup.button.callback('❌ Cancel', 'cancel_article')]
                        ])
                    }
                );
                break;

            case 'delete_draft':
                await this.deleteDraft(ctx);
                break;
        }

        await ctx.answerCbQuery();
    }

    /**
     * Handle title input
     */
    async handleTitleInput(ctx, session, title) {
        if (title.length < 10) {
            return ctx.reply('❌ Title too short. Please enter at least 10 characters.');
        }

        if (title.length > 200) {
            return ctx.reply('❌ Title too long. Please keep it under 200 characters.');
        }

        session.article.title = title;
        
        // Handle different modes
        if (session.mode === 'edit') {
            session.step = 'preview';
            await ctx.reply('✅ Title updated!');
            await this.showEditMenu(ctx, session.article);
            return;
        }
        
        session.step = 'content';

        await ctx.reply(
            `✅ **Title Set:** ${title}\n\n` +
            '📄 **Step 2: Content**\n' +
            'Now write the main content of your article.\n\n' +
            '💡 **Tips:**\n' +
            '• Write in clear, engaging language\n' +
            '• Include relevant details and context\n' +
            '• Keep paragraphs readable\n\n' +
            'Send your article content:',
            { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Title', 'back_to_title')],
                    [Markup.button.callback('❌ Cancel', 'cancel_article')]
                ])
            }
        );
    }

    /**
     * Handle content input
     */
    async handleContentInput(ctx, session, content) {
        if (content.length < 50) {
            return ctx.reply('❌ Content too short. Please write at least 50 characters.');
        }

        if (content.length > 4000) {
            return ctx.reply('❌ Content too long. Please keep it under 4000 characters.');
        }

        session.article.content = content;
        
        // Handle different modes
        if (session.mode === 'edit') {
            session.step = 'preview';
            await ctx.reply('✅ Content updated!');
            await this.showEditMenu(ctx, session.article);
            return;
        }
        
        session.step = 'category';

        const categories = [
            'Breaking News', 'Local News', 'Politics', 'Business', 
            'Technology', 'Sports', 'Entertainment', 'Health', 
            'Education', 'Opinion', 'Other'
        ];

        const keyboard = [];
        for (let i = 0; i < categories.length; i += 2) {
            const row = [
                Markup.button.callback(categories[i], `category:${categories[i]}`)
            ];
            if (categories[i + 1]) {
                row.push(Markup.button.callback(categories[i + 1], `category:${categories[i + 1]}`));
            }
            keyboard.push(row);
        }

        keyboard.push([
            Markup.button.callback('🔙 Back to Content', 'back_to_content'),
            Markup.button.callback('❌ Cancel', 'cancel_article')
        ]);

        await ctx.reply(
            '✅ **Content Added** (Preview):\n' +
            `${content.substring(0, 150)}${content.length > 150 ? '...' : ''}\n\n` +
            '🏷️ **Step 3: Category**\n' +
            'Select the most appropriate category for your article:',
            { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            }
        );
    }

    /**
     * Handle category selection
     */
    async handleCategorySelection(ctx) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);
        const category = ctx.match[1];

        if (!session) {
            return ctx.answerCbQuery('Session expired. Please start again with /newarticle.');
        }

        session.article.category = category;
        session.step = 'summary';

        await ctx.editMessageText(
            `✅ **Category Selected:** ${category}\n\n` +
            '📋 **Step 4: Summary**\n' +
            'Write a brief summary (2-3 sentences) that captures the key points of your article.\n\n' +
            'This summary will be shown in article previews and search results.',
            { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('↩️ Auto-Generate Summary', 'auto_summary')],
                    [Markup.button.callback('🔙 Back to Category', 'back_to_category')],
                    [Markup.button.callback('❌ Cancel', 'cancel_article')]
                ])
            }
        );

        await ctx.answerCbQuery('Category selected');
    }

    /**
     * Handle summary input
     */
    async handleSummaryInput(ctx, session, summary) {
        if (summary.length < 20) {
            return ctx.reply('❌ Summary too short. Please write at least 20 characters.');
        }

        if (summary.length > 500) {
            return ctx.reply('❌ Summary too long. Please keep it under 500 characters.');
        }

        session.article.summary = summary;
        
        // Handle different modes
        if (session.mode === 'edit') {
            session.step = 'preview';
            await ctx.reply('✅ Summary updated!');
            await this.showEditMenu(ctx, session.article);
            return;
        }
        
        // Show final preview
        await this.showArticlePreview(ctx, session);
    }

    /**
     * Auto-generate summary from content
     */
    async autoGenerateSummary(ctx) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);

        if (!session || !session.article.content) {
            return ctx.answerCbQuery('Error: No content found.');
        }

        // Simple auto-summary: first 2 sentences or 200 characters
        const content = session.article.content;
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        let summary = sentences.slice(0, 2).join('. ').trim();
        if (summary.length > 200) {
            summary = content.substring(0, 200).trim();
            if (!summary.endsWith('.')) {
                summary += '...';
            }
        } else if (!summary.endsWith('.')) {
            summary += '.';
        }

        session.article.summary = summary;
        
        await ctx.editMessageText(
            `🤖 **Auto-Generated Summary:**\n${summary}\n\n` +
            '✏️ You can send a different summary now, or proceed with this one.',
            { 
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Use This Summary', 'use_auto_summary')],
                    [Markup.button.callback('✏️ Write Custom Summary', 'custom_summary')],
                    [Markup.button.callback('❌ Cancel', 'cancel_article')]
                ])
            }
        );

        await ctx.answerCbQuery('Summary generated');
    }

    /**
     * Show article preview and final options
     */
    async showArticlePreview(ctx, session) {
        const article = session.article;
        
        let preview = `📋 **Article Preview**\n\n`;
        preview += `📰 **Title:** ${article.title}\n`;
        preview += `🏷️ **Category:** ${article.category}\n`;
        preview += `👤 **Author:** ${article.author}\n\n`;
        preview += `📝 **Summary:**\n${article.summary}\n\n`;
        preview += `📄 **Content Preview:**\n${article.content.substring(0, 200)}${article.content.length > 200 ? '...' : ''}\n\n`;
        preview += `📊 **Stats:** ${article.content.length} characters, ${article.content.split(' ').length} words`;

        const keyboard = [
            [
                Markup.button.callback('💾 Save as Draft', 'save_draft'),
                Markup.button.callback('🚀 Publish Now', 'publish_now')
            ],
            [
                Markup.button.callback('✏️ Edit Title', 'edit_title'),
                Markup.button.callback('📝 Edit Content', 'edit_content')
            ],
            [
                Markup.button.callback('🏷️ Change Category', 'edit_category'),
                Markup.button.callback('📋 Edit Summary', 'edit_summary')
            ],
            [
                Markup.button.callback('❌ Cancel', 'cancel_article')
            ]
        ];

        await ctx.reply(preview, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
    }

    /**
     * Save article as draft
     */
    async saveDraft(ctx) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);

        if (!session) {
            return ctx.answerCbQuery('Session expired.');
        }

        try {
            if (session.mode === 'edit') {
                // Update existing article
                const updateData = {
                    title: session.article.title,
                    content: session.article.content,
                    category: session.article.category,
                    summary: session.article.summary,
                    updated_at: new Date()
                };

                await this.db.collection('news_articles').updateOne(
                    { _id: new ObjectId(session.articleId) },
                    { $set: updateData }
                );

                this.userSessions.delete(userId);

                await ctx.editMessageText(
                    '✅ **Changes Saved Successfully!**\n\n' +
                    `📰 **"${session.article.title}"**\n\n` +
                    '📝 Your article has been updated and can be:\n' +
                    '• Published using /post\n' +
                    '• Edited again with /drafts\n' +
                    '• Shared with others once published',
                    { parse_mode: 'Markdown' }
                );
            } else {
                // Create new article
                const article = {
                    ...session.article,
                    _id: new ObjectId(),
                    status: 'draft',
                    published_date: null,
                    views: 0,
                    reactions: { like: 0, love: 0, fire: 0 },
                    source: 'User Generated',
                    source_metadata: { 
                        is_original_source: true,
                        user_generated: true
                    }
                };

                await this.db.collection('news_articles').insertOne(article);
                
                this.userSessions.delete(userId);

                await ctx.editMessageText(
                    '✅ **Article Saved as Draft!**\n\n' +
                    `📰 **"${article.title}"**\n\n` +
                    '📝 Your article has been saved and can be:\n' +
                    '• Edited later with /drafts\n' +
                    '• Published using /post\n' +
                    '• Shared with others once published\n\n' +
                    '🎉 Great work creating original content!',
                    { parse_mode: 'Markdown' }
                );
            }

            await ctx.answerCbQuery('Draft saved!');
        } catch (error) {
            console.error('Error saving draft:', error);
            await ctx.answerCbQuery('❌ Error saving draft');
        }
    }

    /**
     * Publish article immediately
     */
    async publishNow(ctx) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);

        if (!session) {
            return ctx.answerCbQuery('Session expired.');
        }

        try {
            const article = {
                ...session.article,
                _id: new ObjectId(),
                status: 'published',
                published_date: new Date(),
                views: 0,
                reactions: { like: 0, love: 0, fire: 0 },
                source: 'User Generated',
                source_metadata: { 
                    is_original_source: true,
                    user_generated: true
                }
            };

            await this.db.collection('news_articles').insertOne(article);
            
            this.userSessions.delete(userId);

            await ctx.editMessageText(
                '🚀 **Article Published Successfully!**\n\n' +
                `📰 **"${article.title}"**\n\n` +
                '✅ Your article is now:\n' +
                '• Available in the news feed\n' +
                '• Ready to be posted via /post\n' +
                '• Searchable by other users\n\n' +
                '🎊 Congratulations on publishing your first article!',
                { parse_mode: 'Markdown' }
            );

            await ctx.answerCbQuery('Article published!');
        } catch (error) {
            console.error('Error publishing article:', error);
            await ctx.answerCbQuery('❌ Error publishing article');
        }
    }

    /**
     * Cancel article creation
     */
    async cancelCreation(ctx) {
        const userId = ctx.from.id;
        this.userSessions.delete(userId);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(
                '❌ **Article Creation Cancelled**\n\n' +
                'Your progress has been discarded.\n' +
                'Use /newarticle to start again anytime.',
                { parse_mode: 'Markdown' }
            );
            await ctx.answerCbQuery('Creation cancelled');
        } else {
            await ctx.reply(
                '❌ **Article Creation Cancelled**\n\n' +
                'Your progress has been discarded.\n' +
                'Use /newarticle to start again anytime.',
                { parse_mode: 'Markdown' }
            );
        }
    }

    /**
     * Get user's active session
     */
    getUserSession(userId) {
        return this.userSessions.get(userId);
    }

    /**
     * Clear user session
     */
    clearUserSession(userId) {
        this.userSessions.delete(userId);
    }

    /**
     * Show category selection with edit mode support
     */
    async showCategorySelection(ctx, isEdit = false) {
        const categories = [
            'Breaking News', 'Local News', 'Politics', 'Business', 
            'Technology', 'Sports', 'Entertainment', 'Health', 
            'Education', 'Opinion', 'Other'
        ];

        const keyboard = [];
        for (let i = 0; i < categories.length; i += 2) {
            const row = [
                Markup.button.callback(categories[i], `category:${categories[i]}`)
            ];
            if (categories[i + 1]) {
                row.push(Markup.button.callback(categories[i + 1], `category:${categories[i + 1]}`));
            }
            keyboard.push(row);
        }

        if (isEdit) {
            keyboard.push([
                Markup.button.callback('🔙 Back to Menu', 'back_to_edit_menu'),
                Markup.button.callback('❌ Cancel', 'cancel_article')
            ]);
        } else {
            keyboard.push([
                Markup.button.callback('🔙 Back to Content', 'back_to_content'),
                Markup.button.callback('❌ Cancel', 'cancel_article')
            ]);
        }

        const message = isEdit ? 
            '🏷️ **Edit Category**\n\nSelect the new category for your article:' :
            '🏷️ **Step 3: Category**\n\nSelect the most appropriate category for your article:';

        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
    }

    /**
     * Delete draft article
     */
    async deleteDraft(ctx) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);

        if (!session || session.mode !== 'edit' || !session.articleId) {
            return ctx.answerCbQuery('No draft to delete.');
        }

        try {
            await this.db.collection('news_articles').deleteOne({
                _id: new ObjectId(session.articleId),
                author_id: userId,
                status: 'draft'
            });

            this.userSessions.delete(userId);

            await ctx.editMessageText(
                '🗑️ **Draft Deleted Successfully**\n\n' +
                'Your draft article has been permanently deleted.\n' +
                'Use /newarticle to create a new article.',
                { parse_mode: 'Markdown' }
            );

            await ctx.answerCbQuery('Draft deleted');
        } catch (error) {
            console.error('Error deleting draft:', error);
            await ctx.answerCbQuery('❌ Error deleting draft');
        }
    }

    /**
     * Handle back to edit menu action
     */
    async backToEditMenu(ctx) {
        const userId = ctx.from.id;
        const session = this.userSessions.get(userId);

        if (!session || session.mode !== 'edit') {
            return ctx.answerCbQuery('No active editing session.');
        }

        session.step = 'preview';
        await this.showEditMenu(ctx, session.article);
        await ctx.answerCbQuery();
    }
}

module.exports = ArticleCreator;