// Fixed start command section
const startCommand = `
        // /start
        this.bot.command('start', async (ctx) => {
            // Check admin status
            ctx.isAdmin = config.adminIds.includes(ctx.from.id);
            
            // Track user
            await this.db.collection('users').updateOne(
                { user_id: ctx.from.id },
                {
                    $set: {
                        username: ctx.from.username,
                        first_name: ctx.from.first_name,
                        last_name: ctx.from.last_name,
                        language_code: ctx.from.language_code,
                        last_active: new Date()
                    },
                    $setOnInsert: {
                        user_id: ctx.from.id,
                        created_at: new Date()
                    }
                },
                { upsert: true }
            );
            
            const welcomeMessage = 
                '🎯 *Welcome to Zone News Bot!*\\n\\n' +
                'Your premier automated news distribution system\\n\\n' +
                '🚀 *Features:*\\n' +
                '• Auto-post to multiple channels\\n' +
                '• Smart content scheduling\\n' +
                '• Native Telegram reactions\\n' +
                '• Analytics & insights\\n' +
                '• Forward from any channel to add';
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { 
                            text: '➕ Add to Channel', 
                            url: \`https://t.me/\${ctx.botInfo.username}?startchannel=true\` 
                        },
                        { 
                            text: '➕ Add to Group', 
                            url: \`https://t.me/\${ctx.botInfo.username}?startgroup=true\` 
                        }
                    ],
                    [
                        { text: '📰 Latest News (Coming Soon)', callback_data: 'news_coming_soon' },
                        { text: '📱 Mini App', web_app: { url: 'https://thezonenews.com/miniapp' } }
                    ],
                    [
                        { text: '📖 How to Use', callback_data: 'how_to_use' },
                        { text: '💬 Support', url: 'https://t.me/ZoneNewsSupport' }
                    ],
                    ctx.isAdmin ? [{ text: '👑 Admin Panel', callback_data: 'admin' }] : []
                ].filter(row => row.length > 0)
            };
            
            await ctx.reply(welcomeMessage, { 
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        });
`;

module.exports = startCommand;