#!/usr/bin/env node

/**
 * Zone News Telegram Bot - Stable Production Version
 * Single source of truth for all bot functionality
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const mongoose = require('mongoose');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Core Services
const databaseService = require('./src/services/database-service');
const adminService = require('./src/services/admin-service');
const schedulingService = require('./src/services/scheduling-service');
const reactionService = require('./src/services/reaction-service');
const statsService = require('./src/services/stats-service');
const subscriptionService = require('./src/services/subscription-service');
const messageService = require('./src/services/message-service');

// Command Handlers - Safely require with fallbacks
// const startCommand = require('./src/services/commands/start-command'); use info-commands instead 
const helpCommand = require('./src/services/commands/help-command');
const adminCommands = require('./src/services/commands/admin-commands');
const statsCommand = require('./src/services/commands/stats-command');
const infoCommands = require('./src/services/commands/info-commands');
const subscriptionCommands = require('./src/services/commands/subscription-commands');

// Configuration
const config = {
  bot: {
    token: process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
    webhookDomain: process.env.WEBHOOK_DOMAIN,
    webhookPort: process.env.WEBHOOK_PORT || 3000,
    environment: process.env.NODE_ENV || 'development'
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/zone-news',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    }
  },
  channels: {
    main: process.env.MAIN_CHANNEL_ID || '@TheZoneNewsAU',
    tech: process.env.TECH_CHANNEL_ID || '@TheZoneNewsTech',
    crypto: process.env.CRYPTO_CHANNEL_ID || '@TheZoneNewsCrypto'
  },
  admins: (process.env.ADMIN_IDS || '').split(',').filter(Boolean).map(Number),
  features: {
    reactions: process.env.ENABLE_REACTIONS !== 'false',
    scheduling: process.env.ENABLE_SCHEDULING !== 'false',
    analytics: process.env.ENABLE_ANALYTICS !== 'false',
    forwarding: process.env.ENABLE_FORWARDING !== 'false'
  }
};

// Validate configuration
if (!config.bot.token) {
  console.error('❌ Bot token not found in environment variables');
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(config.bot.token);

// Express app for webhook
const app = express();
app.use(helmet());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/webhook', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    features: config.features
  });
});

// Webhook endpoint
app.post(`/webhook/${config.bot.token}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// State management for interactive features
const userStates = new Map();

// Middleware for logging
bot.use(async (ctx, next) => {
  const start = Date.now();
  try {
    await next();
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${ctx.updateType} processed in ${duration}ms`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing ${ctx.updateType}:`, error);
    throw error;
  }
});

// Admin middleware
bot.use(async (ctx, next) => {
  if (ctx.from) {
    ctx.isAdmin = config.admins.includes(ctx.from.id);
  }
  await next();
});

// Register command handlers with error handling
bot.command('start', async (ctx) => {
  try {
    await startCommand.handle(ctx);
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('❌ Error processing start command');
  }
});

bot.command('help', async (ctx) => {
  try {
    await helpCommand.handle(ctx);
  } catch (error) {
    console.error('Error in help command:', error);
    await ctx.reply('❌ Error processing help command');
  }
});

bot.command('stats', async (ctx) => {
  try {
    if (statsCommand && statsCommand.handle) {
      await statsCommand.handle(ctx);
    } else {
      // Fallback stats implementation
      const stats = await statsService.getStats();
      await ctx.reply(`📊 Bot Statistics:\n\n` +
        `👥 Total Users: ${stats.totalUsers || 0}\n` +
        `📬 Messages Sent: ${stats.messagesSent || 0}\n` +
        `❤️ Total Reactions: ${stats.totalReactions || 0}\n` +
        `📅 Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`
      );
    }
  } catch (error) {
    console.error('Error in stats command:', error);
    await ctx.reply('❌ Error fetching statistics');
  }
});

bot.command('subscribe', async (ctx) => {
  try {
    await subscriptionCommands.subscribe(ctx);
  } catch (error) {
    console.error('Error in subscribe command:', error);
    await ctx.reply('❌ Error processing subscription');
  }
});

bot.command('unsubscribe', async (ctx) => {
  try {
    await subscriptionCommands.unsubscribe(ctx);
  } catch (error) {
    console.error('Error in unsubscribe command:', error);
    await ctx.reply('❌ Error processing unsubscription');
  }
});

// Admin commands with error handling
bot.command('broadcast', async (ctx) => {
  try {
    if (!ctx.isAdmin) {
      return ctx.reply('⛔ This command is only for administrators.');
    }
    await adminCommands.broadcast(ctx);
  } catch (error) {
    console.error('Error in broadcast command:', error);
    await ctx.reply('❌ Error processing broadcast command');
  }
});

bot.command('schedule', async (ctx) => {
  try {
    if (!ctx.isAdmin) {
      return ctx.reply('⛔ This command is only for administrators.');
    }
    await adminCommands.schedule(ctx);
  } catch (error) {
    console.error('Error in schedule command:', error);
    await ctx.reply('❌ Error processing schedule command');
  }
});

bot.command('users', async (ctx) => {
  try {
    if (!ctx.isAdmin) {
      return ctx.reply('⛔ This command is only for administrators.');
    }
    await adminCommands.listUsers(ctx);
  } catch (error) {
    console.error('Error in users command:', error);
    await ctx.reply('❌ Error listing users');
  }
});

bot.command('channels', async (ctx) => {
  try {
    if (!ctx.isAdmin) {
      return ctx.reply('⛔ This command is only for administrators.');
    }
    await adminCommands.listChannels(ctx);
  } catch (error) {
    console.error('Error in channels command:', error);
    await ctx.reply('❌ Error listing channels');
  }
});

bot.command('post', async (ctx) => {
  try {
    if (!ctx.isAdmin) {
      return ctx.reply('⛔ This command is only for administrators.');
    }
    await adminCommands.createPost(ctx);
  } catch (error) {
    console.error('Error in post command:', error);
    await ctx.reply('❌ Error creating post');
  }
});

bot.command('analytics', async (ctx) => {
  try {
    if (!ctx.isAdmin) {
      return ctx.reply('⛔ This command is only for administrators.');
    }
    await adminCommands.showAnalytics(ctx);
  } catch (error) {
    console.error('Error in analytics command:', error);
    await ctx.reply('❌ Error showing analytics');
  }
});

// Inline keyboard callbacks
bot.action(/^subscribe_(.+)$/, async (ctx) => {
  const channel = ctx.match[1];
  await subscriptionService.subscribe(ctx.from.id, channel);
  await ctx.answerCbQuery('✅ Subscribed successfully!');
  await ctx.editMessageText(`You are now subscribed to ${channel} updates!`);
});

bot.action(/^unsubscribe_(.+)$/, async (ctx) => {
  const channel = ctx.match[1];
  await subscriptionService.unsubscribe(ctx.from.id, channel);
  await ctx.answerCbQuery('✅ Unsubscribed successfully!');
  await ctx.editMessageText(`You have been unsubscribed from ${channel} updates.`);
});

bot.action(/^view_article_(.+)$/, async (ctx) => {
  const articleId = ctx.match[1];
  const article = await messageService.getArticle(articleId);
  if (article) {
    await ctx.answerCbQuery();
    await ctx.reply(article.content, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '👍 Like', callback_data: `like_${articleId}` },
          { text: '💬 Comment', callback_data: `comment_${articleId}` },
          { text: '🔗 Share', url: `https://t.me/share/url?url=${article.url}` }
        ]]
      }
    });
  } else {
    await ctx.answerCbQuery('Article not found', { show_alert: true });
  }
});

// Reaction handlers with improved error handling
if (config.features.reactions) {
  // Handle message reactions
  bot.on('message_reaction', async (ctx) => {
    try {
      const update = ctx.update;
      
      // Check if message_reaction exists in the update
      if (!update.message_reaction) {
        console.warn('Message reaction update missing message_reaction field');
        return;
      }
      
      const { message_reaction } = update;
      
      // Validate required fields
      if (!message_reaction.message_id || !message_reaction.user || !message_reaction.chat) {
        console.warn('Message reaction missing required fields:', {
          hasMessageId: !!message_reaction.message_id,
          hasUser: !!message_reaction.user,
          hasChat: !!message_reaction.chat
        });
        return;
      }
      
      // Process the reaction
      await reactionService.handleReaction({
        messageId: message_reaction.message_id,
        userId: message_reaction.user.id,
        chatId: message_reaction.chat.id,
        newReaction: message_reaction.new_reaction || [],
        oldReaction: message_reaction.old_reaction || [],
        timestamp: new Date()
      });
      
      // Track analytics if enabled
      if (config.features.analytics && statsService.trackReaction) {
        const reactionEmoji = message_reaction.new_reaction?.[0]?.emoji || 
                             (message_reaction.new_reaction?.[0]?.type === 'emoji' ? 
                              message_reaction.new_reaction[0].emoji : 'removed');
        
        await statsService.trackReaction({
          userId: message_reaction.user.id,
          messageId: message_reaction.message_id,
          reactionType: reactionEmoji
        });
      }
      
      console.log(`✅ Reaction processed: User ${message_reaction.user.id} on message ${message_reaction.message_id}`);
    } catch (error) {
      console.error('Error handling message reaction:', error.message, error.stack);
    }
  });

  // Handle reaction count updates
  bot.on('message_reaction_count', async (ctx) => {
    try {
      const update = ctx.update;
      
      // Check if message_reaction_count exists
      if (!update.message_reaction_count) {
        console.warn('Reaction count update missing message_reaction_count field');
        return;
      }
      
      const { message_reaction_count } = update;
      
      // Validate required fields
      if (!message_reaction_count.message_id || !message_reaction_count.chat) {
        console.warn('Reaction count missing required fields:', {
          hasMessageId: !!message_reaction_count.message_id,
          hasChat: !!message_reaction_count.chat
        });
        return;
      }
      
      // Update reaction counts
      await reactionService.updateReactionCount({
        messageId: message_reaction_count.message_id,
        chatId: message_reaction_count.chat.id,
        reactions: message_reaction_count.reactions || [],
        timestamp: new Date()
      });
      
      console.log(`✅ Reaction count updated for message ${message_reaction_count.message_id}`);
    } catch (error) {
      console.error('Error handling reaction count update:', error.message, error.stack);
    }
  });
}

// Interactive post creation wizard
bot.command('createpost', async (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('⛔ This command is only for administrators.');
  }
  
  userStates.set(ctx.from.id, { 
    step: 'title',
    post: {}
  });
  
  await ctx.reply('📝 Let\'s create a new post!\n\nPlease enter the post title:');
});

// Handle text messages for interactive features
bot.on('text', async (ctx) => {
  const state = userStates.get(ctx.from.id);
  
  if (!state) return;
  
  switch (state.step) {
    case 'title':
      state.post.title = ctx.message.text;
      state.step = 'content';
      await ctx.reply('Great! Now enter the post content:');
      break;
      
    case 'content':
      state.post.content = ctx.message.text;
      state.step = 'channel';
      await ctx.reply('Which channel should this be posted to?\n\n' +
        '1️⃣ Main Channel\n' +
        '2️⃣ Tech Channel\n' +
        '3️⃣ Crypto Channel\n' +
        '4️⃣ All Channels');
      break;
      
    case 'channel':
      const channelChoice = ctx.message.text;
      state.post.channels = channelChoice === '4' ? 
        Object.values(config.channels) : 
        [config.channels[['main', 'tech', 'crypto'][parseInt(channelChoice) - 1]]];
      
      state.step = 'schedule';
      await ctx.reply('When should this be posted?\n\n' +
        '1️⃣ Now\n' +
        '2️⃣ Schedule for later');
      break;
      
    case 'schedule':
      if (ctx.message.text === '2') {
        state.step = 'datetime';
        await ctx.reply('Enter the date and time (YYYY-MM-DD HH:MM):');
      } else {
        // Post immediately
        await messageService.createAndSendPost(state.post, bot);
        userStates.delete(ctx.from.id);
        await ctx.reply('✅ Post sent successfully!');
      }
      break;
      
    case 'datetime':
      state.post.scheduledTime = new Date(ctx.message.text);
      await schedulingService.schedulePost(state.post);
      userStates.delete(ctx.from.id);
      await ctx.reply(`✅ Post scheduled for ${state.post.scheduledTime.toLocaleString()}`);
      break;
  }
  
  userStates.set(ctx.from.id, state);
});

// Scheduled posts
if (config.features.scheduling) {
  // Morning post at 7 AM
  cron.schedule('0 7 * * *', async () => {
    console.log('📅 Sending morning scheduled post...');
    try {
      await schedulingService.sendMorningPost(bot);
      console.log('✅ Morning post sent successfully');
    } catch (error) {
      console.error('❌ Error sending morning post:', error);
    }
  });

  // Evening post at 6 PM
  cron.schedule('0 18 * * *', async () => {
    console.log('📅 Sending evening scheduled post...');
    try {
      await schedulingService.sendEveningPost(bot);
      console.log('✅ Evening post sent successfully');
    } catch (error) {
      console.error('❌ Error sending evening post:', error);
    }
  });

  // Check for custom scheduled posts every minute
  cron.schedule('* * * * *', async () => {
    try {
      await schedulingService.processScheduledPosts(bot);
    } catch (error) {
      console.error('Error processing scheduled posts:', error);
    }
  });
}

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  if (ctx.reply) {
    ctx.reply('❌ An error occurred while processing your request. Please try again later.')
      .catch((replyError) => {
        console.error('Failed to send error message to user:', replyError);
      });
  }
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Stop accepting new requests
    if (config.bot.environment === 'production' && config.bot.webhookDomain) {
      await bot.telegram.deleteWebhook();
    }
    
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('✅ Database connection closed');
    }
    
    // Stop the bot
    bot.stop(signal);
    console.log('✅ Bot stopped');
    
    // Exit process
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the bot
const start = async () => {
  try {
    // Connect to database
    await databaseService.connect(config.database.uri, config.database.options);
    console.log('✅ Connected to MongoDB');
    
    // Initialize services
    await adminService.initialize(config.admins);
    await statsService.initialize();
    await subscriptionService.initialize();
    
    // Start bot
    if (config.bot.environment === 'production' && config.bot.webhookDomain) {
      // Use webhook in production
      await bot.telegram.setWebhook(`${config.bot.webhookDomain}/webhook/${config.bot.token}`);
      app.listen(config.bot.webhookPort, () => {
        console.log(`✅ Bot webhook server running on port ${config.bot.webhookPort}`);
      });
    } else {
      // Use polling in development
      await bot.launch();
      console.log('✅ Bot started in polling mode');
    }
    
    console.log('🤖 Zone News Bot is running!');
    console.log(`📊 Features enabled: ${JSON.stringify(config.features)}`);
    console.log(`👥 Admin IDs: ${config.admins.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
};

// Start the application
start();

module.exports = bot;
