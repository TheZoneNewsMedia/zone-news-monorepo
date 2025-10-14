/**
 * Template System - Complete template management with categories and analytics
 * Production-ready implementation for Zone News Bot
 */

const { ObjectId } = require('mongodb');

class TemplateSystem {
    constructor(bot, db, tierManager) {
        this.bot = bot;
        this.db = db;
        this.tierManager = tierManager;
        
        // Template categories
        this.categories = {
            'news': {
                name: 'News Posts',
                icon: '📰',
                description: 'Breaking news, updates, and articles',
                color: '#FF4444'
            },
            'promotion': {
                name: 'Promotions',
                icon: '🎯',
                description: 'Sales, offers, and marketing content',
                color: '#FF8800'
            },
            'social': {
                name: 'Social Media',
                icon: '📱',
                description: 'Social engagement and community posts',
                color: '#4488FF'
            },
            'announcement': {
                name: 'Announcements',
                icon: '📢',
                description: 'Important updates and notifications',
                color: '#8844FF'
            },
            'event': {
                name: 'Events',
                icon: '📅',
                description: 'Event promotions and invitations',
                color: '#44FF88'
            },
            'newsletter': {
                name: 'Newsletter',
                icon: '📧',
                description: 'Regular newsletter content',
                color: '#FF4488'
            },
            'tutorial': {
                name: 'Tutorials',
                icon: '📚',
                description: 'How-to guides and educational content',
                color: '#FFAA44'
            },
            'quote': {
                name: 'Quotes',
                icon: '💭',
                description: 'Inspirational and motivational quotes',
                color: '#44AAFF'
            },
            'poll': {
                name: 'Polls & Surveys',
                icon: '📊',
                description: 'Interactive polls and feedback requests',
                color: '#AA44FF'
            },
            'custom': {
                name: 'Custom',
                icon: '⚙️',
                description: 'User-defined custom templates',
                color: '#666666'
            }
        };
        
        // Template limits by tier
        this.templateLimits = {
            free: {
                max_templates: 0,
                categories: [],
                sharing: false,
                analytics: false,
                variables: false,
                import_export: false
            },
            basic: {
                max_templates: 5,
                categories: ['news', 'promotion', 'social', 'custom'],
                sharing: false,
                analytics: true,
                variables: true,
                import_export: false
            },
            pro: {
                max_templates: 20,
                categories: Object.keys(this.categories),
                sharing: true,
                analytics: true,
                variables: true,
                import_export: true
            },
            enterprise: {
                max_templates: -1, // unlimited
                categories: Object.keys(this.categories),
                sharing: true,
                analytics: true,
                variables: true,
                import_export: true
            }
        };
        
        // Variable system for dynamic content
        this.templateVariables = {
            '{{date}}': () => new Date().toLocaleDateString('en-AU'),
            '{{time}}': () => new Date().toLocaleTimeString('en-AU', { hour12: false }),
            '{{datetime}}': () => new Date().toLocaleString('en-AU'),
            '{{day}}': () => new Date().toLocaleDateString('en-AU', { weekday: 'long' }),
            '{{month}}': () => new Date().toLocaleDateString('en-AU', { month: 'long' }),
            '{{year}}': () => new Date().getFullYear().toString(),
            '{{username}}': (ctx) => ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name,
            '{{firstname}}': (ctx) => ctx.from.first_name,
            '{{lastname}}': (ctx) => ctx.from.last_name || '',
            '{{fullname}}': (ctx) => `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
            '{{random_number}}': () => Math.floor(Math.random() * 100).toString(),
            '{{random_emoji}}': () => ['🎉', '🚀', '✨', '🌟', '💫', '🎊'][Math.floor(Math.random() * 6)],
            '{{break}}': () => '\n',
            '{{separator}}': () => '━━━━━━━━━━━━━━━━━━━━'
        };
        
        // Popular template examples by category
        this.templateExamples = {
            news: [
                {
                    name: 'Breaking News',
                    content: '🚨 *BREAKING NEWS*\n\n{{title}}\n\n{{content}}\n\n📅 {{datetime}}\n🔗 Read more: {{link}}'
                },
                {
                    name: 'Daily News Digest',
                    content: '📰 *Daily News - {{date}}*\n\n🔹 {{headline1}}\n🔹 {{headline2}}\n🔹 {{headline3}}\n\n📊 Stay informed with Zone News!'
                }
            ],
            promotion: [
                {
                    name: 'Flash Sale',
                    content: '🔥 *FLASH SALE ALERT!*\n\n💥 {{offer_title}}\n💰 Save {{discount}}%\n⏰ Until {{end_date}}\n\n🛒 Shop now: {{link}}'
                },
                {
                    name: 'Product Launch',
                    content: '🚀 *NEW PRODUCT LAUNCH*\n\n✨ Introducing {{product_name}}\n\n{{description}}\n\n🎯 Special launch price: {{price}}\n🔗 {{link}}'
                }
            ],
            social: [
                {
                    name: 'Engagement Post',
                    content: '👋 Hey everyone! {{random_emoji}}\n\n{{question}}\n\nDrop your thoughts in the comments! 💬\n\n#Engagement #Community'
                },
                {
                    name: 'Thank You Post',
                    content: '🙏 *Thank You!*\n\nWe appreciate all {{followers_count}} of our amazing followers!\n\n{{message}}\n\n❤️ Much love,\nThe Zone News Team'
                }
            ]
        };
    }

    /**
     * Register template commands and handlers
     */
    register() {
        console.log('🔧 Registering TemplateSystem...');
        
        // Template management commands
        this.bot.command('templates', this.handleTemplates.bind(this));
        this.bot.command('savetemplate', this.handleSaveTemplate.bind(this));
        this.bot.command('loadtemplate', this.handleLoadTemplate.bind(this));
        this.bot.command('deletetemplate', this.handleDeleteTemplate.bind(this));
        this.bot.command('templatecategories', this.handleTemplateCategories.bind(this));
        this.bot.command('sharetemplate', this.handleShareTemplate.bind(this));
        this.bot.command('templatestats', this.handleTemplateStats.bind(this));
        this.bot.command('importtemplate', this.handleImportTemplate.bind(this));
        this.bot.command('exporttemplate', this.handleExportTemplate.bind(this));
        this.bot.command('templatevars', this.handleTemplateVariables.bind(this));
        
        // Callback handlers
        this.bot.action(/^template:/, this.handleTemplateCallback.bind(this));
        this.bot.action(/^category:/, this.handleCategoryCallback.bind(this));
        this.bot.action(/^share:/, this.handleShareCallback.bind(this));
        this.bot.action(/^example:/, this.handleExampleCallback.bind(this));
        
        console.log('✅ TemplateSystem registered');
    }

    /**
     * Handle /templates command
     */
    async handleTemplates(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Check if user has templates feature
            const hasFeature = await this.tierManager.hasFeature(userId, 'templates');
            if (!hasFeature) {
                await ctx.reply(
                    '📝 *Templates* require Basic tier or higher.\n\n' +
                    '✨ Upgrade to Basic ($9.99/mo) to:\n' +
                    '• Save 5 custom templates\n' +
                    '• Use template variables\n' +
                    '• Quick post creation\n' +
                    '• Template analytics',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '💎 Upgrade', callback_data: 'subscribe:basic:monthly' }],
                                [{ text: '❌ Close', callback_data: 'cancel' }]
                            ]
                        }
                    }
                );
                return;
            }
            
            const userTier = await this.tierManager.getUserTier(userId);
            const tierLimits = this.templateLimits[userTier];
            
            // Get user's templates
            const templates = await this.getUserTemplates(userId);
            const templateCount = templates.length;
            
            let message = `📝 *Template Manager*\n\n`;
            message += `🎖️ Tier: ${userTier.charAt(0).toUpperCase() + userTier.slice(1)}\n`;
            message += `📊 Templates: ${templateCount}`;
            if (tierLimits.max_templates !== -1) {
                message += `/${tierLimits.max_templates}`;
            }
            message += '\n\n';
            
            if (templateCount === 0) {
                message += '*No templates saved yet.*\n\n';
                message += 'Create your first template to get started!';
            } else {
                message += '*Your Templates:*\n';
                templates.slice(0, 8).forEach((template, index) => {
                    const categoryEmoji = this.categories[template.category]?.icon || '📄';
                    const usageCount = template.usage_count || 0;
                    message += `${index + 1}. ${categoryEmoji} ${template.name} (${usageCount} uses)\n`;
                });
                
                if (templateCount > 8) {
                    message += `\n... and ${templateCount - 8} more templates`;
                }
            }
            
            const keyboard = [
                [
                    { text: '➕ Create Template', callback_data: 'template:create' },
                    { text: '📂 Browse Categories', callback_data: 'category:browse' }
                ]
            ];
            
            if (templateCount > 0) {
                keyboard.push([
                    { text: '📋 My Templates', callback_data: 'template:list' },
                    { text: '📊 Template Stats', callback_data: 'template:stats' }
                ]);
            }
            
            keyboard.push([
                { text: '💡 Examples', callback_data: 'example:browse' },
                { text: '🔧 Variables', callback_data: 'template:variables' }
            ]);
            
            if (tierLimits.import_export) {
                keyboard.push([
                    { text: '📥 Import', callback_data: 'template:import' },
                    { text: '📤 Export', callback_data: 'template:export' }
                ]);
            }
            
            if (tierLimits.sharing) {
                keyboard.push([
                    { text: '🌐 Public Templates', callback_data: 'template:public' },
                    { text: '🤝 Shared with Me', callback_data: 'template:shared' }
                ]);
            }
            
            keyboard.push([{ text: '❌ Close', callback_data: 'cancel' }]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error in templates command:', error);
            await ctx.reply('❌ Error accessing template system.');
        }
    }

    /**
     * Handle /savetemplate command
     */
    async handleSaveTemplate(ctx) {
        try {
            const userId = ctx.from.id;
            const args = ctx.message.text.split(' ').slice(1);
            
            // Check template limits
            const limitCheck = await this.tierManager.checkLimit(userId, 'templates');
            if (!limitCheck.allowed) {
                await ctx.reply(limitCheck.message, { parse_mode: 'Markdown' });
                return;
            }
            
            if (args.length === 0) {
                await ctx.reply(
                    '📝 *Save Template*\n\n' +
                    '*Usage:*\n' +
                    '`/savetemplate <name> <content>`\n\n' +
                    '*Example:*\n' +
                    '`/savetemplate "Daily News" 📰 Breaking: {{title}} - {{content}}`\n\n' +
                    '*Available variables:*\n' +
                    '• {{date}}, {{time}}, {{datetime}}\n' +
                    '• {{username}}, {{firstname}}\n' +
                    '• Custom: {{title}}, {{content}}, etc.',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Parse name and content
            let templateName, templateContent;
            
            if (args[0].startsWith('"') && args[0].endsWith('"')) {
                templateName = args[0].slice(1, -1);
                templateContent = args.slice(1).join(' ');
            } else {
                templateName = args[0];
                templateContent = args.slice(1).join(' ');
            }
            
            if (!templateName || !templateContent) {
                await ctx.reply('❌ Please provide both template name and content.');
                return;
            }
            
            // Check if template name already exists
            const existingTemplate = await this.db.collection('user_templates').findOne({
                user_id: userId,
                name: templateName
            });
            
            if (existingTemplate) {
                await ctx.reply(
                    `❌ Template "${templateName}" already exists.\n\n` +
                    'Use a different name or delete the existing template first.',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Show category selection
            await this.showCategorySelection(ctx, templateName, templateContent);
            
        } catch (error) {
            console.error('Error saving template:', error);
            await ctx.reply('❌ Error saving template.');
        }
    }

    /**
     * Handle /loadtemplate command
     */
    async handleLoadTemplate(ctx) {
        try {
            const userId = ctx.from.id;
            const args = ctx.message.text.split(' ').slice(1);
            
            if (args.length === 0) {
                // Show template selection
                await this.showTemplateSelection(ctx, 'load');
                return;
            }
            
            const templateName = args.join(' ');
            
            // Find template
            const template = await this.db.collection('user_templates').findOne({
                user_id: userId,
                name: templateName
            });
            
            if (!template) {
                await ctx.reply(
                    `❌ Template "${templateName}" not found.\n\n` +
                    'Use /templates to see your saved templates.',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Process template variables
            const processedContent = await this.processTemplateVariables(template.content, ctx);
            
            // Update usage count
            await this.db.collection('user_templates').updateOne(
                { _id: template._id },
                { 
                    $inc: { usage_count: 1 },
                    $set: { last_used: new Date() }
                }
            );
            
            // Track template usage
            await this.trackTemplateUsage(userId, template._id, 'load');
            
            await ctx.reply(
                `📝 *Template Loaded: ${template.name}*\n\n` +
                `${processedContent}\n\n` +
                `📂 Category: ${this.categories[template.category]?.name || 'Unknown'}\n` +
                `📊 Usage: ${(template.usage_count || 0) + 1} times`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Post Now', callback_data: `template:post:${template._id}` },
                                { text: '⏰ Schedule', callback_data: `template:schedule:${template._id}` }
                            ],
                            [
                                { text: '✏️ Edit Template', callback_data: `template:edit:${template._id}` },
                                { text: '📋 Copy Text', callback_data: `template:copy:${template._id}` }
                            ],
                            [
                                { text: '🔄 Reload', callback_data: `template:reload:${template._id}` },
                                { text: '📊 Stats', callback_data: `template:details:${template._id}` }
                            ],
                            [{ text: '❌ Close', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error loading template:', error);
            await ctx.reply('❌ Error loading template.');
        }
    }

    /**
     * Handle template callbacks
     */
    async handleTemplateCallback(ctx) {
        try {
            const data = ctx.callbackQuery.data.split(':');
            const action = data[1];
            const param = data[2];
            
            await ctx.answerCallbackQuery();
            
            switch (action) {
                case 'create':
                    await this.startTemplateCreation(ctx);
                    break;
                case 'list':
                    await this.showTemplateList(ctx);
                    break;
                case 'edit':
                    await this.editTemplate(ctx, param);
                    break;
                case 'delete':
                    await this.deleteTemplate(ctx, param);
                    break;
                case 'post':
                    await this.postTemplate(ctx, param);
                    break;
                case 'schedule':
                    await this.scheduleTemplate(ctx, param);
                    break;
                case 'stats':
                    await this.showTemplateStats(ctx);
                    break;
                case 'variables':
                    await this.showTemplateVariables(ctx);
                    break;
                default:
                    await ctx.reply('❌ Unknown template action.');
            }
            
        } catch (error) {
            console.error('Error handling template callback:', error);
            await ctx.answerCallbackQuery('❌ Error processing template request');
        }
    }

    /**
     * Show category selection for new template
     */
    async showCategorySelection(ctx, templateName, templateContent) {
        try {
            const userId = ctx.from.id;
            const userTier = await this.tierManager.getUserTier(userId);
            const tierLimits = this.templateLimits[userTier];
            
            let message = `📂 *Select Category*\n\n`;
            message += `Template: "${templateName}"\n\n`;
            message += `Choose a category for your template:`;
            
            const keyboard = [];
            
            // Add available categories based on tier
            for (const [key, category] of Object.entries(this.categories)) {
                if (tierLimits.categories.includes(key)) {
                    keyboard.push([{
                        text: `${category.icon} ${category.name}`,
                        callback_data: `category:save:${key}:${encodeURIComponent(templateName)}:${encodeURIComponent(templateContent)}`
                    }]);
                }
            }
            
            keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel' }]);
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error showing category selection:', error);
            await ctx.reply('❌ Error showing categories.');
        }
    }

    /**
     * Handle category callbacks
     */
    async handleCategoryCallback(ctx) {
        try {
            const data = ctx.callbackQuery.data.split(':');
            const action = data[1];
            
            await ctx.answerCallbackQuery();
            
            switch (action) {
                case 'save':
                    const categoryKey = data[2];
                    const templateName = decodeURIComponent(data[3]);
                    const templateContent = decodeURIComponent(data[4]);
                    await this.saveTemplateToCategory(ctx, templateName, templateContent, categoryKey);
                    break;
                case 'browse':
                    await this.browseCategoriesMenu(ctx);
                    break;
                case 'view':
                    await this.viewCategoryTemplates(ctx, data[2]);
                    break;
                default:
                    await ctx.reply('❌ Unknown category action.');
            }
            
        } catch (error) {
            console.error('Error handling category callback:', error);
            await ctx.answerCallbackQuery('❌ Error processing category request');
        }
    }

    /**
     * Save template to specific category
     */
    async saveTemplateToCategory(ctx, templateName, templateContent, categoryKey) {
        try {
            const userId = ctx.from.id;
            const category = this.categories[categoryKey];
            
            if (!category) {
                await ctx.reply('❌ Invalid category selected.');
                return;
            }
            
            // Analyze template content for variables
            const variables = this.extractVariables(templateContent);
            
            // Create template document
            const template = {
                user_id: userId,
                name: templateName,
                content: templateContent,
                category: categoryKey,
                variables: variables,
                created_at: new Date(),
                updated_at: new Date(),
                usage_count: 0,
                last_used: null,
                is_public: false,
                tags: [],
                metadata: {
                    character_count: templateContent.length,
                    variable_count: variables.length,
                    estimated_length: this.estimateProcessedLength(templateContent)
                }
            };
            
            const result = await this.db.collection('user_templates').insertOne(template);
            
            // Track template creation
            await this.trackTemplateUsage(userId, result.insertedId, 'create');
            
            await ctx.editMessageText(
                `✅ *Template Saved!*\n\n` +
                `📝 Name: ${templateName}\n` +
                `📂 Category: ${category.icon} ${category.name}\n` +
                `📊 Variables: ${variables.length}\n` +
                `📏 Length: ${templateContent.length} characters\n\n` +
                `🆔 Template ID: \`${result.insertedId}\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📤 Use Now', callback_data: `template:post:${result.insertedId}` },
                                { text: '✏️ Edit', callback_data: `template:edit:${result.insertedId}` }
                            ],
                            [
                                { text: '📋 View Templates', callback_data: 'template:list' },
                                { text: '➕ Create Another', callback_data: 'template:create' }
                            ],
                            [{ text: '❌ Close', callback_data: 'cancel' }]
                        ]
                    }
                }
            );
            
        } catch (error) {
            console.error('Error saving template:', error);
            await ctx.reply('❌ Error saving template to category.');
        }
    }

    /**
     * Show template list
     */
    async showTemplateList(ctx) {
        try {
            const userId = ctx.from.id;
            const templates = await this.getUserTemplates(userId);
            
            if (templates.length === 0) {
                await ctx.editMessageText(
                    '📋 *No Templates Found*\n\n' +
                    'You haven\'t created any templates yet.\n\n' +
                    'Create your first template to get started!',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '➕ Create Template', callback_data: 'template:create' }],
                                [{ text: '💡 Browse Examples', callback_data: 'example:browse' }],
                                [{ text: '« Back', callback_data: 'template:menu' }]
                            ]
                        }
                    }
                );
                return;
            }
            
            let message = `📋 *Your Templates* (${templates.length})\n\n`;
            
            const keyboard = [];
            
            templates.forEach((template, index) => {
                const categoryEmoji = this.categories[template.category]?.icon || '📄';
                const usageCount = template.usage_count || 0;
                
                message += `${index + 1}. ${categoryEmoji} **${template.name}**\n`;
                message += `   📊 Used ${usageCount} times\n`;
                message += `   📅 ${template.created_at.toLocaleDateString()}\n\n`;
                
                keyboard.push([{
                    text: `${categoryEmoji} ${template.name}`,
                    callback_data: `template:details:${template._id}`
                }]);
            });
            
            keyboard.push([
                { text: '➕ Create New', callback_data: 'template:create' },
                { text: '« Back', callback_data: 'template:menu' }
            ]);
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
            
        } catch (error) {
            console.error('Error showing template list:', error);
            await ctx.reply('❌ Error loading templates.');
        }
    }

    /**
     * Process template variables
     */
    async processTemplateVariables(content, ctx, customVars = {}) {
        let processedContent = content;
        
        // Process built-in variables
        for (const [variable, handler] of Object.entries(this.templateVariables)) {
            if (processedContent.includes(variable)) {
                const value = typeof handler === 'function' ? handler(ctx) : handler;
                processedContent = processedContent.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
            }
        }
        
        // Process custom variables
        for (const [variable, value] of Object.entries(customVars)) {
            const pattern = `{{${variable}}}`;
            processedContent = processedContent.replace(new RegExp(pattern.replace(/[{}]/g, '\\$&'), 'g'), value);
        }
        
        return processedContent;
    }

    /**
     * Extract variables from template content
     */
    extractVariables(content) {
        const variables = [];
        const regex = /\{\{([^}]+)\}\}/g;
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            const variable = match[1];
            if (!variables.includes(variable)) {
                variables.push(variable);
            }
        }
        
        return variables;
    }

    /**
     * Get user's templates
     */
    async getUserTemplates(userId, category = null) {
        const query = { user_id: userId };
        if (category) {
            query.category = category;
        }
        
        return await this.db.collection('user_templates')
            .find(query)
            .sort({ created_at: -1 })
            .toArray();
    }

    /**
     * Track template usage for analytics
     */
    async trackTemplateUsage(userId, templateId, action) {
        try {
            await this.db.collection('template_analytics').insertOne({
                user_id: userId,
                template_id: templateId,
                action: action, // create, load, edit, delete, post, schedule
                created_at: new Date()
            });
        } catch (error) {
            console.error('Error tracking template usage:', error);
        }
    }

    /**
     * Show template statistics
     */
    async handleTemplateStats(ctx) {
        try {
            const userId = ctx.from.id;
            
            // Get template statistics
            const totalTemplates = await this.db.collection('user_templates').countDocuments({ user_id: userId });
            
            const categoryStats = await this.db.collection('user_templates').aggregate([
                { $match: { user_id: userId } },
                { $group: { _id: '$category', count: { $sum: 1 }, total_usage: { $sum: '$usage_count' } } }
            ]).toArray();
            
            const usageStats = await this.db.collection('template_analytics').aggregate([
                { $match: { user_id: userId } },
                { $group: { _id: '$action', count: { $sum: 1 } } }
            ]).toArray();
            
            const mostUsedTemplate = await this.db.collection('user_templates')
                .findOne({ user_id: userId }, { sort: { usage_count: -1 } });
            
            let message = `📊 *Template Statistics*\n\n`;
            message += `📝 Total Templates: ${totalTemplates}\n\n`;
            
            if (categoryStats.length > 0) {
                message += `📂 *By Category:*\n`;
                categoryStats.forEach(stat => {
                    const category = this.categories[stat._id];
                    const emoji = category?.icon || '📄';
                    message += `${emoji} ${category?.name || stat._id}: ${stat.count} (${stat.total_usage} uses)\n`;
                });
                message += '\n';
            }
            
            if (usageStats.length > 0) {
                message += `📈 *Usage Activity:*\n`;
                usageStats.forEach(stat => {
                    const actionEmojis = {
                        create: '➕',
                        load: '📋',
                        edit: '✏️',
                        delete: '🗑️',
                        post: '📤',
                        schedule: '⏰'
                    };
                    const emoji = actionEmojis[stat._id] || '📊';
                    message += `${emoji} ${stat._id}: ${stat.count}\n`;
                });
                message += '\n';
            }
            
            if (mostUsedTemplate) {
                const category = this.categories[mostUsedTemplate.category];
                message += `🏆 *Most Used:*\n`;
                message += `${category?.icon || '📄'} ${mostUsedTemplate.name} (${mostUsedTemplate.usage_count || 0} uses)`;
            }
            
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📋 View Templates', callback_data: 'template:list' },
                            { text: '📈 Detailed Report', callback_data: 'template:report' }
                        ],
                        [
                            { text: '🔄 Refresh', callback_data: 'template:stats' },
                            { text: '❌ Close', callback_data: 'cancel' }
                        ]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Error getting template stats:', error);
            await ctx.reply('❌ Error retrieving template statistics.');
        }
    }

    /**
     * Show template variables help
     */
    async showTemplateVariables(ctx) {
        let message = `🔧 *Template Variables*\n\n`;
        message += `Use variables to make your templates dynamic!\n\n`;
        message += `*Built-in Variables:*\n`;
        
        const variableGroups = {
            'Date & Time': ['{{date}}', '{{time}}', '{{datetime}}', '{{day}}', '{{month}}', '{{year}}'],
            'User Info': ['{{username}}', '{{firstname}}', '{{lastname}}', '{{fullname}}'],
            'Dynamic Content': ['{{random_number}}', '{{random_emoji}}'],
            'Formatting': ['{{break}}', '{{separator}}']
        };
        
        for (const [group, variables] of Object.entries(variableGroups)) {
            message += `\n*${group}:*\n`;
            variables.forEach(variable => {
                message += `• \`${variable}\`\n`;
            });
        }
        
        message += `\n*Custom Variables:*\n`;
        message += `• \`{{title}}\` - Your custom title\n`;
        message += `• \`{{content}}\` - Your custom content\n`;
        message += `• \`{{link}}\` - Your custom link\n`;
        message += `• Create any: \`{{your_variable}}\`\n\n`;
        message += `*Example:*\n`;
        message += `📰 Breaking: \`{{title}}\`\n\n\`{{content}}\`\n\n📅 \`{{datetime}}\``;
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💡 See Examples', callback_data: 'example:browse' }],
                    [{ text: '« Back to Templates', callback_data: 'template:menu' }],
                    [{ text: '❌ Close', callback_data: 'cancel' }]
                ]
            }
        });
    }

    /**
     * Estimate processed template length
     */
    estimateProcessedLength(content) {
        let estimatedLength = content.length;
        
        // Estimate variable replacements
        const variables = this.extractVariables(content);
        variables.forEach(variable => {
            const placeholder = `{{${variable}}}`;
            const estimatedValue = this.estimateVariableLength(variable);
            estimatedLength = estimatedLength - placeholder.length + estimatedValue;
        });
        
        return estimatedLength;
    }

    /**
     * Estimate variable replacement length
     */
    estimateVariableLength(variable) {
        const estimates = {
            'date': 10,
            'time': 8,
            'datetime': 18,
            'day': 9,
            'month': 9,
            'year': 4,
            'username': 15,
            'firstname': 10,
            'lastname': 10,
            'fullname': 20,
            'random_number': 2,
            'random_emoji': 2,
            'break': 1,
            'separator': 20
        };
        
        return estimates[variable] || 20; // Default estimate for custom variables
    }

    /**
     * Browse categories menu
     */
    async browseCategoriesMenu(ctx) {
        const userId = ctx.from.id;
        const userTier = await this.tierManager.getUserTier(userId);
        const tierLimits = this.templateLimits[userTier];
        
        let message = `📂 *Template Categories*\n\n`;
        message += `Available categories for ${userTier} tier:\n\n`;
        
        const keyboard = [];
        
        for (const [key, category] of Object.entries(this.categories)) {
            if (tierLimits.categories.includes(key)) {
                const templateCount = await this.db.collection('user_templates').countDocuments({
                    user_id: userId,
                    category: key
                });
                
                message += `${category.icon} **${category.name}**\n`;
                message += `   ${category.description}\n`;
                message += `   Templates: ${templateCount}\n\n`;
                
                keyboard.push([{
                    text: `${category.icon} ${category.name} (${templateCount})`,
                    callback_data: `category:view:${key}`
                }]);
            }
        }
        
        keyboard.push([{ text: '« Back to Templates', callback_data: 'template:menu' }]);
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    }
}

module.exports = TemplateSystem;