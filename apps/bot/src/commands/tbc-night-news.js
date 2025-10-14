/**
 * TBC Night News Command
 * Posts night news to @ZoneNewsAdl and forwards to TBC
 */

const { Markup } = require('telegraf');

class TBCNightNewsCommand {
    constructor(bot, db) {
        this.bot = bot;
        this.db = db;
        
        // Configuration
        this.config = {
            sourceChannelId: -1002212113452, // @ZoneNewsAdl
            tbcGroupId: -2665614394,         // TBC group
            tbcTopicId: 9,                   // Zone News topic
            adminIds: process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [7802629063]
        };
        
        // Track messages for syncing
        this.messageMap = new Map();
    }

    /**
     * Register the command
     */
    register() {
        // Command to post night news
        this.bot.command('nightnews', async (ctx) => {
            // Check if admin
            if (!this.config.adminIds.includes(ctx.from?.id)) {
                return ctx.reply('❌ This command is restricted to admins only.');
            }
            
            await ctx.reply('📰 Starting Night News posting...');
            await this.postNightNews(ctx);
        });
        
        // Command to post single article
        this.bot.command('postarticle', async (ctx) => {
            if (!this.config.adminIds.includes(ctx.from?.id)) {
                return ctx.reply('❌ This command is restricted to admins only.');
            }
            
            const args = ctx.message.text.replace('/postarticle ', '');
            if (!args) {
                return ctx.reply('Usage: /postarticle <JSON article data>');
            }
            
            try {
                const article = JSON.parse(args);
                await this.postSingleArticle(article, ctx);
            } catch (error) {
                ctx.reply('❌ Invalid JSON format');
            }
        });
    }

    /**
     * Create reaction keyboard
     */
    createReactionKeyboard(messageId) {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('👍', `react:${messageId}:like`),
                Markup.button.callback('❤️', `react:${messageId}:love`),
                Markup.button.callback('🔥', `react:${messageId}:fire`),
                Markup.button.callback('🎉', `react:${messageId}:party`),
                Markup.button.callback('🤔', `react:${messageId}:think`),
                Markup.button.callback('😢', `react:${messageId}:sad`)
            ],
            [
                Markup.button.url('📤 Share', `https://t.me/ZoneNewsAdl/${messageId}`),
                Markup.button.callback('👁 Views', `views:${messageId}`)
            ]
        ]);
    }

    /**
     * Format article for posting
     */
    formatArticle(article) {
        let text = `<b>${article.title}</b>\n\n`;
        text += `${article.content}\n\n`;
        text += `<b>Category:</b> ${article.category}\n`;
        text += `<b>Source:</b> ${article.source}\n`;
        if (article.link) {
            text += `<b>Link:</b> <a href="${article.link}">Read more</a>`;
        }
        return text;
    }

    /**
     * Post night news articles
     */
    async postNightNews(ctx) {
        const articles = [
            {
                title: "Australia’s social media age trial collapses into chaos and finger pointing",
                content: `The federal government’s ambitious plan to keep kids off harmful social media platforms has hit a spectacular roadblock, with key advisory board members walking out and confidential documents leaking to the press.\n\nThe age assurance trial was meant to test whether tech companies could effectively verify users’ ages before granting access, but internal divisions over privacy concerns and technical feasibility have derailed progress.\n\nSo far we’ve seen high profile resignations from the trial’s advisory board signal deep disagreements over approach.\n\nWith internal leaked documents reveal concerns about surveillance overreach and ineffective age verification methods.\n\nCritics argue the trial prioritises political optics over practical solutions, while supporters insist child safety must come first.\n\nThe technology itself remains unproven current age verification systems are easily bypassed and raise serious privacy concerns about storing personal identification data.\n\nThe trial’s collapse means continued uncertainty about when and how social media platforms will be held accountable for protecting children.\n\nParents remain the first line of defence in monitoring their kids’ online activity, while schools and community groups advocate for better digital literacy programs that don’t rely on flawed technology fixes.`,
                category: "Technology & Society",
                source: "The Guardian",
                link: "https://www.theguardian.com/media/2025/aug/19/australia-age-assurance-trial-social-media-ban-leaks-resignations"
            },
            {
                title: "Silicon Valley’s existential crisis: what comes after the AI gold rush?",
                content: `The tech capital of the world is facing an uncomfortable truth.\n\nThat after years of throwing billions at artificial intelligence, industry leaders are quietly asking what’s next.\n\nMajor layoffs are gutting once untouchable companies, while investors grow sceptical of AI promises that haven’t translated to sustainable profits.\n\nThe new buzzword is “hard tech”physical innovations in energy, manufacturing, and space exploration that can’t be replicated with clever algorithms.\n\nTech sector job cuts hit 85,000 workers globally in 2023, signalling market correction.\n\nInvestment shifting from software toward hardware, energy infrastructure, and advanced manufacturing.\n\nThe pivot showcase the harsh economic realities. That rising interest rates, supply chain vulnerabilities, and the realisation that pure software solutions have limits.\n\nCompanies now are rediscovering the value of making actual things rather than just digital services.\n\nSouth Australia’s manufacturing heritage and renewable energy leadership position the state well for this “hard tech” renaissance.\n\nLocal universities, defence contractors, and clean energy companies could attract Silicon Valley talent and investment as the industry seeks alternatives to the Bay Area’s sky high costs and regulatory constraints.\n\nThe key is developing skilled workers who can bridge digital innovation with physical engineering.`,
                category: "Technology & Economy",
                source: "AFR",
                link: "https://www.afr.com/technology/the-question-suddenly-sweeping-through-silicon-valley-20250818-p5mnrl"
            },
            {
                title: "Wall Street sounds alarm bells over $6.6 trillion crypto market meltdown",
                content: `Major financial institutions are warning of catastrophic losses across cryptocurrency markets as Bitcoin, Ethereum, and XRP prices tumble toward multi-year lows.\n\nThe digital currency sector, once valued at nearly $7 trillion, has shed over $1.5 trillion in the past quarter alone, triggering fears of broader financial contagion as institutional investors scramble to limit exposure.\n\nCrypto market valuation has plunged 25% in recent months, wiping out over $1.5 trillion the causes results from:\n\n- Regulatory crackdowns\n- Interest rates rate pressures\n\nThe collapse stems from a combination of toxic condition and  regulatory uncertainty, rising interest rates making riskier investments less attractive, and growing scepticism about crypto’s real world utility.\n\nMajor exchanges report unprecedented withdrawal volumes as panic selling accelerates.\n\nAustralian investors face potential losses on holdings that seemed bulletproof just weeks ago.\n\nFinancial advisers recommend mitigating crypto exposure by reassess risk tolerance and diversifying within your assets.\n\nThe volatility is a reminder that digital currencies have many potential by are still speculative investments.`,
                category: "Finance & Technology",
                source: "Forbes",
                link: "https://www.forbes.com/sites/digital-assets/2025/08/18/wall-street-issues-serious-66-trillion-crypto-warning-as-price-crash-fears-hit-bitcoin-ethereum-and-xrp/"
            },
            {
                title: "SA’s domestic violence reckoning: 136 ways to fix a broken system",
                content: `A royal commission has exposed South Australia’s fragmented response to domestic violence as “a real failure,” delivering 136 recommendations after four women died within a single week sparked urgent reform calls.\n\nCommissioner Natasha Stott Despoja pulled no punches, revealing a system so disjointed that no single person is held accountable when services fail victim survivors.\n\nThe commission delivered 136 recommendations with government immediately adopting seven key changes.\n\nThe Plans include Australia’s first standalone domestic violence ministry and 24 hour crisis helpline.\n\nThe inquiry heard from over 5,000 people survivors, families, service providers, police, and advocates painting a picture of bureaucratic silos, crisis driven responses, and leadership gaps that leave vulnerable people without adequate protection.\n\nOne recommendation calls for restricting late night alcohol delivery, recognising the substance’s role in escalating violence.\n\nSouth Australians, are looking into reforms represent an opportunity to create integrated support networks.\n\nThe new ministerial portfolio signals intent, while the planned crisis hotline could be a  help when current services fall short.\n\nThe success depends on funding as the opposition warns the initial $3.5 million commitment falls well short of what’s needed to implement meaningful change.`,
                category: "SA Community & Safety",
                source: "Independent Australia",
                link: "https://www.indailysa.com.au/news/just-in/2025/08/19/addressing-a-real-failure-136-changes-needed-as-sas-dv-horror-laid-bare"
            }
        ];

        try {
            // Generate today's date in '16th of August' format
            const now = new Date();
            const day = now.getDate();
            const month = now.toLocaleString('default', { month: 'long' });
            const daySuffix = (d) => {
                if (d > 3 && d < 21) return 'th';
                switch (d % 10) {
                    case 1: return 'st';
                    case 2: return 'nd';
                    case 3: return 'rd';
                    default: return 'th';
                }
            };
            const formattedDate = `${day}${daySuffix(day)} of ${month}`;

            // Post header with News emoji and dynamic date
            const headerText = `📰 <b>${formattedDate}, Night News</b> ℹ️`;
            
            const channelHeader = await this.bot.telegram.sendMessage(
                this.config.sourceChannelId,
                headerText,
                {
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([[
                        Markup.button.url('📰 Add News Emoji Pack', 'https://t.me/addemoji/NewsEmoji')
                    ]]).reply_markup
                }
            );
            
            // Forward header to TBC
            await this.bot.telegram.forwardMessage(
                this.config.tbcGroupId,
                this.config.sourceChannelId,
                channelHeader.message_id,
                { message_thread_id: this.config.tbcTopicId }
            );
            
            await ctx.reply(`✅ Header posted: Message ${channelHeader.message_id}`);
            
            // Post articles
            for (const article of articles) {
                await this.postSingleArticle(article, ctx);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
            await ctx.reply('✅ Night news posting complete!');
            
        } catch (error) {
            console.error('Error posting night news:', error);
            await ctx.reply(`❌ Error: ${error.message}`);
        }
    }

    /**
     * Post single article to channel and TBC
     */
    async postSingleArticle(article, ctx) {
        try {
            const text = this.formatArticle(article);
            
            // Post to channel
            const channelMsg = await this.bot.telegram.sendMessage(
                this.config.sourceChannelId,
                text,
                {
                    parse_mode: 'HTML',
                    disable_web_page_preview: false
                }
            );
            
            // Add reactions
            await this.bot.telegram.editMessageReplyMarkup(
                this.config.sourceChannelId,
                channelMsg.message_id,
                null,
                this.createReactionKeyboard(channelMsg.message_id).reply_markup
            );
            
            // Forward to TBC
            const tbcMsg = await this.bot.telegram.forwardMessage(
                this.config.tbcGroupId,
                this.config.sourceChannelId,
                channelMsg.message_id,
                { message_thread_id: this.config.tbcTopicId }
            );
            
            // Try to add reactions to forwarded message
            try {
                await this.bot.telegram.editMessageReplyMarkup(
                    this.config.tbcGroupId,
                    tbcMsg.message_id,
                    null,
                    this.createReactionKeyboard(channelMsg.message_id).reply_markup
                );
            } catch (err) {
                // If can't edit, send reaction buttons separately
                await this.bot.telegram.sendMessage(
                    this.config.tbcGroupId,
                    '👇 React to this article:',
                    {
                        message_thread_id: this.config.tbcTopicId,
                        reply_to_message_id: tbcMsg.message_id,
                        reply_markup: this.createReactionKeyboard(channelMsg.message_id).reply_markup
                    }
                );
            }
            
            // Track mapping
            this.messageMap.set(channelMsg.message_id, {
                channelId: channelMsg.message_id,
                tbcId: tbcMsg.message_id,
                title: article.title
            });
            
            if (ctx) {
                await ctx.reply(`✅ Posted: "${article.title.substring(0, 50)}..." (Channel: ${channelMsg.message_id}, TBC: ${tbcMsg.message_id})`);
            }
            
            return { channelMsg, tbcMsg };
            
        } catch (error) {
            console.error('Error posting article:', error);
            if (ctx) {
                await ctx.reply(`❌ Failed to post article: ${error.message}`);
            }
            throw error;
        }
    }
}

module.exports = TBCNightNewsCommand;